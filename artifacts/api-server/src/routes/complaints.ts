import { insertNotification } from "../lib/notificationRecipient";
import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc, gte, sql, inArray } from "drizzle-orm";
import { db, complaintsTable, usersTable, unitsTable, notificationsTable, buildingsTable } from "@workspace/db";
import { SENSITIVE_CATEGORIES, RISK_KEYWORDS, complaintSensitivities } from "@workspace/db";
import {
  CreateComplaintBody,
  UpdateComplaintBody,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";
import { getAccessibleBuildingIds, canAccessBuilding } from "../middlewares/buildingScope";

type ComplaintSensitivity = (typeof complaintSensitivities)[number];

const router: IRouter = Router();
router.use("/complaints", requireRole("manager", "platform_admin", "accountant", "facility_staff", "hq_executive"));
async function getUserBuildingId(req: Request): Promise<number | null> {
  const userId = req.user?.userId;
  if (!userId) return null;
  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  return user?.buildingId ?? null;
}

function detectRiskKeywords(text: string): boolean {
  return RISK_KEYWORDS.some(keyword => text.includes(keyword));
}

function computeSensitivity(category: string, description: string, title: string, manualSensitivity?: string, isUrgent?: boolean): {
  sensitivity: ComplaintSensitivity;
  hasRiskKeyword: boolean;
  shouldEscalate: boolean;
} {
  let sensitivity: ComplaintSensitivity = (manualSensitivity as ComplaintSensitivity) || "normal";
  const hasRiskKeyword = detectRiskKeywords(description) || detectRiskKeywords(title);
  let shouldEscalate = false;

  if (SENSITIVE_CATEGORIES.includes(category)) {
    if (sensitivityLevel(sensitivity) < sensitivityLevel("sensitive")) {
      sensitivity = "sensitive";
    }
    shouldEscalate = true;
  }

  if (hasRiskKeyword) {
    if (sensitivityLevel(sensitivity) < sensitivityLevel("sensitive")) {
      sensitivity = "sensitive";
    }
    shouldEscalate = true;
  }

  if (isUrgent) {
    sensitivity = "urgent";
    shouldEscalate = true;
  }

  return { sensitivity, hasRiskKeyword, shouldEscalate };
}

function sensitivityLevel(s: string): number {
  const levels: Record<string, number> = { normal: 0, caution: 1, sensitive: 2, urgent: 3 };
  return levels[s] ?? 0;
}

async function checkRecurring(buildingId: number, unitNumber: string, category: string): Promise<{ isRecurring: boolean; recurringCount: number }> {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const byUnit = await db
    .select({ id: complaintsTable.id })
    .from(complaintsTable)
    .where(
      and(
        eq(complaintsTable.buildingId, buildingId),
        eq(complaintsTable.unitNumber, unitNumber),
        gte(complaintsTable.createdAt, sixMonthsAgo)
      )
    );

  const byCategory = await db
    .select({ id: complaintsTable.id })
    .from(complaintsTable)
    .where(
      and(
        eq(complaintsTable.buildingId, buildingId),
        eq(complaintsTable.category, category as never),
        gte(complaintsTable.createdAt, sixMonthsAgo)
      )
    );

  const count = Math.max(byUnit.length, byCategory.length) + 1;
  return { isRecurring: count >= 3, recurringCount: count };
}

async function createHqNotification(complaint: { id: number; title: string; category: string; sensitivity: string; buildingId: number }) {
  let buildingName = "관리 건물";
  try {
    const building = await db.select({ name: buildingsTable.name }).from(buildingsTable)
      .where(eq(buildingsTable.id, complaint.buildingId))
      .then(r => r[0]);
    if (building?.name) buildingName = building.name;
  } catch {
  }

  const CATEGORY_LABELS: Record<string, string> = {
    noise: "소음", parking: "주차", maintenance: "유지보수", cleaning: "청결",
    security: "보안", contract_legal: "계약/법무", management_dispute: "관리단 분쟁",
    accounting_issue: "회계 부적정", water_leak: "누수/방수", elevator: "승강기",
    floor_noise: "층간소음", other: "기타",
  };

  await insertNotification({
    recipientType: "hq_executive",
    notificationType: "complaint_escalation",
    title: `[민감 민원] ${buildingName} - ${complaint.title}`,
    message: `${buildingName}에서 ${CATEGORY_LABELS[complaint.category] || complaint.category} 카테고리의 민감 민원이 접수되었습니다. 민감도: ${complaint.sensitivity}`,
    relatedEntityType: "complaint",
    relatedEntityId: complaint.id,
  });
}

router.get("/complaints", async (req: Request, res: Response): Promise<void> => {
  const { category, status, sensitivity, isRecurring, escalatedToHq } = req.query as {
    category?: string; status?: string; sensitivity?: string;
    isRecurring?: string; escalatedToHq?: string;
  };

  // [Task #596] hq_executive 는 매핑된 건물 묶음에만 가시. platform_admin 만 전체.
  const scope = await getAccessibleBuildingIds(req);
  const conditions = [];
  if (!scope.unrestricted) {
    if (scope.ids.length === 0) { res.json([]); return; }
    if (scope.ids.length === 1) conditions.push(eq(complaintsTable.buildingId, scope.ids[0]));
    else conditions.push(inArray(complaintsTable.buildingId, scope.ids));
  }
  // category/status/sensitivity 는 enum 컬럼이라 string 인자를 넘기려면 좁은 타입으로 단언한다.
  if (category) conditions.push(eq(complaintsTable.category, category as never));
  if (status) conditions.push(eq(complaintsTable.status, status as never));
  if (sensitivity) conditions.push(eq(complaintsTable.sensitivity, sensitivity as never));
  if (isRecurring === "true") conditions.push(eq(complaintsTable.isRecurring, true));
  if (escalatedToHq === "true") conditions.push(eq(complaintsTable.escalatedToHq, true));

  const rows = await db
    .select()
    .from(complaintsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(complaintsTable.createdAt));

  res.json(rows);
});

router.post("/complaints", async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateComplaintBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }

  const unit = await db
    .select()
    .from(unitsTable)
    .where(and(eq(unitsTable.buildingId, buildingId), eq(unitsTable.unitNumber, parsed.data.unitNumber)))
    .then((r) => r[0]);

  const { sensitivity, hasRiskKeyword, shouldEscalate } = computeSensitivity(
    parsed.data.category,
    parsed.data.description,
    parsed.data.title,
    parsed.data.sensitivity,
    parsed.data.isUrgent
  );

  const { isRecurring, recurringCount } = await checkRecurring(buildingId, parsed.data.unitNumber, parsed.data.category);

  const { isUrgent, ...insertData } = parsed.data;
  const [row] = await db
    .insert(complaintsTable)
    .values({
      ...insertData,
      buildingId,
      unitId: unit?.id ?? null,
      sensitivity,
      hasRiskKeyword,
      isRecurring,
      recurringCount,
      photoUrls: insertData.photoUrls || [],
      escalatedToHq: shouldEscalate,
      escalatedAt: shouldEscalate ? new Date() : null,
    })
    .returning();

  if (shouldEscalate) {
    await createHqNotification({
      id: row.id,
      title: row.title,
      category: row.category,
      sensitivity: row.sensitivity,
      buildingId: row.buildingId,
    });
  }

  res.status(201).json(row);
});

router.patch("/complaints/:id", async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id as string);
  const parsed = UpdateComplaintBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }

  const updates: Partial<typeof complaintsTable.$inferInsert> = {};
  if (parsed.data.status) updates.status = parsed.data.status;
  if (parsed.data.assigneeName) updates.assigneeName = parsed.data.assigneeName;
  if (parsed.data.resolution) updates.resolution = parsed.data.resolution;
  if (parsed.data.sensitivity) {
    updates.sensitivity = parsed.data.sensitivity as ComplaintSensitivity;
  }
  if (parsed.data.status === "completed") updates.completedAt = new Date();

  const [row] = await db
    .update(complaintsTable)
    .set(updates)
    .where(and(eq(complaintsTable.id, id), eq(complaintsTable.buildingId, buildingId)))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(row);
});

router.post("/complaints/:id/escalate", async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id as string);
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }

  const [row] = await db
    .update(complaintsTable)
    .set({ escalatedToHq: true, escalatedAt: new Date(), status: "in_progress" })
    .where(and(eq(complaintsTable.id, id), eq(complaintsTable.buildingId, buildingId)))
    .returning();

  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  await createHqNotification({
    id: row.id,
    title: row.title,
    category: row.category,
    sensitivity: row.sensitivity,
    buildingId: row.buildingId,
  });

  res.json(row);
});

router.delete("/complaints/:id", async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id as string);
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }

  const [row] = await db
    .delete(complaintsTable)
    .where(and(eq(complaintsTable.id, id), eq(complaintsTable.buildingId, buildingId)))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json({ success: true });
});

router.get("/complaints/:id/history", async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id as string);
  const userRole = req.user?.role;

  const complaint = await db.select().from(complaintsTable)
    .where(eq(complaintsTable.id, id))
    .then(r => r[0]);

  if (!complaint) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // [Task #596] hq_executive 는 매핑된 건물 묶음에 한해 접근 허용.
  if (!(await canAccessBuilding(req, complaint.buildingId))) {
    res.status(403).json({ error: "접근 권한이 없습니다" });
    return;
  }

  const history = await db
    .select()
    .from(complaintsTable)
    .where(
      and(
        eq(complaintsTable.buildingId, complaint.buildingId),
        sql`(${complaintsTable.unitNumber} = ${complaint.unitNumber} OR ${complaintsTable.category} = ${complaint.category})`,
        sql`${complaintsTable.id} != ${id}`
      )
    )
    .orderBy(desc(complaintsTable.createdAt))
    .limit(20);

  res.json(history);
});

async function handleComplaintAnalytics(req: Request, res: Response): Promise<void> {
  // [Task #596] hq_executive 는 매핑된 건물 묶음의 민원만 분석. platform_admin 만 무제한.
  const scope = await getAccessibleBuildingIds(req);
  if (!scope.unrestricted && scope.ids.length === 0) {
    res.json({
      sensitiveComplaintRate: 0,
      recurringAvgResolutionDays: null,
      totalComplaints: 0,
      sensitiveCount: 0,
      recurringCount: 0,
      unresolvedSensitiveComplaints: [],
      categoryTrend: [],
      buildingSummary: [],
    });
    return;
  }
  const allComplaints = scope.unrestricted
    ? await db.select().from(complaintsTable).orderBy(desc(complaintsTable.createdAt))
    : await db.select().from(complaintsTable)
        .where(inArray(complaintsTable.buildingId, scope.ids))
        .orderBy(desc(complaintsTable.createdAt));

  const sensitiveCount = allComplaints.filter(c =>
    c.sensitivity === "sensitive" || c.sensitivity === "urgent"
  ).length;

  const recurringCompleted = allComplaints.filter(c => c.isRecurring && c.completedAt);
  let recurringAvgResolutionDays: number | null = null;
  if (recurringCompleted.length > 0) {
    const totalDays = recurringCompleted.reduce((sum, c) => {
      const created = new Date(c.createdAt).getTime();
      const completed = new Date(c.completedAt!).getTime();
      return sum + (completed - created) / (1000 * 60 * 60 * 24);
    }, 0);
    recurringAvgResolutionDays = Math.round((totalDays / recurringCompleted.length) * 10) / 10;
  }

  const unresolvedSensitive = allComplaints.filter(c =>
    (c.sensitivity === "sensitive" || c.sensitivity === "urgent") && c.status !== "completed"
  );

  const categoryTrendMap = new Map<string, number>();
  for (const c of allComplaints) {
    const month = new Date(c.createdAt).toISOString().substring(0, 7);
    const key = `${month}:${c.category}`;
    categoryTrendMap.set(key, (categoryTrendMap.get(key) || 0) + 1);
  }
  const categoryTrend = Array.from(categoryTrendMap.entries()).map(([key, count]) => {
    const [month, category] = key.split(":");
    return { month, category, count };
  }).sort((a, b) => a.month.localeCompare(b.month));

  const buildingMap = new Map<number, { totalComplaints: number; sensitiveCount: number; recurringCount: number }>();
  for (const c of allComplaints) {
    if (!buildingMap.has(c.buildingId)) {
      buildingMap.set(c.buildingId, { totalComplaints: 0, sensitiveCount: 0, recurringCount: 0 });
    }
    const b = buildingMap.get(c.buildingId)!;
    b.totalComplaints++;
    if (c.sensitivity === "sensitive" || c.sensitivity === "urgent") b.sensitiveCount++;
    if (c.isRecurring) b.recurringCount++;
  }

  let buildingNameMap = new Map<number, string>();
  try {
    const buildings = await db.select({ id: buildingsTable.id, name: buildingsTable.name }).from(buildingsTable);
    buildingNameMap = new Map(buildings.map(b => [b.id, b.name]));
  } catch {
  }

  const buildingSummary = Array.from(buildingMap.entries()).map(([buildingId, stats]) => ({
    buildingId,
    buildingName: buildingNameMap.get(buildingId) || "관리 건물",
    ...stats,
    sensitiveRate: stats.totalComplaints > 0
      ? Math.round((stats.sensitiveCount / stats.totalComplaints) * 100 * 10) / 10
      : 0,
  }));

  res.json({
    sensitiveComplaintRate: allComplaints.length > 0
      ? Math.round((sensitiveCount / allComplaints.length) * 100 * 10) / 10
      : 0,
    recurringAvgResolutionDays,
    totalComplaints: allComplaints.length,
    sensitiveCount,
    recurringCount: allComplaints.filter(c => c.isRecurring).length,
    unresolvedSensitiveComplaints: unresolvedSensitive.slice(0, 20),
    categoryTrend,
    buildingSummary,
  });
}

export { handleComplaintAnalytics };
export default router;
