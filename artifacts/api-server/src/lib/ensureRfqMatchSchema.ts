import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

// [Task #226] credit_category_pricing 테이블에 sido/sigungu 컬럼을 추가하고
// (category, sido, sigungu) 조합 유니크 인덱스로 단가 행을 식별한다.
// 기존 (category) 단일 unique 제약은 제거하고, 기존 행은 sido/sigungu = NULL
// 인 "기본 단가" 행으로 그대로 둔다.
//
// quotes 테이블에는 first_viewed_at / no_view_refunded_at 컬럼을 추가해
// 미열람 환불 잡의 판정/멱등 처리를 가능하게 한다.
export async function ensureRfqMatchSchema(): Promise<void> {
  // 베이스 테이블이 아직 마이그레이트되지 않은 환경에서는 본 ensure 가 실패하지 않도록
  // 사전에 존재 여부를 확인한다 (드리즐 마이그레이션 미실행 dev DB 대응).
  const exists = (await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'credit_category_pricing'
    ) AS exists
  `)) as unknown as { rows: Array<{ exists: boolean }> };
  if (!exists.rows?.[0]?.exists) return;

  await db.execute(sql`
    ALTER TABLE credit_category_pricing
      ADD COLUMN IF NOT EXISTS sido text
  `);
  await db.execute(sql`
    ALTER TABLE credit_category_pricing
      ADD COLUMN IF NOT EXISTS sigungu text
  `);
  // 기존 카테고리 단일 unique 인덱스/제약 제거 (있을 때만).
  await db.execute(sql`
    ALTER TABLE credit_category_pricing
      DROP CONSTRAINT IF EXISTS credit_category_pricing_category_unique
  `);
  await db.execute(sql`
    DROP INDEX IF EXISTS credit_category_pricing_category_unique
  `);
  // (category, sido, sigungu) 유니크 인덱스 — NULL 도 동일 값으로 취급하기 위해
  // NULLS NOT DISTINCT 옵션을 사용한다 (Postgres 15+).
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS credit_category_pricing_cat_region_unique
      ON credit_category_pricing (category, sido, sigungu) NULLS NOT DISTINCT
  `);

  await db.execute(sql`
    ALTER TABLE quotes
      ADD COLUMN IF NOT EXISTS first_viewed_at timestamptz
  `);
  await db.execute(sql`
    ALTER TABLE quotes
      ADD COLUMN IF NOT EXISTS no_view_refunded_at timestamptz
  `);
  // [Task #226] 단가/정책 변경 이력 표시(누가 마지막으로 저장했는지) 컬럼.
  await db.execute(sql`
    ALTER TABLE credit_category_pricing
      ADD COLUMN IF NOT EXISTS updated_by text
  `);
  const psExists = (await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'platform_settings'
    ) AS exists
  `)) as unknown as { rows: Array<{ exists: boolean }> };
  if (psExists.rows?.[0]?.exists) {
    await db.execute(sql`
      ALTER TABLE platform_settings
        ADD COLUMN IF NOT EXISTS updated_by text
    `);
  }
}
