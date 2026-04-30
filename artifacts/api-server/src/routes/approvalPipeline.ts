// [Task #611] 기안서 → 본부장/관리인 결재 → 지출결의서·입금요청서 자동 발행 라인.
//
// 본 라우터가 하는 일:
//   1. 본부장 결재 임계 금액 CRUD (`/hq-approval-thresholds`)
//   2. 결재 라인 상신(line/submit) — 임계·본부장 배정·관리인 가입 여부를 보고
//      결재선(1단계 또는 2단계)을 자동 산출하고 스냅샷한다.
//   3. 긴급집행(사후결재) — 서명 단계가 비어 있어도 즉시 지출결의서·입금요청서 발행.
//   4. 서명본 첨부 업/다운로드, 교체.
//   5. 오프라인 결재 처리 — 관리소장이 서명본 업로드 후 본부장/관리인 결재단계를
//      대리 닫아 다음 단계로 넘긴다.
//   6. 지출결의서함/입금요청함 조회·처리 (출납기록 / 송금완료).
//
// 모든 라우트는 `authMiddleware` 적용 후의 사용자(req.user) 가 들어온다는 전제다.

import { Router, type IRouter } from "express";
import { and, desc, eq, isNull, inArray } from "drizzle-orm";
import {
  db,
  approvalsTable,
  approvalStepsTable,
  approvalSignedCopiesTable,
  hqApprovalThresholdsTable,
  hqBuildingAssignmentsTable,
  expenseVouchersTable,
  paymentRequestsTable,
  usersTable,
  tasksTable,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth";
import { insertNotification } from "../lib/notificationRecipient";
// [Task #610] 단일 통로 — approval lifecycle UPDATE 도 saveProducingDocument 로 통과.
import { saveProducingDocument } from "../repo/producingDocuments";

const router: IRouter = Router();

function serializeApproval(r: typeof approvalsTable.$inferSelect) {
  return {
    ...r,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function serializeStep(r: typeof approvalStepsTable.$inferSelect) {
  return {
    ...r,
    processedAt: r.processedAt?.toISOString() ?? null,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

function serializeSignedCopy(r: typeof approvalSignedCopiesTable.$inferSelect) {
  return { ...r, createdAt: r.createdAt.toISOString() };
}

function serializeVoucher(r: typeof expenseVouchersTable.$inferSelect) {
  return {
    ...r,
    recordedAt: r.recordedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function serializePaymentRequest(r: typeof paymentRequestsTable.$inferSelect) {
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// [Task #682] 인박스(지출결의서함/입금요청함) 행에 source(예: rfq#123) 백링크를
//   부착해 경리·관리인이 어느 RFQ 에서 출발한 청구인지 즉시 알 수 있게 한다.
//   approvalId 단일 컬럼만으로는 출처 RFQ 를 모르므로 approvals 1회 batch 조회.
async function attachApprovalSource<
  T extends { approvalId: number | null }
>(rows: T[]): Promise<(T & {
  sourceEntityType: string | null;
  sourceEntityId: number | null;
  sourceApprovalId: number | null;
  sourceApprovalTitle: string | null;
})[]> {
  const approvalIds = Array.from(
    new Set(rows.map((r) => r.approvalId).filter((id): id is number => typeof id === "number")),
  );
  if (approvalIds.length === 0) {
    return rows.map((r) => ({
      ...r,
      sourceEntityType: null,
      sourceEntityId: null,
      sourceApprovalId: r.approvalId ?? null,
      sourceApprovalTitle: null,
    }));
  }
  const approvals = await db
    .select({
      id: approvalsTable.id,
      title: approvalsTable.title,
      sourceEntityType: approvalsTable.sourceEntityType,
      sourceEntityId: approvalsTable.sourceEntityId,
    })
    .from(approvalsTable)
    .where(inArray(approvalsTable.id, approvalIds));
  const byId = new Map(approvals.map((a) => [a.id, a]));
  return rows.map((r) => {
    const a = r.approvalId != null ? byId.get(r.approvalId) ?? null : null;
    return {
      ...r,
      sourceEntityType: a?.sourceEntityType ?? null,
      sourceEntityId: a?.sourceEntityId ?? null,
      sourceApprovalId: a?.id ?? r.approvalId ?? null,
      sourceApprovalTitle: a?.title ?? null,
    };
  });
}

// 1) ─── HQ approval thresholds ───────────────────────────────────────────
//
// 본부장(hq_executive) 본인이 본인 임계 금액을 본다/세운다.
// platform_admin 은 모든 본부장 row 를 볼 수 있다 (감사용).

router.get("/hq-approval-thresholds", async (req, res): Promise<void> => {
  const user = req.user!;
  if (user.role === "platform_admin") {
    const rows = await db.select().from(hqApprovalThresholdsTable);
    res.json(rows);
    return;
  }
  if (user.role !== "hq_executive") {
    res.status(403).json({ error: "본부장 또는 관리자만 접근할 수 있습니다" });
    return;
  }
  const rows = await db
    .select()
    .from(hqApprovalThresholdsTable)
    .where(eq(hqApprovalThresholdsTable.hqUserId, user.userId));
  res.json(rows);
});

router.put(
  "/hq-approval-thresholds",
  requireRole("hq_executive", "platform_admin"),
  async (req, res): Promise<void> => {
    const user = req.user!;
    const { buildingId, thresholdAmount, hqUserId } = req.body || {};
    if (typeof thresholdAmount !== "number" || !Number.isFinite(thresholdAmount) || thresholdAmount < 0) {
      res.status(400).json({ error: "임계 금액은 0 이상의 숫자여야 합니다" });
      return;
    }
    const targetUserId = user.role === "platform_admin" && hqUserId ? Number(hqUserId) : user.userId;
    const buildingIdValue = buildingId === undefined || buildingId === null ? null : Number(buildingId);

    // upsert by (hq_user_id, building_id)
    const existing = await db
      .select()
      .from(hqApprovalThresholdsTable)
      .where(
        and(
          eq(hqApprovalThresholdsTable.hqUserId, targetUserId),
          buildingIdValue === null
            ? isNull(hqApprovalThresholdsTable.buildingId)
            : eq(hqApprovalThresholdsTable.buildingId, buildingIdValue),
        ),
      );

    if (existing.length > 0) {
      const [row] = await db
        .update(hqApprovalThresholdsTable)
        .set({ thresholdAmount, updatedByUserId: user.userId })
        .where(eq(hqApprovalThresholdsTable.id, existing[0].id))
        .returning();
      res.json(row);
      return;
    }
    const [row] = await db
      .insert(hqApprovalThresholdsTable)
      .values({ hqUserId: targetUserId, buildingId: buildingIdValue, thresholdAmount, updatedByUserId: user.userId })
      .returning();
    res.status(201).json(row);
  },
);

// 2) ─── Submit a draft as an approval line with auto-routing ────────────────
//
// POST /approvals/:id/submit-line
//   body: { urgentExecution?: boolean, urgentConsentMemo?: string }
//
// 동작:
//   - 라인이 임시 저장(isDraft) 상태여야 한다.
//   - 라인의 buildingId 와 estimatedAmount 를 보고:
//       a) 해당 건물에 본부장(hq_executive) 가 배정되어 있고
//       b) estimatedAmount >= 본부장 임계 금액 이면
//     "관리소장 상신 → 본부장 결재 → 관리인 결재" 2단계로 구성.
//   - 그 외(임계 미만 / 본부장 미배정) "관리소장 상신 → 관리인 결재" 1단계.
//   - 관리인이 가입돼 있으면 해당 단계 path = electronic, 아니면 offline.
//   - 본부장도 동일 규칙. 본부장이 가입돼 있어도 path 는 본부장 본인 의사대로
//     선택할 수 있게 기본 offline 으로 두되, electronic 경로가 열려 있으면
//     본인 결재함에 자동 노출(approvalSteps 라우터의 권한 검사로 처리).
//   - urgentExecution=true 면 즉시 지출결의서·입금요청서 발행 + 필수업무 자동 등록 +
//     서명 단계는 signedCopyMissing=true 로 표시.

async function findCustodianForBuilding(buildingId: number | null): Promise<typeof usersTable.$inferSelect | null> {
  // [Task #611 fix] cross-building 폴백 제거.
  //   기존 구현은 "해당 건물 custodian 이 없으면 시스템 임의 custodian" 으로 라우팅하여
  //   다른 건물 사용자에게 결재권/알림이 새는 cross-tenant 노출이었다.
  //   이제는 반드시 건물에 직접 등록된 custodian 만 결재자로 인정한다.
  if (!buildingId) return null;
  const directRows = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.role, "custodian"), eq(usersTable.buildingId, buildingId)));
  return directRows[0] ?? null;
}

async function findHqExecutiveForBuilding(buildingId: number | null): Promise<typeof usersTable.$inferSelect | null> {
  if (!buildingId) return null;
  const assigned = await db
    .select({ user: usersTable })
    .from(hqBuildingAssignmentsTable)
    .innerJoin(usersTable, eq(usersTable.id, hqBuildingAssignmentsTable.hqUserId))
    .where(eq(hqBuildingAssignmentsTable.buildingId, buildingId))
    .limit(1);
  return assigned[0]?.user ?? null;
}

async function thresholdForHqAndBuilding(hqUserId: number, buildingId: number | null): Promise<number | null> {
  if (buildingId) {
    const buildingRow = await db
      .select()
      .from(hqApprovalThresholdsTable)
      .where(
        and(
          eq(hqApprovalThresholdsTable.hqUserId, hqUserId),
          eq(hqApprovalThresholdsTable.buildingId, buildingId),
        ),
      );
    if (buildingRow[0]) return buildingRow[0].thresholdAmount;
  }
  const defaultRow = await db
    .select()
    .from(hqApprovalThresholdsTable)
    .where(and(eq(hqApprovalThresholdsTable.hqUserId, hqUserId), isNull(hqApprovalThresholdsTable.buildingId)));
  return defaultRow[0]?.thresholdAmount ?? null;
}

async function issueDownstreamDocuments(
  approval: typeof approvalsTable.$inferSelect,
  awaitingPostApproval: boolean,
): Promise<void> {
  // 같은 approval 에 대해 이미 발행됐으면 skip (멱등).
  const existingVoucher = await db
    .select()
    .from(expenseVouchersTable)
    .where(eq(expenseVouchersTable.approvalId, approval.id))
    .limit(1);
  if (existingVoucher[0]) return;

  const amount = approval.estimatedAmount ?? 0;

  const [voucher] = await db
    .insert(expenseVouchersTable)
    .values({
      approvalId: approval.id,
      buildingId: approval.buildingId ?? null,
      title: approval.title,
      description: approval.description,
      vendorName: approval.vendorName ?? null,
      amount,
      status: "pending",
      awaitingPostApproval,
    })
    .returning();

  const [request] = await db
    .insert(paymentRequestsTable)
    .values({
      approvalId: approval.id,
      expenseVoucherId: voucher.id,
      buildingId: approval.buildingId ?? null,
      title: approval.title,
      description: approval.description,
      vendorName: approval.vendorName ?? null,
      amount,
      status: "pending",
      awaitingPostApproval,
    })
    .returning();

  // 경리 알림 — 지출결의서함.
  await insertNotification({
    recipientType: "role:accountant",
    notificationType: "expense_voucher_issued",
    title: awaitingPostApproval ? "긴급 지출결의서(사후결재 대기)" : "지출결의서 발행",
    message: `${approval.title} — 출납등록을 진행해주세요`,
    relatedEntityType: "expense_voucher",
    relatedEntityId: voucher.id,
  });
  // 관리인 알림 — 입금요청함.
  if (approval.custodianApproverId) {
    await insertNotification({
      recipientType: `user:${approval.custodianApproverId}`,
      notificationType: "payment_request_issued",
      title: awaitingPostApproval ? "긴급 입금요청서(사후결재 대기)" : "입금요청서 도착",
      message: `${approval.title} — 송금완료 처리해주세요`,
      relatedEntityType: "payment_request",
      relatedEntityId: request.id,
    });
  } else {
    await insertNotification({
      recipientType: "role:custodian",
      notificationType: "payment_request_issued",
      title: awaitingPostApproval ? "긴급 입금요청서(사후결재 대기)" : "입금요청서 도착",
      message: `${approval.title} — 송금완료 처리해주세요`,
      relatedEntityType: "payment_request",
      relatedEntityId: request.id,
    });
  }
}

router.post("/approvals/:id/submit-line", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const user = req.user!;
  const body = req.body || {};
  const urgent = !!body.urgentExecution;
  const urgentMemo = typeof body.urgentConsentMemo === "string" ? body.urgentConsentMemo.trim() : "";

  const [existing] = await db.select().from(approvalsTable).where(eq(approvalsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "결재 요청을 찾을 수 없습니다" });
    return;
  }
  if (existing.requesterId !== user.userId && user.role !== "platform_admin") {
    res.status(403).json({ error: "본인의 기안만 상신할 수 있습니다" });
    return;
  }
  if (!existing.isDraft) {
    res.status(400).json({ error: "이미 상신된 라인입니다" });
    return;
  }
  if (urgent && !urgentMemo) {
    res.status(400).json({
      error: "긴급집행 라인은 유선 동의 메모(통화일시·통화자·요지)를 입력해야 합니다",
    });
    return;
  }

  const amount = existing.estimatedAmount ?? 0;

  // 관리인 결재자 결정 (반드시 해당 건물 소속).
  const custodian = await findCustodianForBuilding(existing.buildingId ?? null);
  // 본부장 결재 분기.
  const hqExec = await findHqExecutiveForBuilding(existing.buildingId ?? null);

  // [Task #611 round-7 fix] 운영 룰 — 관리인이 시스템에 가입되어 있지 않은 건물도
  //   결재 라인을 만들 수 있어야 한다 (관리인은 시스템 사용을 강제할 수 없는 외부
  //   인사인 경우가 많음). 등록된 custodian 이 없으면:
  //     - approverId 는 placeholder 로 상신자(관리소장)의 userId 를 박는다
  //       (FK 가 없는 컬럼이고, /process-offline 은 approverId 를 검증하지 않으므로
  //        상신자가 서명본 첨부로 단계를 마감할 수 있다)
  //     - approverRole = "custodian" 유지, approverName = "관리인 (미등록)"
  //     - path 는 강제로 "offline" — 미등록 사용자가 전자결재 처리 자체가 불가
  //     - signedCopyMissing = true 로 표시해 인쇄·서명·스캔 첨부 책임을 시각화
  //   cross-tenant 폴백은 여전히 막혀 있다 (다른 건물 custodian 은 절대 끌어다 쓰지
  //   않는다 — 이 함수가 building 한정으로만 조회하기 때문).
  const hasRegisteredCustodian = !!custodian;
  let thresholdSnapshot: number | null = null;
  let needsHqStep = false;
  if (hqExec) {
    thresholdSnapshot = await thresholdForHqAndBuilding(hqExec.id, existing.buildingId ?? null);
    if (thresholdSnapshot !== null && amount >= thresholdSnapshot) {
      needsHqStep = true;
    }
  }

  // 기존 단계 비우고 다시 구성.
  await db.delete(approvalStepsTable).where(eq(approvalStepsTable.approvalId, id));

  // [Task #611 fix] 운영 룰 — 기본 라인은 "offline" (서명본 인쇄·서명·스캔 첨부).
  // body.preferElectronicPath=true 이고 결재자가 등록 사용자면 "electronic" 으로
  // 명시 전환 가능. 긴급집행은 단계를 즉시 승인 처리하고 서명본은 사후 첨부.
  const preferElectronic = body.preferElectronicPath === true;
  const stepPath = urgent ? "offline" : preferElectronic ? "electronic" : "offline";
  let order = 1;
  if (needsHqStep && hqExec) {
    await db.insert(approvalStepsTable).values({
      approvalId: id,
      stepOrder: order++,
      approverId: hqExec.id,
      approverName: hqExec.name,
      approverRole: "hq_executive",
      status: urgent ? "approved" : "pending",
      path: stepPath,
      signedCopyMissing: urgent,
      decidedAt: urgent ? new Date() : null,
      processedAt: urgent ? new Date() : null,
      comment: urgent ? "긴급집행 사후결재 대기" : null,
    });
  }
  // [Task #611 round-7] 미등록 관리인이어도 단계는 항상 1개 만든다 (offline 강제).
  await db.insert(approvalStepsTable).values({
    approvalId: id,
    stepOrder: order++,
    approverId: hasRegisteredCustodian ? custodian!.id : user.userId,
    approverName: hasRegisteredCustodian ? custodian!.name : "관리인 (미등록)",
    approverRole: "custodian",
    status: urgent ? "approved" : "pending",
    path: hasRegisteredCustodian ? stepPath : "offline",
    signedCopyMissing: urgent || !hasRegisteredCustodian,
    decidedAt: urgent ? new Date() : null,
    processedAt: urgent ? new Date() : null,
    comment: urgent
      ? "긴급집행 사후결재 대기"
      : hasRegisteredCustodian
        ? null
        : "관리인 미가입 — 상신자가 인쇄·서명·스캔 후 첨부",
  });

  const totalSteps = order - 1;

  // [Task #610] 단일 통로 — 라인 상신(submit) lifecycle UPDATE 도 saveProducingDocument 로.
  const updated = await saveProducingDocument({
    write: (exec) =>
      exec
        .update(approvalsTable)
        .set({
          isDraft: false,
          status: urgent ? "approved" : totalSteps > 0 ? "in_progress" : "pending",
          currentStep: 1,
          totalSteps: Math.max(totalSteps, 1),
          urgentExecution: urgent,
          urgentConsentMemo: urgent ? urgentMemo : null,
          hqThresholdSnapshot: thresholdSnapshot,
          hqApproverId: needsHqStep && hqExec ? hqExec.id : null,
          custodianApproverId: custodian?.id ?? null,
          approvedAt: urgent ? new Date() : null,
        })
        .where(eq(approvalsTable.id, id))
        .returning()
        .then((r) => r[0]),
    document: {
      kind: "approval",
      sourceTable: "approvals",
      state: urgent ? "completed" : "submitted",
      title: (r) => r.title,
      authorId: (r) => r.requesterId,
      buildingId: (r) => r.buildingId,
      href: (r) => `/approvals/${r.id}`,
    },
  });

  // 다음 결재자 알림 (정상 경로) — 첫 단계.
  if (!urgent && totalSteps > 0) {
    const [first] = await db
      .select()
      .from(approvalStepsTable)
      .where(eq(approvalStepsTable.approvalId, id))
      .orderBy(approvalStepsTable.stepOrder)
      .limit(1);
    if (first) {
      await insertNotification({
        recipientType: `user:${first.approverId}`,
        notificationType: "approval_step_pending",
        title: "결재 요청 도착",
        message: `${existing.title} — 검토 후 결재해주세요`,
        relatedEntityType: "approval",
        relatedEntityId: id,
      });
    }
  }

  // 긴급집행 라인은 즉시 지출결의서·입금요청서 발행 + "사후결재 받기" 필수업무 자동 등록.
  if (urgent) {
    const [task] = await db
      .insert(tasksTable)
      .values({
        title: `긴급지출 기안서 사후결재 받기 — ${existing.title}`,
        description: `긴급집행으로 발행된 라인의 본부장/관리인 서명본을 사후 첨부해야 합니다.\n\n유선 동의 메모: ${urgentMemo}\n\n원본 기안 라인 ID: ${id}`,
        category: "approval",
        priority: "high",
        status: "pending",
      })
      .returning();
    // [allow-direct-write: urgentTaskId 외래키 포인터만 갱신; 라이프사이클 상태 변화 없음
    //   (status·isDraft 등은 위 saveProducingDocument 가 이미 documents 동기화).
    //   트리거 documents_approvals_aiu 가 updated_at 만 새로고침한다.]
    await db.update(approvalsTable).set({ urgentTaskId: task.id }).where(eq(approvalsTable.id, id));
    await issueDownstreamDocuments({ ...updated, urgentTaskId: task.id }, true);
  }

  res.json(serializeApproval(updated));
});

// 3) ─── Signed copies (서명본) ─────────────────────────────────────────────

router.get("/approvals/:id/steps/:stepId/signed-copies", async (req, res): Promise<void> => {
  const approvalId = Number(req.params.id);
  const stepId = Number(req.params.stepId);
  const user = req.user!;

  // [Task #611 fix] 서명본 열람 권한 — 매니저 일괄 통과는 cross-building 노출이라
  // 위험. 상신자/해당 결재자/platform_admin 만 무조건 허용하고, manager 는
  // approval.buildingId 가 본인 빌딩 범위와 일치할 때만 허용한다.
  const [approval] = await db.select().from(approvalsTable).where(eq(approvalsTable.id, approvalId));
  if (!approval) {
    res.status(404).json({ error: "결재 요청을 찾을 수 없습니다" });
    return;
  }
  const stepRows = await db
    .select()
    .from(approvalStepsTable)
    .where(eq(approvalStepsTable.approvalId, approvalId));
  const isApprover = stepRows.some((s) => s.approverId === user.userId);
  const isRequester = approval.requesterId === user.userId;
  let isAuthorized = isRequester || isApprover || user.role === "platform_admin";
  if (!isAuthorized && user.role === "manager") {
    const scope = await accessibleBuildingIds(user.userId, user.role);
    if (
      approval.buildingId === null
        ? scope.includeNullBuilding
        : scope.ids.includes(approval.buildingId)
    ) {
      isAuthorized = true;
    }
  }
  if (!isAuthorized) {
    res.status(403).json({ error: "서명본 열람 권한이 없습니다" });
    return;
  }

  // [Task #611 fix] 교체된(replacedById 가 채워진) 이전 버전은 목록에서 숨겨,
  //   페이지별 UI 가 같은 페이지의 여러 버전을 동시에 보여주지 않도록 한다.
  //   원본 이력은 DB 에 그대로 남아 감사 추적은 보존된다.
  const rows = await db
    .select()
    .from(approvalSignedCopiesTable)
    .where(and(
      eq(approvalSignedCopiesTable.stepId, stepId),
      eq(approvalSignedCopiesTable.approvalId, approvalId),
      isNull(approvalSignedCopiesTable.replacedById),
    ))
    .orderBy(approvalSignedCopiesTable.pageNumber, approvalSignedCopiesTable.id);
  res.json(rows.map(serializeSignedCopy));
});

router.post("/approvals/:id/steps/:stepId/signed-copies", async (req, res): Promise<void> => {
  const approvalId = Number(req.params.id);
  const stepId = Number(req.params.stepId);
  const body = req.body || {};
  const user = req.user!;

  if (!body.fileUrl || !body.fileName) {
    res.status(400).json({ error: "파일 정보(fileName, fileUrl)가 필요합니다" });
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

  // 권한: 관리소장(상신자), 해당 단계 결재자, platform_admin.
  const [approval] = await db.select().from(approvalsTable).where(eq(approvalsTable.id, approvalId));
  const isRequester = approval?.requesterId === user.userId;
  const isStepApprover = step.approverId === user.userId;
  if (!isRequester && !isStepApprover && user.role !== "platform_admin") {
    res.status(403).json({ error: "서명본 업로드 권한이 없습니다" });
    return;
  }

  const userName = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, user.userId))
    .then((rows) => rows[0]?.name ?? user.email);

  const validMethods = ["drag_drop", "file_picker", "camera", "gallery"];
  const uploadMethod = validMethods.includes(body.uploadMethod) ? body.uploadMethod : "file_picker";
  const validKinds = ["offline_scan", "electronic_pdf"];
  const kind = validKinds.includes(body.kind) ? body.kind : step.path === "electronic" ? "electronic_pdf" : "offline_scan";

  const [row] = await db
    .insert(approvalSignedCopiesTable)
    .values({
      approvalId,
      stepId,
      pageNumber: body.pageNumber ?? 1,
      fileName: body.fileName,
      fileUrl: body.fileUrl,
      mimeType: body.mimeType ?? null,
      fileHash: body.fileHash ?? null,
      uploadMethod,
      kind,
      uploadedBy: user.userId,
      uploadedByName: userName,
    })
    .returning();

  // 서명본이 들어오면 단계의 signedCopyMissing 해제.
  await db.update(approvalStepsTable).set({ signedCopyMissing: false }).where(eq(approvalStepsTable.id, stepId));

  // 라인 전체에 결재 단계 미보관이 더 이상 없으면 긴급집행 필수업무도 자동 해제.
  const [updatedApproval] = await db.select().from(approvalsTable).where(eq(approvalsTable.id, approvalId));
  if (updatedApproval?.urgentExecution && updatedApproval.urgentTaskId) {
    const remaining = await db
      .select()
      .from(approvalStepsTable)
      .where(and(eq(approvalStepsTable.approvalId, approvalId), eq(approvalStepsTable.signedCopyMissing, true)));
    if (remaining.length === 0) {
      await db
        .update(tasksTable)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(tasksTable.id, updatedApproval.urgentTaskId));
      await db
        .update(expenseVouchersTable)
        .set({ awaitingPostApproval: false })
        .where(eq(expenseVouchersTable.approvalId, approvalId));
      await db
        .update(paymentRequestsTable)
        .set({ awaitingPostApproval: false })
        .where(eq(paymentRequestsTable.approvalId, approvalId));
    }
  }

  res.status(201).json(serializeSignedCopy(row));
});

// [Task #611 fix] 전자결재 결정의 표준 산출물(canonical artifact).
//   approvalSteps /process 가 전자결재 단계를 닫을 때 적재한 signed_copies row
//   의 fileUrl 이 가리키는 GET 엔드포인트. 결재 메타(누가/언제/의견/상신자)를
//   영구 보관해 종이 서명본과 동일한 추적성을 갖게 한다.
router.get("/approvals/:id/steps/:stepId/electronic-decision", async (req, res): Promise<void> => {
  const approvalId = Number(req.params.id);
  const stepId = Number(req.params.stepId);
  const user = req.user!;

  const [approval] = await db.select().from(approvalsTable).where(eq(approvalsTable.id, approvalId));
  const [step] = await db
    .select()
    .from(approvalStepsTable)
    .where(and(eq(approvalStepsTable.id, stepId), eq(approvalStepsTable.approvalId, approvalId)));
  if (!approval || !step) {
    res.status(404).json({ error: "결재 단계를 찾을 수 없습니다" });
    return;
  }
  // 동일 권한 모델: 상신자/해당 결재자/platform_admin/스코프 일치 manager.
  const isRequester = approval.requesterId === user.userId;
  const isApprover = step.approverId === user.userId;
  let isAuthorized = isRequester || isApprover || user.role === "platform_admin";
  if (!isAuthorized && user.role === "manager") {
    const scope = await accessibleBuildingIds(user.userId, user.role);
    if (
      approval.buildingId === null
        ? scope.includeNullBuilding
        : scope.ids.includes(approval.buildingId)
    ) {
      isAuthorized = true;
    }
  }
  if (!isAuthorized) {
    res.status(403).json({ error: "결재 결과 열람 권한이 없습니다" });
    return;
  }
  res.json({
    approvalId,
    stepId,
    title: approval.title,
    requesterId: approval.requesterId,
    requesterName: approval.requesterName,
    approverId: step.approverId,
    approverName: step.approverName,
    approverRole: step.approverRole,
    decision: step.status,
    comment: step.comment,
    decidedAt: step.decidedAt?.toISOString() ?? step.processedAt?.toISOString() ?? null,
    path: step.path,
    signatureId: step.signatureId,
  });
});

// 잘못 올린 파일 교체. 새 row 를 적재하고 이전 row 는 replacedById 로 마킹.
router.post("/approvals/:id/steps/:stepId/signed-copies/:copyId/replace", async (req, res): Promise<void> => {
  const approvalId = Number(req.params.id);
  const stepId = Number(req.params.stepId);
  const copyId = Number(req.params.copyId);
  const body = req.body || {};
  const user = req.user!;

  if (!body.fileUrl || !body.fileName || !body.replaceReason) {
    res.status(400).json({ error: "교체 사유(replaceReason)와 새 파일 정보가 필요합니다" });
    return;
  }

  // [Task #611 fix] 교체 대상이 해당 approval/step 에 속하는지 + 권한 검증.
  const [old] = await db
    .select()
    .from(approvalSignedCopiesTable)
    .where(eq(approvalSignedCopiesTable.id, copyId));
  if (!old || old.approvalId !== approvalId || old.stepId !== stepId) {
    res.status(404).json({ error: "원본 첨부를 찾을 수 없습니다" });
    return;
  }

  const [step] = await db
    .select()
    .from(approvalStepsTable)
    .where(and(eq(approvalStepsTable.id, stepId), eq(approvalStepsTable.approvalId, approvalId)));
  const [approval] = await db.select().from(approvalsTable).where(eq(approvalsTable.id, approvalId));
  const isRequester = approval?.requesterId === user.userId;
  const isStepApprover = step?.approverId === user.userId;
  if (!isRequester && !isStepApprover && user.role !== "platform_admin") {
    res.status(403).json({ error: "서명본 교체 권한이 없습니다" });
    return;
  }

  const userName = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, user.userId))
    .then((rows) => rows[0]?.name ?? user.email);

  const [newRow] = await db
    .insert(approvalSignedCopiesTable)
    .values({
      approvalId: old.approvalId,
      stepId,
      pageNumber: old.pageNumber,
      fileName: body.fileName,
      fileUrl: body.fileUrl,
      mimeType: body.mimeType ?? old.mimeType ?? null,
      fileHash: body.fileHash ?? null,
      uploadMethod: body.uploadMethod ?? old.uploadMethod,
      kind: old.kind,
      uploadedBy: user.userId,
      uploadedByName: userName,
      replaceReason: body.replaceReason,
    })
    .returning();

  await db
    .update(approvalSignedCopiesTable)
    .set({ replacedById: newRow.id, replaceReason: body.replaceReason })
    .where(eq(approvalSignedCopiesTable.id, copyId));

  res.status(201).json(serializeSignedCopy(newRow));
});

// 4) ─── Offline-path step closure ───────────────────────────────────────────
//
// POST /approvals/:id/steps/:stepId/process-offline
//   body: { action: "approve" | "reject", comment?: string, decidedAt?: ISOstring }
// 관리소장(상신자) 또는 platform_admin 이 본부장/관리인 결재 결과를 대신 닫는다.
// 적어도 1장 이상의 서명본이 첨부돼 있어야 닫을 수 있다 (긴급집행 라인의 사후 마감 제외).
router.post("/approvals/:id/steps/:stepId/process-offline", async (req, res): Promise<void> => {
  const approvalId = Number(req.params.id);
  const stepId = Number(req.params.stepId);
  const { action, comment, decidedAt } = req.body || {};
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
  if (approval.requesterId !== user.userId && user.role !== "platform_admin") {
    res.status(403).json({ error: "오프라인 결재는 상신자(관리소장) 또는 관리자만 대리 처리할 수 있습니다" });
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
    res.status(400).json({ error: "현재 결재 순서가 아닙니다" });
    return;
  }
  if (step.status !== "pending" && step.status !== "awaiting_offline") {
    res.status(400).json({ error: "이미 처리된 단계입니다" });
    return;
  }

  // 승인 처리 시 서명본 1장 이상 필수 (긴급집행 사후결재는 별도 흐름).
  if (action === "approve") {
    const copies = await db
      .select()
      .from(approvalSignedCopiesTable)
      .where(eq(approvalSignedCopiesTable.stepId, stepId));
    if (copies.length === 0) {
      res.status(400).json({ error: "서명본을 1장 이상 첨부한 후 결재완료 처리할 수 있습니다" });
      return;
    }
  }

  const decided = decidedAt ? new Date(decidedAt) : new Date();
  const newStatus = action === "approve" ? "approved" : "rejected";
  await db
    .update(approvalStepsTable)
    .set({ status: newStatus, comment: comment ?? null, processedAt: new Date(), decidedAt: decided })
    .where(eq(approvalStepsTable.id, stepId));

  if (action === "reject") {
    // [Task #610] 단일 통로 — 라인 반려 transition 도 saveProducingDocument 로.
    await saveProducingDocument({
      write: (exec) =>
        exec
          .update(approvalsTable)
          .set({ status: "rejected", rejectionReason: comment ?? "반려됨" })
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
      message: `${approval.title} — ${comment ?? "반려 사유 없음"}`,
      relatedEntityType: "approval",
      relatedEntityId: approvalId,
    });
    res.json({ ok: true, status: "rejected" });
    return;
  }

  // 다음 단계로 진행 또는 라인 종결.
  const allSteps = await db
    .select()
    .from(approvalStepsTable)
    .where(eq(approvalStepsTable.approvalId, approvalId))
    .orderBy(approvalStepsTable.stepOrder);
  const nextPending = allSteps.find((s) => s.status === "pending" && s.id !== stepId);

  if (nextPending) {
    // [Task #610] 단일 통로 — 다음 단계 진행 transition.
    await saveProducingDocument({
      write: (exec) =>
        exec
          .update(approvalsTable)
          .set({ currentStep: nextPending.stepOrder, status: "in_progress" })
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
      recipientType: `user:${nextPending.approverId}`,
      notificationType: "approval_step_pending",
      title: "결재 요청 도착",
      message: `${approval.title} — 검토 후 결재해주세요`,
      relatedEntityType: "approval",
      relatedEntityId: approvalId,
    });
    res.json({ ok: true, nextStep: nextPending.stepOrder });
    return;
  }

  // 라인 종결 — 자동 발행.
  const userName = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, user.userId))
    .then((rows) => rows[0]?.name ?? user.email);
  // [Task #610] 단일 통로 — 라인 최종 승인 transition.
  const finalApproval = await saveProducingDocument({
    write: (exec) =>
      exec
        .update(approvalsTable)
        .set({ status: "approved", approverId: step.approverId, approverName: step.approverName, approvedAt: decided })
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

  await issueDownstreamDocuments(finalApproval, false);

  await insertNotification({
    recipientType: `user:${approval.requesterId}`,
    notificationType: "approval_completed",
    title: "결재 라인 완료",
    message: `${approval.title} — 지출결의서·입금요청서가 발행되었습니다`,
    relatedEntityType: "approval",
    relatedEntityId: approvalId,
  });

  res.json({ ok: true, status: "approved", processorName: userName });
});

// 5) ─── Expense vouchers (지출결의서함, 경리) ──────────────────────────────

// [Task #611 fix] 인박스 행은 사용자가 책임지는 건물 범위 안에서만 보여야 한다.
//   - platform_admin: 전체 행
//   - hq_executive: 본인에게 배정된 건물(hq_building_assignments)
//   - 그 외(accountant/manager/custodian): 본인 buildingId 한 곳
// null buildingId 행은 본사(공통) 안건이라 platform_admin/manager 만 본다.
async function accessibleBuildingIds(userId: number, role: string): Promise<{ allBuildings: boolean; ids: number[]; includeNullBuilding: boolean }> {
  if (role === "platform_admin") return { allBuildings: true, ids: [], includeNullBuilding: true };
  if (role === "hq_executive") {
    const assigned = await db
      .select({ buildingId: hqBuildingAssignmentsTable.buildingId })
      .from(hqBuildingAssignmentsTable)
      .where(eq(hqBuildingAssignmentsTable.hqUserId, userId));
    return { allBuildings: false, ids: assigned.map((r) => r.buildingId), includeNullBuilding: false };
  }
  const [u] = await db
    .select({ buildingId: usersTable.buildingId })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return {
    allBuildings: false,
    ids: u?.buildingId ? [u.buildingId] : [],
    includeNullBuilding: role === "manager",
  };
}

router.get("/expense-vouchers", async (req, res): Promise<void> => {
  const user = req.user!;
  const status = (req.query.status as string | undefined) ?? undefined;
  if (
    user.role !== "accountant" &&
    user.role !== "manager" &&
    user.role !== "platform_admin" &&
    user.role !== "hq_executive"
  ) {
    res.status(403).json({ error: "접근 권한이 없습니다" });
    return;
  }
  const scope = await accessibleBuildingIds(user.userId, user.role);
  let rows = await db
    .select()
    .from(expenseVouchersTable)
    .orderBy(desc(expenseVouchersTable.createdAt));
  if (!scope.allBuildings) {
    rows = rows.filter((r) => {
      if (r.buildingId === null) return scope.includeNullBuilding;
      return scope.ids.includes(r.buildingId);
    });
  }
  if (status) rows = rows.filter((r) => r.status === status);
  // [Task #682] 인박스 행에 출처 RFQ 등 백링크 부착.
  const enriched = await attachApprovalSource(rows.map(serializeVoucher));
  res.json(enriched);
});

router.get(
  "/expense-vouchers/:id",
  // [Task #611 fix] 단건 조회도 list 와 동일한 역할 정책으로 잠근다.
  //   facility_staff 등 다른 역할은 같은 빌딩이라도 voucher 단건을 볼 수 없다.
  requireRole("accountant", "manager", "platform_admin", "hq_executive"),
  async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const user = req.user!;
  const [row] = await db.select().from(expenseVouchersTable).where(eq(expenseVouchersTable.id, id));
  if (!row) {
    res.status(404).json({ error: "지출결의서를 찾을 수 없습니다" });
    return;
  }
  // [Task #611 fix] 단건 조회도 빌딩 스코프로 보호.
  const scope = await accessibleBuildingIds(user.userId, user.role);
  if (!scope.allBuildings) {
    const allowed =
      row.buildingId === null
        ? scope.includeNullBuilding
        : scope.ids.includes(row.buildingId);
    if (!allowed) {
      res.status(403).json({ error: "조회 권한이 없습니다" });
      return;
    }
  }
  res.json(serializeVoucher(row));
});

router.post(
  "/expense-vouchers/:id/record",
  requireRole("accountant", "manager", "platform_admin"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const body = req.body || {};
    const user = req.user!;
    if (!body.paidAt || !body.paymentMethod) {
      res.status(400).json({ error: "지급일과 지급방식을 입력해주세요" });
      return;
    }
    // [Task #611 fix] 객체 단위 권한 — 다른 건물 voucher 를 ID 만 알아도
    // 출납기록 처리하는 IDOR 를 막는다.
    const [target] = await db
      .select()
      .from(expenseVouchersTable)
      .where(eq(expenseVouchersTable.id, id));
    if (!target) {
      res.status(404).json({ error: "지출결의서를 찾을 수 없습니다" });
      return;
    }
    const scope = await accessibleBuildingIds(user.userId, user.role);
    if (!scope.allBuildings) {
      const allowed =
        target.buildingId === null
          ? scope.includeNullBuilding
          : scope.ids.includes(target.buildingId);
      if (!allowed) {
        res.status(403).json({ error: "해당 건물의 지출결의서를 처리할 권한이 없습니다" });
        return;
      }
    }
    const userName = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, user.userId))
      .then((rows) => rows[0]?.name ?? user.email);
    const [row] = await db
      .update(expenseVouchersTable)
      .set({
        paidAt: body.paidAt,
        paymentMethod: body.paymentMethod,
        accountMemo: body.accountMemo ?? null,
        receiptFileUrl: body.receiptFileUrl ?? null,
        recordedByUserId: user.userId,
        recordedByName: userName,
        recordedAt: new Date(),
        status: "recorded",
      })
      .where(eq(expenseVouchersTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "지출결의서를 찾을 수 없습니다" });
      return;
    }
    // 관리인에게 출납등록 완료 알림.
    await insertNotification({
      recipientType: "role:custodian",
      notificationType: "expense_voucher_recorded",
      title: "출납등록 완료",
      message: `${row.title} — 경리가 출납등록을 완료했습니다`,
      relatedEntityType: "expense_voucher",
      relatedEntityId: row.id,
    });
    res.json(serializeVoucher(row));
  },
);

// 6) ─── Payment requests (입금요청함, 관리인) ──────────────────────────────

router.get("/payment-requests", async (req, res): Promise<void> => {
  const user = req.user!;
  const status = (req.query.status as string | undefined) ?? undefined;
  if (
    user.role !== "custodian" &&
    user.role !== "manager" &&
    user.role !== "platform_admin" &&
    user.role !== "accountant" &&
    user.role !== "hq_executive"
  ) {
    res.status(403).json({ error: "접근 권한이 없습니다" });
    return;
  }
  const scope = await accessibleBuildingIds(user.userId, user.role);
  let rows = await db
    .select()
    .from(paymentRequestsTable)
    .orderBy(desc(paymentRequestsTable.createdAt));
  if (!scope.allBuildings) {
    rows = rows.filter((r) => {
      if (r.buildingId === null) return scope.includeNullBuilding;
      return scope.ids.includes(r.buildingId);
    });
  }
  if (status) rows = rows.filter((r) => r.status === status);
  // [Task #682] 인박스 행에 출처 RFQ 등 백링크 부착.
  const enriched = await attachApprovalSource(rows.map(serializePaymentRequest));
  res.json(enriched);
});

router.get(
  "/payment-requests/:id",
  // [Task #611 fix] 단건 조회도 list 와 동일한 역할 정책으로 잠근다.
  //   facility_staff 등 다른 역할은 같은 빌딩이라도 입금요청서 단건을 볼 수 없다.
  requireRole("custodian", "manager", "platform_admin", "accountant", "hq_executive"),
  async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const user = req.user!;
  const [row] = await db.select().from(paymentRequestsTable).where(eq(paymentRequestsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "입금요청서를 찾을 수 없습니다" });
    return;
  }
  const scope = await accessibleBuildingIds(user.userId, user.role);
  if (!scope.allBuildings) {
    const allowed =
      row.buildingId === null
        ? scope.includeNullBuilding
        : scope.ids.includes(row.buildingId);
    if (!allowed) {
      res.status(403).json({ error: "조회 권한이 없습니다" });
      return;
    }
  }
  res.json(serializePaymentRequest(row));
});

router.post(
  "/payment-requests/:id/remit",
  requireRole("custodian", "manager", "platform_admin"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const body = req.body || {};
    const user = req.user!;
    if (!body.remittedAt) {
      res.status(400).json({ error: "송금일을 입력해주세요" });
      return;
    }
    // [Task #611 fix] 객체 단위 권한 — 다른 건물 입금요청서 IDOR 방지.
    const [target] = await db
      .select()
      .from(paymentRequestsTable)
      .where(eq(paymentRequestsTable.id, id));
    if (!target) {
      res.status(404).json({ error: "입금요청서를 찾을 수 없습니다" });
      return;
    }
    const scope = await accessibleBuildingIds(user.userId, user.role);
    if (!scope.allBuildings) {
      const allowed =
        target.buildingId === null
          ? scope.includeNullBuilding
          : scope.ids.includes(target.buildingId);
      if (!allowed) {
        res.status(403).json({ error: "해당 건물의 입금요청서를 처리할 권한이 없습니다" });
        return;
      }
    }
    const userName = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, user.userId))
      .then((rows) => rows[0]?.name ?? user.email);

    const [row] = await db
      .update(paymentRequestsTable)
      .set({
        remittedAt: body.remittedAt,
        remittanceReceiptUrl: body.remittanceReceiptUrl ?? null,
        remittedByUserId: user.userId,
        remittedByName: userName,
        remittanceMemo: body.remittanceMemo ?? null,
        status: "remitted",
      })
      .where(eq(paymentRequestsTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "입금요청서를 찾을 수 없습니다" });
      return;
    }

    // [Task #611 fix] settlements 자동 동기화는 제거.
    //   기존 구현은 settlements.contractId == approvalId 라는 **의미가 없는** 키로
    //   조인해서 무관한 계약 정산이 paid 로 바뀔 수 있었다. approval ↔ settlement
    //   연결 모델이 정의되기 전까지는 송금 완료 시 별도 동기화를 하지 않는다.
    //   (정산은 별도 상호참조 컬럼이 도입되는 후속 작업에서 다시 연결한다.)

    await insertNotification({
      recipientType: "role:accountant",
      notificationType: "payment_remitted",
      title: "송금 완료",
      message: `${row.title} — 관리인이 송금완료 처리했습니다`,
      relatedEntityType: "payment_request",
      relatedEntityId: row.id,
    });
    res.json(serializePaymentRequest(row));
  },
);

export default router;
export { accessibleBuildingIds };

// Hook into final approval — exported for use in approvalSteps router.
export { issueDownstreamDocuments };
