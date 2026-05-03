// [Task #801] 회계 기초·전표 마스터 — 회계기수/개시잔액/자동분개/보고서형식/데이터전송.
//   AI-first: 개시잔액·전표는 자유 텍스트 → LLM 파싱 → 사용자 확인 → 전표 발행 흐름.
import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  fiscalPeriodsTable,
  openingBalancesTable,
  autoJournalRulesTable,
  autoJournalRuleLinesTable,
  reportFormatsTable,
  reportFormatLinesTable,
  chartOfAccountsTable,
  journalEntriesTable,
  journalLinesTable,
} from "@workspace/db";
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { requireRole } from "../middlewares/auth";
import { audit, requireAction } from "../middlewares/audit";
import { canAccessBuilding, getAccessibleBuildingIds, getUserBuildingId } from "../middlewares/buildingScope";
import { postJournal } from "../lib/accountingRules";
import { routedGenerate } from "../lib/llmRouter";

const router: IRouter = Router();
router.use("/accounting", requireRole("manager", "accountant", "platform_admin", "hq_executive"));

async function resolveBuildingId(req: Request, body?: { buildingId?: unknown }): Promise<number | null> {
  const role = req.user?.role;
  const requested = body?.buildingId != null ? Number(body.buildingId) : null;
  if (role === "platform_admin") {
    const bid = requested ?? (await getUserBuildingId(req));
    if (bid && !(await canAccessBuilding(req, bid))) return null;
    return bid ?? null;
  }
  return (await getUserBuildingId(req)) ?? null;
}

async function buildingScopeIds(req: Request): Promise<{ all: boolean; ids: number[] }> {
  const scope = await getAccessibleBuildingIds(req);
  return { all: !!scope.unrestricted, ids: scope.ids };
}

// ── 회계기수 ────────────────────────────────────────────────
router.get("/accounting/fiscal-periods", async (req: Request, res: Response): Promise<void> => {
  const scope = await buildingScopeIds(req);
  if (!scope.all && scope.ids.length === 0) { res.json({ periods: [] }); return; }
  const where = scope.all ? undefined : inArray(fiscalPeriodsTable.buildingId, scope.ids);
  const rows = await db.select().from(fiscalPeriodsTable).where(where).orderBy(desc(fiscalPeriodsTable.startDate));
  res.json({ periods: rows });
});

router.post("/accounting/fiscal-periods", requireAction("accounting.fiscal_period.create"), audit("accounting.fiscal_period.create", { targetType: "fiscal_periods" }), async (req: Request, res: Response): Promise<void> => {
  const buildingId = await resolveBuildingId(req, req.body);
  if (!buildingId) { res.status(400).json({ error: "buildingId가 필요합니다" }); return; }
  const { code, name, startDate, endDate, isCurrent, memo } = req.body ?? {};
  if (!code || !name || !startDate || !endDate) { res.status(400).json({ error: "code/name/startDate/endDate 필요" }); return; }
  if (isCurrent) {
    await db.update(fiscalPeriodsTable).set({ isCurrent: false }).where(eq(fiscalPeriodsTable.buildingId, buildingId));
  }
  try {
    const [row] = await db.insert(fiscalPeriodsTable).values({
      buildingId, code, name, startDate, endDate,
      isCurrent: !!isCurrent, status: "open", memo: memo ?? null,
      createdById: req.user?.userId ?? null,
    }).returning();
    res.status(201).json(row);
  } catch (e) {
    res.status(409).json({ error: "중복 코드이거나 저장 실패", detail: (e as Error).message });
  }
});

router.patch("/accounting/fiscal-periods/:id", requireAction("accounting.fiscal_period.update"), audit("accounting.fiscal_period.update", { targetType: "fiscal_periods" }), async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const [row] = await db.select().from(fiscalPeriodsTable).where(eq(fiscalPeriodsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await canAccessBuilding(req, row.buildingId))) { res.status(403).json({ error: "권한 없음" }); return; }
  const { name, startDate, endDate, status, isCurrent, memo } = req.body ?? {};
  if (isCurrent === true) {
    await db.update(fiscalPeriodsTable).set({ isCurrent: false }).where(eq(fiscalPeriodsTable.buildingId, row.buildingId));
  }
  const [updated] = await db.update(fiscalPeriodsTable).set({
    ...(name != null ? { name } : {}),
    ...(startDate != null ? { startDate } : {}),
    ...(endDate != null ? { endDate } : {}),
    ...(status != null ? { status } : {}),
    ...(isCurrent != null ? { isCurrent: !!isCurrent } : {}),
    ...(memo !== undefined ? { memo } : {}),
  }).where(eq(fiscalPeriodsTable.id, id)).returning();
  res.json(updated);
});

router.delete("/accounting/fiscal-periods/:id", requireAction("accounting.fiscal_period.delete"), audit("accounting.fiscal_period.delete", { targetType: "fiscal_periods" }), async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const [row] = await db.select().from(fiscalPeriodsTable).where(eq(fiscalPeriodsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await canAccessBuilding(req, row.buildingId))) { res.status(403).json({ error: "권한 없음" }); return; }
  await db.delete(fiscalPeriodsTable).where(eq(fiscalPeriodsTable.id, id));
  res.json({ ok: true });
});

// ── 개시잔액 ────────────────────────────────────────────────
router.get("/accounting/opening-balances", async (req: Request, res: Response): Promise<void> => {
  const scope = await buildingScopeIds(req);
  if (!scope.all && scope.ids.length === 0) { res.json({ rows: [] }); return; }
  const fiscalPeriodId = req.query.fiscalPeriodId ? Number(req.query.fiscalPeriodId) : null;
  const where = and(
    scope.all ? undefined : inArray(openingBalancesTable.buildingId, scope.ids),
    fiscalPeriodId ? eq(openingBalancesTable.fiscalPeriodId, fiscalPeriodId) : undefined,
  );
  const rows = await db.select().from(openingBalancesTable).where(where).orderBy(asc(openingBalancesTable.accountCode));
  res.json({ rows });
});

// AI 파싱 — 사용자가 붙여넣은 자유 텍스트(전기 시산표/통장 잔액 등)를
// {accountCode, accountName, debit, credit} 라인 배열로 추출. 표준 계정과목을
// 함께 전달해 모델이 코드를 매칭하도록 한다. 저장은 별도 confirm 엔드포인트에서.
router.post("/accounting/opening-balances/ai-parse", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await resolveBuildingId(req, req.body);
  if (!buildingId) { res.status(400).json({ error: "buildingId 필요" }); return; }
  const text = String(req.body?.text ?? "").trim();
  if (!text) { res.status(400).json({ error: "text 필요" }); return; }
  const accounts = await db.select({ code: chartOfAccountsTable.code, name: chartOfAccountsTable.name, type: chartOfAccountsTable.type })
    .from(chartOfAccountsTable)
    .where(or(isNull(chartOfAccountsTable.buildingId), eq(chartOfAccountsTable.buildingId, buildingId)))
    .orderBy(asc(chartOfAccountsTable.code));
  const accountList = accounts.map(a => `${a.code} ${a.name} (${a.type})`).join("\n");
  const prompt = `다음은 한국 관리비 회계의 표준 계정과목 목록이다.\n${accountList}\n\n사용자가 붙여넣은 전기말 잔액(또는 전월 잔액) 텍스트를 분석해 개시 잔액 라인 배열로 변환하라.\n각 라인은 자산/비용은 차변(debit), 부채/자본/수익은 대변(credit) 으로 분류한다.\n결과는 JSON: {"lines":[{"accountCode":"1020","accountName":"예금","debit":1000000,"credit":0,"memo":"기업은행"}]}\n반드시 위 계정 목록의 code 만 사용. 모르면 가장 가까운 계정으로 매핑.\n\n[입력]\n${text}`;
  try {
    const result = await routedGenerate({
      parts: [{ text: prompt }],
      json: true,
      tier: "tier1",
      inputTextForRouting: prompt,
    });
    let parsed: { lines?: Array<{ accountCode?: string; accountName?: string; debit?: number; credit?: number; memo?: string }> } = {};
    try { parsed = JSON.parse(result.text); } catch { parsed = { lines: [] }; }
    const lines = (parsed.lines ?? []).map(l => ({
      accountCode: String(l.accountCode ?? ""),
      accountName: String(l.accountName ?? ""),
      debit: Number(l.debit ?? 0) || 0,
      credit: Number(l.credit ?? 0) || 0,
      memo: l.memo ?? null,
    })).filter(l => l.accountCode && (l.debit > 0 || l.credit > 0));
    res.json({ lines, model: result.model });
  } catch (e) {
    res.status(502).json({ error: "AI 분석 실패", detail: (e as Error).message });
  }
});

// 개시잔액 라인을 일괄 저장 + 분개로 발행(posted=true).
router.post("/accounting/opening-balances/post", requireAction("accounting.opening_balance.post"), audit("accounting.opening_balance.post", { targetType: "opening_balances" }), async (req: Request, res: Response): Promise<void> => {
  const buildingId = await resolveBuildingId(req, req.body);
  if (!buildingId) { res.status(400).json({ error: "buildingId 필요" }); return; }
  const fiscalPeriodId = Number(req.body?.fiscalPeriodId);
  const asOfDate = String(req.body?.asOfDate ?? "");
  const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];
  if (!fiscalPeriodId || !asOfDate || lines.length === 0) {
    res.status(400).json({ error: "fiscalPeriodId/asOfDate/lines 필요" }); return;
  }
  const totalD = lines.reduce((s: number, l: { debit?: number }) => s + (Number(l.debit) || 0), 0);
  const totalC = lines.reduce((s: number, l: { credit?: number }) => s + (Number(l.credit) || 0), 0);
  if (Math.abs(totalD - totalC) > 0.5) {
    res.status(400).json({ error: `대차 불일치: 차변 ${totalD} / 대변 ${totalC}` }); return;
  }
  // 1) opening_balances upsert
  const saved: number[] = [];
  for (const l of lines) {
    const accountCode = String(l.accountCode);
    const accountName = String(l.accountName);
    const debit = Number(l.debit) || 0;
    const credit = Number(l.credit) || 0;
    const memo = l.memo ?? null;
    const existing = await db.select().from(openingBalancesTable)
      .where(and(eq(openingBalancesTable.buildingId, buildingId), eq(openingBalancesTable.fiscalPeriodId, fiscalPeriodId), eq(openingBalancesTable.accountCode, accountCode)))
      .limit(1);
    if (existing[0]) {
      const [u] = await db.update(openingBalancesTable).set({ accountName, debit, credit, memo, asOfDate, posted: true }).where(eq(openingBalancesTable.id, existing[0].id)).returning();
      saved.push(u.id);
    } else {
      const [n] = await db.insert(openingBalancesTable).values({
        buildingId, fiscalPeriodId, asOfDate, accountCode, accountName, debit, credit, memo, posted: true, createdById: req.user?.userId ?? null,
      }).returning();
      saved.push(n.id);
    }
  }
  // 2) 단일 분개 헤더 + 라인으로 기록 (manual)
  const journal = await postJournal({
    buildingId,
    entryDate: asOfDate,
    memo: `개시잔액 입력 (FY#${fiscalPeriodId})`,
    sourceEvent: "manual",
    sourceRefType: "opening_balance",
    sourceRefId: fiscalPeriodId,
    createdById: req.user?.userId ?? null,
    lines: lines.map((l: { accountCode: string; accountName: string; debit?: number; credit?: number; memo?: string | null }) => ({
      accountCode: String(l.accountCode),
      accountName: String(l.accountName),
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0,
      memo: l.memo ?? null,
    })),
  });
  await db.update(openingBalancesTable).set({ postedJournalEntryId: journal.entryId })
    .where(and(eq(openingBalancesTable.buildingId, buildingId), eq(openingBalancesTable.fiscalPeriodId, fiscalPeriodId)));
  res.json({ ok: true, saved: saved.length, journalEntryId: journal.entryId });
});

// ── 자동분개 규칙 ───────────────────────────────────────────
router.get("/accounting/auto-journal-rules", async (req: Request, res: Response): Promise<void> => {
  const scope = await buildingScopeIds(req);
  const where = scope.all
    ? undefined
    : scope.ids.length === 0
      ? isNull(autoJournalRulesTable.buildingId)
      : or(isNull(autoJournalRulesTable.buildingId), inArray(autoJournalRulesTable.buildingId, scope.ids));
  const rules = await db.select().from(autoJournalRulesTable).where(where).orderBy(asc(autoJournalRulesTable.code));
  const ids = rules.map(r => r.id);
  const lines = ids.length ? await db.select().from(autoJournalRuleLinesTable).where(inArray(autoJournalRuleLinesTable.ruleId, ids)).orderBy(asc(autoJournalRuleLinesTable.ruleId), asc(autoJournalRuleLinesTable.sortOrder)) : [];
  const grouped = new Map<number, typeof lines>();
  for (const l of lines) { const arr = grouped.get(l.ruleId) ?? []; arr.push(l); grouped.set(l.ruleId, arr); }
  res.json({ rules: rules.map(r => ({ ...r, lines: grouped.get(r.id) ?? [] })) });
});

router.post("/accounting/auto-journal-rules", requireAction("accounting.auto_rule.create"), audit("accounting.auto_rule.create", { targetType: "auto_journal_rules" }), async (req: Request, res: Response): Promise<void> => {
  const buildingId = await resolveBuildingId(req, req.body);
  const { code, name, event, enabled, memo, lines } = req.body ?? {};
  if (!code || !name || !event) { res.status(400).json({ error: "code/name/event 필요" }); return; }
  const [rule] = await db.insert(autoJournalRulesTable).values({
    buildingId, code, name, event, enabled: enabled !== false,
    memo: memo ?? null, createdById: req.user?.userId ?? null,
  }).returning();
  if (Array.isArray(lines) && lines.length > 0) {
    await db.insert(autoJournalRuleLinesTable).values(lines.map((l: { kind: string; accountCode: string; accountName: string; amountSource?: string; fixedAmount?: number; ratio?: number; memo?: string }, i: number) => ({
      ruleId: rule.id,
      kind: l.kind === "credit" ? "credit" as const : "debit" as const,
      accountCode: String(l.accountCode),
      accountName: String(l.accountName),
      amountSource: l.amountSource === "fixed" ? "fixed" as const : "event" as const,
      fixedAmount: l.fixedAmount != null ? Number(l.fixedAmount) : null,
      ratio: Number(l.ratio ?? 1),
      memo: l.memo ?? null,
      sortOrder: i,
    })));
  }
  res.status(201).json(rule);
});

router.patch("/accounting/auto-journal-rules/:id", requireAction("accounting.auto_rule.update"), audit("accounting.auto_rule.update", { targetType: "auto_journal_rules" }), async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const [row] = await db.select().from(autoJournalRulesTable).where(eq(autoJournalRulesTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  if (row.buildingId != null && !(await canAccessBuilding(req, row.buildingId))) {
    res.status(403).json({ error: "권한 없음" }); return;
  }
  const { name, event, enabled, memo, lines } = req.body ?? {};
  const [updated] = await db.update(autoJournalRulesTable).set({
    ...(name != null ? { name } : {}),
    ...(event != null ? { event } : {}),
    ...(enabled != null ? { enabled: !!enabled } : {}),
    ...(memo !== undefined ? { memo } : {}),
  }).where(eq(autoJournalRulesTable.id, id)).returning();
  if (Array.isArray(lines)) {
    await db.delete(autoJournalRuleLinesTable).where(eq(autoJournalRuleLinesTable.ruleId, id));
    if (lines.length > 0) {
      await db.insert(autoJournalRuleLinesTable).values(lines.map((l: { kind: string; accountCode: string; accountName: string; amountSource?: string; fixedAmount?: number; ratio?: number; memo?: string }, i: number) => ({
        ruleId: id,
        kind: l.kind === "credit" ? "credit" as const : "debit" as const,
        accountCode: String(l.accountCode),
        accountName: String(l.accountName),
        amountSource: l.amountSource === "fixed" ? "fixed" as const : "event" as const,
        fixedAmount: l.fixedAmount != null ? Number(l.fixedAmount) : null,
        ratio: Number(l.ratio ?? 1),
        memo: l.memo ?? null,
        sortOrder: i,
      })));
    }
  }
  res.json(updated);
});

router.delete("/accounting/auto-journal-rules/:id", requireAction("accounting.auto_rule.delete"), audit("accounting.auto_rule.delete", { targetType: "auto_journal_rules" }), async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const [row] = await db.select().from(autoJournalRulesTable).where(eq(autoJournalRulesTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  if (row.buildingId != null && !(await canAccessBuilding(req, row.buildingId))) {
    res.status(403).json({ error: "권한 없음" }); return;
  }
  await db.delete(autoJournalRulesTable).where(eq(autoJournalRulesTable.id, id));
  res.json({ ok: true });
});

// ── 보고서 형식 ─────────────────────────────────────────────
router.get("/accounting/report-formats", async (req: Request, res: Response): Promise<void> => {
  const scope = await buildingScopeIds(req);
  const where = scope.all
    ? undefined
    : scope.ids.length === 0
      ? isNull(reportFormatsTable.buildingId)
      : or(isNull(reportFormatsTable.buildingId), inArray(reportFormatsTable.buildingId, scope.ids));
  const formats = await db.select().from(reportFormatsTable).where(where).orderBy(asc(reportFormatsTable.code));
  const ids = formats.map(f => f.id);
  const lines = ids.length ? await db.select().from(reportFormatLinesTable).where(inArray(reportFormatLinesTable.formatId, ids)).orderBy(asc(reportFormatLinesTable.formatId), asc(reportFormatLinesTable.sortOrder)) : [];
  const grouped = new Map<number, typeof lines>();
  for (const l of lines) { const arr = grouped.get(l.formatId) ?? []; arr.push(l); grouped.set(l.formatId, arr); }
  res.json({ formats: formats.map(f => ({ ...f, lines: grouped.get(f.id) ?? [] })) });
});

// AI 추천 — 표준 계정 + 사용자 지정 추가 계정을 받아 BS/IS 표준 행 구조 제안.
router.post("/accounting/report-formats/ai-suggest", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await resolveBuildingId(req, req.body);
  const kind = String(req.body?.kind ?? "balance_sheet");
  const accounts = await db.select({ code: chartOfAccountsTable.code, name: chartOfAccountsTable.name, type: chartOfAccountsTable.type })
    .from(chartOfAccountsTable)
    .where(buildingId ? or(isNull(chartOfAccountsTable.buildingId), eq(chartOfAccountsTable.buildingId, buildingId)) : isNull(chartOfAccountsTable.buildingId))
    .orderBy(asc(chartOfAccountsTable.code));
  const list = accounts.map(a => `${a.code} ${a.name} (${a.type})`).join("\n");
  const prompt = `한국 공동주택 관리비 회계의 ${kind === "income_statement" ? "손익계산서" : "재무상태표"} 표준 행 구조를 제안하라.\n계정 목록:\n${list}\n\n결과 JSON: {"lines":[{"sortOrder":1,"label":"유동자산","accountCodes":"","isSummary":true,"indent":0},{"sortOrder":2,"label":"  현금및예금","accountCodes":"1010,1020","isSummary":false,"indent":1}]}\nisSummary 행은 accountCodes 비움(자식 합계).`;
  try {
    const result = await routedGenerate({ parts: [{ text: prompt }], json: true, tier: "tier1" });
    let parsed: { lines?: Array<unknown> } = {};
    try { parsed = JSON.parse(result.text); } catch { parsed = { lines: [] }; }
    res.json({ lines: parsed.lines ?? [], model: result.model });
  } catch (e) {
    res.status(502).json({ error: "AI 추천 실패", detail: (e as Error).message });
  }
});

router.post("/accounting/report-formats", requireAction("accounting.report_format.create"), audit("accounting.report_format.create", { targetType: "report_formats" }), async (req: Request, res: Response): Promise<void> => {
  const buildingId = await resolveBuildingId(req, req.body);
  const { code, name, kind, enabled, memo, lines } = req.body ?? {};
  if (!code || !name || !kind) { res.status(400).json({ error: "code/name/kind 필요" }); return; }
  const [fmt] = await db.insert(reportFormatsTable).values({
    buildingId, code, name, kind, enabled: enabled !== false,
    memo: memo ?? null, createdById: req.user?.userId ?? null,
  }).returning();
  if (Array.isArray(lines) && lines.length > 0) {
    await db.insert(reportFormatLinesTable).values(lines.map((l: { label: string; accountCodes?: string; isSummary?: boolean; indent?: number; memo?: string }, i: number) => ({
      formatId: fmt.id,
      sortOrder: i,
      label: String(l.label),
      accountCodes: l.accountCodes ?? null,
      isSummary: !!l.isSummary,
      indent: Number(l.indent ?? 0),
      memo: l.memo ?? null,
    })));
  }
  res.status(201).json(fmt);
});

router.delete("/accounting/report-formats/:id", requireAction("accounting.report_format.delete"), audit("accounting.report_format.delete", { targetType: "report_formats" }), async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const [row] = await db.select().from(reportFormatsTable).where(eq(reportFormatsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  if (row.buildingId != null && !(await canAccessBuilding(req, row.buildingId))) {
    res.status(403).json({ error: "권한 없음" }); return;
  }
  await db.delete(reportFormatsTable).where(eq(reportFormatsTable.id, id));
  res.json({ ok: true });
});

// ── 회계데이터 전송 (CSV 묶음) ─────────────────────────────
router.get("/accounting/data-export", async (req: Request, res: Response): Promise<void> => {
  const scope = await buildingScopeIds(req);
  if (!scope.all && scope.ids.length === 0) { res.json({ entries: [], lines: [] }); return; }
  const from = String(req.query.from ?? "");
  const to = String(req.query.to ?? "");
  const where = and(
    scope.all ? undefined : inArray(journalEntriesTable.buildingId, scope.ids),
    from ? gte(journalEntriesTable.entryDate, from) : undefined,
    to ? lte(journalEntriesTable.entryDate, to) : undefined,
  );
  const entries = await db.select().from(journalEntriesTable).where(where).orderBy(asc(journalEntriesTable.entryDate), asc(journalEntriesTable.id));
  const ids = entries.map(e => e.id);
  const lines = ids.length ? await db.select().from(journalLinesTable).where(inArray(journalLinesTable.entryId, ids)).orderBy(asc(journalLinesTable.entryId), asc(journalLinesTable.sortOrder)) : [];
  res.json({ entries, lines });
});

// ── 전표 AI 작성 — 자연어 → 분개 라인 추천 ─────────────────
router.post("/accounting/journal/ai-suggest", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await resolveBuildingId(req, req.body);
  if (!buildingId) { res.status(400).json({ error: "buildingId 필요" }); return; }
  const text = String(req.body?.text ?? "").trim();
  if (!text) { res.status(400).json({ error: "text 필요" }); return; }
  const accounts = await db.select({ code: chartOfAccountsTable.code, name: chartOfAccountsTable.name, type: chartOfAccountsTable.type })
    .from(chartOfAccountsTable)
    .where(or(isNull(chartOfAccountsTable.buildingId), eq(chartOfAccountsTable.buildingId, buildingId)))
    .orderBy(asc(chartOfAccountsTable.code));
  const list = accounts.map(a => `${a.code} ${a.name} (${a.type})`).join("\n");
  const prompt = `한국 관리비 회계 분개 보조. 표준 계정과목:\n${list}\n\n사용자 설명을 차/대 라인으로 변환:\n결과 JSON {"entryDate":"YYYY-MM-DD","memo":"...","lines":[{"accountCode":"1020","accountName":"예금","debit":0,"credit":1000000,"memo":"..."}]}\n오늘 기준 날짜로 추정. 차변 합 = 대변 합 이 되도록 보정.\n\n[설명]\n${text}`;
  try {
    const result = await routedGenerate({ parts: [{ text: prompt }], json: true, tier: "tier1", inputTextForRouting: prompt });
    let parsed: { entryDate?: string; memo?: string; lines?: Array<{ accountCode?: string; accountName?: string; debit?: number; credit?: number; memo?: string }> } = {};
    try { parsed = JSON.parse(result.text); } catch { parsed = { lines: [] }; }
    const today = new Date().toISOString().slice(0, 10);
    res.json({
      entryDate: parsed.entryDate ?? today,
      memo: parsed.memo ?? "",
      lines: (parsed.lines ?? []).map(l => ({
        accountCode: String(l.accountCode ?? ""),
        accountName: String(l.accountName ?? ""),
        debit: Number(l.debit ?? 0) || 0,
        credit: Number(l.credit ?? 0) || 0,
        memo: l.memo ?? null,
      })).filter(l => l.accountCode),
      model: result.model,
    });
  } catch (e) {
    res.status(502).json({ error: "AI 추천 실패", detail: (e as Error).message });
  }
});

export default router;
