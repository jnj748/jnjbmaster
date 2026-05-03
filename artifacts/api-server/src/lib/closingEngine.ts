// [Task #780] T9 마감·보고엔진 v01 — 게이트 점검 / 잠금 / 스냅샷 / 이월잔액 / 표준보고.
//
// 흐름:
//   1) runGates(buildingId, month)  — 5개 게이트 결과(통과/미통과 + 상세) 반환.
//   2) buildSnapshot(...)            — 보고용 집계(부과·수납·미수·매출·비용·BS/PL).
//   3) computeCarryForward(...)      — 자산(1xxx)·부채(2xxx) 잔액을 다음 달로 이월.
//   4) lockMonth(...)                — 위 3종을 단일 트랜잭션으로 굳히고 journal_entries.locked=true.
//   5) unlockMonth(...)              — period_closings.status='reopened' + journal locked=false 해제.
//   6) isMonthLocked(...)            — 미들웨어/T10 발송엔진에서 빠르게 조회.

import { db } from "@workspace/db";
import { routedGenerate } from "./llmRouter";
import {
  journalEntriesTable,
  journalLinesTable,
  billsTable,
  billPaymentsTable,
  bankTransactionsTable,
  billingRunsTable,
  billingInstallmentsTable,
  meterReadingsTable,
  unitsTable,
  periodClosingsTable,
  closingSnapshotsTable,
  carryForwardBalancesTable,
  type ClosingGateResult,
  type ClosingSnapshotSummary,
} from "@workspace/db";
import { and, eq, gte, lte, sql, isNull, isNotNull, ne } from "drizzle-orm";
import { logger } from "./logger";

// [Task #780 review] 트랜잭션 내부에서 helpers 가 같은 tx 컨텍스트로 읽도록
//   집계 함수에 executor 를 주입한다. 외부 API(runGates/buildSnapshot/...)는
//   기존처럼 인자 없이 호출하면 db 글로벌을 쓰고, lockMonth 내부에서는 tx 를 넘긴다.
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

// [Task #780 review] LLM 변동 코멘트 — 전월 대비 핵심 수치 변화를 1~3줄로 요약.
//   실패해도 마감을 막지 않는다(코멘트 없는 빈 배열로 폴백).
async function generateClosingComments(
  buildingId: number,
  month: string,
  current: ClosingSnapshotSummary,
  ex: Executor,
): Promise<string[]> {
  try {
    const prev = await (async () => {
      const [y, m] = month.split("-").map(Number);
      const pm = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
      const [pc] = await ex.select().from(periodClosingsTable)
        .where(and(eq(periodClosingsTable.buildingId, buildingId), eq(periodClosingsTable.month, pm)));
      if (!pc?.snapshotId) return null;
      const [snap] = await ex.select().from(closingSnapshotsTable)
        .where(eq(closingSnapshotsTable.id, pc.snapshotId));
      return snap?.summary ?? null;
    })();

    const prompt = [
      "당신은 건물 회계 마감 보고서 코멘트를 작성하는 보조 분석가입니다.",
      "다음 JSON 두 개(전월/당월 핵심 수치)를 비교해 한국어 1~3줄로 변동 요약을 써주세요.",
      "장황한 서론 없이 숫자·증감(%)·원인 추정만. 마크다운/리스트 기호 금지.",
      `당월(${month}) 요약: ${JSON.stringify({ totals: current.totals, collection: current.collection })}`,
      `전월: ${prev ? JSON.stringify({ totals: (prev as ClosingSnapshotSummary).totals, collection: (prev as ClosingSnapshotSummary).collection }) : "없음(첫 마감)"}`,
    ].join("\n");

    const r = await routedGenerate({
      parts: [{ text: prompt }],
      tier: "tier0",
      maxOutputTokens: 256,
      inputTextForRouting: prompt,
    });
    return r.text
      .split(/\n+/)
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .slice(0, 3);
  } catch (err) {
    logger.warn({ err, buildingId, month }, "[Task #780] closing AI comment generation failed; falling back to empty");
    return [];
  }
}

// ── 월 헬퍼 ─────────────────────────────────────────────────
export function isYM(s: string): boolean {
  return /^\d{4}-\d{2}$/.test(s);
}
function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { start, end: next };
}
export function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

// ── 게이트 ──────────────────────────────────────────────────
export async function runGates(buildingId: number, month: string, ex: Executor = db): Promise<ClosingGateResult[]> {
  if (!isYM(month)) throw new Error("month must be YYYY-MM");
  const { start, end } = monthBounds(month);
  const results: ClosingGateResult[] = [];

  // 1) 검침 누락 — 호실 수 vs 검침된 unique 호실 수.
  //    검침 데이터가 있어야 비례부과/요금산정이 가능. 검침 0건이면 통과(검침을 안 쓰는 건물 케이스).
  const unitCountRow = await ex.select({ c: sql<number>`COUNT(*)::int` })
    .from(unitsTable).where(eq(unitsTable.buildingId, buildingId));
  const unitCount = unitCountRow[0]?.c ?? 0;
  const meteredRow = await ex.select({ c: sql<number>`COUNT(DISTINCT ${meterReadingsTable.unitId})::int` })
    .from(meterReadingsTable)
    .where(and(
      eq(meterReadingsTable.buildingId, buildingId),
      sql`${meterReadingsTable.readingDate} >= ${start} AND ${meterReadingsTable.readingDate} < ${end}`,
    ));
  const metered = (meteredRow[0] as { c?: number } | undefined)?.c ?? 0;
  const meterMissing = unitCount > 0 && metered > 0 && metered < unitCount ? unitCount - metered : 0;
  results.push({
    key: "meters_missing",
    label: "검침 누락",
    passed: meterMissing === 0,
    detail: meterMissing === 0
      ? metered === 0 ? "검침 데이터 없음(검침 미사용 건물)" : `${unitCount}호실 모두 검침 입력됨`
      : `${meterMissing}개 호실 검침 누락`,
    count: meterMissing,
    fixHref: "/erp/metering",
  });

  // 2) 수납 분개 누락 — bill_payments 중 reversed_at IS NULL 인데 journal_entries 에 매칭이 없음.
  const paymentJournalRow = await ex.execute(sql`
    SELECT COUNT(*)::int AS c FROM ${billPaymentsTable} bp
    WHERE bp.building_id = ${buildingId}
      AND bp.reversed_at IS NULL
      AND DATE(bp.paid_at) >= ${start} AND DATE(bp.paid_at) < ${end}
      AND NOT EXISTS (
        SELECT 1 FROM ${journalEntriesTable} je
         WHERE je.source_event IN ('payment.received','payment.partial')
           AND je.source_ref_type = 'bill_payment'
           AND je.source_ref_id = bp.id
      )
  `);
  const pjMissing = Number((paymentJournalRow.rows[0] as { c?: number })?.c ?? 0);
  results.push({
    key: "payments_unjournaled",
    label: "수납 분개 누락",
    passed: pjMissing === 0,
    detail: pjMissing === 0 ? "모든 수납에 대응 분개 존재" : `${pjMissing}건 수납이 분개되지 않음`,
    count: pjMissing,
    fixHref: "/erp/billing-ledger",
  });

  // 3) 분개 대차불일치 — 해당 월 entry 중 is_balanced=false.
  const ubRow = await ex.select({ c: sql<number>`COUNT(*)::int` })
    .from(journalEntriesTable)
    .where(and(
      eq(journalEntriesTable.buildingId, buildingId),
      gte(journalEntriesTable.entryDate, start),
      sql`${journalEntriesTable.entryDate} < ${end}`,
      eq(journalEntriesTable.isBalanced, false),
    ));
  const unbalanced = (ubRow[0] as { c?: number } | undefined)?.c ?? 0;
  results.push({
    key: "journal_unbalanced",
    label: "분개 대차불일치",
    passed: unbalanced === 0,
    detail: unbalanced === 0 ? "모든 분개 대차일치" : `${unbalanced}건 대차불일치`,
    count: unbalanced,
    fixHref: "/erp/accounting",
  });

  // 4) 통장내역 미매칭 — match_status NOT IN ('matched','manual','auto','ignored') 인 거래.
  const bankRow = await ex.select({ c: sql<number>`COUNT(*)::int` })
    .from(bankTransactionsTable)
    .where(and(
      eq(bankTransactionsTable.buildingId, buildingId),
      gte(bankTransactionsTable.txDate, start),
      sql`${bankTransactionsTable.txDate} < ${end}`,
      sql`${bankTransactionsTable.matchStatus} IN ('unmatched','suspense')`,
    ));
  const bankUnmatched = (bankRow[0] as { c?: number } | undefined)?.c ?? 0;
  results.push({
    key: "bank_unmatched",
    label: "통장내역 미매칭",
    passed: bankUnmatched === 0,
    detail: bankUnmatched === 0 ? "모든 통장내역 매칭 완료" : `${bankUnmatched}건 미매칭/가수금`,
    count: bankUnmatched,
    fixHref: "/erp/billing-ledger",
  });

  // 5) 분할부과 인식 누락 — 활성 ledger 중 startMonth<=month<=endMonth 인데
  //    voucher.installment_recognized 분개가 그 달에 없으면 미인식.
  const installRow = await ex.execute(sql`
    SELECT COUNT(*)::int AS c FROM ${billingInstallmentsTable} bi
    WHERE bi.building_id = ${buildingId}
      AND bi.status = 'active'
      AND bi.start_month <= ${month}
      AND bi.end_month >= ${month}
      AND NOT EXISTS (
        SELECT 1 FROM ${journalEntriesTable} je
         WHERE je.building_id = ${buildingId}
           AND je.source_event = 'voucher.installment_recognized'
           AND je.source_ref_id = bi.id
           AND DATE(je.entry_date) >= ${start}
           AND DATE(je.entry_date) < ${end}
      )
  `);
  const inMissing = Number((installRow.rows[0] as { c?: number })?.c ?? 0);
  results.push({
    key: "installments_pending",
    label: "분할부과 인식 누락",
    passed: inMissing === 0,
    detail: inMissing === 0 ? "당월 분할부과 모두 인식" : `${inMissing}건 분할부과 회차 미인식`,
    count: inMissing,
    fixHref: "/erp/billing",
  });

  return results;
}

// ── 스냅샷 집계 ─────────────────────────────────────────────
async function aggregateBilling(buildingId: number, month: string, ex: Executor = db): Promise<{ billed: number; collected: number; overdue: number; overdueCount: number; rate: number }> {
  const [row] = await ex.select({
    billed: sql<number>`COALESCE(SUM(${billsTable.totalAmount}), 0)`,
    paid: sql<number>`COALESCE(SUM(${billsTable.paidAmount}), 0)`,
    overdueAmt: sql<number>`COALESCE(SUM(CASE WHEN ${billsTable.status} IN ('overdue','partial','issued') THEN GREATEST(${billsTable.totalAmount} - ${billsTable.paidAmount}, 0) ELSE 0 END), 0)`,
    overdueCnt: sql<number>`COUNT(*) FILTER (WHERE ${billsTable.status} IN ('overdue','partial','issued') AND ${billsTable.totalAmount} > ${billsTable.paidAmount})::int`,
  })
    .from(billsTable)
    .where(and(eq(billsTable.buildingId, buildingId), eq(billsTable.billingMonth, month)));
  const billed = Number(row?.billed ?? 0);
  const collected = Number(row?.paid ?? 0);
  const overdue = Number(row?.overdueAmt ?? 0);
  const overdueCount = Number(row?.overdueCnt ?? 0);
  const rate = billed > 0 ? Math.round((collected / billed) * 1000) / 10 : 0;
  return { billed, collected, overdue, overdueCount, rate };
}

async function aggregatePLandBS(buildingId: number, month: string, ex: Executor = db): Promise<{
  revenue: Array<{ code: string; name: string; amount: number }>;
  expense: Array<{ code: string; name: string; amount: number }>;
  assets: Array<{ code: string; name: string; balance: number }>;
  liabilities: Array<{ code: string; name: string; balance: number }>;
  equity: Array<{ code: string; name: string; balance: number }>;
  netIncome: number;
}> {
  const { start, end } = monthBounds(month);
  // 당월 손익(코드 4xxx 매출 / 5xxx 비용)
  const plRows = await ex.execute<{ code: string; name: string; debit: number; credit: number }>(sql`
    SELECT jl.account_code AS code, MAX(jl.account_name) AS name,
           COALESCE(SUM(jl.debit),0)::float AS debit, COALESCE(SUM(jl.credit),0)::float AS credit
    FROM ${journalLinesTable} jl
    JOIN ${journalEntriesTable} je ON je.id = jl.entry_id
    WHERE je.building_id = ${buildingId}
      AND je.entry_date >= ${start} AND je.entry_date < ${end}
    GROUP BY jl.account_code
  `);
  const revenue: Array<{ code: string; name: string; amount: number }> = [];
  const expense: Array<{ code: string; name: string; amount: number }> = [];
  for (const r of plRows.rows) {
    const c = String(r.code);
    if (c.startsWith("4")) revenue.push({ code: c, name: String(r.name), amount: Number(r.credit) - Number(r.debit) });
    else if (c.startsWith("5")) expense.push({ code: c, name: String(r.name), amount: Number(r.debit) - Number(r.credit) });
  }
  const revenueSum = revenue.reduce((s, r) => s + r.amount, 0);
  const expenseSum = expense.reduce((s, r) => s + r.amount, 0);
  const netIncome = revenueSum - expenseSum;

  // 누적 BS — entry_date < end 까지의 1xxx/2xxx/3xxx 잔액.
  const bsRows = await ex.execute<{ code: string; name: string; debit: number; credit: number }>(sql`
    SELECT jl.account_code AS code, MAX(jl.account_name) AS name,
           COALESCE(SUM(jl.debit),0)::float AS debit, COALESCE(SUM(jl.credit),0)::float AS credit
    FROM ${journalLinesTable} jl
    JOIN ${journalEntriesTable} je ON je.id = jl.entry_id
    WHERE je.building_id = ${buildingId}
      AND je.entry_date < ${end}
    GROUP BY jl.account_code
  `);
  const assets: Array<{ code: string; name: string; balance: number }> = [];
  const liabilities: Array<{ code: string; name: string; balance: number }> = [];
  const equity: Array<{ code: string; name: string; balance: number }> = [];
  for (const r of bsRows.rows) {
    const c = String(r.code);
    const n = String(r.name);
    if (c.startsWith("1")) assets.push({ code: c, name: n, balance: Number(r.debit) - Number(r.credit) });
    else if (c.startsWith("2")) liabilities.push({ code: c, name: n, balance: Number(r.credit) - Number(r.debit) });
    else if (c.startsWith("3")) equity.push({ code: c, name: n, balance: Number(r.credit) - Number(r.debit) });
  }
  return { revenue, expense, assets, liabilities, equity, netIncome };
}

async function aggregateResidentReport(buildingId: number, month: string, ex: Executor = db): Promise<ClosingSnapshotSummary["residentReport"]> {
  const rows = await ex.select({
    unitId: billsTable.unitId,
    unitNumber: billsTable.unitNumber,
    billed: billsTable.totalAmount,
    paid: billsTable.paidAmount,
    status: billsTable.status,
    dueDate: billsTable.dueDate,
  })
    .from(billsTable)
    .where(and(eq(billsTable.buildingId, buildingId), eq(billsTable.billingMonth, month)))
    .orderBy(billsTable.unitNumber);
  const items = rows.map((r) => ({
    unitId: r.unitId ?? null,
    unitNumber: r.unitNumber ?? null,
    billed: Number(r.billed ?? 0),
    paid: Number(r.paid ?? 0),
    overdue: Math.max(Number(r.billed ?? 0) - Number(r.paid ?? 0), 0),
    status: r.status ?? null,
    dueDate: r.dueDate ?? null,
  }));
  const totals = {
    billed: items.reduce((s, i) => s + i.billed, 0),
    paid: items.reduce((s, i) => s + i.paid, 0),
    overdue: items.reduce((s, i) => s + i.overdue, 0),
  };
  return { items, totals };
}

export async function buildSnapshot(buildingId: number, month: string, ex: Executor = db): Promise<ClosingSnapshotSummary> {
  const billing = await aggregateBilling(buildingId, month, ex);
  const pl = await aggregatePLandBS(buildingId, month, ex);
  const residentReport = await aggregateResidentReport(buildingId, month, ex);
  const totals = {
    billed: billing.billed,
    collected: billing.collected,
    overdue: billing.overdue,
    revenue: pl.revenue.reduce((s, r) => s + r.amount, 0),
    expense: pl.expense.reduce((s, r) => s + r.amount, 0),
    netIncome: pl.netIncome,
  };

  // 에너지 사용 — meter_readings 합계(있을 때만).
  const energyRows = await ex.execute<{ kind: string; total: number }>(sql`
    SELECT meter_type AS kind, COALESCE(SUM(usage),0)::float AS total
    FROM ${meterReadingsTable}
    WHERE building_id = ${buildingId} AND billing_month = ${month}
    GROUP BY meter_type
  `).catch(() => ({ rows: [] as Array<{ kind: string; total: number }> }));
  const energy: Record<string, { usage: number; amount: number; unit: string } | null> = {};
  for (const e of energyRows.rows) {
    energy[String(e.kind)] = { usage: Number(e.total), amount: 0, unit: "" };
  }

  return {
    buildingId,
    month,
    generatedAt: new Date().toISOString(),
    totals,
    collection: { rate: billing.rate, billed: billing.billed, collected: billing.collected, overdue: billing.overdue, overdueCount: billing.overdueCount },
    energy,
    balanceSheet: { assets: pl.assets, liabilities: pl.liabilities, equity: pl.equity },
    operations: { revenue: pl.revenue, expense: pl.expense, netIncome: pl.netIncome },
    residentReport,
    comments: [],
  };
}

// ── 이월잔액 계산 ──────────────────────────────────────────
// 자산(1xxx) / 부채(2xxx) 의 (계정코드 × 거래처 × 호실) 누적 잔액을 다음 달로 이월.
// from_month = month, to_month = nextMonth(month).
export async function computeCarryForward(buildingId: number, month: string, ex: Executor = db): Promise<Array<{
  accountCode: string; accountName: string; partyName: string | null; unitId: number | null; debit: number; credit: number; balance: number;
}>> {
  const { end } = monthBounds(month);
  const rows = await ex.execute<{ code: string; name: string; party: string | null; unit_id: number | null; debit: number; credit: number }>(sql`
    SELECT jl.account_code AS code, MAX(jl.account_name) AS name,
           jl.party_name AS party, jl.unit_id AS unit_id,
           COALESCE(SUM(jl.debit),0)::float AS debit,
           COALESCE(SUM(jl.credit),0)::float AS credit
    FROM ${journalLinesTable} jl
    JOIN ${journalEntriesTable} je ON je.id = jl.entry_id
    WHERE je.building_id = ${buildingId}
      AND je.entry_date < ${end}
      AND (jl.account_code LIKE '1%' OR jl.account_code LIKE '2%')
    GROUP BY jl.account_code, jl.party_name, jl.unit_id
  `);
  const out: Array<{
    accountCode: string; accountName: string; partyName: string | null; unitId: number | null;
    debit: number; credit: number; balance: number;
  }> = [];
  for (const r of rows.rows) {
    const code = String(r.code);
    const debit = Number(r.debit);
    const credit = Number(r.credit);
    const balance = code.startsWith("1") ? debit - credit : credit - debit;
    if (Math.abs(balance) < 0.5) continue;
    out.push({
      accountCode: code,
      accountName: String(r.name),
      partyName: r.party ?? null,
      unitId: r.unit_id ?? null,
      debit, credit, balance,
    });
  }
  return out;
}

// ── 잠금 상태 조회 ─────────────────────────────────────────
export async function isMonthLocked(buildingId: number, month: string): Promise<boolean> {
  if (!isYM(month)) return false;
  const [row] = await db.select({ status: periodClosingsTable.status })
    .from(periodClosingsTable)
    .where(and(eq(periodClosingsTable.buildingId, buildingId), eq(periodClosingsTable.month, month)));
  return row?.status === "locked";
}

// ── 마감 잠금 ──────────────────────────────────────────────
// [Task #780 review] 정합성은 두 겹으로 보장된다:
//   1) 본 함수: SERIALIZABLE 트랜잭션 + advisory lock 으로 게이트 평가·스냅샷·
//      이월잔액 산출·status 전환을 같은 가시성에서 원자 수행.
//   2) DB 트리거 enforce_month_open() (migration 0061): journal_entries /
//      bill_payments / bills / bank_transactions 의 INSERT/UPDATE 시점에
//      period_closings 행을 FOR SHARE 로 읽고 status='locked' 면 예외 발생.
//      lockMonth() 의 status→locked UPDATE 는 같은 행에 EXCLUSIVE 를 걸어
//      writer 의 SHARE 와 자연 직렬화 — 라우트 레벨 isMonthLocked 인라인 체크의
//      "체크→쓰기" race 가 DB 차원에서 닫힌다.
export async function lockMonth(buildingId: number, month: string, userId: number, reason: string | null): Promise<{ closingId: number; snapshotId: number; gates: ClosingGateResult[]; carryForward: number }> {
  if (!isYM(month)) throw new Error("month must be YYYY-MM");
  const toMonth = nextMonth(month);
  const { start, end } = monthBounds(month);

  // [Task #780 review] SERIALIZABLE + 재시도. 동시 변경계 라우트가 isMonthLocked
  //   를 읽고 우리가 status='locked' 로 전환할 때 rw-conflict 가 발생하면 한 쪽이
  //   40001(serialization_failure) 로 롤백된다. 마감 측이 실패한 경우 최대 3회
  //   지수 백오프로 재시도해 사용자 입장에서 안정적으로 마감되도록 한다.
  const MAX_ATTEMPTS = 3;
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await runLockTransaction(buildingId, month, userId, reason, toMonth, start, end);
    } catch (err) {
      const code = (err as { code?: string }).code;
      const sqlState = (err as { sqlState?: string }).sqlState;
      // PG serialization_failure(40001) 또는 deadlock_detected(40P01) 만 재시도.
      if (code === "40001" || code === "40P01" || sqlState === "40001") {
        lastErr = err;
        const delay = 50 * Math.pow(2, attempt);
        logger.warn({ buildingId, month, attempt, code }, "[Task #780] lockMonth serialization conflict — retrying");
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("마감 직렬화 충돌 — 잠시 후 다시 시도하세요");
}

async function runLockTransaction(
  buildingId: number,
  month: string,
  userId: number,
  reason: string | null,
  toMonth: string,
  start: string,
  end: string,
): Promise<{ closingId: number; snapshotId: number; gates: ClosingGateResult[]; carryForward: number }> {
  return await db.transaction(async (tx) => {
    // 0) 같은 (building, month) 에 대한 동시 마감 시도를 advisory lock 으로 직렬화.
    //    hashtext 로 64bit key 생성 — 두 인자 advisory lock 사용.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${buildingId}::bigint, hashtext(${month})::bigint)`);
    // 0-1) DB 트리거(enforce_month_open)는 잠긴 월에 INSERT/UPDATE 를 막는데,
    //      lockMonth 본인은 journal_entries.locked=true 같은 자기 잠금 동작을
    //      해야 하므로 세션-스코프 GUC 로 트리거를 잠시 건너뛴다.
    await tx.execute(sql`SET LOCAL app.bypass_close_guard = '1'`);

    // 1) 게이트 — 트랜잭션 안에서 다시 평가해 같은 가시성으로 검사.
    const gates = await runGates(buildingId, month, tx);
    const failed = gates.filter(g => !g.passed);
    if (failed.length > 0) {
      const err = new Error(`마감 게이트 미통과: ${failed.map(f => f.label).join(", ")}`);
      (err as Error & { code?: string; gates?: unknown }).code = "CLOSING_GATE_FAILED";
      (err as Error & { code?: string; gates?: unknown }).gates = gates;
      throw err;
    }

    // 2) 스냅샷·이월잔액 — 모두 같은 tx 의 스냅에서 읽는다.
    const baseSummary = await buildSnapshot(buildingId, month, tx);
    const cf = await computeCarryForward(buildingId, month, tx);
    // 2-1) AI 변동 코멘트 — LLM 라우터로 1~3줄 요약을 만들어 스냅샷에 함께 굳힌다.
    //      LLM 실패 시 [] 폴백이라 마감을 막지 않는다.
    const comments = await generateClosingComments(buildingId, month, baseSummary, tx);
    const summary: ClosingSnapshotSummary = { ...baseSummary, comments };
    // 1) 스냅샷 1행
    const [snap] = await tx.insert(closingSnapshotsTable).values({
      buildingId, month,
      summary,
      totals: {
        billed: summary.totals.billed,
        collected: summary.totals.collected,
        overdue: summary.totals.overdue,
        revenue: summary.totals.revenue,
        expense: summary.totals.expense,
        netIncome: summary.totals.netIncome,
      },
    }).returning({ id: closingSnapshotsTable.id });
    if (!snap) throw new Error("스냅샷 생성 실패");

    // 2) period_closings upsert(open|reopened → locked)
    const existing = await tx.select().from(periodClosingsTable)
      .where(and(eq(periodClosingsTable.buildingId, buildingId), eq(periodClosingsTable.month, month)));
    let closingId: number;
    if (existing.length > 0) {
      const [u] = await tx.update(periodClosingsTable).set({
        status: "locked",
        lockedAt: new Date(),
        lockedById: userId,
        lockReason: reason,
        snapshotId: snap.id,
        gateResults: gates,
        unlockedAt: null,
        unlockedById: null,
        unlockReason: null,
      })
        .where(eq(periodClosingsTable.id, existing[0].id))
        .returning({ id: periodClosingsTable.id });
      closingId = u!.id;
    } else {
      const [i] = await tx.insert(periodClosingsTable).values({
        buildingId, month,
        status: "locked",
        lockedAt: new Date(),
        lockedById: userId,
        lockReason: reason,
        snapshotId: snap.id,
        gateResults: gates,
      }).returning({ id: periodClosingsTable.id });
      closingId = i!.id;
    }

    // 3) journal_entries.locked = true (당월)
    await tx.update(journalEntriesTable).set({ locked: true })
      .where(and(
        eq(journalEntriesTable.buildingId, buildingId),
        gte(journalEntriesTable.entryDate, start),
        sql`${journalEntriesTable.entryDate} < ${end}`,
      ));

    // 4) 이월잔액 — 같은 (from_month → to_month) 키로 멱등 재기록.
    await tx.delete(carryForwardBalancesTable).where(and(
      eq(carryForwardBalancesTable.buildingId, buildingId),
      eq(carryForwardBalancesTable.fromMonth, month),
    ));
    if (cf.length > 0) {
      await tx.insert(carryForwardBalancesTable).values(cf.map(b => ({
        buildingId,
        fromMonth: month,
        toMonth,
        accountCode: b.accountCode,
        accountName: b.accountName,
        partyName: b.partyName,
        unitId: b.unitId,
        debit: b.debit,
        credit: b.credit,
        balance: b.balance,
      })));
    }

    return { closingId, snapshotId: snap.id, gates, carryForward: cf.length };
  }, { isolationLevel: "serializable" });
}

// ── 마감 해제 (감사·되돌림) ─────────────────────────────────
export async function unlockMonth(buildingId: number, month: string, userId: number, reason: string): Promise<{ closingId: number }> {
  if (!isYM(month)) throw new Error("month must be YYYY-MM");
  if (!reason || reason.trim().length < 3) throw new Error("재오픈 사유는 3자 이상 필수입니다");

  const { start, end } = monthBounds(month);
  return await db.transaction(async (tx) => {
    // unlock 도 journal_entries.locked=false 로 변경계 — 트리거 우회 필요.
    await tx.execute(sql`SET LOCAL app.bypass_close_guard = '1'`);
    const [pc] = await tx.select().from(periodClosingsTable)
      .where(and(eq(periodClosingsTable.buildingId, buildingId), eq(periodClosingsTable.month, month)));
    if (!pc) throw new Error("마감 이력이 없습니다");
    if (pc.status !== "locked") throw new Error("잠긴 마감만 해제할 수 있습니다");

    const [u] = await tx.update(periodClosingsTable).set({
      status: "reopened",
      unlockedAt: new Date(),
      unlockedById: userId,
      unlockReason: reason.trim(),
    })
      .where(eq(periodClosingsTable.id, pc.id))
      .returning({ id: periodClosingsTable.id });

    await tx.update(journalEntriesTable).set({ locked: false })
      .where(and(
        eq(journalEntriesTable.buildingId, buildingId),
        gte(journalEntriesTable.entryDate, start),
        sql`${journalEntriesTable.entryDate} < ${end}`,
      ));

    return { closingId: u!.id };
  });
}

logger.info("[Task #780] closingEngine loaded");
