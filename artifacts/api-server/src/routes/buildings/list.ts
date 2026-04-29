// [Task #496] buildings 라우터 분리 — 건물 조회(list/my/overview) 핸들러.
//   원본 routes/buildings.ts 의 GET /buildings/list, /my, /overview 를 그대로 옮긴다.
//   인증/권한 미들웨어는 부모 라우터(routes/buildings/index.ts)가 일괄 적용한다.
import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  buildingsTable,
  usersTable,
  inspectionsTable,
  safetyChecklistsTable,
  maintenanceLogsTable,
  unitsTable,
  vehiclesTable,
} from "@workspace/db";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { getAccessibleBuildingIds } from "../../middlewares/buildingScope";

const router: IRouter = Router();

router.get("/buildings/list", async (req: Request, res: Response) => {
  const user = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).then(r => r[0]);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  // [Task #596] hq_executive 는 hq_building_assignments 매핑된 건물만 노출.
  //   platform_admin 만 전 건물 가시. 매핑이 비어 있는 hq_executive 는 빈 배열.
  const scope = await getAccessibleBuildingIds(req);
  let buildings: Array<typeof buildingsTable.$inferSelect>;
  if (scope.unrestricted) {
    buildings = await db.select().from(buildingsTable);
  } else if (scope.ids.length === 0) {
    buildings = [];
  } else {
    buildings = await db.select().from(buildingsTable).where(inArray(buildingsTable.id, scope.ids));
  }
  res.json(buildings.map(b => ({
    id: b.id,
    name: b.name,
    addressFull: b.addressFull,
    totalUnits: b.totalUnits,
  })));
});

router.get("/buildings/my", async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  if (!user?.buildingId) {
    res.json({ building: null });
    return;
  }

  const building = await db.select().from(buildingsTable).where(eq(buildingsTable.id, user.buildingId)).then(r => r[0]);
  res.json({ building: building || null });
});

router.get("/buildings/overview", async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  if (!user?.buildingId) {
    res.json({ building: null });
    return;
  }

  const building = await db.select().from(buildingsTable).where(eq(buildingsTable.id, user.buildingId)).then(r => r[0]);
  if (!building) {
    res.json({ building: null });
    return;
  }

  try {
    const today = new Date().toISOString().split("T")[0];
    const thirtyDays = new Date();
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    const futureStr = thirtyDays.toISOString().split("T")[0];

    const bId = building.id;

    const allInspections = await db.select().from(inspectionsTable).where(eq(inspectionsTable.buildingId, bId));
    const upcomingInspections = allInspections.filter(i => i.nextDueDate >= today && i.nextDueDate <= futureStr);
    const overdueInspections = allInspections.filter(i => i.status === "overdue" || (i.nextDueDate < today && i.status !== "completed"));

    const recentChecklists = await db.select().from(safetyChecklistsTable).where(eq(safetyChecklistsTable.buildingId, bId)).orderBy(desc(safetyChecklistsTable.inspectionDate)).limit(5);
    const checklistTotal = await db.select({ count: sql<number>`count(*)::int` }).from(safetyChecklistsTable).where(eq(safetyChecklistsTable.buildingId, bId)).then(r => r[0]?.count ?? 0);

    const pendingMaintenance = await db.select({ count: sql<number>`count(*)::int` }).from(maintenanceLogsTable).where(and(eq(maintenanceLogsTable.buildingId, bId), eq(maintenanceLogsTable.status, "pending"))).then(r => r[0]?.count ?? 0);
    const completedMaintenance = await db.select({ count: sql<number>`count(*)::int` }).from(maintenanceLogsTable).where(and(eq(maintenanceLogsTable.buildingId, bId), eq(maintenanceLogsTable.status, "completed"))).then(r => r[0]?.count ?? 0);

    const allUnits = await db.select().from(unitsTable).where(eq(unitsTable.buildingId, user.buildingId));
    const occupiedUnits = allUnits.filter(u => u.status === "occupied" || u.status === "입주");
    const vacantUnits = allUnits.filter(u => u.status === "vacant" || u.status === "공실");

    const vehicleCount = await db.select({ count: sql<number>`count(*)::int` }).from(vehiclesTable).where(eq(vehiclesTable.buildingId, user.buildingId)).then(r => r[0]?.count ?? 0);

    res.json({
      building,
      inspections: {
        total: allInspections.length,
        upcoming: upcomingInspections.length,
        overdue: overdueInspections.length,
        upcomingList: upcomingInspections.slice(0, 5).map(i => ({
          id: i.id, name: i.name, category: i.category, nextDueDate: i.nextDueDate, status: i.status,
        })),
      },
      safetyChecklists: {
        total: checklistTotal,
        recent: recentChecklists.map(c => ({
          id: c.id, title: c.title, category: c.category, inspectionDate: c.inspectionDate, status: c.status,
        })),
      },
      maintenance: {
        pending: pendingMaintenance,
        completed: completedMaintenance,
      },
      occupancy: {
        totalUnits: allUnits.length,
        occupied: occupiedUnits.length,
        vacant: vacantUnits.length,
        rate: allUnits.length > 0 ? Math.round((occupiedUnits.length / allUnits.length) * 100) : 0,
      },
      vehicles: {
        total: vehicleCount,
      },
    });
  } catch (error) {
    req.log.error({ err: error }, "Error fetching building overview");
    res.status(500).json({ error: "건물 현황 조회 실패" });
  }
});

export default router;
