import { insertNotification } from "../lib/notificationRecipient";
import { Router, type IRouter } from "express";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { db, approvalsTable, usersTable, approvalStepsTable, approvalRecipientsTable, notificationsTable, contractsTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth";
// [Task #610] 2층 단일 통로 — 기안서 commit 후 documents 레지스트리에 등록.
import { saveProducingDocument } from "../repo/producingDocuments";
import type { DocumentAuthorRole } from "@workspace/db";
import { tasksTable, inspectionsTable } from "@workspace/db";
import { transitionContractStatus } from "./contracts";
// [Task #611 fix] manager/accountant/custodian/hq_executive/facility 등 모든 비
//   platform_admin 역할에서 GET /approvals · /approvals/:id 가 본인 빌딩 스코프
//   밖의 결재를 노출하지 않도록 같은 정책을 재사용한다.
import { accessibleBuildingIds } from "./approvalPipeline";

const router: IRouter = Router();

function serializeApproval(r: typeof approvalsTable.$inferSelect) {
  return {
    ...r,
    // [Task #682] buildingId, sourceEntityType, sourceEntityId 등은 이미 spread 로
    //   포함된다. 명시적으로 keep 한다는 사실을 readability 차원에서 코멘트로 박는다.
    approvedAt: r.approvedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

router.get("/approvals", async (req, res): Promise<void> => {
  const status = req.query.status as string | undefined;
  const user = req.user!;
  let rows = await db.select().from(approvalsTable).orderBy(desc(approvalsTable.createdAt));

  rows = rows.filter((r) => !r.isDraft);

  // [Task #611 fix] 빌딩 스코프 강제 (multi-tenant 노출 방지).
  //   - platform_admin: 전체 노출.
  //   - hq_executive: hq_building_assignments 로 매핑된 건물만.
  //   - manager: 본인 buildingId + 본사(buildingId=null) 안건.
  //   - 그 외 역할(accountant/custodian/facility 등): 본인 buildingId
  //     + 본인이 상신했거나 본인이 결재자로 배정된 결재만.
  const scope = await accessibleBuildingIds(user.userId, user.role);
  if (!scope.allBuildings) {
    const assignedSteps = await db.select({ approvalId: approvalStepsTable.approvalId })
      .from(approvalStepsTable)
      .where(eq(approvalStepsTable.approverId, user.userId));
    const assignedIds = new Set(assignedSteps.map((s) => s.approvalId));
    rows = rows.filter((r) => {
      const inScope =
        (r.buildingId === null && scope.includeNullBuilding) ||
        (r.buildingId !== null && scope.ids.includes(r.buildingId));
      if (inScope) return true;
      // 스코프 밖이라도 본인이 상신/결재자인 건은 봐야 한다.
      return r.requesterId === user.userId || assignedIds.has(r.id);
    });
  }

  if (status) {
    rows = rows.filter((r) => r.status === status);
  }

  res.json(rows.map(serializeApproval));
});

router.get("/approvals/drafts", async (req, res): Promise<void> => {
  const user = req.user!;
  const rows = await db.select().from(approvalsTable)
    .where(and(eq(approvalsTable.isDraft, true), eq(approvalsTable.requesterId, user.userId)))
    .orderBy(desc(approvalsTable.createdAt));

  res.json(rows.map(serializeApproval));
});

router.post("/approvals", requireRole("manager", "platform_admin", "accountant"), async (req, res): Promise<void> => {
  const body = req.body;
  if (!body.title || !body.description || !body.category) {
    res.status(400).json({ error: "입력값이 올바르지 않습니다" });
    return;
  }
  const user = req.user!;

  const validCategories = ["maintenance", "inspection", "facility", "equipment", "other"];
  if (!validCategories.includes(body.category)) {
    res.status(400).json({ error: "유효하지 않은 분류입니다" });
    return;
  }

  const userName = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, user.userId))
    .then((rows) => rows[0]?.name ?? user.email);

  const steps = body.approvalSteps || [];
  const recipients = body.recipients || [];

  if (steps.length > 5) {
    res.status(400).json({ error: "결재선은 최대 5단계까지 설정할 수 있습니다" });
    return;
  }

  // [Task #682] RFQ 카드의 "기안서 작성" 진입에서 출처(rfq/quote/voucher 등)를
  //   approval row 에 함께 보존한다 — buildingId 도 같이 받아두어야 본부장 라인이
  //   자동 결정될 때 임계 매칭이 정확해진다.
  const buildingIdRaw = body.buildingId;
  const buildingIdValue =
    typeof buildingIdRaw === "number" && Number.isFinite(buildingIdRaw)
      ? buildingIdRaw
      : null;
  const sourceEntityType =
    typeof body.sourceEntityType === "string" && body.sourceEntityType.length > 0
      ? body.sourceEntityType
      : null;
  const sourceEntityIdRaw = body.sourceEntityId;
  const sourceEntityId =
    typeof sourceEntityIdRaw === "number" && Number.isFinite(sourceEntityIdRaw)
      ? sourceEntityIdRaw
      : null;

  // [Task #610] 2층 단일 통로 — 결재 INSERT + documents upsert 헬퍼 위임.
  let row: typeof approvalsTable.$inferSelect;
  try {
    row = await saveProducingDocument({
      write: (exec) =>
        exec
          .insert(approvalsTable)
          .values({
            title: body.title,
            description: body.description,
            category: body.category,
            templateId: body.templateId ?? null,
            estimatedAmount: body.estimatedAmount ?? null,
            vendorName: body.vendorName ?? null,
            vendorQuoteDetails: body.vendorQuoteDetails ?? null,
            relatedDraftId: body.relatedDraftId ?? null,
            relatedInspectionId: body.relatedInspectionId ?? null,
            requesterId: user.userId,
            requesterName: userName,
            buildingId: buildingIdValue,
            sourceEntityType,
            sourceEntityId,
            status: steps.length > 0 ? "in_progress" : "pending",
            isDraft: false,
            totalSteps: Math.max(steps.length, 1),
            currentStep: 1,
          })
          .returning()
          .then((r) => r[0]),
      document: {
        kind: "approval",
        sourceTable: "approvals",
        state: "submitted",
        title: (r) => r.title,
        authorId: user.userId,
        authorRole: (user.role as DocumentAuthorRole) ?? null,
        buildingId: (r) => r.buildingId,
        href: (r) => `/approvals/${r.id}`,
        metadata: (r) => ({ category: r.category, totalSteps: r.totalSteps }),
      },
    });
  } catch (err) {
    req.log.error({ err }, "[Task #610] approval saveProducingDocument failed");
    res.status(500).json({ error: "결재 상신 실패" });
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

  if (steps.length > 0) {
    await insertNotification({
      recipientType: `user:${steps[0].approverId}`,
      notificationType: "approval_step_pending",
      title: "결재 요청",
      message: `결재 요청이 도착했습니다: ${body.title}`,
      relatedEntityType: "approval",
      relatedEntityId: row.id,
    });
  }

  // saveProducingDocument 가 위에서 이미 documents 레지스트리에 같은 (kind, sourceTable,
  // sourceId) 로 등록을 마쳤다 — 별도의 registerDocument 호출은 중복이라 두지 않는다.

  res.status(201).json(serializeApproval(row));
});

router.get("/approvals/stats", requireRole("manager", "platform_admin"), async (_req, res): Promise<void> => {
  const allApprovals = await db.select().from(approvalsTable).orderBy(desc(approvalsTable.createdAt));

  const pending = allApprovals.filter((a) => a.status === "pending");
  const approved = allApprovals.filter((a) => a.status === "approved");
  const rejected = allApprovals.filter((a) => a.status === "rejected");

  const totalAmount = allApprovals.reduce((s, a) => s + (a.estimatedAmount ?? 0), 0);
  const approvedAmount = approved.reduce((s, a) => s + (a.estimatedAmount ?? 0), 0);

  const recentApprovals = allApprovals.slice(0, 5).map(serializeApproval);

  res.json({
    totalPending: pending.length,
    totalApproved: approved.length,
    totalRejected: rejected.length,
    totalAmount: Math.round(totalAmount),
    approvedAmount: Math.round(approvedAmount),
    recentApprovals,
  });
});

router.get("/approvals/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const user = req.user!;
  const [row] = await db.select().from(approvalsTable).where(eq(approvalsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "결재 요청을 찾을 수 없습니다" });
    return;
  }

  // [Task #611 fix] 빌딩 스코프 강제 + 상신자/결재자 통과.
  //   platform_admin 만 무조건 통과. 그 외에는:
  //     - 본인이 상신했거나 결재자로 배정된 결재 → 통과
  //     - 그렇지 않더라도 본인의 빌딩 스코프 안에 있고 manager 면 통과
  //   (manager 외 역할은 본인이 관여한 결재만 봐야 함.)
  const isRequester = row.requesterId === user.userId;
  const assignedSteps = await db.select({ id: approvalStepsTable.id })
    .from(approvalStepsTable)
    .where(and(eq(approvalStepsTable.approvalId, id), eq(approvalStepsTable.approverId, user.userId)));
  const isApprover = assignedSteps.length > 0;
  let isAuthorized = user.role === "platform_admin" || isRequester || isApprover;
  if (!isAuthorized && (user.role === "manager" || user.role === "hq_executive")) {
    const scope = await accessibleBuildingIds(user.userId, user.role);
    if (
      row.buildingId === null
        ? scope.includeNullBuilding
        : scope.ids.includes(row.buildingId)
    ) {
      isAuthorized = true;
    }
  }
  if (!isAuthorized) {
    res.status(403).json({ error: "접근 권한이 없습니다" });
    return;
  }

  res.json(serializeApproval(row));
});

router.post("/approvals/:id/approve", requireRole("manager", "platform_admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const user = req.user!;

  const [existing] = await db.select().from(approvalsTable).where(eq(approvalsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "결재 요청을 찾을 수 없습니다" });
    return;
  }

  if (existing.totalSteps > 1) {
    res.status(400).json({ error: "다단계 결재는 결재선을 통해 처리해주세요" });
    return;
  }

  const userName = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, user.userId))
    .then((rows) => rows[0]?.name ?? user.email);

  // [Task #610] 단일 통로 — 단건 승인 transition 도 saveProducingDocument 로.
  const row = await saveProducingDocument({
    write: (exec) =>
      exec
        .update(approvalsTable)
        .set({
          status: "approved",
          approverId: user.userId,
          approverName: userName,
          approvedAt: new Date(),
        })
        .where(eq(approvalsTable.id, id))
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

  const linkedContracts = await db.select().from(contractsTable).where(eq(contractsTable.approvalId, id));
  for (const c of linkedContracts) {
    if (c.status === "in_approval" || c.status === "draft") {
      await transitionContractStatus(c.id, "active");
    }
  }

  res.json(serializeApproval(row));
});

router.post("/approvals/:id/reject", requireRole("manager", "platform_admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const body = req.body;
  if (!body?.reason) {
    res.status(400).json({ error: "반려 사유를 입력해주세요" });
    return;
  }
  const user = req.user!;

  const [existing] = await db.select().from(approvalsTable).where(eq(approvalsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "결재 요청을 찾을 수 없습니다" });
    return;
  }

  if (existing.totalSteps > 1) {
    res.status(400).json({ error: "다단계 결재는 결재선을 통해 처리해주세요" });
    return;
  }

  const userName = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, user.userId))
    .then((rows) => rows[0]?.name ?? user.email);

  // [Task #610] 단일 통로 — 단건 반려 transition 도 saveProducingDocument 로.
  const row = await saveProducingDocument({
    write: (exec) =>
      exec
        .update(approvalsTable)
        .set({
          status: "rejected",
          approverId: user.userId,
          approverName: userName,
          rejectionReason: body.reason,
        })
        .where(eq(approvalsTable.id, id))
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

  res.json(serializeApproval(row));
});

router.get("/executive/kpi", requireRole("manager", "platform_admin"), async (_req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const allTasks = await db.select().from(tasksTable);
  const completedTasks = allTasks.filter((t) => t.status === "completed");
  const taskCompletionRate = allTasks.length > 0 ? Math.round((completedTasks.length / allTasks.length) * 1000) / 10 : 0;

  const allInspections = await db.select().from(inspectionsTable);
  const completedInspections = allInspections.filter((i) => i.status === "completed");
  const inspectionCompletionRate =
    allInspections.length > 0 ? Math.round((completedInspections.length / allInspections.length) * 1000) / 10 : 0;

  const pendingApprovals = await db
    .select()
    .from(approvalsTable)
    .where(eq(approvalsTable.status, "pending"));

  const approvedThisMonth = await db
    .select()
    .from(approvalsTable)
    .where(
      and(
        eq(approvalsTable.status, "approved"),
        gte(approvalsTable.approvedAt, monthStart),
        lte(approvalsTable.approvedAt, monthEnd)
      )
    );
  const monthlySpending = approvedThisMonth.reduce((s, a) => s + (a.estimatedAmount ?? 0), 0);

  const overdueItems = allTasks.filter(
    (t) => t.status !== "completed" && t.dueDate && t.dueDate < today
  ).length;

  res.json({
    inspectionCompletionRate,
    taskCompletionRate,
    pendingApprovals: pendingApprovals.length,
    monthlySpending: Math.round(monthlySpending),
    totalTasks: allTasks.length,
    completedTasks: completedTasks.length,
    totalInspections: allInspections.length,
    completedInspections: completedInspections.length,
    overdueItems,
  });
});

router.get("/executive/spending", requireRole("manager", "platform_admin"), async (req, res): Promise<void> => {
  const year = req.query.year ? Number(req.query.year) : undefined;
  const month = req.query.month ? Number(req.query.month) : undefined;

  let allApprovals = await db.select().from(approvalsTable);

  if (year && month) {
    allApprovals = allApprovals.filter((a) => {
      const d = a.createdAt;
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    });
  } else if (year) {
    allApprovals = allApprovals.filter((a) => a.createdAt.getFullYear() === year);
  }

  const totalSpending = allApprovals.reduce((s, a) => s + (a.estimatedAmount ?? 0), 0);
  const approvedSpending = allApprovals
    .filter((a) => a.status === "approved")
    .reduce((s, a) => s + (a.estimatedAmount ?? 0), 0);
  const pendingSpending = allApprovals
    .filter((a) => a.status === "pending")
    .reduce((s, a) => s + (a.estimatedAmount ?? 0), 0);

  const categoryMap: Record<string, { amount: number; count: number }> = {};
  for (const a of allApprovals) {
    if (!categoryMap[a.category]) categoryMap[a.category] = { amount: 0, count: 0 };
    categoryMap[a.category].amount += a.estimatedAmount ?? 0;
    categoryMap[a.category].count += 1;
  }
  const byCategory = Object.entries(categoryMap).map(([category, data]) => ({
    category,
    amount: Math.round(data.amount),
    count: data.count,
  }));

  const monthlyMap: Record<string, number> = {};
  for (const a of allApprovals) {
    const m = a.createdAt.toISOString().slice(0, 7);
    monthlyMap[m] = (monthlyMap[m] ?? 0) + (a.estimatedAmount ?? 0);
  }
  const monthlyTrend = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([m, amount]) => ({ month: m, amount: Math.round(amount) }));

  res.json({
    totalSpending: Math.round(totalSpending),
    approvedSpending: Math.round(approvedSpending),
    pendingSpending: Math.round(pendingSpending),
    byCategory,
    monthlyTrend,
  });
});

export default router;
