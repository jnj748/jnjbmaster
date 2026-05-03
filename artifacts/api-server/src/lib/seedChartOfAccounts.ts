// [Task #778] T6 — 표준 계정과목 시드. 부팅 시 1회 멱등 실행.
import { db, chartOfAccountsTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { logger } from "./logger";

interface Seed {
  code: string; name: string; type: "asset"|"liability"|"equity"|"revenue"|"expense";
  parentCode?: string | null; isHeader?: boolean;
}

const STANDARD: Seed[] = [
  // 자산
  { code: "1000", name: "자산", type: "asset", isHeader: true },
  { code: "1010", name: "현금", type: "asset", parentCode: "1000" },
  { code: "1020", name: "예금", type: "asset", parentCode: "1000" },
  { code: "1100", name: "미수관리비", type: "asset", parentCode: "1000" },
  { code: "1200", name: "선급비용", type: "asset", parentCode: "1000" },
  // 부채
  { code: "2000", name: "부채", type: "liability", isHeader: true },
  { code: "2100", name: "미지급금", type: "liability", parentCode: "2000" },
  { code: "2200", name: "가수금", type: "liability", parentCode: "2000" },
  { code: "2300", name: "수선적립금부채", type: "liability", parentCode: "2000" },
  // 자본
  { code: "3000", name: "자본", type: "equity", isHeader: true },
  { code: "3100", name: "이월잉여금", type: "equity", parentCode: "3000" },
  // 수익
  { code: "4000", name: "수익", type: "revenue", isHeader: true },
  { code: "4100", name: "관리수익", type: "revenue", parentCode: "4000" },
  { code: "4200", name: "잡수익", type: "revenue", parentCode: "4000" },
  // 비용
  { code: "5000", name: "비용", type: "expense", isHeader: true },
  { code: "5100", name: "관리비용", type: "expense", parentCode: "5000" },
  { code: "5200", name: "수선비", type: "expense", parentCode: "5000" },
  { code: "5300", name: "보험료", type: "expense", parentCode: "5000" },
  { code: "5400", name: "공과금", type: "expense", parentCode: "5000" },
  { code: "5900", name: "잡비", type: "expense", parentCode: "5000" },
];

export async function seedChartOfAccounts(): Promise<{ inserted: number; total: number }> {
  let inserted = 0;
  for (let i = 0; i < STANDARD.length; i++) {
    const s = STANDARD[i];
    const existing = await db.select({ id: chartOfAccountsTable.id })
      .from(chartOfAccountsTable)
      .where(and(eq(chartOfAccountsTable.code, s.code), isNull(chartOfAccountsTable.buildingId)))
      .limit(1);
    if (existing.length > 0) continue;
    await db.insert(chartOfAccountsTable).values({
      code: s.code,
      name: s.name,
      type: s.type,
      parentCode: s.parentCode ?? null,
      isHeader: s.isHeader ?? false,
      isStandard: true,
      buildingId: null,
      sortOrder: i,
    });
    inserted++;
  }
  logger.info({ inserted, total: STANDARD.length }, "[T6] chart_of_accounts seed complete");
  return { inserted, total: STANDARD.length };
}
