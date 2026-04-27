// [Task #496] buildings 라우터 분리 — 건물 등록/수정 핸들러 + 필드 화이트리스트.
//   원본 routes/buildings.ts 의 BUILDING_*_FIELDS 상수, applySidoSigunguDerivation,
//   buildBuildingInsertValues / buildBuildingUpdateValues, POST /buildings, PUT /buildings/:id
//   를 그대로 옮긴다. duplicates.ts / seed-test-tasks.ts 의 헬퍼를 import 해 사용한다.
import { Router, type IRouter, type Request, type Response } from "express";
import { db, buildingsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
// [Task #475] addressFull/addressJibun 만 들어오고 sido/sigungu 가 비어 있는
//   기존·이관 데이터에 대비해 저장 경로에서 자동 도출한다.
import { deriveSidoSigungu } from "@workspace/shared/derive-region";
import {
  BUILDING_DUPLICATE_MESSAGE,
  isDuplicateCheckRole,
  findExistingActiveUserForAddress,
  findExistingManagerForAddress,
} from "./duplicates";
import { ensureTestInspectionsForBuilding } from "./seed-test-tasks";

// [Task #160] POST/PUT 핸들러가 동일한 화이트리스트를 사용해 필드 누락을 방지한다.
const BUILDING_TEXT_FIELDS = [
  "addressFull", "addressJibun", "sido", "sigungu", "dong", "zipCode",
  "buildingUsage", "structureType", "completionDate", "buildingRegisterPk",
  "safetyManagerType", "managementOfficePhone", "managementOfficeFax",
  // [Task #399] 입주민 안내·공지에서 사용하는 추가 연락처 2종(관리비문의/시설방재실).
  "feeInquiryPhone", "facilitySafetyPhone",
  "logoUrl", "approvalDate", "areaBasis",
] as const;
const BUILDING_NUMERIC_FIELDS = [
  "totalArea", "landArea", "buildingArea", "buildingCoverageRatio",
  "floorAreaRatio", "electricCapacityKw", "gasUsageMonthly",
] as const;
const BUILDING_INT_FIELDS = [
  "totalUnits", "totalFloors", "basementFloors", "elevatorCount", "parkingSpaces",
] as const;
const BUILDING_BOOL_FIELDS = [
  "hasPlayground", "hasGas", "hasSepticTank", "safetyManagerRequired",
] as const;
const BUILDING_BOOL_DEFAULTS: Record<string, boolean> = {
  hasPlayground: false, hasGas: true, hasSepticTank: true, safetyManagerRequired: false,
};
// [Task #328] 건축물대장 표제부/총괄표제부 원본을 통째로 저장하는 jsonb 필드.
const BUILDING_JSON_FIELDS = ["registerData"] as const;

// [Task #475] 저장 직전, sido/sigungu 가 비어 있고 addressFull/addressJibun 이
//   있으면 한국어 주소 첫 토큰들로 자동 도출해 채운다. 클라이언트가 카카오
//   postcode 외 경로(엑셀, 직접 PUT)로 주소만 보내도 RFQ 매칭이 가능해진다.
//   이미 값이 들어있는 경우엔 절대 덮어쓰지 않는다.
function applySidoSigunguDerivation(v: Record<string, unknown>): void {
  const sido = v.sido;
  const sigungu = v.sigungu;
  const hasSido = typeof sido === "string" && sido.trim().length > 0;
  const hasSigungu = typeof sigungu === "string" && sigungu.trim().length > 0;
  if (hasSido && hasSigungu) return;
  const addressFull = typeof v.addressFull === "string" ? v.addressFull : null;
  const addressJibun = typeof v.addressJibun === "string" ? v.addressJibun : null;
  if (!addressFull && !addressJibun) return;
  const derived = deriveSidoSigungu(addressFull, addressJibun);
  if (!hasSido && derived.sido) v.sido = derived.sido;
  if (!hasSigungu && derived.sigungu) v.sigungu = derived.sigungu;
}

function buildBuildingInsertValues(data: Record<string, unknown>): Record<string, unknown> {
  const v: Record<string, unknown> = { name: data.name };
  for (const f of BUILDING_TEXT_FIELDS) v[f] = data[f] || null;
  for (const f of BUILDING_INT_FIELDS) v[f] = data[f] ? parseInt(String(data[f])) : null;
  for (const f of BUILDING_NUMERIC_FIELDS) v[f] = data[f] || null;
  for (const f of BUILDING_BOOL_FIELDS) v[f] = data[f] ?? BUILDING_BOOL_DEFAULTS[f];
  for (const f of BUILDING_JSON_FIELDS) {
    if (data[f] !== undefined && data[f] !== null) v[f] = data[f];
  }
  applySidoSigunguDerivation(v);
  return v;
}

function buildBuildingUpdateValues(data: Record<string, unknown>): Record<string, unknown> {
  const v: Record<string, unknown> = {};
  if (data.name !== undefined) v.name = data.name;
  for (const f of BUILDING_TEXT_FIELDS) {
    if (data[f] !== undefined) v[f] = data[f];
  }
  for (const f of BUILDING_INT_FIELDS) {
    if (data[f] !== undefined) v[f] = data[f] ? parseInt(String(data[f])) : null;
  }
  for (const f of BUILDING_NUMERIC_FIELDS) {
    if (data[f] !== undefined) v[f] = data[f] || null;
  }
  for (const f of BUILDING_BOOL_FIELDS) {
    if (data[f] !== undefined) v[f] = data[f];
  }
  for (const f of BUILDING_JSON_FIELDS) {
    if (data[f] !== undefined) v[f] = data[f];
  }
  applySidoSigunguDerivation(v);
  return v;
}

const router: IRouter = Router();

router.post("/buildings", async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const data = req.body;
    if (!data.name) {
      res.status(400).json({ error: "건물명은 필수입니다." });
      return;
    }

    // [Task #227/#341] 관리소장·경리·시설담당자 중복 가입 차단: 동일 지번 주소에
    // 이미 동일 역할의 활성 사용자가 있다면 거절.
    const requester = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
    if (requester && isDuplicateCheckRole(requester.role)) {
      const dup = await findExistingActiveUserForAddress({
        role: requester.role,
        addressJibun: typeof data.addressJibun === "string" ? data.addressJibun : null,
        buildingId: null,
        excludeUserId: userId,
      });
      if (dup) {
        res.status(409).json({ error: BUILDING_DUPLICATE_MESSAGE });
        return;
      }
    }

    // [Task #218] 첫 건물 등록 여부 판별: 매니저가 처음 건물을 등록하는 경우 시드 대상.
    const requestingUser = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
    const isFirstBuildingForManager = !!requestingUser && requestingUser.role === "manager" && !requestingUser.buildingId;

    const [building] = await db
      .insert(buildingsTable)
      .values(buildBuildingInsertValues(data) as typeof buildingsTable.$inferInsert)
      .returning();

    await db.update(usersTable)
      .set({
        buildingId: building.id,
        // [Task #475] 사용자가 sido/sigungu 를 보내지 않아도 buildBuildingInsertValues
        //   가 주소 텍스트로부터 자동 도출해 채우므로, 사용자 행에도 도출된 값을
        //   동일하게 동기화한다(클라이언트 원시 입력 대신 building 행 기준).
        buildingSido: building.sido || null,
        buildingSigungu: building.sigungu || null,
      })
      .where(eq(usersTable.id, userId));

    // [Task #265/#268] 신규 매니저 첫 건물 등록 시 대시보드 체험용 (테스트업무) 4건을 시드한다.
    //  - 첫 등록뿐 아니라 위저드 강제 종료 후 재진입 케이스도 동일한 ensureTestInspectionsForBuilding
    //    헬퍼(POST /buildings/seed-test-inspections 와 공유)를 통해 멱등하게 보장된다.
    if (isFirstBuildingForManager) {
      try {
        await ensureTestInspectionsForBuilding(building.id);
      } catch (seedErr) {
        req.log.warn({ err: seedErr, buildingId: building.id }, "Failed to seed test inspections for first building");
      }
    }

    res.json({ building });
  } catch (error) {
    req.log.error({ err: error }, "Error creating building");
    res.status(500).json({ error: "Failed to create building" });
  }
});

router.put("/buildings/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const data = req.body;

  try {
    const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
    // [Task #278] 위저드 첫 PUT 저장(이미 building 행은 있지만 사용자 행에는 link가
    // 안 된 케이스)에서 사용자 ↔ 건물 연결을 보강한다. 매니저이고 자신의 buildingId
    // 가 비어 있다면, 동일 주소에 다른 매니저가 없는지 확인한 뒤 본인을 해당 건물로
    // 연결해 준다. 이로써 이어지는 멱등 seed-test-inspections 호출이 정상 동작한다.
    let claimManagerForBuilding = false;
    if (
      user &&
      user.role === "manager" &&
      !user.buildingId
    ) {
      const targetBuilding = await db.select().from(buildingsTable).where(eq(buildingsTable.id, id)).then(r => r[0]);
      if (targetBuilding) {
        const dupClaim = await findExistingManagerForAddress({
          addressJibun: targetBuilding.addressJibun ?? null,
          buildingId: id,
          excludeUserId: userId,
        });
        if (!dupClaim) {
          claimManagerForBuilding = true;
        }
      }
    }
    if (!user || (user.buildingId !== id && user.role !== "platform_admin" && !claimManagerForBuilding)) {
      res.status(403).json({ error: "이 건물을 수정할 권한이 없습니다" });
      return;
    }
    // [Task #132] 주소 잠금: platform_admin이 아니면 주소 관련 필드 변경 차단.
    // [Task #427] 단, 건축물대장 식별자(buildingRegisterPk)와 표제부 원본(registerData)은
    //   잠긴 주소에서도 ‘건축물대장 다시 조회’ 동선으로 채워 넣을 수 있어야 하므로
    //   주소 잠금 검사 대상에서 제외한다(주소 자체는 그대로 잠긴 채 유지).
    const existing = await db.select().from(buildingsTable).where(eq(buildingsTable.id, id)).then(r => r[0]);
    if (existing?.addressLocked && user.role !== "platform_admin") {
      const addressFields = ["addressFull", "addressJibun", "sido", "sigungu", "dong", "zipCode"];
      const attemptedAddressEdit = addressFields.some(f => data[f] !== undefined && data[f] !== existing[f as keyof typeof existing]);
      if (attemptedAddressEdit) {
        res.status(423).json({ error: "건물 주소는 잠겨 있어 변경할 수 없습니다. 변경이 필요한 경우 1800-0416으로 연락해 주세요." });
        return;
      }
    }
    // [Task #227/#341] 주소가 바뀌는 PUT 우회 시도 차단: 새 주소에 동일 역할의 다른 활성 사용자가 있으면 거절.
    if (isDuplicateCheckRole(user.role)) {
      const nextJibun = typeof data.addressJibun === "string" ? data.addressJibun : (existing?.addressJibun ?? null);
      const dup = await findExistingActiveUserForAddress({
        role: user.role,
        addressJibun: nextJibun,
        buildingId: id,
        excludeUserId: userId,
      });
      if (dup) {
        res.status(409).json({ error: BUILDING_DUPLICATE_MESSAGE });
        return;
      }
    }

    const updateData = buildBuildingUpdateValues(data);

    const [building] = await db.update(buildingsTable).set(updateData).where(eq(buildingsTable.id, id)).returning();

    // [Task #475] 사용자가 sido/sigungu 를 명시적으로 보내지 않더라도, addressFull/
    //   addressJibun 가 함께 들어오면 buildBuildingUpdateValues 가 자동 도출해 채워
    //   둔 상태이므로, 결과 building 행을 기준으로 사용자의 buildingSido/Sigungu 도
    //   함께 갱신한다(이전: 클라이언트 입력 키 유무로만 분기 → 자동 도출 케이스 누락).
    if (data.sido !== undefined || data.sigungu !== undefined || data.addressFull !== undefined || data.addressJibun !== undefined) {
      const requesterId = req.user?.userId;
      if (requesterId) {
        await db.update(usersTable)
          .set({ buildingSido: building.sido, buildingSigungu: building.sigungu })
          .where(eq(usersTable.id, requesterId));
      }
    }

    // [Task #278] 매니저가 buildingId 미연결 상태로 PUT을 통해 본인 건물을 저장하면
    // 사용자 행에 buildingId/지역 정보를 함께 채워 둔다. 이후 동일 요청 흐름의
    // POST /buildings/seed-test-inspections 호출이 noop 으로 빠지지 않고 정상적으로
    // (테스트업무) 4건을 보장한다.
    if (claimManagerForBuilding) {
      try {
        await db.update(usersTable)
          .set({
            buildingId: id,
            buildingSido: building.sido ?? null,
            buildingSigungu: building.sigungu ?? null,
          })
          .where(eq(usersTable.id, userId));
      } catch (linkErr) {
        req.log.warn({ err: linkErr, userId, buildingId: id }, "Failed to link manager to building during PUT claim");
      }
    }

    res.json({ building });
  } catch (error) {
    req.log.error({ err: error }, "Error updating building");
    res.status(500).json({ error: "Failed to update building" });
  }
});

export default router;
