import { insertNotification } from "../lib/notificationRecipient";
// [Task #132] 시설기사 가입 승인 요청 처리.
// [Task #651] 경리(accountant) 가입 신청도 동일 큐로 통합 처리한다.
//   - requested_role 컬럼으로 시설담당 / 경리를 구분.
//   - 동일 신청 → 본부장 + 관리소장 양쪽 인박스에 동시 알림.
//   - 위계: 본부장의 reject/close 는 매니저가 되돌리지 못한다(서버+UI).
//   - reopen 엔드포인트: 본부장(또는 platform_admin) 만 거절 건을 다시 pending 으로.
//   - 매니저가 거절한 건은 본부장이 reopen 가능, 그 반대는 platform_admin 만.
import { Router, type IRouter, type Request, type Response } from "express";
import { db, facilityStaffSignupRequestsTable, usersTable, buildingsTable, hqBuildingAssignmentsTable } from "@workspace/db";
import { authMiddleware, requireRole } from "../middlewares/auth";
import { and, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { getHqAssignedBuildingIds } from "../middlewares/buildingScope";
import { findExistingActiveUserForAddress, BUILDING_DUPLICATE_MESSAGE } from "./buildings/duplicates";

const router: IRouter = Router();

// [Task #132] 신청 주소/지역 기준으로 매칭되는 건물·관리소장을 찾고, 없으면 미지정으로 둔다.
// [Task #651] 매칭된 본부장(hq_executive) 과 관리소장(manager) 양쪽 인박스에 동시 알림을 발생시킨다.
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

  // [Task #651] 알림 fan-out: 관리소장 + 본부장 양쪽에 동시 발송.
  //   - 관리소장: 매칭된 user:<id> 가 있으면 그쪽으로, 없으면 role:manager 폴백.
  //   - 본부장(round-4 fix): 건물 단위로 매핑된 hq_executive(hq_building_assignments)
  //     만 인박스에 받도록 user:<hqUserId> 를 직접 발송한다. 매핑이 없을 때만
  //     role:hq_executive 폴백(전체 본부장에게 안내)으로 떨어진다.
  const roleLabel = reqRow.requestedRole === "accountant" ? "경리·회계" : "시설기사";
  const baseTitle = `${roleLabel} 가입 신청`;
  const baseMessage = `${roleLabel} 가입 신청이 접수되었습니다 (주소: ${reqRow.requestedAddress})`;

  const recipients: string[] = [];
  if (targetManagerId) recipients.push(`user:${targetManagerId}`);
  else recipients.push("role:manager");

  if (targetBuildingId) {
    const assignedHqs = await db
      .select({ hqUserId: hqBuildingAssignmentsTable.hqUserId })
      .from(hqBuildingAssignmentsTable)
      .where(eq(hqBuildingAssignmentsTable.buildingId, targetBuildingId));
    const assignedHqIds = assignedHqs.map(r => r.hqUserId).filter((v): v is number => v != null);
    if (assignedHqIds.length > 0) {
      for (const hqId of assignedHqIds) recipients.push(`user:${hqId}`);
    } else {
      // 매핑된 본부장이 없으면 전체 본부장 폴백 (지정 가능자 부재 안내).
      recipients.push("role:hq_executive");
    }
  } else {
    // 건물 매칭 자체가 안 된 신청 — 누구라도 봐서 매칭을 도와야 한다.
    recipients.push("role:hq_executive");
  }

  for (const recipient of recipients) {
    await insertNotification({
      recipientType: recipient,
      notificationType: "facility_signup_request",
      title: baseTitle,
      message: baseMessage,
      relatedEntityType: "facility_signup_request",
      relatedEntityId: reqRow.id,
    });
  }
}

router.use("/facility-signup-requests", authMiddleware);

// 본인 요청 상태 조회 (시설기사·경리 본인용)
router.get("/facility-signup-requests/me", async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const [row] = await db.select().from(facilityStaffSignupRequestsTable)
    .where(eq(facilityStaffSignupRequestsTable.userId, userId))
    .orderBy(desc(facilityStaffSignupRequestsTable.createdAt));
  res.json({ request: row ?? null });
});

// 본인 요청 정보 갱신 (위저드 step1 완료 시 주소/지역/자격증사진 등록)
router.patch("/facility-signup-requests/me", async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const requestedAddress: string | undefined = typeof req.body?.requestedAddress === "string" ? req.body.requestedAddress.trim() : undefined;
  const sido: string | null | undefined = req.body?.sido ?? undefined;
  const sigungu: string | null | undefined = req.body?.sigungu ?? undefined;
  // [Task #651] 시설담당 자격증 사진 URL 도 PATCH 로 갱신.
  const licensePhotoUrl: string | null | undefined =
    req.body?.licensePhotoUrl === undefined ? undefined : (typeof req.body.licensePhotoUrl === "string" ? req.body.licensePhotoUrl : null);
  // [Task #651 round-4] 위저드 step2 가 /buildings/responsible-staff 응답에서
  //   확정한 buildingId 를 그대로 신청 레코드에 저장한다. 이렇게 하면
  //   resolveTargetsAndNotify 가 주소 정규화 fallback 으로 라우팅을 다시
  //   계산하지 않아 "안내한 담당자 ≠ 라우팅 대상" 어긋남이 생기지 않는다.
  const explicitBuildingId: number | null | undefined =
    req.body?.buildingId === undefined
      ? undefined
      : (typeof req.body.buildingId === "number" && Number.isFinite(req.body.buildingId)
          ? req.body.buildingId
          : null);

  const [existing] = await db.select().from(facilityStaffSignupRequestsTable)
    .where(eq(facilityStaffSignupRequestsTable.userId, userId))
    .orderBy(desc(facilityStaffSignupRequestsTable.createdAt));
  if (!existing) {
    res.status(404).json({ error: "신청 내역이 없습니다" }); return;
  }
  if (existing.status !== "pending") {
    res.status(409).json({ error: "이미 처리된 신청입니다" }); return;
  }
  // [Task #651] 시설담당은 자격증 사진이 필수. 페이로드에서 명시적으로 비우려는
  // 시도(licensePhotoUrl===null)도 차단하고, 기존에도 비어 있는데 이번 PATCH 가
  // 새 값을 주지 않으면 신청 자체를 진행시키지 않는다.
  if (existing.requestedRole === "facility_staff") {
    const incoming = licensePhotoUrl;
    const finalLicense = incoming === undefined ? existing.licensePhotoUrl : incoming;
    if (!finalLicense || typeof finalLicense !== "string" || finalLicense.trim() === "") {
      res.status(400).json({ error: "자격증 사진을 첨부해야 신청할 수 있습니다." });
      return;
    }
  }
  const patch: Record<string, unknown> = {};
  if (requestedAddress !== undefined) patch.requestedAddress = requestedAddress || "(주소 미지정)";
  if (sido !== undefined) patch.sido = sido;
  if (sigungu !== undefined) patch.sigungu = sigungu;
  if (licensePhotoUrl !== undefined) patch.licensePhotoUrl = licensePhotoUrl;
  // 주소/지역이 바뀌면 매칭 재계산을 위해 타겟을 초기화한다.
  if (requestedAddress !== undefined || sido !== undefined || sigungu !== undefined) {
    patch.targetBuildingId = null;
    patch.targetManagerId = null;
  }
  // [Task #651 round-4] step2 에서 확정된 explicit buildingId 가 들어오면
  //   초기화 후 곧바로 그 값을 세팅한다. 동일 트랜잭션 안에서 매니저까지 함께
  //   고정해 알림/승인 라우팅이 단일 진실의 원천(SSOT)이 되게 한다.
  if (explicitBuildingId !== undefined && explicitBuildingId !== null) {
    patch.targetBuildingId = explicitBuildingId;
    const [mgr] = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(and(
        eq(usersTable.role, "manager"),
        eq(usersTable.approvalStatus, "active"),
        eq(usersTable.buildingId, explicitBuildingId),
      ))
      .limit(1);
    patch.targetManagerId = mgr?.id ?? null;
  }
  const [row] = await db.update(facilityStaffSignupRequestsTable)
    .set(patch)
    .where(eq(facilityStaffSignupRequestsTable.id, existing.id))
    .returning();
  try { await resolveTargetsAndNotify(row.id); }
  catch (e) { req.log?.warn?.({ err: e }, "Failed to resolve facility signup targets (PATCH /me)"); }
  res.json({ request: row });
});

// 관리자/관리소장/본부장 inbox.
// [Task #651] role 쿼리 파라미터로 시설담당(facility_staff) / 경리(accountant) 분리 조회.
router.get("/facility-signup-requests", requireRole("manager", "platform_admin", "hq_executive"), async (req: Request, res: Response) => {
  const user = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).then(r => r[0]);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const status = (req.query.status as string) || "pending";
  const requestedRoleParam = typeof req.query.role === "string" ? req.query.role : "";
  const allowedRoleFilter: ("facility_staff" | "accountant")[] = ["facility_staff", "accountant"];

  const conds = [eq(facilityStaffSignupRequestsTable.status, status as "pending" | "approved" | "rejected")];
  if (allowedRoleFilter.includes(requestedRoleParam as "facility_staff" | "accountant")) {
    conds.push(eq(facilityStaffSignupRequestsTable.requestedRole, requestedRoleParam as "facility_staff" | "accountant"));
  }

  let rows = await db.select({
      req: facilityStaffSignupRequestsTable,
      user: usersTable,
    })
    .from(facilityStaffSignupRequestsTable)
    .leftJoin(usersTable, eq(usersTable.id, facilityStaffSignupRequestsTable.userId))
    .where(and(...conds))
    .orderBy(desc(facilityStaffSignupRequestsTable.createdAt));

  // [Task #651 round-4] 결정자 사용자명을 함께 노출(추적성). decidedBy 가 있는
  //   행만 별도 조회로 매핑한다.
  const decidedByIds = Array.from(new Set(
    rows.map(r => r.req.decidedBy).filter((v): v is number => v != null),
  ));
  const decidedByMap = new Map<number, string | null>();
  if (decidedByIds.length > 0) {
    const decidedUsers = await db.select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(inArray(usersTable.id, decidedByIds));
    for (const u of decidedUsers) decidedByMap.set(u.id, u.name ?? null);
  }

  // [Task #132] 관리소장은 자신을 명시적으로 가리킨 요청만 처리 가능.
  //   미지정(매칭 실패) 요청은 platform_admin 큐로 라우팅 (HQ 는 매핑된 건물만).
  if (user.role === "manager") {
    rows = rows.filter(r =>
      r.req.targetManagerId === user.id ||
      (user.buildingId != null && r.req.targetBuildingId === user.buildingId)
    );
  } else if (user.role === "hq_executive") {
    // [Task #596] hq_executive 는 매핑된 건물 대상 신청만 본다.
    //   미지정(targetBuildingId == null) 신청은 plat_admin 만 처리.
    const assigned = await getHqAssignedBuildingIds(user.id);
    const allowed = new Set(assigned);
    rows = rows.filter(r =>
      r.req.targetBuildingId != null && allowed.has(r.req.targetBuildingId)
    );
  }

  res.json({
    requests: rows.map(r => ({
      ...r.req,
      user: r.user ? { id: r.user.id, name: r.user.name, email: r.user.email, phone: r.user.phone } : null,
      // [Task #651 round-4] 결정자 사용자명을 응답에 포함 (decidedAt 은 r.req 에 이미 존재).
      decidedByName: r.req.decidedBy != null ? (decidedByMap.get(r.req.decidedBy) ?? null) : null,
    })),
  });
});

// 관리소장은 자기 건물/본인 매칭만 처리, hq_executive 는 매핑 건물 대상 신청만 처리.
// platform_admin 만 무제한 (미지정 신청 포함).
async function assertManagerCanHandle(approver: { id: number; role: string; buildingId: number | null; buildingSido: string | null }, requestId: number): Promise<{ ok: true; reqRow: typeof facilityStaffSignupRequestsTable.$inferSelect } | { ok: false; status: number; error: string }> {
  const [reqRow] = await db.select().from(facilityStaffSignupRequestsTable).where(eq(facilityStaffSignupRequestsTable.id, requestId));
  if (!reqRow) return { ok: false, status: 404, error: "신청을 찾을 수 없습니다" };
  if (approver.role === "platform_admin") return { ok: true, reqRow };
  if (approver.role === "hq_executive") {
    // [Task #596] HQ 는 매핑된 건물 대상 신청만 승인/거절 가능.
    if (reqRow.targetBuildingId == null) {
      return { ok: false, status: 403, error: "미지정 신청은 플랫폼 관리자만 처리할 수 있습니다" };
    }
    const assigned = await getHqAssignedBuildingIds(approver.id);
    if (!assigned.includes(reqRow.targetBuildingId)) {
      return { ok: false, status: 403, error: "본 건물 관할이 아닙니다" };
    }
    return { ok: true, reqRow };
  }
  // [Task #132] 관리소장은 자신을 명시적으로 가리킨 요청만 처리.
  const sameManager = reqRow.targetManagerId === approver.id;
  const sameBuilding = approver.buildingId != null && reqRow.targetBuildingId === approver.buildingId;
  if (sameManager || sameBuilding) return { ok: true, reqRow };
  return { ok: false, status: 403, error: "이 신청에 대한 권한이 없습니다" };
}

router.post("/facility-signup-requests/:id/approve", requireRole("manager", "platform_admin", "hq_executive"), async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  const approver = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).then(r => r[0]);
  if (!approver) { res.status(401).json({ error: "Unauthorized" }); return; }
  const guard = await assertManagerCanHandle(approver, id);
  if (!guard.ok) { res.status(guard.status).json({ error: guard.error }); return; }
  const reqRowExisting = guard.reqRow;

  // [Task #651] 위계 보호: 본부장이 거절한 건은 매니저가 되돌릴 수 없다.
  if (
    approver.role === "manager"
    && reqRowExisting.status === "rejected"
    && reqRowExisting.decidedByRole === "hq_executive"
  ) {
    res.status(403).json({ error: "본부장이 거절한 신청은 관리소장이 되돌릴 수 없습니다." });
    return;
  }

  // [Task #132] 승인 시 건물 배정은 관리소장이면 본인 건물,
  // 플랫폼/HQ면 명시적으로 받거나 신청서의 targetBuildingId를 사용한다.
  // 본문 buildingId가 명시되면 우선, 없으면 manager.buildingId, 없으면 request.targetBuildingId
  // [Task #132/#596] 명시적 buildingId는 platform_admin/hq_executive만 허용.
  //   hq_executive 의 explicit buildingId 는 매핑된 건물 한도로 검증.
  //   관리소장은 본인 건물만 가능.
  const isAdmin = approver.role === "platform_admin" || approver.role === "hq_executive";
  const explicitBuildingId: number | null = (isAdmin && Number.isInteger(req.body?.buildingId)) ? req.body.buildingId : null;
  if (explicitBuildingId != null && approver.role === "hq_executive") {
    const assigned = await getHqAssignedBuildingIds(approver.id);
    if (!assigned.includes(explicitBuildingId)) {
      res.status(403).json({ error: "본 건물 관할이 아닙니다" });
      return;
    }
  }
  const finalBuildingId: number | null = explicitBuildingId
    ?? (approver.role === "manager" ? approver.buildingId : null)
    ?? reqRowExisting.targetBuildingId;
  if (!finalBuildingId) {
    res.status(400).json({ error: "승인 시 건물을 지정해야 합니다 (buildingId)." });
    return;
  }

  // [Task #559] 시설담당자는 한 건물에 여러 명이 활동할 수 있으므로 중복 검사를 수행하지 않는다.
  // [Task #651] 경리는 1건물 1인 — 승인 직전에 사전 점검 (UX 친화 안내).
  //   진정한 동시성 차단은 DB partial unique index (migration 0044) +
  //   23505 catch (아래) 가 담당한다.
  if (reqRowExisting.requestedRole === "accountant") {
    const dup = await findExistingActiveUserForAddress({
      role: "accountant",
      buildingId: finalBuildingId,
      excludeUserId: reqRowExisting.userId,
    });
    if (dup.exists) {
      res.status(409).json({
        error: BUILDING_DUPLICATE_MESSAGE,
        conflictBuildingName: dup.conflictBuildingName ?? null,
      });
      return;
    }
  }

  // [Task #651] race-safe 가드:
  //   - status = 'pending' 인 행만 업데이트 → HQ 가 먼저 reject 했다면 매니저의
  //     UPDATE 는 0건 반환 → 409.
  //   - 매니저는 hq_executive 가 결정한 행을 절대 덮어쓰지 못함 (decidedByRole 검사).
  //   - 매니저는 platform_admin 결정 행도 덮어쓰지 못함.
  //   - hq_executive 는 platform_admin 결정 행을 덮어쓰지 못함.
  //   .returning() 결과가 비어 있으면 race condition or 권한 위계로 막힌 것.
  const updateConds = [
    eq(facilityStaffSignupRequestsTable.id, id),
    eq(facilityStaffSignupRequestsTable.status, "pending"),
  ];
  if (approver.role === "manager") {
    updateConds.push(
      or(
        isNull(facilityStaffSignupRequestsTable.decidedByRole),
        eq(facilityStaffSignupRequestsTable.decidedByRole, "manager"),
      )!,
    );
  } else if (approver.role === "hq_executive") {
    updateConds.push(
      or(
        isNull(facilityStaffSignupRequestsTable.decidedByRole),
        ne(facilityStaffSignupRequestsTable.decidedByRole, "platform_admin"),
      )!,
    );
  }

  try {
    let updatedRow: typeof facilityStaffSignupRequestsTable.$inferSelect | undefined;
    await db.transaction(async (tx) => {
      const [r] = await tx.update(facilityStaffSignupRequestsTable)
        .set({
          status: "approved",
          decidedBy: approver.id,
          decidedByRole: approver.role,
          decidedAt: new Date(),
          targetBuildingId: finalBuildingId,
          targetManagerId: approver.role === "manager" ? approver.id : null,
        })
        .where(and(...updateConds))
        .returning();
      updatedRow = r;
      if (r) {
        await tx.update(usersTable)
          .set({ approvalStatus: "active", buildingId: finalBuildingId })
          .where(eq(usersTable.id, r.userId));
      }
    });
    if (!updatedRow) {
      res.status(409).json({
        error: "이 신청은 이미 다른 권한자가 처리했거나 권한 위계로 변경할 수 없습니다.",
      });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    // [Task #651] DB partial unique index (users_one_active_accountant_per_building)
    //   가 동시 승인 race 를 마지막 보루로 차단한다. PG 23505 unique_violation 을
    //   사용자 친화 안내로 변환.
    const code = (e as { code?: string } | null)?.code;
    if (code === "23505") {
      res.status(409).json({
        error: BUILDING_DUPLICATE_MESSAGE,
      });
      return;
    }
    throw e;
  }
});

router.post("/facility-signup-requests/:id/reject", requireRole("manager", "platform_admin", "hq_executive"), async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  const note: string = req.body?.note ?? "";
  const approver = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).then(r => r[0]);
  if (!approver) { res.status(401).json({ error: "Unauthorized" }); return; }
  const guard = await assertManagerCanHandle(approver, id);
  if (!guard.ok) { res.status(guard.status).json({ error: guard.error }); return; }
  const reqRowExisting = guard.reqRow;

  // [Task #651] 위계 보호: 본부장이 결정한 건은 매니저가 다시 결정할 수 없다.
  if (
    approver.role === "manager"
    && reqRowExisting.status !== "pending"
    && reqRowExisting.decidedByRole === "hq_executive"
  ) {
    res.status(403).json({ error: "본부장이 결정한 신청은 관리소장이 되돌릴 수 없습니다." });
    return;
  }

  // [Task #651] race-safe 가드 (approve 와 동일 패턴).
  //   - status='pending' 인 행만 거절. 이미 다른 결정자가 처리했다면 0건.
  //   - 매니저는 hq_executive / platform_admin 결정 행을 덮어쓰지 못함.
  //   - hq_executive 는 platform_admin 결정 행을 덮어쓰지 못함.
  const rejectConds = [
    eq(facilityStaffSignupRequestsTable.id, id),
    eq(facilityStaffSignupRequestsTable.status, "pending"),
  ];
  if (approver.role === "manager") {
    rejectConds.push(
      or(
        isNull(facilityStaffSignupRequestsTable.decidedByRole),
        eq(facilityStaffSignupRequestsTable.decidedByRole, "manager"),
      )!,
    );
  } else if (approver.role === "hq_executive") {
    rejectConds.push(
      or(
        isNull(facilityStaffSignupRequestsTable.decidedByRole),
        ne(facilityStaffSignupRequestsTable.decidedByRole, "platform_admin"),
      )!,
    );
  }

  let rejectedRow: typeof facilityStaffSignupRequestsTable.$inferSelect | undefined;
  await db.transaction(async (tx) => {
    const [r] = await tx.update(facilityStaffSignupRequestsTable)
      .set({
        status: "rejected",
        decidedBy: approver.id,
        decidedByRole: approver.role,
        decidedAt: new Date(),
        note,
      })
      .where(and(...rejectConds))
      .returning();
    rejectedRow = r;
    if (r) {
      await tx.update(usersTable)
        .set({ approvalStatus: "rejected" })
        .where(eq(usersTable.id, r.userId));
    }
  });
  if (!rejectedRow) {
    res.status(409).json({
      error: "이 신청은 이미 다른 권한자가 처리했거나 권한 위계로 변경할 수 없습니다.",
    });
    return;
  }
  res.json({ ok: true });
});

// [Task #651] 거절·승인된 신청을 다시 pending 으로 되돌린다.
//   - 매니저가 거절한 건 → 본부장(hq_executive) / platform_admin 만 reopen 가능.
//   - 본부장(또는 platform_admin) 이 거절한 건 → platform_admin 만 reopen 가능
//     (관리소장은 본부장 결정을 절대 되돌릴 수 없다).
router.post("/facility-signup-requests/:id/reopen", requireRole("platform_admin", "hq_executive"), async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  const approver = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).then(r => r[0]);
  if (!approver) { res.status(401).json({ error: "Unauthorized" }); return; }
  const guard = await assertManagerCanHandle(approver, id);
  if (!guard.ok) { res.status(guard.status).json({ error: guard.error }); return; }
  const reqRowExisting = guard.reqRow;

  if (reqRowExisting.status === "pending") {
    res.status(409).json({ error: "이미 대기 상태입니다" });
    return;
  }

  // 본부장이 결정한 건은 platform_admin 만 reopen 가능.
  if (approver.role === "hq_executive" && reqRowExisting.decidedByRole === "platform_admin") {
    res.status(403).json({ error: "플랫폼이 결정한 신청은 플랫폼 관리자만 다시 여실 수 있습니다." });
    return;
  }

  // [Task #651] race-safe 가드:
  //   - 이미 reopen 되어 status='pending' 인 행은 다시 reopen 하지 않음 (위에서 409).
  //   - hq_executive 는 platform_admin 이 결정한 행을 reopen 할 수 없음 (decidedByRole 검사).
  const reopenConds = [
    eq(facilityStaffSignupRequestsTable.id, id),
    ne(facilityStaffSignupRequestsTable.status, "pending"),
  ];
  if (approver.role === "hq_executive") {
    reopenConds.push(
      or(
        isNull(facilityStaffSignupRequestsTable.decidedByRole),
        ne(facilityStaffSignupRequestsTable.decidedByRole, "platform_admin"),
      )!,
    );
  }

  let reopenedRow: typeof facilityStaffSignupRequestsTable.$inferSelect | undefined;
  await db.transaction(async (tx) => {
    const [r] = await tx.update(facilityStaffSignupRequestsTable)
      .set({
        status: "pending",
        decidedBy: null,
        decidedByRole: null,
        decidedAt: null,
        // 거절 사유는 보존하지 않음 (다시 검토 시 새 메모를 남기도록).
        note: null,
      })
      .where(and(...reopenConds))
      .returning();
    reopenedRow = r;
    if (r) {
      await tx.update(usersTable)
        .set({ approvalStatus: "pending" })
        .where(eq(usersTable.id, r.userId));
    }
  });
  if (!reopenedRow) {
    res.status(409).json({
      error: "이 신청은 이미 다시 열렸거나 권한 위계로 변경할 수 없습니다.",
    });
    return;
  }
  res.json({ ok: true });
});

export default router;
