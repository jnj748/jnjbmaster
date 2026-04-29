// [Task #596] 본부장(hq_executive) ↔ 건물 매핑 관리 API.
//
//   - hq_building_assignments 테이블의 CRUD 를 platform_admin 전용으로 노출.
//   - 본부장 자기 자신은 /hq/assigned-buildings 로 자신의 매핑만 조회.
//
//   엔드포인트:
//     GET    /admin/hq-assignments?hqUserId=...   매핑 목록(본부장/건물 join)
//     POST   /admin/hq-assignments                매핑 추가  { hqUserId, buildingId }
//     DELETE /admin/hq-assignments/:id            매핑 삭제
//     GET    /hq/assigned-buildings               로그인한 hq_executive 의 매핑
import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  usersTable,
  buildingsTable,
  hqBuildingAssignmentsTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();

// 본부장 본인 매핑 조회 — 마이페이지/대시보드 안내 등에 사용.
router.get("/hq/assigned-buildings", async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [u] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId));
  if (!u) { res.status(404).json({ error: "사용자를 찾을 수 없습니다" }); return; }

  // platform_admin 은 전 건물을 본다(매핑 자체는 의미 없음).
  if (u.role === "platform_admin") {
    const buildings = await db.select({
      buildingId: buildingsTable.id,
      buildingName: buildingsTable.name,
      addressFull: buildingsTable.addressFull,
    }).from(buildingsTable);
    res.json({ unrestricted: true, assignments: buildings });
    return;
  }
  if (u.role !== "hq_executive") {
    res.status(403).json({ error: "본부장 전용입니다" });
    return;
  }

  const rows = await db
    .select({
      id: hqBuildingAssignmentsTable.id,
      buildingId: buildingsTable.id,
      buildingName: buildingsTable.name,
      addressFull: buildingsTable.addressFull,
      createdAt: hqBuildingAssignmentsTable.createdAt,
    })
    .from(hqBuildingAssignmentsTable)
    .innerJoin(buildingsTable, eq(buildingsTable.id, hqBuildingAssignmentsTable.buildingId))
    .where(eq(hqBuildingAssignmentsTable.hqUserId, userId));
  res.json({ unrestricted: false, assignments: rows });
});

// 이하 admin 전용 — platform_admin 만 접근 가능.
router.use("/admin/hq-assignments", requireRole("platform_admin"));

router.get("/admin/hq-assignments", async (req: Request, res: Response) => {
  const hqUserIdRaw = req.query.hqUserId;
  const where = hqUserIdRaw !== undefined
    ? eq(hqBuildingAssignmentsTable.hqUserId, Number(hqUserIdRaw))
    : undefined;

  const rows = await db
    .select({
      id: hqBuildingAssignmentsTable.id,
      hqUserId: hqBuildingAssignmentsTable.hqUserId,
      hqUserName: usersTable.name,
      hqUserEmail: usersTable.email,
      buildingId: hqBuildingAssignmentsTable.buildingId,
      buildingName: buildingsTable.name,
      addressFull: buildingsTable.addressFull,
      assignedByUserId: hqBuildingAssignmentsTable.assignedByUserId,
      createdAt: hqBuildingAssignmentsTable.createdAt,
    })
    .from(hqBuildingAssignmentsTable)
    .innerJoin(usersTable, eq(usersTable.id, hqBuildingAssignmentsTable.hqUserId))
    .innerJoin(buildingsTable, eq(buildingsTable.id, hqBuildingAssignmentsTable.buildingId))
    .where(where as ReturnType<typeof eq> | undefined);

  res.json({ assignments: rows });
});

// 본부장 후보 목록(역할이 hq_executive 인 사용자) — admin UI 의 셀렉터용.
router.get("/admin/hq-users", requireRole("platform_admin"), async (_req: Request, res: Response) => {
  const rows = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      approvalStatus: usersTable.approvalStatus,
    })
    .from(usersTable)
    .where(eq(usersTable.role, "hq_executive"));
  res.json({ users: rows });
});

router.post("/admin/hq-assignments", async (req: Request, res: Response) => {
  const adminId = req.user!.userId;
  const body = req.body ?? {};
  const hqUserId = Number(body.hqUserId);
  const buildingId = Number(body.buildingId);
  if (!Number.isFinite(hqUserId) || !Number.isFinite(buildingId)) {
    res.status(400).json({ error: "hqUserId, buildingId 가 필요합니다" });
    return;
  }

  // 대상 사용자 검증 — hq_executive 역할만 허용.
  const [target] = await db.select({ id: usersTable.id, role: usersTable.role })
    .from(usersTable).where(eq(usersTable.id, hqUserId));
  if (!target) { res.status(404).json({ error: "본부장 사용자를 찾을 수 없습니다" }); return; }
  if (target.role !== "hq_executive") {
    res.status(400).json({ error: "본부장(hq_executive) 역할에만 건물을 할당할 수 있습니다" });
    return;
  }

  const [building] = await db.select({ id: buildingsTable.id })
    .from(buildingsTable).where(eq(buildingsTable.id, buildingId));
  if (!building) { res.status(404).json({ error: "건물을 찾을 수 없습니다" }); return; }

  // 중복 매핑은 멱등 처리(409 가 아니라 기존 row 반환).
  const [existing] = await db.select()
    .from(hqBuildingAssignmentsTable)
    .where(and(
      eq(hqBuildingAssignmentsTable.hqUserId, hqUserId),
      eq(hqBuildingAssignmentsTable.buildingId, buildingId),
    ));
  if (existing) {
    res.json({ assignment: existing, alreadyExisted: true });
    return;
  }

  const [created] = await db.insert(hqBuildingAssignmentsTable).values({
    hqUserId,
    buildingId,
    assignedByUserId: adminId,
  }).returning();
  res.status(201).json({ assignment: created });
});

router.delete("/admin/hq-assignments/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "유효하지 않은 id" }); return; }
  const deleted = await db.delete(hqBuildingAssignmentsTable)
    .where(eq(hqBuildingAssignmentsTable.id, id))
    .returning({ id: hqBuildingAssignmentsTable.id });
  if (deleted.length === 0) { res.status(404).json({ error: "매핑을 찾을 수 없습니다" }); return; }
  res.json({ ok: true });
});

// 한 본부장에 대한 매핑을 한꺼번에 동기화(set 연산) — admin UI 의 다중 선택 저장 편의용.
router.put("/admin/hq-assignments/by-user/:hqUserId", async (req: Request, res: Response) => {
  const adminId = req.user!.userId;
  const hqUserId = Number(req.params.hqUserId);
  const body = req.body ?? {};
  const buildingIds: number[] = Array.isArray(body.buildingIds)
    ? body.buildingIds.map((x: unknown) => Number(x)).filter((n: number) => Number.isFinite(n))
    : [];
  if (!Number.isFinite(hqUserId)) { res.status(400).json({ error: "유효하지 않은 hqUserId" }); return; }

  const [target] = await db.select({ id: usersTable.id, role: usersTable.role })
    .from(usersTable).where(eq(usersTable.id, hqUserId));
  if (!target || target.role !== "hq_executive") {
    res.status(400).json({ error: "본부장(hq_executive) 사용자가 아닙니다" });
    return;
  }

  // 1) 현재 매핑 조회 → diff 계산
  const current = await db
    .select({ id: hqBuildingAssignmentsTable.id, buildingId: hqBuildingAssignmentsTable.buildingId })
    .from(hqBuildingAssignmentsTable)
    .where(eq(hqBuildingAssignmentsTable.hqUserId, hqUserId));
  const currentSet = new Set(current.map(r => r.buildingId));
  const desiredSet = new Set(buildingIds);

  const toAdd = buildingIds.filter(b => !currentSet.has(b));
  const toRemoveIds = current.filter(r => !desiredSet.has(r.buildingId)).map(r => r.id);

  await db.transaction(async (tx) => {
    if (toRemoveIds.length > 0) {
      await tx.delete(hqBuildingAssignmentsTable)
        .where(inArray(hqBuildingAssignmentsTable.id, toRemoveIds));
    }
    if (toAdd.length > 0) {
      await tx.insert(hqBuildingAssignmentsTable).values(
        toAdd.map(buildingId => ({ hqUserId, buildingId, assignedByUserId: adminId })),
      );
    }
  });

  res.json({ ok: true, added: toAdd.length, removed: toRemoveIds.length });
});

export default router;
