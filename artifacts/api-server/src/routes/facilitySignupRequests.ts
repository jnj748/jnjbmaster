// [Task #132] 시설기사 가입 승인 요청 처리.
import { Router, type IRouter, type Request, type Response } from "express";
import { db, facilityStaffSignupRequestsTable, usersTable, buildingsTable, notificationsTable } from "@workspace/db";
import { authMiddleware, requireRole } from "../middlewares/auth";
import { and, desc, eq } from "drizzle-orm";

const router: IRouter = Router();

// [Task #132] 신청 주소/지역 기준으로 매칭되는 건물·관리소장을 찾고, 없으면 미지정으로 둔다.
// 그리고 매칭된 관리소장(또는 플랫폼)에게 인박스 알림을 생성한다.
export async function resolveTargetsAndNotify(requestId: number): Promise<void> {
  const [reqRow] = await db.select().from(facilityStaffSignupRequestsTable)
    .where(eq(facilityStaffSignupRequestsTable.id, requestId));
  if (!reqRow) return;

  let targetBuildingId: number | null = reqRow.targetBuildingId;
  let targetManagerId: number | null = reqRow.targetManagerId;

  if (!targetBuildingId && !targetManagerId) {
    // 1) 정확한 주소 매칭 우선, 2) sido + sigungu 매칭, 3) sido 매칭
    let matchedBuilding: { id: number } | undefined;
    if (reqRow.requestedAddress && reqRow.requestedAddress !== "(주소 미지정)") {
      const exact = await db.select({ id: buildingsTable.id })
        .from(buildingsTable)
        .where(eq(buildingsTable.addressFull, reqRow.requestedAddress));
      matchedBuilding = exact[0];
    }
    if (!matchedBuilding && reqRow.sido) {
      const conds = [eq(buildingsTable.sido, reqRow.sido)];
      if (reqRow.sigungu) conds.push(eq(buildingsTable.sigungu, reqRow.sigungu));
      const region = await db.select({ id: buildingsTable.id })
        .from(buildingsTable)
        .where(and(...conds))
        .limit(1);
      matchedBuilding = region[0];
    }
    if (matchedBuilding) {
      targetBuildingId = matchedBuilding.id;
      const [mgr] = await db.select({ id: usersTable.id })
        .from(usersTable)
        .where(and(eq(usersTable.role, "manager"), eq(usersTable.buildingId, matchedBuilding.id)))
        .limit(1);
      if (mgr) targetManagerId = mgr.id;
    }
    if (targetBuildingId !== reqRow.targetBuildingId || targetManagerId !== reqRow.targetManagerId) {
      await db.update(facilityStaffSignupRequestsTable)
        .set({ targetBuildingId, targetManagerId })
        .where(eq(facilityStaffSignupRequestsTable.id, reqRow.id));
    }
  }

  // 알림 생성: 관리소장이 있으면 manager 인박스, 없으면 admin 인박스로 라우팅.
  await db.insert(notificationsTable).values({
    recipientType: targetManagerId ? "manager" : "admin",
    notificationType: "facility_signup_request",
    title: "시설기사 가입 신청",
    message: `시설기사 가입 신청이 접수되었습니다 (주소: ${reqRow.requestedAddress})`,
    relatedEntityType: "facility_signup_request",
    relatedEntityId: reqRow.id,
  });
}

router.use("/facility-signup-requests", authMiddleware);

// 본인 요청 상태 조회 (시설기사 본인용)
router.get("/facility-signup-requests/me", async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const [row] = await db.select().from(facilityStaffSignupRequestsTable)
    .where(eq(facilityStaffSignupRequestsTable.userId, userId))
    .orderBy(desc(facilityStaffSignupRequestsTable.createdAt));
  res.json({ request: row ?? null });
});

// 본인 요청 정보 갱신 (위저드 step1 완료 시 주소/지역 등록)
router.patch("/facility-signup-requests/me", async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const requestedAddress: string | undefined = typeof req.body?.requestedAddress === "string" ? req.body.requestedAddress.trim() : undefined;
  const sido: string | null | undefined = req.body?.sido ?? undefined;
  const sigungu: string | null | undefined = req.body?.sigungu ?? undefined;

  const [existing] = await db.select().from(facilityStaffSignupRequestsTable)
    .where(eq(facilityStaffSignupRequestsTable.userId, userId))
    .orderBy(desc(facilityStaffSignupRequestsTable.createdAt));
  if (!existing) {
    res.status(404).json({ error: "신청 내역이 없습니다" }); return;
  }
  if (existing.status !== "pending") {
    res.status(409).json({ error: "이미 처리된 신청입니다" }); return;
  }
  const patch: Record<string, unknown> = {};
  if (requestedAddress !== undefined) patch.requestedAddress = requestedAddress || "(주소 미지정)";
  if (sido !== undefined) patch.sido = sido;
  if (sigungu !== undefined) patch.sigungu = sigungu;
  // 주소/지역이 바뀌면 매칭 재계산을 위해 타겟을 초기화한다.
  if (requestedAddress !== undefined || sido !== undefined || sigungu !== undefined) {
    patch.targetBuildingId = null;
    patch.targetManagerId = null;
  }
  const [row] = await db.update(facilityStaffSignupRequestsTable)
    .set(patch)
    .where(eq(facilityStaffSignupRequestsTable.id, existing.id))
    .returning();
  try { await resolveTargetsAndNotify(row.id); }
  catch (e) { req.log?.warn?.({ err: e }, "Failed to resolve facility signup targets (PATCH /me)"); }
  res.json({ request: row });
});

// 관리자/관리소장 inbox
router.get("/facility-signup-requests", requireRole("manager", "platform_admin", "hq_executive"), async (req: Request, res: Response) => {
  const user = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).then(r => r[0]);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const status = (req.query.status as string) || "pending";
  let rows = await db.select({
      req: facilityStaffSignupRequestsTable,
      user: usersTable,
    })
    .from(facilityStaffSignupRequestsTable)
    .leftJoin(usersTable, eq(usersTable.id, facilityStaffSignupRequestsTable.userId))
    .where(eq(facilityStaffSignupRequestsTable.status, status as "pending" | "approved" | "rejected"))
    .orderBy(desc(facilityStaffSignupRequestsTable.createdAt));

  // [Task #132] 관리소장은 자신을 명시적으로 가리킨 요청만 처리 가능.
  // 미지정(매칭 실패) 요청은 platform_admin/hq_executive 큐로만 라우팅한다.
  if (user.role === "manager") {
    rows = rows.filter(r =>
      r.req.targetManagerId === user.id ||
      (user.buildingId != null && r.req.targetBuildingId === user.buildingId)
    );
  }

  res.json({ requests: rows.map(r => ({ ...r.req, user: r.user ? { id: r.user.id, name: r.user.name, email: r.user.email, phone: r.user.phone } : null })) });
});

// 관리소장은 자기 건물/본인 매칭 또는 같은 시도에서 미지정 요청만 처리 가능.
async function assertManagerCanHandle(approver: { id: number; role: string; buildingId: number | null; buildingSido: string | null }, requestId: number): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (approver.role === "platform_admin" || approver.role === "hq_executive") return { ok: true };
  const [reqRow] = await db.select().from(facilityStaffSignupRequestsTable).where(eq(facilityStaffSignupRequestsTable.id, requestId));
  if (!reqRow) return { ok: false, status: 404, error: "신청을 찾을 수 없습니다" };
  // [Task #132] 관리소장은 자신을 명시적으로 가리킨 요청만 처리. 미지정 요청은 admin/HQ만.
  const sameManager = reqRow.targetManagerId === approver.id;
  const sameBuilding = approver.buildingId != null && reqRow.targetBuildingId === approver.buildingId;
  if (sameManager || sameBuilding) return { ok: true };
  return { ok: false, status: 403, error: "이 신청에 대한 권한이 없습니다" };
}

router.post("/facility-signup-requests/:id/approve", requireRole("manager", "platform_admin", "hq_executive"), async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  const approver = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).then(r => r[0]);
  if (!approver) { res.status(401).json({ error: "Unauthorized" }); return; }
  const guard = await assertManagerCanHandle(approver, id);
  if (!guard.ok) { res.status(guard.status).json({ error: guard.error }); return; }

  // [Task #132] 승인 시 건물 배정은 관리소장이면 본인 건물,
  // 플랫폼/HQ면 명시적으로 받거나 신청서의 targetBuildingId를 사용한다.
  // 본문 buildingId가 명시되면 우선, 없으면 manager.buildingId, 없으면 request.targetBuildingId
  const [reqRowExisting] = await db.select().from(facilityStaffSignupRequestsTable)
    .where(eq(facilityStaffSignupRequestsTable.id, id));
  if (!reqRowExisting) { res.status(404).json({ error: "신청 내역을 찾을 수 없습니다" }); return; }
  // [Task #132] 명시적 buildingId는 platform_admin/hq_executive만 허용. 관리소장은 본인 건물만 가능.
  const isAdmin = approver.role === "platform_admin" || approver.role === "hq_executive";
  const explicitBuildingId: number | null = (isAdmin && Number.isInteger(req.body?.buildingId)) ? req.body.buildingId : null;
  const finalBuildingId: number | null = explicitBuildingId
    ?? (approver.role === "manager" ? approver.buildingId : null)
    ?? reqRowExisting.targetBuildingId;
  if (!finalBuildingId) {
    res.status(400).json({ error: "승인 시 건물을 지정해야 합니다 (buildingId)." });
    return;
  }

  await db.transaction(async (tx) => {
    const [r] = await tx.update(facilityStaffSignupRequestsTable)
      .set({ status: "approved", decidedBy: approver.id, decidedAt: new Date(), targetBuildingId: finalBuildingId, targetManagerId: approver.role === "manager" ? approver.id : null })
      .where(eq(facilityStaffSignupRequestsTable.id, id))
      .returning();
    if (r) {
      await tx.update(usersTable)
        .set({ approvalStatus: "active", buildingId: finalBuildingId })
        .where(eq(usersTable.id, r.userId));
    }
  });
  res.json({ ok: true });
});

router.post("/facility-signup-requests/:id/reject", requireRole("manager", "platform_admin", "hq_executive"), async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  const note: string = req.body?.note ?? "";
  const approver = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).then(r => r[0]);
  if (!approver) { res.status(401).json({ error: "Unauthorized" }); return; }
  const guard = await assertManagerCanHandle(approver, id);
  if (!guard.ok) { res.status(guard.status).json({ error: guard.error }); return; }

  await db.transaction(async (tx) => {
    const [r] = await tx.update(facilityStaffSignupRequestsTable)
      .set({ status: "rejected", decidedBy: approver.id, decidedAt: new Date(), note })
      .where(eq(facilityStaffSignupRequestsTable.id, id))
      .returning();
    if (r) {
      await tx.update(usersTable)
        .set({ approvalStatus: "rejected" })
        .where(eq(usersTable.id, r.userId));
    }
  });
  res.json({ ok: true });
});

export default router;
