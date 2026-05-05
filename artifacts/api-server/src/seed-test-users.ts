import bcrypt from "bcryptjs";
import { db, usersTable, hqBuildingAssignmentsTable, buildingsTable } from "@workspace/db";
import { eq, and, sql, isNull, inArray } from "drizzle-orm";
import { logger } from "./lib/logger";
import { seedDevDemoSeeds } from "./seed-dev-demo-seeds";

const TEST_PASSWORD = "test1234!";

// [Task #629 → 2026-05 사장님 요청] DEV 환경 데모 건물의 기본 시드 값.
//   - 사장님 명시 요청: 데모 건물 #1 = 실제 존재하는 "씨엘뷰오피스텔"
//     (경기도 용인시 기흥구 동백중앙로 177) 로 고정.
//     이렇게 해야 캐시/관리비 트랜잭션 + 각 기능 작동 검증 시 실제 주소
//     기반의 데이터(우편번호/시군구/지번) 로 시연/회귀가 일관된다.
//   - 백필 가드(아래 ensureDevDemoBuilding) 는 "현재 행이 씨엘뷰오피스텔이
//     아니면 1회 강제로 씨엘뷰 데이터로 정렬한다" — 사장님이 데모 건물을
//     의도적으로 다른 건물로 바꿔서 쓰는 운영 시나리오는 없다.
//   - production 에서는 절대 실행되지 않는다 (seedTestUsers 가 NODE_ENV 가드).
const DEMO_BUILDING_DEFAULTS = {
  name: "씨엘뷰오피스텔",
  addressFull: "경기도 용인시 기흥구 동백중앙로 177",
  // 정확한 지번은 미상 — 도로명 주소 시 "동백동" 까지만 박는다(클라이언트는
  //   addressFull 을 우선 표기하고 jibun 은 보조 표시).
  addressJibun: "경기도 용인시 기흥구 동백동",
  sido: "경기도",
  sigungu: "용인시 기흥구",
  dong: "동백동",
  zipCode: "17084",
  totalUnits: 168,
  totalFloors: 18,
  basementFloors: 4,
  totalArea: "18500.00",
  buildingUsage: "업무시설",
  structureType: "철근콘크리트구조",
  completionDate: "2018-09-15",
  approvalDate: "2018-10-05",
  elevatorCount: 4,
  parkingSpaces: 180,
  hasPlayground: false,
  hasGas: true,
  hasSepticTank: false,
  managementOfficePhone: "031-555-0100",
  managementOfficeFax: "031-555-0101",
  feeInquiryPhone: "031-555-0102",
  facilitySafetyPhone: "031-555-0103",
  landArea: "2100.00",
  buildingArea: "1450.00",
  buildingCoverageRatio: "69.05",
  floorAreaRatio: "881.00",
  electricCapacityKw: "1200",
  gasUsageMonthly: "12000",
} as const;

const TEST_USERS = [
  { email: "manager@test.com", name: "테스트 관리소장", role: "manager" as const, portalType: "building" as const, buildingId: 1 },
  { email: "accountant@test.com", name: "테스트 경리", role: "accountant" as const, portalType: "building" as const, buildingId: 1 },
  { email: "facility@test.com", name: "테스트 시설기사", role: "facility_staff" as const, portalType: "building" as const, buildingId: 1 },
  { email: "hq@test.com", name: "테스트 총괄임원", role: "hq_executive" as const, portalType: "hq" as const, buildingId: null },
  { email: "admin@test.com", name: "테스트 관리자", role: "platform_admin" as const, portalType: "hq" as const, buildingId: null },
  { email: "partner@test.com", name: "테스트 파트너사", role: "partner" as const, portalType: "partner" as const, buildingId: null },
];

// [Task #629] DEV 데모 건물(#1) 멱등 시드.
//   - buildings 행 #1 이 존재하지 않으면 새로 만들어 #1 PK 를 보장한다.
//     (PostgreSQL serial 시퀀스 특성상 명시적 id 삽입은 시퀀스를 건드리지
//     않으므로 setval 로 시퀀스를 다음 값으로 맞춘다.)
//   - 행이 이미 있다면 placeholder 여부를 검사한다. addressFull 과 totalUnits
//     가 모두 비어 있을 때만 데모 값으로 채운다(사용자가 이미 손댄 행은 절대
//     덮어쓰지 않는다 — 서버 재시작이 사용자 변경을 잃지 않게 한다).
async function ensureDevDemoBuilding(): Promise<void> {
  const [existing] = await db
    .select()
    .from(buildingsTable)
    .where(eq(buildingsTable.id, 1));

  if (!existing) {
    // 명시적 id=1 로 삽입한 후 시퀀스를 현재 최댓값 다음으로 맞춰
    // 이후 INSERT 가 1번을 다시 시도해 충돌하지 않게 한다.
    await db.insert(buildingsTable).values({
      id: 1,
      ...DEMO_BUILDING_DEFAULTS,
    } as typeof buildingsTable.$inferInsert);
    await db.execute(
      sql`SELECT setval(pg_get_serial_sequence('buildings', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM buildings), 0), 1))`,
    );
    logger.info({ buildingId: 1 }, "DEV demo building (#1) seeded");
    return;
  }

  // [2026-05 사장님 요청] 데모 건물 #1 은 항상 "씨엘뷰오피스텔" 로 정렬한다.
  //   - 현재 행의 name 또는 addressFull 이 DEMO_BUILDING_DEFAULTS 와 다르면
  //     1회 갱신해서 강제로 동기화한다.
  //   - 이미 동일한 데모 데이터로 채워져 있으면 아무것도 하지 않는다(멱등).
  //   - 사장님이 데모 건물을 다른 건물로 바꿔쓰는 운영 시나리오는 없으므로
  //     기존 "placeholder 일 때만 백필" 가드는 더 이상 필요하지 않다.
  const isAlreadyDemo =
    existing.name === DEMO_BUILDING_DEFAULTS.name &&
    existing.addressFull === DEMO_BUILDING_DEFAULTS.addressFull;
  if (isAlreadyDemo) {
    return;
  }

  await db
    .update(buildingsTable)
    .set(DEMO_BUILDING_DEFAULTS as Partial<typeof buildingsTable.$inferInsert>)
    .where(eq(buildingsTable.id, 1));
  logger.info(
    { buildingId: 1, name: DEMO_BUILDING_DEFAULTS.name },
    "DEV demo building (#1) realigned to 씨엘뷰오피스텔",
  );
}

// [Task #629] DEV DB 정합화 보고. 자동 삭제는 절대 하지 않는다 — 사용자가 한 번
//   검토 후 수동 정리할 수 있도록 옵션 보고서만 출력한다.
async function reportDevDbHealth(): Promise<void> {
  try {
    // (1) buildingId 가 NULL 인 manager 사용자 수.
    const managersWithoutBuilding = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable)
      .where(and(eq(usersTable.role, "manager"), isNull(usersTable.buildingId)))
      .then((r) => r[0]?.count ?? 0);

    // (2) 동일 주소(address_jibun)로 중복 생성된 buildings 행 그룹 수.
    const dupGroups = await db.execute<{ address_jibun: string; cnt: number; ids: string }>(sql`
      SELECT address_jibun,
             COUNT(*)::int AS cnt,
             string_agg(id::text, ',' ORDER BY id) AS ids
      FROM buildings
      WHERE address_jibun IS NOT NULL AND address_jibun <> ''
      GROUP BY address_jibun
      HAVING COUNT(*) > 1
    `);
    const duplicateRows = (dupGroups as unknown as { rows: Array<{ address_jibun: string; cnt: number; ids: string }> }).rows ?? [];

    // (3) user.buildingId 가 가리키는 건물이 placeholder 인 사용자 수.
    //     placeholder 임계치는 클라이언트의 isBuildingPlaceholder 와 동일하게
    //     {address_full, total_units, completion_date} 중 ≥2 가 비어 있을 때.
    //     - text 컬럼은 NULL 또는 빈 문자열, integer 컬럼은 NULL 또는 0 을 빈
    //       값으로 간주한다.
    const usersOnPlaceholderRow = await db.execute<{ cnt: number }>(sql`
      SELECT COUNT(*)::int AS cnt
      FROM users u
      JOIN buildings b ON b.id = u.building_id
      WHERE (
        (CASE WHEN COALESCE(NULLIF(b.address_full, ''), NULL) IS NULL THEN 1 ELSE 0 END)
      + (CASE WHEN COALESCE(b.total_units, 0) = 0 THEN 1 ELSE 0 END)
      + (CASE WHEN b.completion_date IS NULL THEN 1 ELSE 0 END)
      ) >= 2
    `);
    const usersOnPlaceholder =
      (usersOnPlaceholderRow as unknown as { rows: Array<{ cnt: number }> }).rows?.[0]?.cnt ?? 0;

    logger.info(
      {
        managersWithoutBuilding,
        duplicateAddressGroups: duplicateRows.length,
        duplicateAddressSamples: duplicateRows.slice(0, 5).map((g) => ({
          addressJibun: g.address_jibun,
          buildingIds: g.ids,
          count: g.cnt,
        })),
        usersOnPlaceholderBuilding: usersOnPlaceholder,
      },
      "DEV DB integrity report (no auto-cleanup)",
    );
  } catch (e) {
    logger.warn({ err: e }, "DEV DB integrity report failed");
  }
}

export async function seedTestUsers() {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  // [Task #629] 데모 건물 시드는 사용자 시드보다 먼저 — 사용자 행이 buildingId=1 로
  //   삽입되는 시점에 buildings #1 이 반드시 존재해야 외래키 가드가 안전하다.
  try {
    await ensureDevDemoBuilding();
  } catch (e) {
    logger.warn({ err: e }, "Failed to ensure DEV demo building");
  }

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  let created = 0;

  for (const u of TEST_USERS) {
    try {
      const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, u.email));
      if (existing.length > 0) continue;

      await db.insert(usersTable).values({
        email: u.email,
        passwordHash,
        name: u.name,
        role: u.role,
        portalType: u.portalType,
        buildingId: u.buildingId,
      });
      created++;
    } catch (e) {
      logger.warn({ email: u.email, err: e }, "Failed to seed test user");
    }
  }

  // [Task #629] 기존 환경에서 manager/accountant/facility 테스트 계정의 buildingId 가
  //   NULL 로 떠 있을 수 있다(이전 회귀 흐름의 잔재). 데모 건물 #1 에 다시 묶어 둬야
  //   "빠른 로그인 → 관리소장" 시나리오 A 가 곧바로 동작한다. 이미 다른 건물에 묶여
  //   있는 경우는 손대지 않는다.
  try {
    const sharedBuildingEmails = TEST_USERS
      .filter((u) => u.buildingId === 1)
      .map((u) => u.email);
    if (sharedBuildingEmails.length > 0) {
      const updated = await db
        .update(usersTable)
        .set({ buildingId: 1 })
        .where(and(
          inArray(usersTable.email, sharedBuildingEmails),
          isNull(usersTable.buildingId),
        ))
        .returning({ id: usersTable.id, email: usersTable.email });
      if (updated.length > 0) {
        logger.info(
          { count: updated.length, emails: updated.map((u) => u.email) },
          "Re-linked test users with NULL buildingId to demo building #1",
        );
      }
    }
  } catch (e) {
    logger.warn({ err: e }, "Failed to re-link test users to demo building");
  }

  // [Task #596] hq@test.com 본부장은 기본 관할 건물 1번을 할당해야 e2e 가시 데이터가 나온다.
  //   매핑이 비어 있으면 HQ 대시보드는 빈 응답을 받게 되어 회귀 테스트가 불안정해진다.
  try {
    const [hq] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, "hq@test.com"));
    if (hq) {
      const existingMapping = await db
        .select({ id: hqBuildingAssignmentsTable.id })
        .from(hqBuildingAssignmentsTable)
        .where(and(
          eq(hqBuildingAssignmentsTable.hqUserId, hq.id),
          eq(hqBuildingAssignmentsTable.buildingId, 1),
        ));
      if (existingMapping.length === 0) {
        await db.insert(hqBuildingAssignmentsTable).values({
          hqUserId: hq.id,
          buildingId: 1,
          assignedByUserId: null,
        });
        logger.info({ hqUserId: hq.id, buildingId: 1 }, "Default HQ building assignment seeded");
      }
    }
  } catch (e) {
    logger.warn({ err: e }, "Failed to seed default HQ building assignment");
  }

  if (created > 0) {
    logger.info({ created }, "Test user accounts seeded");
  }

  // [DEV 분할 프리뷰] 사용자 간 입력 연계 검증용 최소 씨앗 데이터.
  //   - vendor 1건 + partner.vendor_id 매핑 + RFQ 1건 (멱등).
  //   - 결재 1건 (매 부팅 재시드 — accountant 결재 시 소진).
  //   호출 순서: 사용자 시드 + buildingId 재연결 + HQ 매핑이 모두 끝난 다음.
  await seedDevDemoSeeds();

  // [Task #629] 시드 직후 한 번만 DEV DB 정합화 보고를 출력한다(자동 삭제 없음).
  await reportDevDbHealth();
}
