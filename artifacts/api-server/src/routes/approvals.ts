import { Router, type IRouter } from "express";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { db, approvalsTable, usersTable, approvalStepsTable, approvalRecipientsTable, notificationsTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth";
import { tasksTable, inspectionsTable } from "@workspace/db";

const router: IRouter = Router();

function serializeApproval(r: typeof approvalsTable.$inferSelect) {
  return {
    ...r,
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

  if (user.role === "manager" || user.role === "platform_admin") {
  } else {
    const assignedSteps = await db.select({ approvalId: approvalStepsTable.approvalId })
      .from(approvalStepsTable)
      .where(eq(approvalStepsTable.approverId, user.userId));
    const assignedIds = new Set(assignedSteps.map((s) => s.approvalId));
    rows = rows.filter((r) => r.requesterId === user.userId || assignedIds.has(r.id));
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

router.post("/approvals", requireRole("manager", "platform_admin"), async (req, res): Promise<void> => {
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

  const [row] = await db
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
      status: steps.length > 0 ? "in_progress" : "pending",
      isDraft: false,
      totalSteps: Math.max(steps.length, 1),
      currentStep: 1,
    })
    .returning();

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
    await db.insert(notificationsTable).values({
      recipientType: `user:${steps[0].approverId}`,
      notificationType: "approval_step_pending",
      title: "결재 요청",
      message: `결재 요청이 도착했습니다: ${body.title}`,
      relatedEntityType: "approval",
      relatedEntityId: row.id,
    });
  }

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

  if (user.role !== "manager" && user.role !== "platform_admin") {
    const isRequester = row.requesterId === user.userId;
    const assignedSteps = await db.select({ id: approvalStepsTable.id })
      .from(approvalStepsTable)
      .where(and(eq(approvalStepsTable.approvalId, id), eq(approvalStepsTable.approverId, user.userId)));
    const isApprover = assignedSteps.length > 0;
    if (!isRequester && !isApprover) {
      res.status(403).json({ error: "접근 권한이 없습니다" });
      return;
    }
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

  const [row] = await db
    .update(approvalsTable)
    .set({
      status: "approved",
      approverId: user.userId,
      approverName: userName,
      approvedAt: new Date(),
    })
    .where(eq(approvalsTable.id, id))
    .returning();

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

  const [row] = await db
    .update(approvalsTable)
    .set({
      status: "rejected",
      approverId: user.userId,
      approverName: userName,
      rejectionReason: body.reason,
    })
    .where(eq(approvalsTable.id, id))
    .returning();

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
