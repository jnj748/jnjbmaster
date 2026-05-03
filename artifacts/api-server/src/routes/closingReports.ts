// [Task #803] 결산·세무 모듈 — 결산보고서 라우트.
//   기존 /accounting/balance-sheet · /accounting/income-statement (#778) 위에
//   결산용 보고(시산표·월별손익·현금흐름·세입세출·년도이월 미리보기)를 더한다.
//   분개 데이터는 기존 buildEntryScope·buildAccountScope 와 동일한 가시성 규칙.
// [Task #812] 6개 보고를 PDF·엑셀로도 내보낼 수 있도록 데이터 빌더를 분리해
//   JSON / .xlsx / .pdf 세 형식이 같은 결과를 공유한다.
import { Router, type IRouter, type Request, type Response } from "express";
import {
  db, chartOfAccountsTable, journalEntriesTable, journalLinesTable,
  budgetsTable, budgetLinesTable, budgetExecutionsTable, BUDGET_CATEGORY_LABELS,
  periodClosingsTable, closingSnapshotsTable,
} from "@workspace/db";
import { and, asc, desc, eq, gte, lte, sql, inArray, isNull, type SQL } from "drizzle-orm";
import { requireRole } from "../middlewares/auth";
import { getAccessibleBuildingIds } from "../middlewares/buildingScope";
import { sendXlsx, sendPdf, type SheetSpec, type PdfTableSpec } from "../lib/closingExports";

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

const TYPE_LABEL: Record<string, string> = {
  asset: "자산", liability: "부채", equity: "자본", revenue: "수익", expense: "비용",
};

// ── 데이터 빌더 ────────────────────────────────────────────────
type TBPayload = {
  from: string | null; to: string | null; asOf: string | null;
  rows: Array<{ code: string; name: string; type: string; periodDebit: number; periodCredit: number; balanceDebit: number; balanceCredit: number }>;
  totals: { debit: number; credit: number; balanced: boolean };
};
async function buildTrialBalance(req: Request): Promise<TBPayload> {
  const scope = await entryScope(req);
  const { from, to, asOf } = req.query as { from?: string; to?: string; asOf?: string };
  if (scope.kind === "empty") {
    return { from: from ?? null, to: to ?? null, asOf: asOf ?? null, rows: [], totals: { debit: 0, credit: 0, balanced: true } };
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
    const finalDebit = t === "asset" || t === "expense" ? Math.max(net, 0) : 0;
    const finalCredit = t === "asset" || t === "expense" ? Math.max(-net, 0) : Math.max(-net, 0);
    td += finalDebit; tc += finalCredit;
    return {
      code: r.code, name: r.name, type: t,
      periodDebit: debit, periodCredit: credit,
      balanceDebit: finalDebit, balanceCredit: finalCredit,
    };
  });
  return {
    from: from ?? null, to: to ?? null, asOf: asOf ?? null,
    rows: out,
    totals: { debit: td, credit: tc, balanced: Math.abs(td - tc) < 0.5 },
  };
}

type ISPayload = { year: string; months: Array<{ month: string; revenue: number; expense: number; netIncome: number }>; totals: { revenue: number; expense: number; netIncome: number } };
async function buildMonthlyIncomeStatement(req: Request): Promise<ISPayload> {
  const year = String(req.query.year ?? new Date().getUTCFullYear());
  const scope = await entryScope(req);
  if (scope.kind === "empty") return { year, months: [], totals: { revenue: 0, expense: 0, netIncome: 0 } };
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
  return { year, months, totals };
}

type CFPayload = { year: string; months: Array<{ month: string; inflow: number; outflow: number; net: number }>; totals: { inflow: number; outflow: number; net: number } };
async function buildCashFlow(req: Request): Promise<CFPayload> {
  const year = String(req.query.year ?? new Date().getUTCFullYear());
  const scope = await entryScope(req);
  if (scope.kind === "empty") return { year, months: [], totals: { inflow: 0, outflow: 0, net: 0 } };
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
  return { year, months, totals };
}

type BVAPayload = {
  year: string;
  rows: Array<{ category: string; label: string; budget: number; actual: number; variance: number; rate: number | null }>;
  totals: { budget: number; actual: number; variance: number };
  hasBudget: boolean;
};
async function buildBudgetVsActual(req: Request): Promise<BVAPayload> {
  const year = String(req.query.year ?? new Date().getUTCFullYear());
  const scope = await getAccessibleBuildingIds(req);
  if (!scope.unrestricted && scope.ids.length === 0) {
    return { year, rows: [], totals: { budget: 0, actual: 0, variance: 0 }, hasBudget: false };
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
  return { year, rows: out, totals, hasBudget: versionIds.length > 0 };
}

type RolloverPayload = {
  year: string; asOf: string;
  lines: Array<{ code: string; name: string; type: string; balance: number }>;
  totals: { assets: number; liabilities: number; equity: number };
  lastLockedMonth: string | null;
};
async function buildYearEndRollover(req: Request): Promise<RolloverPayload> {
  const year = String(req.query.year ?? new Date().getUTCFullYear());
  const scope = await entryScope(req);
  if (scope.kind === "empty") {
    return { year, asOf: `${year}-12-31`, lines: [], totals: { assets: 0, liabilities: 0, equity: 0 }, lastLockedMonth: null };
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
  const lastLocked = await db.select().from(periodClosingsTable)
    .where(and(
      eq(periodClosingsTable.status, "locked"),
      sql`${periodClosingsTable.month} LIKE ${year + "-%"}`,
    ))
    .orderBy(desc(periodClosingsTable.month))
    .limit(1);
  return {
    year, asOf: `${year}-12-31`, lines,
    totals: { assets: totalA, liabilities: totalL, equity: totalE },
    lastLockedMonth: lastLocked[0]?.month ?? null,
  };
}

type SnapshotPayload = { snapshot: { closing: typeof periodClosingsTable.$inferSelect; snapshots: Array<typeof closingSnapshotsTable.$inferSelect> } | null };
async function buildLatestSnapshot(req: Request): Promise<SnapshotPayload> {
  const scope = await getAccessibleBuildingIds(req);
  if (!scope.unrestricted && scope.ids.length === 0) return { snapshot: null };
  const buildingIds = scope.unrestricted ? null : scope.ids;
  const conds: SQL[] = [eq(periodClosingsTable.status, "locked")];
  if (buildingIds && buildingIds.length === 1) conds.push(eq(periodClosingsTable.buildingId, buildingIds[0]));
  else if (buildingIds && buildingIds.length > 1) conds.push(inArray(periodClosingsTable.buildingId, buildingIds));
  const [closing] = await db.select().from(periodClosingsTable)
    .where(and(...conds))
    .orderBy(desc(periodClosingsTable.month))
    .limit(1);
  if (!closing) return { snapshot: null };
  const snaps = await db.select().from(closingSnapshotsTable)
    .where(and(eq(closingSnapshotsTable.buildingId, closing.buildingId), eq(closingSnapshotsTable.month, closing.month)));
  return { snapshot: { closing, snapshots: snaps } };
}

// ── JSON 라우트 ────────────────────────────────────────────────
router.get("/closing-reports/trial-balance", async (req, res) => { res.json(await buildTrialBalance(req)); });
router.get("/closing-reports/monthly-income-statement", async (req, res) => { res.json(await buildMonthlyIncomeStatement(req)); });
router.get("/closing-reports/cash-flow", async (req, res) => { res.json(await buildCashFlow(req)); });
router.get("/closing-reports/budget-vs-actual", async (req, res) => { res.json(await buildBudgetVsActual(req)); });
router.get("/closing-reports/year-end-rollover", async (req, res) => { res.json(await buildYearEndRollover(req)); });
router.get("/closing-reports/latest-snapshot", async (req, res) => { res.json(await buildLatestSnapshot(req)); });

// ── 내보내기 스펙 빌더 ────────────────────────────────────────
function tbSpecs(d: TBPayload): { sheet: SheetSpec; pdf: PdfTableSpec; baseName: string } {
  const meta: Array<[string, string]> = [
    ["기간", `${d.from ?? "-"} ~ ${d.to ?? "-"}`],
    ["차대 일치", d.totals.balanced ? "예" : "아니오"],
  ];
  const rows = d.rows.map((r) => ({
    code: r.code, name: r.name, type: TYPE_LABEL[r.type] ?? r.type,
    periodDebit: r.periodDebit, periodCredit: r.periodCredit,
    balanceDebit: r.balanceDebit, balanceCredit: r.balanceCredit,
  }));
  const totals = { code: "합계", periodDebit: "", periodCredit: "", balanceDebit: d.totals.debit, balanceCredit: d.totals.credit };
  return {
    baseName: `시산표_${d.from ?? "all"}_${d.to ?? "all"}`,
    sheet: {
      title: "시산표", meta,
      columns: [
        { header: "계정코드", key: "code", width: 12 },
        { header: "계정명", key: "name", width: 28 },
        { header: "분류", key: "type", width: 10 },
        { header: "기간 차변", key: "periodDebit", width: 16, numeric: true },
        { header: "기간 대변", key: "periodCredit", width: 16, numeric: true },
        { header: "잔액 차변", key: "balanceDebit", width: 16, numeric: true },
        { header: "잔액 대변", key: "balanceCredit", width: 16, numeric: true },
      ],
      rows, totals,
    },
    pdf: {
      title: "시산표", meta,
      columns: [
        { header: "계정코드", key: "code", width: 60 },
        { header: "계정명", key: "name", width: 160 },
        { header: "분류", key: "type", width: 50 },
        { header: "기간 차변", key: "periodDebit", width: 100, numeric: true },
        { header: "기간 대변", key: "periodCredit", width: 100, numeric: true },
        { header: "잔액 차변", key: "balanceDebit", width: 100, numeric: true },
        { header: "잔액 대변", key: "balanceCredit", width: 100, numeric: true },
      ],
      rows, totals,
    },
  };
}

function isSpecs(d: ISPayload): { sheet: SheetSpec; pdf: PdfTableSpec; baseName: string } {
  const meta: Array<[string, string]> = [["회계연도", d.year]];
  const rows = d.months;
  const totals = { month: "연 합계", revenue: d.totals.revenue, expense: d.totals.expense, netIncome: d.totals.netIncome };
  const cols = [
    { header: "월", key: "month", width: 14 },
    { header: "수익", key: "revenue", width: 18, numeric: true },
    { header: "비용", key: "expense", width: 18, numeric: true },
    { header: "순이익", key: "netIncome", width: 18, numeric: true },
  ];
  const pdfCols = [
    { header: "월", key: "month", width: 80 },
    { header: "수익", key: "revenue", width: 140, numeric: true },
    { header: "비용", key: "expense", width: 140, numeric: true },
    { header: "순이익", key: "netIncome", width: 140, numeric: true },
  ];
  return {
    baseName: `월별손익_${d.year}`,
    sheet: { title: "월별손익", meta, columns: cols, rows, totals },
    pdf: { title: `월별손익 (${d.year})`, meta, columns: pdfCols, rows, totals },
  };
}

function cfSpecs(d: CFPayload): { sheet: SheetSpec; pdf: PdfTableSpec; baseName: string } {
  const meta: Array<[string, string]> = [["회계연도", d.year]];
  const rows = d.months;
  const totals = { month: "연 합계", inflow: d.totals.inflow, outflow: d.totals.outflow, net: d.totals.net };
  const cols = [
    { header: "월", key: "month", width: 14 },
    { header: "유입", key: "inflow", width: 18, numeric: true },
    { header: "유출", key: "outflow", width: 18, numeric: true },
    { header: "순증감", key: "net", width: 18, numeric: true },
  ];
  const pdfCols = [
    { header: "월", key: "month", width: 80 },
    { header: "유입", key: "inflow", width: 140, numeric: true },
    { header: "유출", key: "outflow", width: 140, numeric: true },
    { header: "순증감", key: "net", width: 140, numeric: true },
  ];
  return {
    baseName: `현금흐름_${d.year}`,
    sheet: { title: "현금흐름", meta, columns: cols, rows, totals },
    pdf: { title: `현금흐름 (${d.year})`, meta, columns: pdfCols, rows, totals, footnote: "현금성(1010) + 보통예금(1020) 계정 기준 월별 유입/유출." },
  };
}

function bvaSpecs(d: BVAPayload): { sheet: SheetSpec; pdf: PdfTableSpec; baseName: string } {
  const meta: Array<[string, string]> = [["회계연도", d.year], ["예산 등록 여부", d.hasBudget ? "있음" : "없음"]];
  const rows = d.rows.map((r) => ({ ...r, rate: r.rate == null ? "" : `${r.rate.toFixed(1)}%` }));
  const totals = { label: "합계", budget: d.totals.budget, actual: d.totals.actual, variance: d.totals.variance, rate: "" };
  const cols = [
    { header: "비목", key: "label", width: 24 },
    { header: "편성", key: "budget", width: 16, numeric: true },
    { header: "실집행", key: "actual", width: 16, numeric: true },
    { header: "차이", key: "variance", width: 16, numeric: true },
    { header: "집행률", key: "rate", width: 12 },
  ];
  const pdfCols = [
    { header: "비목", key: "label", width: 200 },
    { header: "편성", key: "budget", width: 130, numeric: true },
    { header: "실집행", key: "actual", width: 130, numeric: true },
    { header: "차이", key: "variance", width: 130, numeric: true },
    { header: "집행률", key: "rate", width: 90, align: "right" as const },
  ];
  return {
    baseName: `세입세출_${d.year}`,
    sheet: { title: "세입세출", meta, columns: cols, rows, totals },
    pdf: { title: `세입세출 (${d.year})`, meta, columns: pdfCols, rows, totals },
  };
}

function rolloverSpecs(d: RolloverPayload): { sheet: SheetSpec; pdf: PdfTableSpec; baseName: string } {
  const meta: Array<[string, string]> = [
    ["기준일", d.asOf],
    ["자산 합계", d.totals.assets.toLocaleString("ko-KR")],
    ["부채 합계", d.totals.liabilities.toLocaleString("ko-KR")],
    ["자본 합계", d.totals.equity.toLocaleString("ko-KR")],
    ["직전 잠금월", d.lastLockedMonth ?? "없음"],
  ];
  const rows = d.lines.map((l) => ({ code: l.code, name: l.name, type: TYPE_LABEL[l.type] ?? l.type, balance: l.balance }));
  const cols = [
    { header: "계정코드", key: "code", width: 12 },
    { header: "계정명", key: "name", width: 28 },
    { header: "분류", key: "type", width: 10 },
    { header: "잔액", key: "balance", width: 18, numeric: true },
  ];
  const pdfCols = [
    { header: "계정코드", key: "code", width: 80 },
    { header: "계정명", key: "name", width: 240 },
    { header: "분류", key: "type", width: 80 },
    { header: "잔액", key: "balance", width: 200, numeric: true },
  ];
  return {
    baseName: `년도이월_${d.year}`,
    sheet: { title: "년도이월", meta, columns: cols, rows },
    pdf: { title: `년도이월 미리보기 (${d.year})`, meta, columns: pdfCols, rows },
  };
}

function snapshotSpecs(d: SnapshotPayload): { sheet: SheetSpec; pdf: PdfTableSpec; baseName: string } {
  if (!d.snapshot) {
    const meta: Array<[string, string]> = [["상태", "잠금된 월이 없습니다"]];
    const empty = { title: "결산스냅샷", meta, columns: [{ header: "안내", key: "msg", width: 60 }], rows: [{ msg: "월마감에서 잠금을 진행하면 스냅샷이 생성됩니다." }] };
    return {
      baseName: `결산스냅샷`,
      sheet: empty,
      pdf: { ...empty, columns: [{ header: "안내", key: "msg", width: 600 }] },
    };
  }
  const c = d.snapshot.closing;
  const meta: Array<[string, string]> = [
    ["대상월", c.month],
    ["상태", c.status],
  ];
  const rows: Array<Record<string, unknown>> = [];
  for (const s of d.snapshot.snapshots) {
    const totals = (s.totals ?? {}) as Record<string, number>;
    const keys = Object.keys(totals);
    if (keys.length === 0) {
      rows.push({ id: String(s.id), key: "-", value: "-" });
    } else {
      for (const k of keys) rows.push({ id: String(s.id), key: k, value: totals[k] });
    }
  }
  const cols = [
    { header: "스냅샷 ID", key: "id", width: 12 },
    { header: "지표", key: "key", width: 28 },
    { header: "값", key: "value", width: 18, numeric: true },
  ];
  const pdfCols = [
    { header: "스냅샷 ID", key: "id", width: 80 },
    { header: "지표", key: "key", width: 280 },
    { header: "값", key: "value", width: 240, numeric: true },
  ];
  return {
    baseName: `결산스냅샷_${c.month}`,
    sheet: { title: "결산스냅샷", meta, columns: cols, rows },
    pdf: { title: `결산스냅샷 (${c.month})`, meta, columns: pdfCols, rows },
  };
}

type ReportKey = "trial-balance" | "monthly-income-statement" | "cash-flow" | "budget-vs-actual" | "year-end-rollover" | "latest-snapshot";

async function buildSpecs(key: ReportKey, req: Request): Promise<{ sheet: SheetSpec; pdf: PdfTableSpec; baseName: string }> {
  switch (key) {
    case "trial-balance": return tbSpecs(await buildTrialBalance(req));
    case "monthly-income-statement": return isSpecs(await buildMonthlyIncomeStatement(req));
    case "cash-flow": return cfSpecs(await buildCashFlow(req));
    case "budget-vs-actual": return bvaSpecs(await buildBudgetVsActual(req));
    case "year-end-rollover": return rolloverSpecs(await buildYearEndRollover(req));
    case "latest-snapshot": return snapshotSpecs(await buildLatestSnapshot(req));
  }
}

const REPORT_KEYS: ReportKey[] = [
  "trial-balance", "monthly-income-statement", "cash-flow",
  "budget-vs-actual", "year-end-rollover", "latest-snapshot",
];

for (const key of REPORT_KEYS) {
  router.get(`/closing-reports/${key}.xlsx`, async (req: Request, res: Response): Promise<void> => {
    const { sheet, baseName } = await buildSpecs(key, req);
    await sendXlsx(res, `${baseName}.xlsx`, sheet);
  });
  router.get(`/closing-reports/${key}.pdf`, async (req: Request, res: Response): Promise<void> => {
    const { pdf, baseName } = await buildSpecs(key, req);
    sendPdf(res, `${baseName}.pdf`, pdf);
  });
}

export default router;
