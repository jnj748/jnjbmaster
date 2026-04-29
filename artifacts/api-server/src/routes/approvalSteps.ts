import { insertNotification } from "../lib/notificationRecipient";
import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, approvalsTable, approvalStepsTable, approvalRecipientsTable, approvalSignedCopiesTable, digitalSignaturesTable, usersTable, notificationsTable, contractsTable } from "@workspace/db";
import { requireRole, type AuthPayload } from "../middlewares/auth";
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
//   - 결재함 (read / process step) → manager, platform_admin, accountant,
//     hq_executive, custodian (본인 결재함의 전자결재 처리 포함)
//   - draft 생성·수정·상신 → manager, platform_admin, accountant, hq_executive
//     (custodian 제외 — 결재안을 만들 권한 없음)
const inboxRoles = ["manager", "platform_admin", "accountant", "hq_executive", "custodian"] as const;
const draftRoles = ["manager", "platform_admin", "accountant", "hq_executive"] as const;
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

router.post("/approvals/:id/steps/:stepId/process", requireRole(...inboxRoles), async (req, res): Promise<void> => {
  const approvalId = Number(req.params.id);
  const stepId = Number(req.params.stepId);
  const { action, comment, signatureId } = req.body;
  const user = req.user!;

  if (!action || !["approve", "reject"].includes(action)) {
    res.status(400).json({ error: "유효한 action(approve/reject)을 입력해주세요" });
    return;
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

      // [Task #611] 전자결재 경로로 라인이 최종 승인되면 같은 컨텍스트로
      //   지출결의서(→경리) / 입금요청서(→관리인) 자동 발행.
      const [finalApproval] = await db
        .select()
        .from(approvalsTable)
        .where(eq(approvalsTable.id, approvalId));
      if (finalApproval) {
        try {
          await issueDownstreamDocuments(finalApproval, false);
        } catch (err) {
          (req as { log?: { error?: (...args: unknown[]) => void } }).log?.error?.({ err, approvalId }, "issueDownstreamDocuments failed");
        }
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

router.post("/approvals/draft", requireRole(...draftRoles), async (req, res): Promise<void> => {
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

router.put("/approvals/draft/:id", requireRole(...draftRoles), async (req, res): Promise<void> => {
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

router.post("/approvals/draft/:id/submit", requireRole(...draftRoles), async (req, res): Promise<void> => {
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

export default router;
