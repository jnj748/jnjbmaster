// [Task #803] 결산·세무 모듈 — 결산보고서 라우트.
//   기존 /accounting/balance-sheet · /accounting/income-statement (#778) 위에
//   결산용 보고(시산표·월별손익·현금흐름·세입세출·년도이월 미리보기)를 더한다.
//   분개 데이터는 기존 buildEntryScope·buildAccountScope 와 동일한 가시성 규칙.
import { Router, type IRouter, type Request, type Response } from "express";
import {
  db, chartOfAccountsTable, journalEntriesTable, journalLinesTable,
  budgetsTable, budgetLinesTable, budgetExecutionsTable, BUDGET_CATEGORY_LABELS,
  periodClosingsTable, closingSnapshotsTable,
} from "@workspace/db";
import { and, asc, desc, eq, gte, lte, sql, inArray, isNull, type SQL } from "drizzle-orm";
import { requireRole } from "../middlewares/auth";
import { getAccessibleBuildingIds } from "../middlewares/buildingScope";

const router: IRouter = Router();
router.use("/closing-reports", requireRole("manager", "accountant", "platform_admin", "hq_executive"));

async function entryScope(req: Request): Promise<{ kind: "all" } | { kind: "empty" } | { kind: "ids"; cond: SQL }> {
  const scope = await getAccessibleBuildingIds(req);
  if (scope.unrestricted) return { kind: "all" };
  if (scope.ids.length === 0) return { kind: "empty" };
  return {
    kind: "ids",
    cond: scope.ids.length === 1
      ? eq(journalEntriesTable.buildingId, scope.ids[0])
      : inArray(journalEntriesTable.buildingId, scope.ids),
  };
}

async function accountScope(req: Request): Promise<SQL | null> {
  const scope = await getAccessibleBuildingIds(req);
  if (scope.unrestricted) return null;
  if (scope.ids.length === 0) return isNull(chartOfAccountsTable.buildingId);
  if (scope.ids.length === 1) {
    return sql`${chartOfAccountsTable.buildingId} IS NULL OR ${chartOfAccountsTable.buildingId} = ${scope.ids[0]}`;
  }
  return sql`${chartOfAccountsTable.buildingId} IS NULL OR ${chartOfAccountsTable.buildingId} = ANY(${scope.ids})`;
}

async function loadAccountTypes(req: Request): Promise<Map<string, { type: string; name: string }>> {
  const cond = await accountScope(req);
  const accs = await db.select().from(chartOfAccountsTable).where(cond ?? undefined);
  const m = new Map<string, { type: string; name: string }>();
  for (const a of accs) {
    const cur = m.get(a.code);
    if (!cur || a.buildingId !== null) m.set(a.code, { type: a.type, name: a.name });
  }
  return m;
}

// ── 시산표 (Trial Balance) ──────────────────────────────────────
// 기간 누계 차변·대변 합과 잔액(차/대 분리 표기)을 계정 코드 단위로 모은다.
router.get("/closing-reports/trial-balance", async (req: Request, res: Response): Promise<void> => {
  const scope = await entryScope(req);
  const { from, to, asOf } = req.query as { from?: string; to?: string; asOf?: string };
  if (scope.kind === "empty") {
    res.json({ from: from ?? null, to: to ?? null, asOf: asOf ?? null, rows: [], totals: { debit: 0, credit: 0, balanced: true } });
    return;
  }
  const conds: SQL[] = [];
  if (scope.kind === "ids") conds.push(scope.cond);
  if (from) conds.push(gte(journalEntriesTable.entryDate, from));
  if (to) conds.push(lte(journalEntriesTable.entryDate, to));
  if (asOf && !to) conds.push(lte(journalEntriesTable.entryDate, asOf));
  const where = conds.length ? and(...conds) : undefined;
  const rows = await db.select({
    code: journalLinesTable.accountCode,
    name: journalLinesTable.accountName,
    debit: sql<number>`COALESCE(SUM(${journalLinesTable.debit}), 0)`,
    credit: sql<number>`COALESCE(SUM(${journalLinesTable.credit}), 0)`,
  }).from(journalLinesTable)
    .innerJoin(journalEntriesTable, eq(journalEntriesTable.id, journalLinesTable.entryId))
    .where(where)
    .groupBy(journalLinesTable.accountCode, journalLinesTable.accountName)
    .orderBy(asc(journalLinesTable.accountCode));
  const types = await loadAccountTypes(req);
  let td = 0, tc = 0;
  const out = rows.map((r) => {
    const t = types.get(r.code)?.type ?? "asset";
    const debit = Number(r.debit);
    const credit = Number(r.credit);
    const net = debit - credit;
    // 정상잔액: asset/expense=차변, 나머지=대변. 순잔액의 부호로 표기 측을 결정.
    const debitSide = t === "asset" || t === "expense" ? Math.max(net, 0) : Math.max(-net, 0) === 0 ? 0 : 0;
    const creditSide = t === "asset" || t === "expense" ? Math.max(-net, 0) : Math.max(net, 0);
    // 위 식은 자산/비용은 차변잔액(net>0)을, 부채/자본/수익은 대변잔액(net<0)을 양수로 표기.
    const finalDebit = t === "asset" || t === "expense" ? Math.max(net, 0) : 0;
    const finalCredit = t === "asset" || t === "expense" ? Math.max(-net, 0) : Math.max(-net, 0);
    td += finalDebit; tc += finalCredit;
    return {
      code: r.code,
      name: r.name,
      type: t,
      periodDebit: debit,
      periodCredit: credit,
      balanceDebit: finalDebit,
      balanceCredit: finalCredit,
    };
  });
  res.json({
    from: from ?? null,
    to: to ?? null,
    asOf: asOf ?? null,
    rows: out,
    totals: { debit: td, credit: tc, balanced: Math.abs(td - tc) < 0.5 },
  });
});

// ── 월별손익계산서 (Monthly Income Statement) ────────────────────
// year(YYYY) 기간을 월별로 쪼개 수익·비용·순이익을 12행으로 반환.
router.get("/closing-reports/monthly-income-statement", async (req: Request, res: Response): Promise<void> => {
  const year = String(req.query.year ?? new Date().getUTCFullYear());
  const scope = await entryScope(req);
  if (scope.kind === "empty") { res.json({ year, months: [], totals: { revenue: 0, expense: 0, netIncome: 0 } }); return; }
  const conds: SQL[] = [];
  if (scope.kind === "ids") conds.push(scope.cond);
  conds.push(gte(journalEntriesTable.entryDate, `${year}-01-01`));
  conds.push(lte(journalEntriesTable.entryDate, `${year}-12-31`));
  const rows = await db.select({
    month: sql<string>`to_char(${journalEntriesTable.entryDate}, 'YYYY-MM')`,
    code: journalLinesTable.accountCode,
    debit: sql<number>`COALESCE(SUM(${journalLinesTable.debit}), 0)`,
    credit: sql<number>`COALESCE(SUM(${journalLinesTable.credit}), 0)`,
  }).from(journalLinesTable)
    .innerJoin(journalEntriesTable, eq(journalEntriesTable.id, journalLinesTable.entryId))
    .where(and(...conds))
    .groupBy(sql`to_char(${journalEntriesTable.entryDate}, 'YYYY-MM')`, journalLinesTable.accountCode);
  const types = await loadAccountTypes(req);
  const byMonth = new Map<string, { revenue: number; expense: number }>();
  for (let m = 1; m <= 12; m++) byMonth.set(`${year}-${String(m).padStart(2, "0")}`, { revenue: 0, expense: 0 });
  for (const r of rows) {
    const t = types.get(r.code)?.type;
    if (t !== "revenue" && t !== "expense") continue;
    const slot = byMonth.get(r.month) ?? { revenue: 0, expense: 0 };
    if (t === "revenue") slot.revenue += Number(r.credit) - Number(r.debit);
    else slot.expense += Number(r.debit) - Number(r.credit);
    byMonth.set(r.month, slot);
  }
  const months = Array.from(byMonth.entries()).map(([month, v]) => ({
    month, revenue: v.revenue, expense: v.expense, netIncome: v.revenue - v.expense,
  }));
  const totals = months.reduce(
    (acc, m) => ({ revenue: acc.revenue + m.revenue, expense: acc.expense + m.expense, netIncome: acc.netIncome + m.netIncome }),
    { revenue: 0, expense: 0, netIncome: 0 },
  );
  res.json({ year, months, totals });
});

// ── 현금흐름표 (간이) ───────────────────────────────────────────
// CASH(1010) + BANK(1020) 계정의 차변(유입)·대변(유출)을 월별로 모아 영업/투자/재무
// 분류는 보류하고 운영성과(net) 만 표기 — XpBIZ 와 의도적으로 다른 단순한 v01.
router.get("/closing-reports/cash-flow", async (req: Request, res: Response): Promise<void> => {
  const year = String(req.query.year ?? new Date().getUTCFullYear());
  const scope = await entryScope(req);
  if (scope.kind === "empty") { res.json({ year, months: [], totals: { inflow: 0, outflow: 0, net: 0 } }); return; }
  const conds: SQL[] = [];
  if (scope.kind === "ids") conds.push(scope.cond);
  conds.push(gte(journalEntriesTable.entryDate, `${year}-01-01`));
  conds.push(lte(journalEntriesTable.entryDate, `${year}-12-31`));
  conds.push(inArray(journalLinesTable.accountCode, ["1010", "1020"]));
  const rows = await db.select({
    month: sql<string>`to_char(${journalEntriesTable.entryDate}, 'YYYY-MM')`,
    debit: sql<number>`COALESCE(SUM(${journalLinesTable.debit}), 0)`,
    credit: sql<number>`COALESCE(SUM(${journalLinesTable.credit}), 0)`,
  }).from(journalLinesTable)
    .innerJoin(journalEntriesTable, eq(journalEntriesTable.id, journalLinesTable.entryId))
    .where(and(...conds))
    .groupBy(sql`to_char(${journalEntriesTable.entryDate}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${journalEntriesTable.entryDate}, 'YYYY-MM')`);
  const months = rows.map((r) => ({
    month: r.month, inflow: Number(r.debit), outflow: Number(r.credit), net: Number(r.debit) - Number(r.credit),
  }));
  const totals = months.reduce(
    (a, m) => ({ inflow: a.inflow + m.inflow, outflow: a.outflow + m.outflow, net: a.net + m.net }),
    { inflow: 0, outflow: 0, net: 0 },
  );
  res.json({ year, months, totals });
});

// ── 세입세출서 (Budget vs Actual) ───────────────────────────────
// #776 의 budgets/budget_versions/budget_lines/budget_executions 8개 표준 카테고리
// 매트릭스 기준. 활성 버전의 1~12월 합을 편성으로, budget_executions 누계를 실집행
// 으로 본다. 활성 버전이 없는 건물은 budget=0 으로 표기되며 actual 만 노출.
router.get("/closing-reports/budget-vs-actual", async (req: Request, res: Response): Promise<void> => {
  const year = String(req.query.year ?? new Date().getUTCFullYear());
  const scope = await getAccessibleBuildingIds(req);
  if (!scope.unrestricted && scope.ids.length === 0) {
    res.json({ year, rows: [], totals: { budget: 0, actual: 0, variance: 0 } });
    return;
  }
  const buildingIds = scope.unrestricted ? null : scope.ids;
  const budgetConds: SQL[] = [eq(budgetsTable.year, Number(year))];
  if (buildingIds && buildingIds.length === 1) budgetConds.push(eq(budgetsTable.buildingId, buildingIds[0]));
  else if (buildingIds && buildingIds.length > 1) budgetConds.push(inArray(budgetsTable.buildingId, buildingIds));
  const budgets = await db.select().from(budgetsTable).where(and(...budgetConds));
  const versionIds = budgets.map((b) => b.activeVersionId).filter((v): v is number => v != null);
  const budgetByCat = new Map<string, number>();
  if (versionIds.length > 0) {
    const lines = await db.select({
      category: budgetLinesTable.category,
      amount: sql<number>`COALESCE(SUM(${budgetLinesTable.amount}), 0)`,
    }).from(budgetLinesTable)
      .where(and(
        versionIds.length === 1 ? eq(budgetLinesTable.versionId, versionIds[0]) : inArray(budgetLinesTable.versionId, versionIds),
        // 0 은 연 총액 보조행 — 월(1~12) 만 합산.
        gte(budgetLinesTable.month, 1),
        lte(budgetLinesTable.month, 12),
      ))
      .groupBy(budgetLinesTable.category);
    for (const l of lines) budgetByCat.set(l.category, Number(l.amount));
  }
  const execConds: SQL[] = [];
  if (buildingIds && buildingIds.length === 1) execConds.push(eq(budgetExecutionsTable.buildingId, buildingIds[0]));
  else if (buildingIds && buildingIds.length > 1) execConds.push(inArray(budgetExecutionsTable.buildingId, buildingIds));
  const budgetIds = budgets.map((b) => b.id);
  if (budgetIds.length > 0) {
    execConds.push(budgetIds.length === 1 ? eq(budgetExecutionsTable.budgetId, budgetIds[0]) : inArray(budgetExecutionsTable.budgetId, budgetIds));
  }
  const actualByCat = new Map<string, number>();
  if (budgetIds.length > 0) {
    const erows = await db.select({
      category: budgetExecutionsTable.category,
      amount: sql<number>`COALESCE(SUM(${budgetExecutionsTable.amount}), 0)`,
    }).from(budgetExecutionsTable)
      .where(execConds.length ? and(...execConds) : undefined)
      .groupBy(budgetExecutionsTable.category);
    for (const r of erows) actualByCat.set(r.category, Number(r.amount));
  }
  const cats = new Set([...budgetByCat.keys(), ...actualByCat.keys()]);
  const out = Array.from(cats).map((c) => {
    const budget = budgetByCat.get(c) ?? 0;
    const actual = actualByCat.get(c) ?? 0;
    return {
      category: c,
      label: BUDGET_CATEGORY_LABELS[c as keyof typeof BUDGET_CATEGORY_LABELS] ?? c,
      budget, actual,
      variance: actual - budget,
      rate: budget > 0 ? Math.round((actual / budget) * 1000) / 10 : null,
    };
  }).sort((a, b) => a.category.localeCompare(b.category));
  const totals = out.reduce(
    (acc, r) => ({ budget: acc.budget + r.budget, actual: acc.actual + r.actual, variance: acc.variance + r.variance }),
    { budget: 0, actual: 0, variance: 0 },
  );
  res.json({ year, rows: out, totals, hasBudget: versionIds.length > 0 });
});

// ── 년도이월 미리보기 ──────────────────────────────────────────
// 회계기말의 자산/부채/자본 잔액을 정리해 차기 이월잔액으로 제안.
// 실제 이월 발행은 #780 closingEngine.lockMonth + carry-forward 가 처리한다.
router.get("/closing-reports/year-end-rollover", async (req: Request, res: Response): Promise<void> => {
  const year = String(req.query.year ?? new Date().getUTCFullYear());
  const scope = await entryScope(req);
  if (scope.kind === "empty") {
    res.json({ year, asOf: `${year}-12-31`, lines: [], totals: { assets: 0, liabilities: 0, equity: 0 } });
    return;
  }
  const conds: SQL[] = [];
  if (scope.kind === "ids") conds.push(scope.cond);
  conds.push(lte(journalEntriesTable.entryDate, `${year}-12-31`));
  const rows = await db.select({
    code: journalLinesTable.accountCode,
    name: journalLinesTable.accountName,
    debit: sql<number>`COALESCE(SUM(${journalLinesTable.debit}), 0)`,
    credit: sql<number>`COALESCE(SUM(${journalLinesTable.credit}), 0)`,
  }).from(journalLinesTable)
    .innerJoin(journalEntriesTable, eq(journalEntriesTable.id, journalLinesTable.entryId))
    .where(and(...conds))
    .groupBy(journalLinesTable.accountCode, journalLinesTable.accountName);
  const types = await loadAccountTypes(req);
  let totalA = 0, totalL = 0, totalE = 0;
  const lines = rows.flatMap((r) => {
    const t = types.get(r.code)?.type;
    if (t !== "asset" && t !== "liability" && t !== "equity") return [];
    const debit = Number(r.debit), credit = Number(r.credit), net = debit - credit;
    const balance = t === "asset" ? net : -net;
    if (Math.abs(balance) < 0.5) return [];
    if (t === "asset") totalA += balance;
    if (t === "liability") totalL += balance;
    if (t === "equity") totalE += balance;
    return [{ code: r.code, name: r.name, type: t, balance }];
  }).sort((a, b) => a.code.localeCompare(b.code));
  // 직전 마감(이미 잠긴 마지막 월) 표기 — UI 가 잠금 흐름으로 안내.
  const lastLocked = await db.select().from(periodClosingsTable)
    .where(and(
      eq(periodClosingsTable.status, "locked"),
      sql`${periodClosingsTable.month} LIKE ${year + "-%"}`,
    ))
    .orderBy(desc(periodClosingsTable.month))
    .limit(1);
  res.json({
    year,
    asOf: `${year}-12-31`,
    lines,
    totals: { assets: totalA, liabilities: totalL, equity: totalE },
    lastLockedMonth: lastLocked[0]?.month ?? null,
  });
});

// ── 결산 스냅샷 한 컷(요약 카드용) ──────────────────────────────
// 마감 잠금 시 #780 가 저장한 closing_snapshots 의 가장 최근 잠금 행을 돌려준다.
router.get("/closing-reports/latest-snapshot", async (req: Request, res: Response): Promise<void> => {
  const scope = await getAccessibleBuildingIds(req);
  if (!scope.unrestricted && scope.ids.length === 0) { res.json({ snapshot: null }); return; }
  const buildingIds = scope.unrestricted ? null : scope.ids;
  const conds: SQL[] = [eq(periodClosingsTable.status, "locked")];
  if (buildingIds && buildingIds.length === 1) conds.push(eq(periodClosingsTable.buildingId, buildingIds[0]));
  else if (buildingIds && buildingIds.length > 1) conds.push(inArray(periodClosingsTable.buildingId, buildingIds));
  const [closing] = await db.select().from(periodClosingsTable)
    .where(and(...conds))
    .orderBy(desc(periodClosingsTable.month))
    .limit(1);
  if (!closing) { res.json({ snapshot: null }); return; }
  const snaps = await db.select().from(closingSnapshotsTable)
    .where(and(eq(closingSnapshotsTable.buildingId, closing.buildingId), eq(closingSnapshotsTable.month, closing.month)));
  res.json({ snapshot: { closing, snapshots: snaps } });
});

export default router;
