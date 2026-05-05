// [DEV 데모 씨앗] 빠른 로그인 사용자 간 입력 연계 검증을 위한 최소 씨앗 데이터.
//
// 목적: /__dev/preview-grid 4-셀(직원 3 + 파트너 1) 격자에서 처음 진입했을 때
//   "빈 화면" 이 아니어서 곧바로 사용자 간 데이터 흐름을 시각 확인할 수 있게 한다.
//
// 시드 범위 (의도적으로 최소화):
//   1. partner@test.com 의 users.vendor_id 매핑 (+ 매핑 대상 vendor 1건)
//   2. building #1 의 RFQ 1건 (위 vendor 가 응찰 가능하도록 vendor_ids 에 등재)
//   3. 결재 1건 (manager 기안 → accountant 결재 대기) — 매 부팅 재시드
//      (사장님 결정: accountant 가 결재 누르면 소진되므로 매번 새로 깐다)
//
// 검침/공지/일보/관리비는 시드하지 않는다 — 격자에서 manager 가 직접 입력해
//   facility/accountant 격자에서 새로고침으로 보이는 흐름이 사장님이 검증하시려는
//   본질이며, 미리 깔면 오히려 첫 진입에서 "내가 입력한 게 맞나" 가 헷갈린다.
//
// DEV-전용 가드 (replit.md 3중 가드):
//   - 진입 시 NODE_ENV !== "production" 체크 (호출부 seedTestUsers 도 동일 가드).
//   - 모든 씨앗 행은 식별 가능한 표식([DEV 데모 씨앗] 또는 명확한 이름) 을 박아
//     멱등 조회의 키로 사용한다.
//   - 사용자가 손댔으면(예: 행을 직접 수정/삭제) 다시 시드되지 않는다.
//     (예외: 결재 1건만 매 부팅 재시드 — 위 사유.)

import {
  db,
  usersTable,
  vendorsTable,
  approvalsTable,
  approvalStepsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./lib/logger";

const DEMO_BUILDING_ID = 1;
const DEMO_VENDOR_NAME = "[DEV 데모] 테스트파트너업체";
const DEMO_RFQ_TITLE = "[DEV 데모] 옥상 방수 보수 견적 요청";
const DEMO_APPROVAL_TITLE = "[DEV 데모] 결재 라인 검증용 기안";

/**
 * partner@test.com 에 매핑할 vendor 행을 멱등 시드한다.
 * - vendor.name = DEMO_VENDOR_NAME 으로 조회 (멱등 키).
 * - users.vendor_id 가 비어 있으면 위 vendor 로 채운다.
 * 반환: 시드된 vendor.id (없으면 null).
 */
async function ensureDemoVendorAndPartnerMapping(): Promise<number | null> {
  let vendorId: number;
  const [existingVendor] = await db
    .select({ id: vendorsTable.id })
    .from(vendorsTable)
    .where(eq(vendorsTable.name, DEMO_VENDOR_NAME));

  if (existingVendor) {
    vendorId = existingVendor.id;
    // [Task #682] 매칭 파이프라인(/rfqs/:id/matched-vendors)이 type="platform" 으로
    //   필터링하므로 demo vendor 도 platform 타입이어야 RFQ 카드에 매칭 수가 잡힌다.
    //   기존에 contracted 로 시드된 행이 있으면 platform 으로 보정한다.
    //   [2026-05] 데모 건물 = 씨엘뷰오피스텔(용인 기흥) 이라 vendor 권역도
    //     같은 시군구로 정렬해 매칭 결과가 자연스럽게 잡히게 한다.
    await db
      .update(vendorsTable)
      .set({ type: "platform", category: "방수/도장", sido: "경기도", sigungu: "용인시 기흥구" })
      .where(eq(vendorsTable.id, vendorId));
  } else {
    const [inserted] = await db
      .insert(vendorsTable)
      .values({
        name: DEMO_VENDOR_NAME,
        category: "방수/도장",
        // [Task #682] platform 매칭 파이프라인에서 잡히도록 platform 으로 시드.
        type: "platform",
        contactName: "테스트파트너 담당자",
        phone: "010-0000-0000",
        email: "partner@test.com",
        address: "경기도 용인시 기흥구 동백중앙로 200",
        sido: "경기도",
        sigungu: "용인시 기흥구",
        notes: "DEV 분할 프리뷰 격자 검증용 데모 vendor — 사용자가 손댔으면 그대로 둠.",
      })
      .returning({ id: vendorsTable.id });
    vendorId = inserted.id;
    logger.info({ vendorId }, "DEV demo vendor seeded");
  }

  // partner@test.com 의 users.vendor_id 매핑.
  //   - vendor_id 가 NULL 인 경우: 데모 vendor 로 채운다 (최초 시드).
  //   - vendor_id 가 가리키는 vendor 행이 더 이상 존재하지 않는 경우(끊긴 FK):
  //     데모 vendor 로 다시 매핑해 "/me/vendor 404 → 빈 화면" 회귀를 자동 복구.
  //   - 이미 다른 유효한 vendor 에 묶여 있으면 절대 덮어쓰지 않는다 (운영성 가드).
  //   raw SQL 로 NOT EXISTS 서브쿼리를 써서 한 문장으로 두 케이스를 모두 처리한다.
  await db.execute(sql`
    UPDATE users
       SET vendor_id = ${vendorId}
     WHERE email = 'partner@test.com'
       AND (
         vendor_id IS NULL
         OR NOT EXISTS (SELECT 1 FROM vendors v WHERE v.id = users.vendor_id)
       )
  `);

  return vendorId;
}

/**
 * building #1 의 RFQ 1건을 멱등 시드한다.
 * - title = DEMO_RFQ_TITLE 로 조회 (멱등 키).
 * - vendor_ids 에 위 vendor.id 가 들어가도록 한다 (파트너 포털에서 보이게).
 */
async function ensureDemoRfq(vendorId: number | null): Promise<void> {
  if (vendorId === null) return;

  // [환경 정합성] rfqs 테이블은 스키마와 DB 컬럼이 완전 일치하지 않을 수 있다 (예:
  //   #612 의 requires_site_visit/closed_at 등이 마이그레이션 누락). drizzle ORM 의
  //   insert 는 모든 NOT NULL DEFAULT 컬럼을 INSERT 문에 포함시키므로 누락 컬럼이
  //   하나라도 있으면 시드 전체가 실패한다. 따라서 핵심 컬럼만 raw SQL 로 INSERT 해
  //   스키마 drift 와 무관하게 동작하게 한다 (DB 가 가진 컬럼 default 값 자동 적용).
  const existing = await db.execute<{ id: number }>(
    sql`select id from rfqs where title = ${DEMO_RFQ_TITLE} limit 1`,
  );
  if (existing.rows.length > 0) return;

  const today = new Date();
  const deadline = new Date(today);
  deadline.setDate(today.getDate() + 14);
  const deadlineStr = deadline.toISOString().slice(0, 10);

  await db.execute(sql`
    insert into rfqs (
      title, category, service_type, description,
      building_name, building_id, deadline, status,
      vendor_ids, sido, sigungu, geo_scope
    ) values (
      ${DEMO_RFQ_TITLE}, '방수/도장', '옥상 방수',
      '씨엘뷰오피스텔 옥상 부분 방수 보수 견적 요청 (DEV 데모).',
      '씨엘뷰오피스텔', ${DEMO_BUILDING_ID}, ${deadlineStr}, 'open',
      ${String(vendorId)}, '경기도', '용인시 기흥구', 'sigungu'
    )
  `);
  logger.info({ vendorId }, "DEV demo RFQ seeded");
}

/**
 * 매 부팅 재시드되는 결재 1건. manager 기안 → accountant 결재 대기.
 * - 기존 [DEV 데모] 결재 행을 모두 정리(steps 포함) 한 후 새로 1건 생성.
 * - 사장님 결정: accountant 가 결재 누르면 소진되므로 다음 부팅 때 다시 깐다.
 *   사용자가 직접 수정/추가한 다른 결재 행은 절대 건드리지 않는다 (title 화이트리스트).
 */
async function reseedDemoApproval(): Promise<void> {
  // manager / accountant 사용자 id 조회 (시드 후이므로 반드시 존재).
  const [manager] = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.email, "manager@test.com"));
  const [accountant] = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.email, "accountant@test.com"));
  if (!manager || !accountant) {
    logger.warn("Skip demo approval reseed — manager/accountant user missing");
    return;
  }

  // 기존 [DEV 데모] 결재 정리 (steps 먼저).
  const oldRows = await db
    .select({ id: approvalsTable.id })
    .from(approvalsTable)
    .where(eq(approvalsTable.title, DEMO_APPROVAL_TITLE));
  for (const row of oldRows) {
    await db.delete(approvalStepsTable).where(eq(approvalStepsTable.approvalId, row.id));
  }
  if (oldRows.length > 0) {
    await db.delete(approvalsTable).where(eq(approvalsTable.title, DEMO_APPROVAL_TITLE));
  }

  const [approval] = await db
    .insert(approvalsTable)
    .values({
      title: DEMO_APPROVAL_TITLE,
      description:
        "DEV 분할 프리뷰 격자 검증용 결재. accountant 격자에서 결재 처리 시 manager 격자에서 결과가 보이는지 확인.",
      category: "other",
      status: "pending",
      currentStep: 1,
      totalSteps: 1,
      requesterId: manager.id,
      requesterName: manager.name,
      approverId: accountant.id,
      approverName: accountant.name,
      buildingId: DEMO_BUILDING_ID,
      triggerSource: "manual",
    })
    .returning({ id: approvalsTable.id });

  await db.insert(approvalStepsTable).values({
    approvalId: approval.id,
    stepOrder: 1,
    approverId: accountant.id,
    approverName: accountant.name,
    approverRole: "accountant",
    status: "pending",
    path: "electronic",
  });

  logger.info({ approvalId: approval.id }, "DEV demo approval reseeded (every boot)");
}

/**
 * DEV 빠른 로그인 사용자 간 연계 검증용 최소 씨앗 데이터를 멱등 시드한다.
 * 호출부(seedTestUsers) 가 이미 NODE_ENV 가드를 가지지만, 미래에 다른 곳에서
 * 직접 호출되어도 prod 데이터가 오염되지 않도록 함수 자체에도 fail-safe 가드.
 */
export async function seedDevDemoSeeds(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    logger.warn("seedDevDemoSeeds called in production — refusing");
    return;
  }
  try {
    const vendorId = await ensureDemoVendorAndPartnerMapping();
    await ensureDemoRfq(vendorId);
    await reseedDemoApproval();
    logger.info("seedDevDemoSeeds completed");
  } catch (e) {
    logger.warn({ err: e }, "seedDevDemoSeeds failed (non-fatal)");
  }
}
