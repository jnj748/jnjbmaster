import { Router, type IRouter } from "express";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { db, approvalsTable, usersTable } from "@workspace/db";
import {
  ListApprovalsResponse,
  CreateApprovalBody,
  GetApprovalResponse,
  ApproveApprovalResponse,
  RejectApprovalBody,
  RejectApprovalResponse,
  GetApprovalStatsResponse,
  GetExecutiveKpiResponse,
  GetExecutiveSpendingResponse,
} from "@workspace/api-zod";
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

router.get("/approvals", requireRole("executive", "manager"), async (req, res): Promise<void> => {
  const status = req.query.status as string | undefined;
  const user = req.user!;
  let rows = await db.select().from(approvalsTable).orderBy(desc(approvalsTable.createdAt));

  if (user.role === "manager") {
    rows = rows.filter((r) => r.requesterId === user.userId);
  }

  if (status) {
    rows = rows.filter((r) => r.status === status);
  }

  res.json(ListApprovalsResponse.parse(rows.map(serializeApproval)));
});

router.post("/approvals", requireRole("manager", "facility_staff"), async (req, res): Promise<void> => {
  const parsed = CreateApprovalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "입력값이 올바르지 않습니다" });
    return;
  }
  const body = parsed.data;
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

  const [row] = await db
    .insert(approvalsTable)
    .values({
      title: body.title,
      description: body.description,
      category: body.category,
      estimatedAmount: body.estimatedAmount ?? null,
      vendorName: body.vendorName ?? null,
      vendorQuoteDetails: body.vendorQuoteDetails ?? null,
      relatedDraftId: body.relatedDraftId ?? null,
      relatedInspectionId: body.relatedInspectionId ?? null,
      requesterId: user.userId,
      requesterName: userName,
      status: "pending",
    })
    .returning();

  res.status(201).json(serializeApproval(row));
});

router.get("/approvals/stats", requireRole("executive", "manager"), async (_req, res): Promise<void> => {
  const allApprovals = await db.select().from(approvalsTable).orderBy(desc(approvalsTable.createdAt));

  const pending = allApprovals.filter((a) => a.status === "pending");
  const approved = allApprovals.filter((a) => a.status === "approved");
  const rejected = allApprovals.filter((a) => a.status === "rejected");

  const totalAmount = allApprovals.reduce((s, a) => s + (a.estimatedAmount ?? 0), 0);
  const approvedAmount = approved.reduce((s, a) => s + (a.estimatedAmount ?? 0), 0);

  const recentApprovals = allApprovals.slice(0, 5).map(serializeApproval);

  res.json(
    GetApprovalStatsResponse.parse({
      totalPending: pending.length,
      totalApproved: approved.length,
      totalRejected: rejected.length,
      totalAmount: Math.round(totalAmount),
      approvedAmount: Math.round(approvedAmount),
      recentApprovals,
    })
  );
});

router.get("/approvals/:id", requireRole("executive", "manager"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const user = req.user!;
  const [row] = await db.select().from(approvalsTable).where(eq(approvalsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "결재 요청을 찾을 수 없습니다" });
    return;
  }

  if (user.role === "manager" && row.requesterId !== user.userId) {
    res.status(403).json({ error: "접근 권한이 없습니다" });
    return;
  }

  res.json(GetApprovalResponse.parse(serializeApproval(row)));
});

router.post("/approvals/:id/approve", requireRole("executive"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const user = req.user!;

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

  if (!row) {
    res.status(404).json({ error: "결재 요청을 찾을 수 없습니다" });
    return;
  }

  res.json(ApproveApprovalResponse.parse(serializeApproval(row)));
});

router.post("/approvals/:id/reject", requireRole("executive"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = RejectApprovalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "반려 사유를 입력해주세요" });
    return;
  }
  const body = parsed.data;
  const user = req.user!;

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

  if (!row) {
    res.status(404).json({ error: "결재 요청을 찾을 수 없습니다" });
    return;
  }

  res.json(RejectApprovalResponse.parse(serializeApproval(row)));
});

router.get("/executive/kpi", requireRole("executive", "manager"), async (_req, res): Promise<void> => {
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

  res.json(
    GetExecutiveKpiResponse.parse({
      inspectionCompletionRate,
      taskCompletionRate,
      pendingApprovals: pendingApprovals.length,
      monthlySpending: Math.round(monthlySpending),
      totalTasks: allTasks.length,
      completedTasks: completedTasks.length,
      totalInspections: allInspections.length,
      completedInspections: completedInspections.length,
      overdueItems,
    })
  );
});

router.get("/executive/spending", requireRole("executive", "manager"), async (req, res): Promise<void> => {
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

  res.json(
    GetExecutiveSpendingResponse.parse({
      totalSpending: Math.round(totalSpending),
      approvedSpending: Math.round(approvedSpending),
      pendingSpending: Math.round(pendingSpending),
      byCategory,
      monthlyTrend,
    })
  );
});

export default router;
