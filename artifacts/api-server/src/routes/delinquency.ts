import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  unitsTable,
  usersTable,
  vehiclesTable,
  vehicleHistoryTable,
  notificationsTable,
  delinquencyActionsTable,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();
router.use(requireRole("manager", "platform_admin", "accountant"));

async function getUserBuildingId(req: Request): Promise<number | null> {
  const userId = req.user?.userId;
  if (!userId) return null;
  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  return user?.buildingId ?? null;
}

async function getBuildingUnitIds(buildingId: number): Promise<Set<number>> {
  const units = await db.select({ id: unitsTable.id }).from(unitsTable)
    .where(eq(unitsTable.buildingId, buildingId));
  return new Set(units.map(u => u.id));
}

async function verifyActionOwnership(actionId: number, buildingId: number): Promise<typeof delinquencyActionsTable.$inferSelect | null> {
  const [action] = await db.select().from(delinquencyActionsTable)
    .where(eq(delinquencyActionsTable.id, actionId));
  if (!action) return null;

  const unitIds = await getBuildingUnitIds(buildingId);
  if (!action.unitId || !unitIds.has(action.unitId)) return null;

  return action;
}

router.get("/delinquency", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.json([]); return; }

  const statusFilter = req.query.status as string | undefined;
  const unitIds = await getBuildingUnitIds(buildingId);

  if (unitIds.size === 0) { res.json([]); return; }

  let actions = await db.select().from(delinquencyActionsTable)
    .orderBy(desc(delinquencyActionsTable.createdAt));

  actions = actions.filter(a => a.unitId && unitIds.has(a.unitId));

  if (statusFilter) {
    actions = actions.filter(a => a.status === statusFilter);
  }

  res.json(actions);
});

router.get("/delinquency/summary", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) {
    res.json({ totalOverdue: 0, notified: 0, parkingSuspended: 0, resolved: 0 });
    return;
  }

  const unitIds = await getBuildingUnitIds(buildingId);
  const allActions = await db.select().from(delinquencyActionsTable);
  const actions = allActions.filter(a => a.unitId && unitIds.has(a.unitId));

  const active = actions.filter(a => a.status === "active");
  const notified = active.filter(a => a.actionType === "notice_sent");
  const parkingSuspended = active.filter(a => a.actionType === "parking_suspended");
  const resolved = actions.filter(a => a.status === "resolved");

  res.json({
    totalOverdue: active.length,
    notified: notified.length,
    parkingSuspended: parkingSuspended.length,
    resolved: resolved.length,
  });
});

router.post("/delinquency/:id/notify", async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "잘못된 ID" }); return; }

  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }

  const action = await verifyActionOwnership(id, buildingId);
  if (!action) { res.status(404).json({ error: "연체 기록을 찾을 수 없습니다" }); return; }

  const [updated] = await db.update(delinquencyActionsTable)
    .set({
      actionType: "notice_sent",
      notes: `${action.notes ? action.notes + "\n" : ""}[${new Date().toISOString().split("T")[0]}] 독촉 통지 발송 (시뮬레이션)`,
    })
    .where(eq(delinquencyActionsTable.id, id))
    .returning();

  await db.insert(notificationsTable).values({
    recipientType: "admin",
    notificationType: "delinquency_notice",
    title: "연체 독촉 통지 발송",
    message: `${action.unitNumber}호 ${action.tenantName || "입주자"} - ${action.overdueMonths}개월 연체, 독촉 통지 발송`,
    relatedEntityType: "delinquency",
    relatedEntityId: action.id,
  });

  res.json(updated);
});

router.post("/delinquency/:id/suspend-parking", async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "잘못된 ID" }); return; }

  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }

  const action = await verifyActionOwnership(id, buildingId);
  if (!action) { res.status(404).json({ error: "연체 기록을 찾을 수 없습니다" }); return; }

  const unitVehicles = await db.select().from(vehiclesTable)
    .where(and(
      eq(vehiclesTable.unit, action.unitNumber),
      eq(vehiclesTable.status, "registered")
    ));

  let suspendedCount = 0;
  for (const v of unitVehicles) {
    await db.update(vehiclesTable)
      .set({ status: "suspended" })
      .where(eq(vehiclesTable.id, v.id));

    await db.insert(vehicleHistoryTable).values({
      vehicleId: v.id,
      action: "suspended",
      vehicleNumber: v.vehicleNumber,
      unit: v.unit,
      performedBy: "system",
      notes: `관리비 ${action.overdueMonths}개월 연체로 주차권 정지`,
    });

    suspendedCount++;
  }

  const [updated] = await db.update(delinquencyActionsTable)
    .set({
      actionType: "parking_suspended",
      notes: `${action.notes ? action.notes + "\n" : ""}[${new Date().toISOString().split("T")[0]}] 주차권 정지 (${suspendedCount}대)`,
    })
    .where(eq(delinquencyActionsTable.id, id))
    .returning();

  await db.insert(notificationsTable).values({
    recipientType: "admin",
    notificationType: "delinquency_parking_suspended",
    title: "주차권 정지 처리",
    message: `${action.unitNumber}호 - 연체 ${action.overdueMonths}개월, 차량 ${suspendedCount}대 주차권 정지`,
    relatedEntityType: "delinquency",
    relatedEntityId: action.id,
  });

  res.json({ ...updated, suspendedVehicles: suspendedCount });
});

router.post("/delinquency/:id/resolve", async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "잘못된 ID" }); return; }

  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }

  const action = await verifyActionOwnership(id, buildingId);
  if (!action) { res.status(404).json({ error: "연체 기록을 찾을 수 없습니다" }); return; }

  if (action.actionType === "parking_suspended") {
    const unitVehicles = await db.select().from(vehiclesTable)
      .where(and(
        eq(vehiclesTable.unit, action.unitNumber),
        eq(vehiclesTable.status, "suspended")
      ));

    for (const v of unitVehicles) {
      await db.update(vehiclesTable)
        .set({ status: "registered" })
        .where(eq(vehiclesTable.id, v.id));

      await db.insert(vehicleHistoryTable).values({
        vehicleId: v.id,
        action: "reactivated",
        vehicleNumber: v.vehicleNumber,
        unit: v.unit,
        performedBy: "system",
        notes: "연체 해소로 주차권 복원",
      });
    }
  }

  const [updated] = await db.update(delinquencyActionsTable)
    .set({
      status: "resolved",
      resolvedDate: new Date(),
      notes: `${action.notes ? action.notes + "\n" : ""}[${new Date().toISOString().split("T")[0]}] 연체 해소 처리`,
    })
    .where(eq(delinquencyActionsTable.id, id))
    .returning();

  await db.insert(notificationsTable).values({
    recipientType: "admin",
    notificationType: "delinquency_resolved",
    title: "연체 해소",
    message: `${action.unitNumber}호 연체가 해소되었습니다`,
    relatedEntityType: "delinquency",
    relatedEntityId: action.id,
  });

  res.json(updated);
});

export default router;
