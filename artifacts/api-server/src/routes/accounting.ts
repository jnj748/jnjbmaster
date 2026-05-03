// [Task #778] T6 회계엔진 v01 — 계정과목·분개·총계정원장·재무제표 라우트.
//   - HQ 임원은 hq_building_assignments 매핑 기반(getAccessibleBuildingIds)으로
//     복수 건물의 분개를 합쳐 본다. 빈 매핑이면 빈 결과.
//   - 모든 쓰기/역분개 경로는 buildingId 일치를 검증한다 (cross-building IDOR 차단).
import { Router, type IRouter, type Request, type Response } from "express";
import { db, chartOfAccountsTable, journalEntriesTable, journalLinesTable } from "@workspace/db";
import { and, desc, eq, gte, lte, sql, inArray, isNull, asc, type SQL } from "drizzle-orm";
import { requireRole } from "../middlewares/auth";
import { audit, requireAction } from "../middlewares/audit";
import { getUserBuildingId, getAccessibleBuildingIds, canAccessBuilding } from "../middlewares/buildingScope";
import { postJournal, reverseJournal, STD } from "../lib/accountingRules";

const router: IRouter = Router();
router.use("/accounting", requireRole("manager", "accountant", "platform_admin", "hq_executive"));

// 분개 헤더 building 스코프 SQL 빌더 — platform_admin 은 무제한, hq_executive 는
// 매핑된 건물 inArray, building-scoped 역할은 본인 건물만.
async function buildEntryScope(req: Request): Promise<{ kind: "all" } | { kind: "empty" } | { kind: "ids"; cond: SQL }> {
  const scope = await getAccessibleBuildingIds(req);
  if (scope.unrestricted) return { kind: "all" };
  if (scope.ids.length === 0) return { kind: "empty" };
  return { kind: "ids", cond: scope.ids.length === 1 ? eq(journalEntriesTable.buildingId, scope.ids[0]) : inArray(journalEntriesTable.buildingId, scope.ids) };
}

// 계정과목 가시성: 표준(buildingId=NULL) + 접근 가능한 건물의 사용자 정의.
async function buildAccountScope(req: Request): Promise<SQL | null> {
  const scope = await getAccessibleBuildingIds(req);
  if (scope.unrestricted) return null; // 전 건물 가시
  if (scope.ids.length === 0) return isNull(chartOfAccountsTable.buildingId);
  if (scope.ids.length === 1) return sql`${chartOfAccountsTable.buildingId} IS NULL OR ${chartOfAccountsTable.buildingId} = ${scope.ids[0]}`;
  return sql`${chartOfAccountsTable.buildingId} IS NULL OR ${chartOfAccountsTable.buildingId} = ANY(${scope.ids})`;
}

// ── 계정과목 ───────────────────────────────────────────────
router.get("/accounting/accounts", async (req: Request, res: Response): Promise<void> => {
  const cond = await buildAccountScope(req);
  const rows = await db.select().from(chartOfAccountsTable)
    .where(cond ?? undefined)
    .orderBy(asc(chartOfAccountsTable.code));
  res.json({ accounts: rows });
});

router.post("/accounting/accounts", requireAction("accounting.account.create"), audit("accounting.account.create", { targetType: "chart_of_accounts" }), async (req: Request, res: Response): Promise<void> => {
  // [Task #778] platform_admin 은 건물 매핑이 없을 수 있으므로 body.buildingId 또는
  // 사용자 매핑 둘 중 하나를 허용. 그 외 역할은 본인 건물에 귀속.
  const userBuilding = await getUserBuildingId(req);
  const role = req.user?.role;
  const requestedBuildingId = req.body?.buildingId ? Number(req.body.buildingId) : null;
  let buildingId: number | null;
  if (role === "platform_admin") {
    buildingId = requestedBuildingId ?? userBuilding ?? null;
    if (buildingId !== null && !(await canAccessBuilding(req, buildingId))) {
      res.status(403).json({ error: "해당 건물 접근 권한 없음" }); return;
    }
  } else {
    if (!userBuilding) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    buildingId = userBuilding;
  }
  const { code, name, type, parentCode, isHeader, description } = req.body ?? {};
  if (!code || !name || !type) { res.status(400).json({ error: "code/name/type 필요" }); return; }
  if (!["asset", "liability", "equity", "revenue", "expense"].includes(type)) {
    res.status(400).json({ error: "type 은 5대 분류 중 하나여야 합니다" }); return;
  }
  // [Task #778] 표준 코드(isStandard, building_id IS NULL)와 동일 코드는 차단 — 분개·재무제표 분류 충돌 방지.
  const [stdConflict] = await db.select().from(chartOfAccountsTable)
    .where(and(eq(chartOfAccountsTable.code, code), isNull(chartOfAccountsTable.buildingId)))
    .limit(1);
  if (stdConflict) { res.status(409).json({ error: `코드 ${code} 는 표준 계정과목과 충돌합니다` }); return; }
  try {
    const [row] = await db.insert(chartOfAccountsTable).values({
      code, name, type, parentCode: parentCode ?? null,
      isHeader: !!isHeader, isStandard: false, buildingId, description: description ?? null,
    }).returning();
    res.json(row);
  } catch (e: unknown) {
    res.status(409).json({ error: "중복된 코드이거나 저장에 실패했습니다", detail: (e as Error).message });
  }
});

// ── 분개장 ─────────────────────────────────────────────────
// [Task #795] page/limit 기반 페이지네이션 — 연 단위 누적 데이터에서도
// 화면이 무거워지지 않도록 분개 헤더만 슬라이스한다. total 을 함께 반환.
function clampInt(v: unknown, def: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

router.get("/accounting/journal", async (req: Request, res: Response): Promise<void> => {
  const scope = await buildEntryScope(req);
  const limit = clampInt(req.query.limit, 100, 1, 500);
  const offset = clampInt(req.query.offset, 0, 0, 1_000_000);
  if (scope.kind === "empty") { res.json({ entries: [], total: 0, limit, offset }); return; }
  const { from, to } = req.query as { from?: string; to?: string };
  const conds: SQL[] = [];
  if (scope.kind === "ids") conds.push(scope.cond);
  if (from) conds.push(gte(journalEntriesTable.entryDate, from));
  if (to) conds.push(lte(journalEntriesTable.entryDate, to));
  const where = conds.length ? and(...conds) : undefined;
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` })
    .from(journalEntriesTable).where(where);
  const entries = await db.select().from(journalEntriesTable)
    .where(where)
    .orderBy(desc(journalEntriesTable.entryDate), desc(journalEntriesTable.id))
    .limit(limit).offset(offset);
  const ids = entries.map(e => e.id);
  const lines = ids.length ? await db.select().from(journalLinesTable).where(inArray(journalLinesTable.entryId, ids)).orderBy(asc(journalLinesTable.entryId), asc(journalLinesTable.sortOrder)) : [];
  const grouped = new Map<number, typeof lines>();
  for (const l of lines) { const arr = grouped.get(l.entryId) ?? []; arr.push(l); grouped.set(l.entryId, arr); }
  res.json({ entries: entries.map(e => ({ ...e, lines: grouped.get(e.id) ?? [] })), total, limit, offset });
});

// [Task #795] CSV 내보내기 공용 유틸.
//   - csvEscape: 콤마/따옴표/개행 외에 = + - @ 로 시작하는 셀은
//     앞에 작은따옴표를 붙여 Excel formula injection 을 차단한다.
//   - sendCsv: BOM + UTF-8 헤더로 한글 깨짐 방지.
//   - MAX_EXPORT_ROWS: 무제한 export 시 메모리/응답 폭증을 막는 하드 캡.
//     초과 시 조용히 잘라내지 않고 413 으로 거부 — 사용자에게 필터를
//     좁히도록 유도하여 데이터 정합성을 보존한다.
const MAX_EXPORT_ROWS = 100_000;
function csvEscape(v: unknown): string {
  if (v == null) return "";
  const raw = typeof v === "string" ? v : String(v);
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}
function sendCsv(res: Response, filename: string, header: string[], rows: Array<Array<unknown>>): void {
  const body = [header.join(","), ...rows.map(r => r.map(csvEscape).join(","))].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send("\uFEFF" + body);
}
function sendExportTooLarge(res: Response, total: number): void {
  res.status(413).json({
    error: `내보낼 데이터가 너무 많습니다 (${total.toLocaleString("ko-KR")}건). 기간/필터를 좁혀 ${MAX_EXPORT_ROWS.toLocaleString("ko-KR")}건 이하로 만든 뒤 다시 시도하세요.`,
    total, max: MAX_EXPORT_ROWS,
  });
}

router.get("/accounting/journal.csv",
  requireAction("data.export"),
  audit("data.export", { targetType: "journal_entry" }),
  async (req: Request, res: Response): Promise<void> => {
    const scope = await buildEntryScope(req);
    const header = ["entryId","entryDate","memo","sourceEvent","isReversal","locked","buildingId","accountCode","accountName","debit","credit","partyName","unitId","lineMemo"];
    if (scope.kind === "empty") { sendCsv(res, `journal-${Date.now()}.csv`, header, []); return; }
    const { from, to } = req.query as { from?: string; to?: string };
    const conds: SQL[] = [];
    if (scope.kind === "ids") conds.push(scope.cond);
    if (from) conds.push(gte(journalEntriesTable.entryDate, from));
    if (to) conds.push(lte(journalEntriesTable.entryDate, to));
    const where = conds.length ? and(...conds) : undefined;
    // [Task #795] 행 수를 먼저 세고 캡 초과 시 413 으로 거부 — 조용한 절단 금지.
    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` })
      .from(journalEntriesTable)
      .innerJoin(journalLinesTable, eq(journalLinesTable.entryId, journalEntriesTable.id))
      .where(where);
    if (total > MAX_EXPORT_ROWS) { sendExportTooLarge(res, total); return; }
    const rows = await db.select({
      entryId: journalEntriesTable.id,
      entryDate: journalEntriesTable.entryDate,
      memo: journalEntriesTable.memo,
      sourceEvent: journalEntriesTable.sourceEvent,
      isReversal: journalEntriesTable.isReversal,
      locked: journalEntriesTable.locked,
      buildingId: journalEntriesTable.buildingId,
      accountCode: journalLinesTable.accountCode,
      accountName: journalLinesTable.accountName,
      debit: journalLinesTable.debit,
      credit: journalLinesTable.credit,
      partyName: journalLinesTable.partyName,
      unitId: journalLinesTable.unitId,
      lineMemo: journalLinesTable.memo,
    }).from(journalEntriesTable)
      .innerJoin(journalLinesTable, eq(journalLinesTable.entryId, journalEntriesTable.id))
      .where(where)
      .orderBy(desc(journalEntriesTable.entryDate), desc(journalEntriesTable.id), asc(journalLinesTable.sortOrder));
    sendCsv(res, `journal-${Date.now()}.csv`, header, rows.map(r => [
      r.entryId, r.entryDate, r.memo, r.sourceEvent, r.isReversal, r.locked,
      r.buildingId, r.accountCode, r.accountName, r.debit, r.credit, r.partyName, r.unitId, r.lineMemo,
    ]));
  });

router.post("/accounting/journal", requireAction("journal.post"), audit("journal.post", { targetType: "journal_entry" }), async (req: Request, res: Response): Promise<void> => {
  // [Task #778] platform_admin 은 본인 매핑 없이 body.buildingId 로 대상 건물 명시 가능.
  const userBuilding = await getUserBuildingId(req);
  const role = req.user?.role;
  const requestedBuildingId = req.body?.buildingId ? Number(req.body.buildingId) : null;
  let buildingId: number | null = null;
  if (role === "platform_admin") {
    buildingId = requestedBuildingId ?? userBuilding ?? null;
    if (buildingId !== null && !(await canAccessBuilding(req, buildingId))) {
      res.status(403).json({ error: "해당 건물 접근 권한 없음" }); return;
    }
    if (buildingId === null) { res.status(400).json({ error: "buildingId 필요 (platform_admin)" }); return; }
  } else {
    if (!userBuilding) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    buildingId = userBuilding;
  }
  const userId = req.user?.userId ?? null;
  const { entryDate, memo, lines } = req.body ?? {};
  if (!entryDate || !memo || !Array.isArray(lines) || lines.length < 2) {
    res.status(400).json({ error: "entryDate/memo/lines(2개 이상) 필요" }); return;
  }
  // [Task #780] T9 마감잠금 가드 — entry_date 의 YYYY-MM 가 잠긴 월이면 차단.
  {
    const ymMatch = /^(\d{4}-\d{2})/.exec(String(entryDate));
    if (ymMatch && buildingId) {
      const { isMonthLocked } = await import("../lib/closingEngine");
      if (await isMonthLocked(buildingId, ymMatch[1])) {
        res.status(409).json({ error: "closing_locked", message: `${ymMatch[1]} 월이 마감되어 분개할 수 없습니다.` });
        return;
      }
    }
  }
  for (const l of lines) {
    if (!l.accountCode) { res.status(400).json({ error: "accountCode 필요" }); return; }
    if ((l.debit ?? 0) < 0 || (l.credit ?? 0) < 0) { res.status(400).json({ error: "음수 금지" }); return; }
    if ((l.debit ?? 0) > 0 && (l.credit ?? 0) > 0) { res.status(400).json({ error: "한 라인은 차변/대변 한쪽만" }); return; }
  }
  const codes = Array.from(new Set(lines.map((l: { accountCode: string }) => l.accountCode))) as string[];
  // [Task #778] 동일 코드가 표준+건물별로 둘 다 있을 수 있으므로, 호출자의 건물 또는 표준만 허용.
  const acc = await db.select().from(chartOfAccountsTable).where(and(
    inArray(chartOfAccountsTable.code, codes),
    sql`${chartOfAccountsTable.buildingId} IS NULL OR ${chartOfAccountsTable.buildingId} = ${buildingId}`,
  ));
  // 건물별 정의가 표준보다 우선(같은 코드면 건물별 이름·분류를 사용).
  const nameByCode = new Map<string, string>();
  const headerByCode = new Map<string, boolean>();
  for (const a of acc) {
    const existing = nameByCode.get(a.code);
    if (!existing || a.buildingId === buildingId) {
      nameByCode.set(a.code, a.name);
      headerByCode.set(a.code, !!a.isHeader);
    }
  }
  for (const c of codes) {
    if (!nameByCode.has(c)) { res.status(400).json({ error: `등록되지 않은 계정과목 코드: ${c}` }); return; }
    // [Task #778] 헤더(요약) 계정에는 직접 분개할 수 없다 — 하위 계정으로 분개 필요.
    if (headerByCode.get(c)) { res.status(400).json({ error: `헤더 계정에는 직접 분개할 수 없습니다: ${c}` }); return; }
  }
  const enriched = lines.map((l: { accountCode: string; accountName?: string; debit?: number; credit?: number; partyName?: string; unitId?: number; memo?: string }) => ({
    accountCode: l.accountCode,
    accountName: l.accountName ?? nameByCode.get(l.accountCode) ?? l.accountCode,
    debit: l.debit ?? 0, credit: l.credit ?? 0,
    partyName: l.partyName, unitId: l.unitId, memo: l.memo,
  }));
  const result = await postJournal({
    buildingId, entryDate, memo, sourceEvent: "manual",
    sourceRefType: "manual", sourceRefId: null, createdById: userId,
    lines: enriched,
  });
  res.json(result);
});

// 역분개 — 대상 entry 의 buildingId 가 호출자 접근 범위 안에 있어야 한다.
router.post("/accounting/journal/:id/reverse", requireAction("journal.reverse"), audit("journal.reverse", { targetType: "journal_entry", targetIdParam: "id" }), async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "잘못된 분개 ID" }); return; }
  const userId = req.user?.userId ?? null;
  const [orig] = await db.select().from(journalEntriesTable).where(eq(journalEntriesTable.id, id));
  if (!orig) { res.status(404).json({ error: "분개를 찾을 수 없습니다" }); return; }
  if (orig.buildingId == null || !(await canAccessBuilding(req, orig.buildingId))) {
    res.status(403).json({ error: "이 건물의 분개를 역분개할 권한이 없습니다" }); return;
  }
  // [Task #780] 마감 잠금 가드 — 원분개의 entryDate 가 잠긴 월에 속하면 역분개 차단.
  //   정정은 다음 달(open 기간)에서 새 분개로 처리해야 한다.
  {
    const m = String(orig.entryDate).slice(0, 7);
    const { isMonthLocked } = await import("../lib/closingEngine");
    if (await isMonthLocked(orig.buildingId, m)) {
      res.status(409).json({ error: "closing_locked", message: `${m} 월이 마감되어 역분개를 등록할 수 없습니다. 마감 후 정정은 다음 달 새 분개로 처리하세요.` });
      return;
    }
  }
  try {
    const newId = await reverseJournal(id, { createdById: userId, memo: req.body?.memo });
    res.json({ entryId: newId });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// ── 총계정원장 (계정별 차/대 + 잔액) ───────────────────────
// [Task #795] 잔액은 누적 계산이라 전체 행을 먼저 만든 뒤 page/limit 으로 슬라이스한다.
// total/limit/offset 을 같이 반환해 페이지네이션 컨트롤이 가능하도록 한다.
async function fetchGeneralLedgerLines(req: Request, accountCode: string, from?: string, to?: string) {
  const scope = await buildEntryScope(req);
  const accCond = await buildAccountScope(req);
  const accConds: SQL[] = [eq(chartOfAccountsTable.code, accountCode)];
  if (accCond) accConds.push(accCond);
  const [acc] = await db.select().from(chartOfAccountsTable).where(and(...accConds)).limit(1);
  if (scope.kind === "empty") return { acc, lines: [] as Array<{ lineId: number; entryId: number; entryDate: string; memo: string; accountCode: string; accountName: string; debit: number; credit: number; partyName: string | null; unitId: number | null; sourceEvent: string; balance: number }>, finalBalance: 0 };
  const conds: SQL[] = [eq(journalLinesTable.accountCode, accountCode)];
  if (scope.kind === "ids") conds.push(scope.cond);
  if (from) conds.push(gte(journalEntriesTable.entryDate, from));
  if (to) conds.push(lte(journalEntriesTable.entryDate, to));
  const rows = await db.select({
    lineId: journalLinesTable.id,
    entryId: journalEntriesTable.id,
    entryDate: journalEntriesTable.entryDate,
    memo: journalEntriesTable.memo,
    accountCode: journalLinesTable.accountCode,
    accountName: journalLinesTable.accountName,
    debit: journalLinesTable.debit,
    credit: journalLinesTable.credit,
    partyName: journalLinesTable.partyName,
    unitId: journalLinesTable.unitId,
    sourceEvent: journalEntriesTable.sourceEvent,
  }).from(journalLinesTable)
    .innerJoin(journalEntriesTable, eq(journalEntriesTable.id, journalLinesTable.entryId))
    .where(and(...conds))
    .orderBy(asc(journalEntriesTable.entryDate), asc(journalEntriesTable.id));
  const debitNormal = acc && (acc.type === "asset" || acc.type === "expense");
  let bal = 0;
  const withBalance = rows.map(r => {
    bal += debitNormal ? (r.debit - r.credit) : (r.credit - r.debit);
    return { ...r, balance: bal };
  });
  return { acc, lines: withBalance, finalBalance: bal };
}

router.get("/accounting/general-ledger", async (req: Request, res: Response): Promise<void> => {
  const { accountCode, from, to } = req.query as { accountCode?: string; from?: string; to?: string };
  if (!accountCode) { res.status(400).json({ error: "accountCode 필요" }); return; }
  const limit = clampInt(req.query.limit, 100, 1, 1000);
  const offset = clampInt(req.query.offset, 0, 0, 1_000_000);
  const { acc, lines, finalBalance } = await fetchGeneralLedgerLines(req, accountCode, from, to);
  const total = lines.length;
  const sliced = lines.slice(offset, offset + limit);
  res.json({ account: acc ?? { code: accountCode, name: accountCode, type: "asset" }, lines: sliced, finalBalance, total, limit, offset });
});

router.get("/accounting/general-ledger.csv",
  requireAction("data.export"),
  audit("data.export", { targetType: "journal_line" }),
  async (req: Request, res: Response): Promise<void> => {
    const { accountCode, from, to } = req.query as { accountCode?: string; from?: string; to?: string };
    if (!accountCode) { res.status(400).json({ error: "accountCode 필요" }); return; }
    const { lines } = await fetchGeneralLedgerLines(req, accountCode, from, to);
    // [Task #795] 메모리 폭증 방지 — 캡 초과 시 조용한 절단 대신 413 으로 거부.
    if (lines.length > MAX_EXPORT_ROWS) { sendExportTooLarge(res, lines.length); return; }
    const header = ["entryId","entryDate","memo","accountCode","accountName","partyName","unitId","debit","credit","balance","sourceEvent"];
    sendCsv(res, `general-ledger-${accountCode}-${Date.now()}.csv`, header, lines.map(l => [
      l.entryId, l.entryDate, l.memo, l.accountCode, l.accountName, l.partyName, l.unitId, l.debit, l.credit, l.balance, l.sourceEvent,
    ]));
  });

// ── 보조부원장 (거래처/호실별) ─────────────────────────────
async function buildSubLedgerWhere(req: Request, q: { partyName?: string; unitId?: string; from?: string; to?: string }) {
  const scope = await buildEntryScope(req);
  if (scope.kind === "empty") return { empty: true as const };
  const conds: SQL[] = [];
  if (scope.kind === "ids") conds.push(scope.cond);
  if (q.partyName) conds.push(eq(journalLinesTable.partyName, q.partyName));
  if (q.unitId) conds.push(eq(journalLinesTable.unitId, Number(q.unitId)));
  if (q.from) conds.push(gte(journalEntriesTable.entryDate, q.from));
  if (q.to) conds.push(lte(journalEntriesTable.entryDate, q.to));
  return { empty: false as const, where: conds.length ? and(...conds) : undefined };
}

router.get("/accounting/sub-ledger", async (req: Request, res: Response): Promise<void> => {
  const { partyName, unitId, from, to } = req.query as { partyName?: string; unitId?: string; from?: string; to?: string };
  if (!partyName && !unitId) { res.status(400).json({ error: "partyName 또는 unitId 필요" }); return; }
  const limit = clampInt(req.query.limit, 100, 1, 1000);
  const offset = clampInt(req.query.offset, 0, 0, 1_000_000);
  const w = await buildSubLedgerWhere(req, { partyName, unitId, from, to });
  if (w.empty) { res.json({ lines: [], total: 0, limit, offset }); return; }
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` })
    .from(journalLinesTable)
    .innerJoin(journalEntriesTable, eq(journalEntriesTable.id, journalLinesTable.entryId))
    .where(w.where);
  const rows = await db.select({
    lineId: journalLinesTable.id,
    entryId: journalEntriesTable.id,
    entryDate: journalEntriesTable.entryDate,
    memo: journalEntriesTable.memo,
    accountCode: journalLinesTable.accountCode,
    accountName: journalLinesTable.accountName,
    debit: journalLinesTable.debit,
    credit: journalLinesTable.credit,
    partyName: journalLinesTable.partyName,
    unitId: journalLinesTable.unitId,
  }).from(journalLinesTable)
    .innerJoin(journalEntriesTable, eq(journalEntriesTable.id, journalLinesTable.entryId))
    .where(w.where)
    .orderBy(asc(journalEntriesTable.entryDate), asc(journalEntriesTable.id))
    .limit(limit).offset(offset);
  res.json({ lines: rows, total, limit, offset });
});

router.get("/accounting/sub-ledger.csv",
  requireAction("data.export"),
  audit("data.export", { targetType: "journal_line" }),
  async (req: Request, res: Response): Promise<void> => {
    const { partyName, unitId, from, to } = req.query as { partyName?: string; unitId?: string; from?: string; to?: string };
    if (!partyName && !unitId) { res.status(400).json({ error: "partyName 또는 unitId 필요" }); return; }
    const header = ["entryId","entryDate","memo","accountCode","accountName","partyName","unitId","debit","credit"];
    const w = await buildSubLedgerWhere(req, { partyName, unitId, from, to });
    if (w.empty) { sendCsv(res, `sub-ledger-${Date.now()}.csv`, header, []); return; }
    // [Task #795] 행 수 카운트 후 캡 초과 시 413 — 조용한 절단 금지.
    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` })
      .from(journalLinesTable)
      .innerJoin(journalEntriesTable, eq(journalEntriesTable.id, journalLinesTable.entryId))
      .where(w.where);
    if (total > MAX_EXPORT_ROWS) { sendExportTooLarge(res, total); return; }
    const rows = await db.select({
      entryId: journalEntriesTable.id,
      entryDate: journalEntriesTable.entryDate,
      memo: journalEntriesTable.memo,
      accountCode: journalLinesTable.accountCode,
      accountName: journalLinesTable.accountName,
      debit: journalLinesTable.debit,
      credit: journalLinesTable.credit,
      partyName: journalLinesTable.partyName,
      unitId: journalLinesTable.unitId,
    }).from(journalLinesTable)
      .innerJoin(journalEntriesTable, eq(journalEntriesTable.id, journalLinesTable.entryId))
      .where(w.where)
      .orderBy(asc(journalEntriesTable.entryDate), asc(journalEntriesTable.id));
    sendCsv(res, `sub-ledger-${Date.now()}.csv`, header, rows.map(r => [
      r.entryId, r.entryDate, r.memo, r.accountCode, r.accountName, r.partyName, r.unitId, r.debit, r.credit,
    ]));
  });

// ── 현금출납장 (1010 + 1020 합산) ──────────────────────────
router.get("/accounting/cashbook", async (req: Request, res: Response): Promise<void> => {
  const scope = await buildEntryScope(req);
  if (scope.kind === "empty") { res.json({ lines: [], finalBalance: 0 }); return; }
  const { from, to } = req.query as { from?: string; to?: string };
  const conds: SQL[] = [inArray(journalLinesTable.accountCode, [STD.CASH.code, STD.BANK.code])];
  if (scope.kind === "ids") conds.push(scope.cond);
  if (from) conds.push(gte(journalEntriesTable.entryDate, from));
  if (to) conds.push(lte(journalEntriesTable.entryDate, to));
  const rows = await db.select({
    entryId: journalEntriesTable.id,
    entryDate: journalEntriesTable.entryDate,
    memo: journalEntriesTable.memo,
    accountCode: journalLinesTable.accountCode,
    accountName: journalLinesTable.accountName,
    debit: journalLinesTable.debit,
    credit: journalLinesTable.credit,
    partyName: journalLinesTable.partyName,
  }).from(journalLinesTable)
    .innerJoin(journalEntriesTable, eq(journalEntriesTable.id, journalLinesTable.entryId))
    .where(and(...conds))
    .orderBy(asc(journalEntriesTable.entryDate), asc(journalEntriesTable.id));
  let bal = 0;
  const withBalance = rows.map(r => { bal += r.debit - r.credit; return { ...r, balance: bal }; });
  res.json({ lines: withBalance, finalBalance: bal });
});

// ── 제예금명세서 (계좌별 잔액 + 거래 내역) ─────────────────
// [Task #778] 자산 계정 중 1010(현금)/1020(예금) 또는 명칭에 "예금/현금/계좌" 가 포함된
// 모든 사용자 정의 계정을 대상으로 잔액과 거래 내역을 함께 반환한다.
router.get("/accounting/deposits", async (req: Request, res: Response): Promise<void> => {
  const scope = await buildEntryScope(req);
  const accCond = await buildAccountScope(req);
  const accBaseConds: SQL[] = [eq(chartOfAccountsTable.type, "asset")];
  if (accCond) accBaseConds.push(accCond);
  const assetAccounts = await db.select().from(chartOfAccountsTable).where(and(...accBaseConds));
  const depositCodes = Array.from(new Set(assetAccounts
    .filter(a => a.code === STD.CASH.code || a.code === STD.BANK.code
      || /예금|현금|계좌/.test(a.name))
    .map(a => a.code)));
  if (depositCodes.length === 0 || scope.kind === "empty") {
    res.json({ accounts: depositCodes.map(c => {
      const m = assetAccounts.find(a => a.code === c)!;
      return { code: c, name: m.name, balance: 0, lines: [] };
    }) });
    return;
  }
  const conds: SQL[] = [inArray(journalLinesTable.accountCode, depositCodes)];
  if (scope.kind === "ids") conds.push(scope.cond);
  const rows = await db.select({
    entryId: journalEntriesTable.id,
    entryDate: journalEntriesTable.entryDate,
    memo: journalEntriesTable.memo,
    accountCode: journalLinesTable.accountCode,
    accountName: journalLinesTable.accountName,
    debit: journalLinesTable.debit,
    credit: journalLinesTable.credit,
    partyName: journalLinesTable.partyName,
  }).from(journalLinesTable)
    .innerJoin(journalEntriesTable, eq(journalEntriesTable.id, journalLinesTable.entryId))
    .where(and(...conds))
    .orderBy(asc(journalLinesTable.accountCode), asc(journalEntriesTable.entryDate), asc(journalEntriesTable.id));
  // 계좌별로 묶어 잔액(누적)과 거래 내역을 만든다.
  const byCode = new Map<string, { code: string; name: string; balance: number; lines: Array<typeof rows[number] & { balance: number }> }>();
  for (const c of depositCodes) {
    const m = assetAccounts.find(a => a.code === c)!;
    byCode.set(c, { code: c, name: m.name, balance: 0, lines: [] });
  }
  for (const r of rows) {
    const acc = byCode.get(r.accountCode);
    if (!acc) continue;
    acc.balance += r.debit - r.credit;
    acc.lines.push({ ...r, balance: acc.balance });
  }
  res.json({ accounts: Array.from(byCode.values()) });
});

// ── 재무상태표 / 운영성과표 ────────────────────────────────
async function aggregate(req: Request, opts: { asOf?: string; from?: string; to?: string }) {
  const scope = await buildEntryScope(req);
  if (scope.kind === "empty") return { rows: [] as Array<{ code: string; name: string; debit: number; credit: number; type: string; balance: number }> };
  const conds: SQL[] = [];
  if (scope.kind === "ids") conds.push(scope.cond);
  if (opts.asOf) conds.push(lte(journalEntriesTable.entryDate, opts.asOf));
  if (opts.from) conds.push(gte(journalEntriesTable.entryDate, opts.from));
  if (opts.to) conds.push(lte(journalEntriesTable.entryDate, opts.to));
  const rows = await db.select({
    code: journalLinesTable.accountCode,
    name: journalLinesTable.accountName,
    debit: sql<number>`COALESCE(SUM(${journalLinesTable.debit}), 0)`,
    credit: sql<number>`COALESCE(SUM(${journalLinesTable.credit}), 0)`,
  }).from(journalLinesTable)
    .innerJoin(journalEntriesTable, eq(journalEntriesTable.id, journalLinesTable.entryId))
    .where(conds.length ? and(...conds) : undefined)
    .groupBy(journalLinesTable.accountCode, journalLinesTable.accountName);
  const accCond = await buildAccountScope(req);
  const accs = await db.select().from(chartOfAccountsTable).where(accCond ?? undefined);
  // [Task #778] 동일 코드가 표준+건물별로 존재하는 경우 건물별 정의를 우선해 분류한다.
  const typeByCode = new Map<string, string>();
  for (const a of accs) {
    const cur = typeByCode.get(a.code);
    if (!cur || a.buildingId !== null) typeByCode.set(a.code, a.type);
  }
  return { rows: rows.map(r => ({ ...r, type: typeByCode.get(r.code) ?? "asset", balance: Number(r.debit) - Number(r.credit) })) };
}

router.get("/accounting/balance-sheet", async (req: Request, res: Response): Promise<void> => {
  const { asOf } = req.query as { asOf?: string };
  const { rows } = await aggregate(req, { asOf });
  const assets = rows.filter(r => r.type === "asset").map(r => ({ code: r.code, name: r.name, balance: r.balance }));
  const liabilities = rows.filter(r => r.type === "liability").map(r => ({ code: r.code, name: r.name, balance: -r.balance }));
  const equity = rows.filter(r => r.type === "equity").map(r => ({ code: r.code, name: r.name, balance: -r.balance }));
  const revenue = rows.filter(r => r.type === "revenue").reduce((s, r) => s + (-r.balance), 0);
  const expense = rows.filter(r => r.type === "expense").reduce((s, r) => s + r.balance, 0);
  const netIncome = revenue - expense;
  const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
  const totalLiab = liabilities.reduce((s, a) => s + a.balance, 0);
  const totalEquity = equity.reduce((s, a) => s + a.balance, 0) + netIncome;
  res.json({ asOf: asOf ?? new Date().toISOString().slice(0,10), assets, liabilities, equity, netIncome, totals: { assets: totalAssets, liabilities: totalLiab, equity: totalEquity } });
});

router.get("/accounting/income-statement", async (req: Request, res: Response): Promise<void> => {
  const { from, to } = req.query as { from?: string; to?: string };
  const { rows } = await aggregate(req, { from, to });
  const revenue = rows.filter(r => r.type === "revenue").map(r => ({ code: r.code, name: r.name, amount: -r.balance }));
  const expense = rows.filter(r => r.type === "expense").map(r => ({ code: r.code, name: r.name, amount: r.balance }));
  const totalRev = revenue.reduce((s, r) => s + r.amount, 0);
  const totalExp = expense.reduce((s, r) => s + r.amount, 0);
  res.json({ from: from ?? null, to: to ?? null, revenue, expense, totals: { revenue: totalRev, expense: totalExp, netIncome: totalRev - totalExp } });
});

// ── AI 계정과목 추천 (거래처/메모 빈도 기반) ──────────────
router.get("/accounting/suggest-account", async (req: Request, res: Response): Promise<void> => {
  const scope = await buildEntryScope(req);
  if (scope.kind === "empty") { res.json({ suggestions: [] }); return; }
  const { partyName, keyword } = req.query as { partyName?: string; keyword?: string };
  if (!partyName && !keyword) { res.json({ suggestions: [] }); return; }
  const conds: SQL[] = [];
  if (scope.kind === "ids") conds.push(scope.cond);
  if (partyName) conds.push(eq(journalLinesTable.partyName, partyName));
  if (keyword) conds.push(sql`${journalEntriesTable.memo} ILIKE ${'%' + keyword + '%'}`);
  const rows = await db.select({
    code: journalLinesTable.accountCode,
    name: journalLinesTable.accountName,
    cnt: sql<number>`COUNT(*)`,
  }).from(journalLinesTable)
    .innerJoin(journalEntriesTable, eq(journalEntriesTable.id, journalLinesTable.entryId))
    .where(conds.length ? and(...conds) : undefined)
    .groupBy(journalLinesTable.accountCode, journalLinesTable.accountName)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(5);
  res.json({ suggestions: rows.map(r => ({ code: r.code, name: r.name, count: Number(r.cnt) })) });
});

// ── AI 이상거래/오류 탐지 ──────────────────────────────────
// [Task #778] 회계 무결성 위반과 의심스러운 패턴을 탐지한다:
//   1) 대차 불일치(isBalanced=false) — 데이터 손상/부정 입력 탐지.
//   2) 계정과목·정상잔액 부적합 — 수익 계정이 차변에 다수 발생, 비용 계정이 대변에 다수 발생.
//   3) 미등록 계정 코드 — 분개에는 있으나 chart_of_accounts 에 없는 코드.
//   4) 라운드넘버 거래 — 1,000,000 이상의 정확한 100만/1000만 단위 (의심 신고 대상).
router.get("/accounting/anomalies", async (req: Request, res: Response): Promise<void> => {
  const scope = await buildEntryScope(req);
  if (scope.kind === "empty") { res.json({ anomalies: [] }); return; }
  const { from, to } = req.query as { from?: string; to?: string };
  const eConds: SQL[] = [];
  if (scope.kind === "ids") eConds.push(scope.cond);
  if (from) eConds.push(gte(journalEntriesTable.entryDate, from));
  if (to) eConds.push(lte(journalEntriesTable.entryDate, to));
  const entries = await db.select().from(journalEntriesTable)
    .where(eConds.length ? and(...eConds) : undefined)
    .orderBy(desc(journalEntriesTable.entryDate), desc(journalEntriesTable.id))
    .limit(2000);
  const ids = entries.map(e => e.id);
  const lines = ids.length ? await db.select().from(journalLinesTable).where(inArray(journalLinesTable.entryId, ids)) : [];
  const accCond = await buildAccountScope(req);
  const accs = await db.select().from(chartOfAccountsTable).where(accCond ?? undefined);
  const typeByCode = new Map<string, string>();
  for (const a of accs) {
    const cur = typeByCode.get(a.code);
    if (!cur || a.buildingId !== null) typeByCode.set(a.code, a.type);
  }
  type Anomaly = { entryId: number; entryDate: string; severity: "high" | "medium" | "low"; kind: string; message: string };
  const anomalies: Anomaly[] = [];
  const linesByEntry = new Map<number, typeof lines>();
  for (const l of lines) { const arr = linesByEntry.get(l.entryId) ?? []; arr.push(l); linesByEntry.set(l.entryId, arr); }
  for (const e of entries) {
    if (!e.isBalanced) {
      anomalies.push({ entryId: e.id, entryDate: e.entryDate, severity: "high", kind: "unbalanced",
        message: `대차 불일치: 차변 ${e.totalDebit} ≠ 대변 ${e.totalCredit}` });
    }
    const ls = linesByEntry.get(e.id) ?? [];
    for (const l of ls) {
      const t = typeByCode.get(l.accountCode);
      if (!t) {
        anomalies.push({ entryId: e.id, entryDate: e.entryDate, severity: "medium", kind: "unknown_account",
          message: `미등록 계정과목: ${l.accountCode} (${l.accountName})` });
        continue;
      }
      // 수익은 대변정상, 비용은 차변정상. 반대편에 큰 금액이 자주 잡히면 분류 오류 가능성.
      if (t === "revenue" && l.debit > 0 && l.credit === 0) {
        anomalies.push({ entryId: e.id, entryDate: e.entryDate, severity: "low", kind: "type_side_mismatch",
          message: `수익 계정 ${l.accountCode}(${l.accountName}) 이 차변(${l.debit})에 발생 — 분류 점검 필요` });
      }
      if (t === "expense" && l.credit > 0 && l.debit === 0) {
        anomalies.push({ entryId: e.id, entryDate: e.entryDate, severity: "low", kind: "type_side_mismatch",
          message: `비용 계정 ${l.accountCode}(${l.accountName}) 이 대변(${l.credit})에 발생 — 분류 점검 필요` });
      }
      const amt = Math.max(l.debit, l.credit);
      if (amt >= 10_000_000 && amt % 10_000_000 === 0) {
        anomalies.push({ entryId: e.id, entryDate: e.entryDate, severity: "low", kind: "round_amount",
          message: `1,000만원 이상 정확한 라운드 금액(${amt.toLocaleString()}) — 검토 권장` });
      }
    }
  }
  res.json({ anomalies });
});

export default router;
