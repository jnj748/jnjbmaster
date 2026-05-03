import { insertNotification } from "../lib/notificationRecipient";
import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, approvalsTable, approvalStepsTable, approvalRecipientsTable, approvalSignedCopiesTable, digitalSignaturesTable, usersTable, notificationsTable, contractsTable } from "@workspace/db";
import { requireRole, type AuthPayload } from "../middlewares/auth";
// [Task #773] 결재 단계 처리(승인/반려)·기안서 생성/수정/제출 감사로그.
import { audit, requireAction } from "../middlewares/audit";
// [Task #610] 2층 단일 통로 — 임시저장 기안서 commit 후 documents 레지스트리에 등록.
import { registerDocument } from "../services/documents/registerDocument";
import { saveProducingDocument } from "../repo/producingDocuments";
import type { DocumentAuthorRole } from "@workspace/db";
import { transitionContractStatus } from "./contracts";
// [Task #611] 라인이 최종 승인되는 모든 경로(전자결재 포함)에서 같은 후크로
//   지출결의서·입금요청서를 자동 발행한다.
import { issueDownstreamDocuments, accessibleBuildingIds } from "./approvalPipeline";

const router: IRouter = Router();
// [Task #611 round-7] 라우터 전체에 걸친 거시 가드 대신, 각 엔드포인트에 정확한
//   역할 집합을 박는다. 이전 구현은 `router.use(..., requireRole(... 'custodian'))`
//   로 custodian 에게 draft create/update/submit 등 결재안 작성 엔드포인트까지
//   열어버려, "관리인은 본인 결재함만 본다"라는 권한 경계가 깨져 있었다.
//
// [Task #707] 경리(accountant)는 결재 결정권자가 아니다 — 결재 라인의 승인/반려는
//   본부장/관리인만 한다. 단, 회계는 결재 진행 현황을 봐야 하므로 read 는 유지하고,
//   /process(단계 전자결재) 처리만 차단한다 (accountantBlocked at handler).
//   - 결재함 read (steps/recipients/signed-copies) → manager, platform_admin,
//     accountant, hq_executive, custodian
//   - 결재함 process (step approve/reject) → manager, platform_admin,
//     hq_executive, custodian — accountant 제외
//   - draft 생성·수정·상신 → manager, platform_admin, accountant, hq_executive
//     (custodian 제외 — 결재안을 만들 권한 없음)
const inboxRoles = ["manager", "platform_admin", "accountant", "hq_executive", "custodian"] as const;
const processRoles = ["manager", "platform_admin", "hq_executive", "custodian"] as const;
const draftRoles = ["manager", "platform_admin", "accountant", "hq_executive"] as const;
// [Task #707 review fix] 결재 결정권자에서 경리(accountant) 가 빠졌으니
//   결재선에 경리 결재자가 들어오면 서버 단에서 거부한다. 프런트가 옵션을
//   가려도 API 호출(curl/Postman) 로 우회 가능 — 정책 위반은 모든 경로에서
//   차단해야 변경 전 라인이 다시 stuck 되는 사고를 막는다.
function rejectAccountantApprover(steps: unknown): string | null {
  if (!Array.isArray(steps)) return null;
  for (const s of steps) {
    if (s && typeof s === "object" && (s as { approverRole?: unknown }).approverRole === "accountant") {
      return "결재 결정권자에 경리(accountant) 는 더 이상 포함될 수 없습니다";
    }
  }
  return null;
}

function serializeStep(r: typeof approvalStepsTable.$inferSelect) {
  return {
    ...r,
    processedAt: r.processedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

function serializeApproval(r: typeof approvalsTable.$inferSelect) {
  return {
    ...r,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// [Task #611 round-8] /steps · /recipients 도 /approvals/:id 와 동일한
//   빌딩 스코프 정책으로 보호한다. 이전 구현은 manager/platform_admin 을
//   무조건 통과시켜, 다른 건물의 결재안 ID 만 알면 단계·수신자가 노출됐다.
async function isAuthorizedForApprovalDetail(
  approval: typeof approvalsTable.$inferSelect,
  user: AuthPayload,
): Promise<boolean> {
  if (user.role === "platform_admin") return true;
  if (approval.requesterId === user.userId) return true;
  const assignedSteps = await db
    .select({ id: approvalStepsTable.id })
    .from(approvalStepsTable)
    .where(and(eq(approvalStepsTable.approvalId, approval.id), eq(approvalStepsTable.approverId, user.userId)));
  if (assignedSteps.length > 0) return true;
  if (user.role === "manager" || user.role === "hq_executive") {
    const scope = await accessibleBuildingIds(user.userId, user.role);
    if (scope.allBuildings) return true;
    if (approval.buildingId === null) return scope.includeNullBuilding;
    return scope.ids.includes(approval.buildingId);
  }
  return false;
}

router.get("/approvals/:id/steps", requireRole(...inboxRoles), async (req, res): Promise<void> => {
  const approvalId = Number(req.params.id);
  const user = req.user!;

  const [approval] = await db.select().from(approvalsTable).where(eq(approvalsTable.id, approvalId));
  if (!approval) {
    res.status(404).json({ error: "결재 요청을 찾을 수 없습니다" });
    return;
  }

  if (!(await isAuthorizedForApprovalDetail(approval, user))) {
    res.status(403).json({ error: "접근 권한이 없습니다" });
    return;
  }

  const steps = await db
    .select()
    .from(approvalStepsTable)
    .where(eq(approvalStepsTable.approvalId, approvalId))
    .orderBy(approvalStepsTable.stepOrder);

  res.json(steps.map(serializeStep));
});

// [Task #773] approve/reject 액션은 매트릭스에서 분기되므로 미들웨어에서 단일
//   action 키를 박을 수 없다. 기존 processRoles 가드는 보존하고, 응답 직전에
//   request body 의 action 을 보고 동적으로 audit 한 번만 기록한다.
// [Task #773] 매트릭스 기반 가드로 전환 (구 requireRole 동등). approve/reject 양쪽 모두
//   동일한 역할 집합이므로 approve 키로 검사해도 둘 다 통과한다.
router.post("/approvals/:id/steps/:stepId/process", requireAction("approval.step.approve"), audit("approval.step.approve", {
  targetType: "approval_step",
  targetIdParam: "stepId",
  // [Task #773] approve / reject 분기 — 응답 직전에 body 의 action 으로 정확히 분기 기록.
  resolveAction: (req) => {
    const a = (req.body as { action?: unknown })?.action;
    if (a === "reject") return "approval.step.reject";
    if (a === "approve") return "approval.step.approve";
    return null;
  },
  resolveBefore: (req) => ({ action: (req.body as { action?: unknown })?.action ?? null }),
}), async (req, res): Promise<void> => {
  const approvalId = Number(req.params.id);
  const stepId = Number(req.params.stepId);
  const { action, comment, signatureId } = req.body;
  const user = req.user!;

  // [Task #707] 방어적 가드 — 라우트는 이미 processRoles 로 막혀 있지만,
  //   ROLE 매트릭스 변경 회귀에 대비해 한 번 더 거른다. 경리는 결재 결정권자가 아니다.
  if (user.role === "accountant") {
    res.status(403).json({ error: "경리는 결재 단계의 승인/반려 권한이 없습니다" });
    return;
  }

  if (!action || !["approve", "reject"].includes(action)) {
    res.status(400).json({ error: "유효한 action(approve/reject)을 입력해주세요" });
    return;
  }

  // [Task #773] reject 는 매트릭스 DESTRUCTIVE_ACTIONS — 사유(reason) 필수.
  //   approve/reject 를 같은 라우트에서 처리하므로 정적 requireAction("approve") 가드만으로는
  //   reject 의 사유 강제가 누락된다. 동적으로 한 번 더 막는다.
  if (action === "reject") {
    const reasonRaw = (req.body as { reason?: unknown }).reason;
    const headerRaw = req.headers["x-audit-reason"];
    const reason = typeof reasonRaw === "string" ? reasonRaw.trim() : typeof headerRaw === "string" ? headerRaw.trim() : "";
    const commentRaw = typeof comment === "string" ? comment.trim() : "";
    if (!reason && !commentRaw) {
      res.status(422).json({
        error: "반려 사유(reason 또는 comment)는 필수입니다",
        action: "approval.step.reject",
        hint: "ConfirmWithReason 컴포넌트로 사유 칩을 받아 X-Audit-Reason 또는 body.reason 으로 전달하세요",
      });
      return;
    }
    // [Task #773] 사유가 reason 으로 안 오고 comment 로만 들어온 경우에도 audit 행이
    //   reason=null 로 남지 않도록, 감사 미들웨어가 보는 req.body.reason 에 미러링한다.
    if (!reason && commentRaw) {
      (req.body as { reason?: string }).reason = commentRaw;
    }
  }

  const [approval] = await db.select().from(approvalsTable).where(eq(approvalsTable.id, approvalId));
  if (!approval) {
    res.status(404).json({ error: "결재 요청을 찾을 수 없습니다" });
    return;
  }

  if (approval.isDraft || approval.status === "draft") {
    res.status(400).json({ error: "임시 저장 상태의 결재는 처리할 수 없습니다. 먼저 제출해주세요." });
    return;
  }

  if (approval.status === "approved" || approval.status === "rejected") {
    res.status(400).json({ error: "이미 최종 처리된 결재입니다" });
    return;
  }

  const [step] = await db
    .select()
    .from(approvalStepsTable)
    .where(and(eq(approvalStepsTable.id, stepId), eq(approvalStepsTable.approvalId, approvalId)));

  if (!step) {
    res.status(404).json({ error: "결재 단계를 찾을 수 없습니다" });
    return;
  }

  if (step.stepOrder !== approval.currentStep) {
    res.status(400).json({ error: "현재 결재 순서가 아닙니다. 이전 단계가 먼저 처리되어야 합니다" });
    return;
  }

  if (step.approverId !== user.userId) {
    res.status(403).json({ error: "이 단계의 결재 권한이 없습니다" });
    return;
  }

  if (step.status !== "pending") {
    res.status(400).json({ error: "이미 처리된 단계입니다" });
    return;
  }

  // [Task #611 fix] 오프라인 결재 단계는 본 엔드포인트로 닫을 수 없다.
  //   본부장/관리인이 인쇄·서명한 결재본을 첨부한 뒤 상신자(관리소장)가
  //   /process-offline 으로 마감해야 한다 — 그래야 서명본 1장 이상 첨부
  //   여부를 검증할 수 있다. 이 가드가 없으면 결재자가 시스템에서 곧바로
  //   '승인'을 눌러 서명본 없이 라인이 마감되는 우회가 가능하다.
  if (step.path === "offline") {
    res.status(400).json({
      error:
        "이 단계는 오프라인(서명본 첨부 필수) 경로입니다. " +
        "서명본을 업로드한 뒤 상신자(관리소장)가 오프라인 결재 마감으로 처리해주세요.",
    });
    return;
  }

  if (signatureId) {
    const [sig] = await db
      .select()
      .from(digitalSignaturesTable)
      .where(and(
        eq(digitalSignaturesTable.id, signatureId),
        eq(digitalSignaturesTable.userId, user.userId)
      ));
    if (!sig) {
      res.status(400).json({ error: "유효하지 않은 서명입니다. 본인의 서명만 사용할 수 있습니다" });
      return;
    }
  }

  const newStatus = action === "approve" ? "approved" : "rejected";

  const [updatedStep] = await db
    .update(approvalStepsTable)
    .set({
      status: newStatus,
      comment: comment ?? null,
      signatureId: signatureId ?? null,
      processedAt: new Date(),
      decidedAt: new Date(),
      signedCopyMissing: false,
    })
    .where(eq(approvalStepsTable.id, stepId))
    .returning();

  // [Task #611 fix] 전자결재 단계가 결재(승인/반려)되면 표준 결재 산출물을
  //   approval_signed_copies 에 자동으로 적재한다. 종이서명본 대신 시스템이
  //   생성한 결정 메타데이터(decision artifact) 를 영구 보관해 오프라인 라인과
  //   동일하게 "결재 단계마다 1장 이상의 결재본이 보관된다"는 불변식을 지킨다.
  try {
    const approverNameForArtifact = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, user.userId))
      .then((rows) => rows[0]?.name ?? user.email ?? "결재자");
    await db.insert(approvalSignedCopiesTable).values({
      approvalId,
      stepId,
      pageNumber: 1,
      fileName: `electronic-decision-step-${stepId}.json`,
      // 전자결재 결정의 표준 조회 경로. 동일 도메인 내 GET 으로 메타데이터를 회신한다.
      fileUrl: `/api/approvals/${approvalId}/steps/${stepId}/electronic-decision`,
      mimeType: "application/json",
      uploadMethod: "file_picker",
      kind: "electronic_pdf",
      uploadedBy: user.userId,
      uploadedByName: approverNameForArtifact,
    });
  } catch (err) {
    (req as { log?: { error?: (...args: unknown[]) => void } }).log?.error?.(
      { err, approvalId, stepId },
      "electronic decision artifact persist failed",
    );
  }

  if (action === "reject") {
    // [Task #610] 단일 통로 — 반려 transition 도 saveProducingDocument 로.
    await saveProducingDocument({
      write: (exec) =>
        exec
          .update(approvalsTable)
          .set({
            status: "rejected",
            rejectionReason: comment ?? "반려됨",
          })
          .where(eq(approvalsTable.id, approvalId))
          .returning()
          .then((r) => r[0]),
      document: {
        kind: "approval",
        sourceTable: "approvals",
        state: "rejected",
        title: (r) => r.title,
        authorId: (r) => r.requesterId,
        buildingId: (r) => r.buildingId,
        href: (r) => `/approvals/${r.id}`,
      },
    });

    await insertNotification({
      recipientType: `user:${approval.requesterId}`,
      notificationType: "approval_rejected",
      title: "결재 반려",
      message: `결재가 반려되었습니다: ${comment || "사유 없음"}`,
      relatedEntityType: "approval",
      relatedEntityId: approvalId,
    });
  } else {
    const allSteps = await db
      .select()
      .from(approvalStepsTable)
      .where(eq(approvalStepsTable.approvalId, approvalId))
      .orderBy(approvalStepsTable.stepOrder);

    const nextStep = allSteps.find((s) => s.status === "pending" && s.id !== stepId);

    if (nextStep) {
      // [Task #610] 단일 통로 — 다음 단계 진행도 saveProducingDocument 로.
      await saveProducingDocument({
        write: (exec) =>
          exec
            .update(approvalsTable)
            .set({
              currentStep: nextStep.stepOrder,
              status: "in_progress",
            })
            .where(eq(approvalsTable.id, approvalId))
            .returning()
            .then((r) => r[0]),
        document: {
          kind: "approval",
          sourceTable: "approvals",
          state: "active",
          title: (r) => r.title,
          authorId: (r) => r.requesterId,
          buildingId: (r) => r.buildingId,
          href: (r) => `/approvals/${r.id}`,
        },
      });

      await insertNotification({
        recipientType: `user:${nextStep.approverId}`,
        notificationType: "approval_step_pending",
        title: "결재 대기",
        message: `결재 요청이 도착했습니다. 승인 또는 반려해주세요.`,
        relatedEntityType: "approval",
        relatedEntityId: approvalId,
      });
    } else {
      const userName = await db
        .select({ name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, user.userId))
        .then((rows) => rows[0]?.name ?? user.email);

      // [Task #610] 단일 통로 — 최종 승인 transition 도 saveProducingDocument 로.
      await saveProducingDocument({
        write: (exec) =>
          exec
            .update(approvalsTable)
            .set({
              status: "approved",
              approverId: user.userId,
              approverName: userName,
              approvedAt: new Date(),
            })
            .where(eq(approvalsTable.id, approvalId))
            .returning()
            .then((r) => r[0]),
        document: {
          kind: "approval",
          sourceTable: "approvals",
          state: "completed",
          title: (r) => r.title,
          authorId: (r) => r.requesterId,
          buildingId: (r) => r.buildingId,
          href: (r) => `/approvals/${r.id}`,
        },
      });

      const linkedContracts = await db
        .select()
        .from(contractsTable)
        .where(eq(contractsTable.approvalId, approvalId));
      for (const c of linkedContracts) {
        if (c.status === "in_approval" || c.status === "draft") {
          await transitionContractStatus(c.id, "active");
        }
      }

      // [Task #707] 결재 최종 승인 시점에는 더 이상 지출결의서·입금요청서를 자동
      //   발행하지 않는다. "계약·증빙 등록 대기" 상태(awaitingContractEvidence)
      //   로 들어가고, 관리소장(또는 같은 건물 경리)이 계약·증빙 등록을 완료하는
      //   시점에 발행이 트리거된다 (POST /approvals/:id/register-contract-evidence).
      //   긴급집행 라인은 submit-line 시점에 이미 즉시 발행됐으므로 여기선 건너뛴다.
      const [finalApproval] = await db
        .select()
        .from(approvalsTable)
        .where(eq(approvalsTable.id, approvalId));
      if (finalApproval && !finalApproval.urgentExecution) {
        await db
          .update(approvalsTable)
          .set({ awaitingContractEvidence: true })
          .where(eq(approvalsTable.id, approvalId));
        await insertNotification({
          recipientType: `user:${approval.requesterId}`,
          notificationType: "approval_contract_evidence_pending",
          title: "계약·증빙 등록 대기",
          message: `${approval.title} — 결재 완료. 업체 계약·증빙을 등록하면 지출결의서·입금요청서가 발행됩니다.`,
          relatedEntityType: "approval",
          relatedEntityId: approvalId,
        });
      }

      await insertNotification({
        recipientType: `user:${approval.requesterId}`,
        notificationType: "approval_completed",
        title: "결재 완료",
        message: `결재가 최종 승인되었습니다.`,
        relatedEntityType: "approval",
        relatedEntityId: approvalId,
      });

      const recipients = await db
        .select()
        .from(approvalRecipientsTable)
        .where(eq(approvalRecipientsTable.approvalId, approvalId));

      for (const r of recipients) {
        await insertNotification({
          recipientType: `user:${r.userId}`,
          notificationType: "approval_shared",
          title: "결재 공유",
          message: `결재가 최종 승인되었습니다: ${approval.title}`,
          relatedEntityType: "approval",
          relatedEntityId: approvalId,
        });
      }
    }
  }

  res.json(serializeStep(updatedStep));
});

router.get("/approvals/:id/recipients", requireRole(...inboxRoles), async (req, res): Promise<void> => {
  const approvalId = Number(req.params.id);
  const user = req.user!;

  const [approval] = await db.select().from(approvalsTable).where(eq(approvalsTable.id, approvalId));
  if (!approval) {
    res.status(404).json({ error: "결재 요청을 찾을 수 없습니다" });
    return;
  }

  if (!(await isAuthorizedForApprovalDetail(approval, user))) {
    res.status(403).json({ error: "접근 권한이 없습니다" });
    return;
  }

  const recipients = await db
    .select()
    .from(approvalRecipientsTable)
    .where(eq(approvalRecipientsTable.approvalId, approvalId));

  res.json(
    recipients.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    }))
  );
});

router.post("/approvals/draft", requireRole(...draftRoles), audit("approval.draft.create", { targetType: "approval" }), async (req, res): Promise<void> => {
  const user = req.user!;
  const body = req.body;

  // [Task #611 fix] 라인 자동 라우팅(/submit-line)에서 본부장 배정/임계 조회는
  // approval.buildingId 를 키로 한다. draft 단계에서 buildingId 를 보존하지 않으면
  // 상신 시 항상 null 이 되어 본부장 단계가 누락된다.
  const [requester] = await db
    .select({ name: usersTable.name, buildingId: usersTable.buildingId })
    .from(usersTable)
    .where(eq(usersTable.id, user.userId));
  const userName = requester?.name ?? user.email;
  const buildingIdRaw = body.buildingId ?? requester?.buildingId ?? null;
  const buildingId =
    typeof buildingIdRaw === "number" && Number.isFinite(buildingIdRaw)
      ? buildingIdRaw
      : null;

  const steps = body.approvalSteps || [];
  const recipients = body.recipients || [];

  if (steps.length > 5) {
    res.status(400).json({ error: "결재선은 최대 5단계까지 설정할 수 있습니다" });
    return;
  }

  const accountantErr = rejectAccountantApprover(steps);
  if (accountantErr) {
    res.status(400).json({ error: accountantErr });
    return;
  }

  // [Task #682] 출처 보존 (rfq → 기안 → 결재 → 지출/입금 사슬을 잇는다).
  const sourceEntityType =
    typeof body.sourceEntityType === "string" && body.sourceEntityType.length > 0
      ? body.sourceEntityType
      : null;
  const sourceEntityIdRaw = body.sourceEntityId;
  const sourceEntityId =
    typeof sourceEntityIdRaw === "number" && Number.isFinite(sourceEntityIdRaw)
      ? sourceEntityIdRaw
      : null;

  // [Task #610] 2층 단일 통로 — 임시저장 INSERT + documents upsert 헬퍼 위임.
  let row: typeof approvalsTable.$inferSelect;
  try {
    row = await saveProducingDocument({
      write: (exec) =>
        exec
          .insert(approvalsTable)
          .values({
            title: body.title || "임시 저장",
            description: body.description || "",
            category: body.category || "other",
            templateId: body.templateId ?? null,
            estimatedAmount: body.estimatedAmount ?? null,
            vendorName: body.vendorName ?? null,
            vendorQuoteDetails: body.vendorQuoteDetails ?? null,
            relatedDraftId: body.relatedDraftId ?? null,
            relatedInspectionId: body.relatedInspectionId ?? null,
            requesterId: user.userId,
            requesterName: userName,
            buildingId,
            sourceEntityType,
            sourceEntityId,
            status: "draft",
            isDraft: true,
            totalSteps: steps.length || 1,
            currentStep: 1,
          })
          .returning()
          .then((r) => r[0]),
      document: {
        kind: "draft",
        sourceTable: "approvals",
        state: "draft",
        title: (r) => r.title,
        authorId: user.userId,
        authorRole: (user.role as DocumentAuthorRole) ?? null,
        buildingId: (r) => r.buildingId,
        href: (r) => `/approvals/${r.id}`,
        metadata: (r) => ({ category: r.category, isDraft: true }),
      },
    });
  } catch (err) {
    req.log.error({ err }, "[Task #610] approval draft saveProducingDocument failed");
    res.status(500).json({ error: "임시 저장 실패" });
    return;
  }

  for (let i = 0; i < steps.length; i++) {
    await db.insert(approvalStepsTable).values({
      approvalId: row.id,
      stepOrder: i + 1,
      approverId: steps[i].approverId,
      approverName: steps[i].approverName,
      approverRole: steps[i].approverRole,
      status: "pending",
    });
  }

  for (const r of recipients) {
    await db.insert(approvalRecipientsTable).values({
      approvalId: row.id,
      userId: r.userId,
      userName: r.userName,
      type: r.type,
    });
  }

  // [Task #610] saveProducingDocument 가 documents 레지스트리 upsert 까지 책임진다 —

  res.status(201).json(serializeApproval(row));
});

router.put("/approvals/draft/:id", requireRole(...draftRoles), audit("approval.draft.update", { targetType: "approval", targetIdParam: "id" }), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const body = req.body;
  const user = req.user!;

  const [existing] = await db.select().from(approvalsTable).where(eq(approvalsTable.id, id));
  if (!existing || !existing.isDraft) {
    res.status(404).json({ error: "임시 저장 문서를 찾을 수 없습니다" });
    return;
  }

  if (existing.requesterId !== user.userId) {
    res.status(403).json({ error: "본인의 임시 저장 문서만 수정할 수 있습니다" });
    return;
  }

  const steps = body.approvalSteps || [];
  const recipients = body.recipients || [];

  if (steps.length > 5) {
    res.status(400).json({ error: "결재선은 최대 5단계까지 설정할 수 있습니다" });
    return;
  }

  const accountantErr = rejectAccountantApprover(steps);
  if (accountantErr) {
    res.status(400).json({ error: accountantErr });
    return;
  }

  // [Task #610] 단일 통로 — UPDATE 도 saveProducingDocument 를 거친다.
  const row = await saveProducingDocument({
    write: (exec) =>
      exec
        .update(approvalsTable)
        .set({
          title: body.title || existing.title,
          description: body.description || existing.description,
          category: body.category || existing.category,
          templateId: body.templateId ?? existing.templateId,
          estimatedAmount: body.estimatedAmount ?? existing.estimatedAmount,
          vendorName: body.vendorName ?? existing.vendorName,
          vendorQuoteDetails: body.vendorQuoteDetails ?? existing.vendorQuoteDetails,
          // [Task #611 fix] draft 수정 시 buildingId 갱신 허용 (자동 라우팅 키).
          buildingId:
            typeof body.buildingId === "number" && Number.isFinite(body.buildingId)
              ? body.buildingId
              : existing.buildingId,
          // [Task #682] 출처 정보도 갱신 가능 — 비어있으면 기존값 보존.
          sourceEntityType:
            typeof body.sourceEntityType === "string" && body.sourceEntityType.length > 0
              ? body.sourceEntityType
              : existing.sourceEntityType,
          sourceEntityId:
            typeof body.sourceEntityId === "number" && Number.isFinite(body.sourceEntityId)
              ? body.sourceEntityId
              : existing.sourceEntityId,
          totalSteps: steps.length || existing.totalSteps,
        })
        .where(eq(approvalsTable.id, id))
        .returning()
        .then((r) => r[0]),
    document: {
      kind: "draft",
      sourceTable: "approvals",
      state: "draft",
      title: (r) => r.title,
      authorId: user.userId,
      authorRole: (user.role as DocumentAuthorRole) ?? null,
      buildingId: (r) => r.buildingId,
      href: (r) => `/approvals/${r.id}`,
      metadata: (r) => ({ category: r.category, isDraft: true }),
    },
  });

  if (steps.length > 0) {
    await db.delete(approvalStepsTable).where(eq(approvalStepsTable.approvalId, id));
    for (let i = 0; i < steps.length; i++) {
      await db.insert(approvalStepsTable).values({
        approvalId: id,
        stepOrder: i + 1,
        approverId: steps[i].approverId,
        approverName: steps[i].approverName,
        approverRole: steps[i].approverRole,
        status: "pending",
      });
    }
  }

  if (recipients.length > 0) {
    await db.delete(approvalRecipientsTable).where(eq(approvalRecipientsTable.approvalId, id));
    for (const r of recipients) {
      await db.insert(approvalRecipientsTable).values({
        approvalId: id,
        userId: r.userId,
        userName: r.userName,
        type: r.type,
      });
    }
  }

  res.json(serializeApproval(row));
});

router.post("/approvals/draft/:id/submit", requireRole(...draftRoles), audit("approval.line.submit", { targetType: "approval", targetIdParam: "id" }), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const body = req.body || {};
  const user = req.user!;

  const [existing] = await db.select().from(approvalsTable).where(eq(approvalsTable.id, id));
  if (!existing || !existing.isDraft) {
    res.status(404).json({ error: "임시 저장 문서를 찾을 수 없습니다" });
    return;
  }

  if (existing.requesterId !== user.userId) {
    res.status(403).json({ error: "본인의 임시 저장 문서만 제출할 수 있습니다" });
    return;
  }

  const steps = body.approvalSteps || [];
  const recipients = body.recipients || [];

  if (steps.length > 5) {
    res.status(400).json({ error: "결재선은 최대 5단계까지 설정할 수 있습니다" });
    return;
  }

  const accountantErr = rejectAccountantApprover(steps);
  if (accountantErr) {
    res.status(400).json({ error: accountantErr });
    return;
  }

  if (steps.length > 0) {
    await db.delete(approvalStepsTable).where(eq(approvalStepsTable.approvalId, id));
    for (let i = 0; i < steps.length; i++) {
      await db.insert(approvalStepsTable).values({
        approvalId: id,
        stepOrder: i + 1,
        approverId: steps[i].approverId,
        approverName: steps[i].approverName,
        approverRole: steps[i].approverRole,
        status: "pending",
      });
    }
  }

  if (recipients.length > 0) {
    await db.delete(approvalRecipientsTable).where(eq(approvalRecipientsTable.approvalId, id));
    for (const r of recipients) {
      await db.insert(approvalRecipientsTable).values({
        approvalId: id,
        userId: r.userId,
        userName: r.userName,
        type: r.type,
      });
    }
  }

  const allSteps = await db
    .select()
    .from(approvalStepsTable)
    .where(eq(approvalStepsTable.approvalId, id))
    .orderBy(approvalStepsTable.stepOrder);

  const updatedFields: Record<string, unknown> = {
    status: allSteps.length > 0 ? "in_progress" : "pending",
    isDraft: false,
    totalSteps: Math.max(allSteps.length, 1),
    currentStep: 1,
  };
  if (body.title) updatedFields.title = body.title;
  if (body.description) updatedFields.description = body.description;
  if (body.category) updatedFields.category = body.category;
  if (body.templateId !== undefined) updatedFields.templateId = body.templateId;
  if (body.estimatedAmount !== undefined) updatedFields.estimatedAmount = body.estimatedAmount;
  if (body.vendorName !== undefined) updatedFields.vendorName = body.vendorName;
  if (body.vendorQuoteDetails !== undefined) updatedFields.vendorQuoteDetails = body.vendorQuoteDetails;

  // [Task #610] 단일 통로 — draft → 상신 transition 도 saveProducingDocument 로.
  const row = await saveProducingDocument({
    write: (exec) =>
      exec
        .update(approvalsTable)
        .set(updatedFields)
        .where(eq(approvalsTable.id, id))
        .returning()
        .then((r) => r[0]),
    document: {
      kind: "approval",
      sourceTable: "approvals",
      state: allSteps.length > 0 ? "active" : "submitted",
      title: (r) => r.title,
      authorId: existing.requesterId,
      authorRole: (user.role as DocumentAuthorRole) ?? null,
      buildingId: (r) => r.buildingId,
      href: (r) => `/approvals/${r.id}`,
      metadata: (r) => ({ category: r.category, isDraft: false, submitted: true }),
    },
  });

  if (allSteps.length > 0) {
    await insertNotification({
      recipientType: `user:${allSteps[0].approverId}`,
      notificationType: "approval_step_pending",
      title: "결재 요청",
      message: `결재 요청이 도착했습니다. 승인 또는 반려해주세요.`,
      relatedEntityType: "approval",
      relatedEntityId: id,
    });
  }

  res.json(serializeApproval(row));
});

// [Task #707 review fix] 변경 전에 라인이 살아 있는 경우 — 결재선에 경리가
//   포함돼 있던 in-flight 라인의 pending 단계를 자동 skip 한다. 서버에서
//   /process 호출이 거부되므로 그대로 두면 영원히 진행되지 못한다. boot 시
//   1회 idempotent 하게 실행한다.
//   - 처리되는 row 만 손대므로 재실행해도 같은 row 를 또 변경하지 않는다.
//   - 자동 skip 후, 해당 approval 의 currentStep 도 다음 미결 단계로 전진시킨다.
export async function backfillSkipAccountantApproverSteps(): Promise<{ skippedSteps: number; advancedApprovals: number; finalizedApprovals: number }> {
  const now = new Date();
  // 1) 경리 결재자 + pending 단계 일괄 skip
  const skipped = await db
    .update(approvalStepsTable)
    .set({
      status: "skipped",
      processedAt: now,
      decidedAt: now,
      comment: "[Task #707] 경리 결재권 폐지에 따른 자동 스킵",
    })
    .where(and(
      eq(approvalStepsTable.approverRole, "accountant"),
      eq(approvalStepsTable.status, "pending"),
    ))
    .returning({ approvalId: approvalStepsTable.approvalId });

  // 2) 영향 받은 approval 들의 currentStep 을 — 다음 pending 단계로 전진.
  //    [Task #707 review fix] 스킵된 경리 단계가 마지막 pending 단계였다면 라인이
  //    영원히 처리되지 못하고 in_progress 로 묶이는 사고가 난다. 다음 pending 이
  //    없는 경우 — 거절된 단계가 하나라도 있으면 status="rejected", 아니면
  //    status="approved" + awaitingContractEvidence=true (신규 흐름) 로 자동 종결.
  const affectedApprovalIds = Array.from(new Set(skipped.map((r) => r.approvalId)));
  let advanced = 0;
  let finalized = 0;
  for (const approvalId of affectedApprovalIds) {
    const stepsForApproval = await db
      .select()
      .from(approvalStepsTable)
      .where(eq(approvalStepsTable.approvalId, approvalId))
      .orderBy(approvalStepsTable.stepOrder);
    const nextPending = stepsForApproval.find((s) => s.status === "pending");
    if (nextPending) {
      await db
        .update(approvalsTable)
        .set({ currentStep: nextPending.stepOrder })
        .where(eq(approvalsTable.id, approvalId));
      advanced++;
    } else {
      // 더 이상 미결 단계가 없다 — 라인을 종결.
      const hasRejected = stepsForApproval.some((s) => s.status === "rejected");
      const [approval] = await db
        .select()
        .from(approvalsTable)
        .where(eq(approvalsTable.id, approvalId));
      if (!approval) continue;
      // 이미 종결된 라인(approved/rejected)은 건드리지 않음 — idempotent.
      if (approval.status !== "pending" && approval.status !== "in_progress") continue;
      if (hasRejected) {
        await db
          .update(approvalsTable)
          .set({ status: "rejected", rejectionReason: approval.rejectionReason ?? "[Task #707] 자동 종결" })
          .where(eq(approvalsTable.id, approvalId));
      } else {
        // 모든 단계가 approved/skipped — 정상 종결. 신규 파이프라인 정책에 따라
        // 발행은 awaitingContractEvidence=true 로 표시만 하고 등록 단계에서 트리거.
        // 긴급집행 라인은 이미 발행이 끝나 있으나 awaitingContractEvidence=true 로
        // 사후등록 폼을 노출 (등록 시 update 모드로 메타만 갱신).
        await db
          .update(approvalsTable)
          .set({
            status: "approved",
            approvedAt: now,
            awaitingContractEvidence: !approval.contractEvidenceRegisteredAt,
          })
          .where(eq(approvalsTable.id, approvalId));
      }
      finalized++;
    }
  }
  return { skippedSteps: skipped.length, advancedApprovals: advanced, finalizedApprovals: finalized };
}

export default router;
