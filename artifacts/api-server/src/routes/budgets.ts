// [Task #776] 예산·집행통제 엔진 v01 — REST 라우트.
//
// 엔드포인트:
//   GET  /budgets?buildingId=&year=         현재 활성 버전 + 라인 매트릭스 + 카테고리별 집행률.
//   PUT  /budgets/:id/lines                 활성 버전의 라인 일괄 upsert (편성 화면 저장).
//   POST /budgets                           신규 budget 헤더 + 빈 v1 생성.
//   POST /budgets/:id/versions              새 버전 생성 (의결 변경 등). lines 동봉 가능.
//   POST /budgets/:id/versions/:vid/approve 의결 승인 — activeVersionId 갱신.
//   GET  /budgets/:id/execution             항목별 예산/집행/잔여/% 카드 데이터.
//   POST /budgets/check                     지출결의 가드: amount + category + month → ok/warn/over.
//
// 회계엔진(T6) 의 voucher.confirmed 이벤트를 구독해 budget_executions 누계를 갱신한다
// (애플리케이션 부팅 시 routes/index.ts 에서 registerBudgetExecutionListener 호출).

import { Router, type IRouter, type Request } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  budgetsTable,
  budgetVersionsTable,
  budgetLinesTable,
  budgetExecutionsTable,
  monthlyBillSummariesTable,
  budgetCategories,
  type BudgetCategory,
} from "@workspace/db";
import { audit, requireAction } from "../middlewares/audit";
import { requireRole } from "../middlewares/auth";
import { canAccessBuilding as scopeCanAccessBuilding } from "../middlewares/buildingScope";
import { voucherEventBus } from "../lib/voucherEvents";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const READ_ROLES = ["manager", "accountant", "hq_executive", "custodian", "platform_admin"] as const;
router.use("/budgets", requireRole(...READ_ROLES));

function parseInt0(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

async function getBuildingScope(req: Request, buildingId: number): Promise<boolean> {
  return scopeCanAccessBuilding(req, buildingId);
}

// 본부장이 같은 카테고리에서 최근 3년 본 건물 또는 동급 건물의 청구서 합계 → 월 평균.
async function suggestBudgetLines(buildingId: number, _year: number): Promise<Record<BudgetCategory, number[]>> {
  // 단순화: 같은 건물 monthlyBillSummaries 의 lineItems 집계로 월별 평균을 만든다.
  //   동급 건물 평균은 후속 태스크에서 보강.
  const rows = await db
    .select()
    .from(monthlyBillSummariesTable)
    .where(eq(monthlyBillSummariesTable.buildingId, buildingId));
  const sums: Record<string, number[]> = {};
  for (const cat of budgetCategories) sums[cat] = Array(12).fill(0);
  const counts: Record<string, number> = {};
  for (const cat of budgetCategories) counts[cat] = 0;
  for (const r of rows) {
    if (!r.billingMonth) continue;
    const m = Number(r.billingMonth.slice(5, 7));
    if (!(m >= 1 && m <= 12)) continue;
    const items = (r.lineItems as Record<string, number> | null) ?? {};
    const map: Record<BudgetCategory, number> = {
      electricity: items.electricity ?? 0,
      water: items.water ?? 0,
      elevator: items.elevator ?? 0,
      cleaning: items.cleaning ?? 0,
      security: items.security ?? 0,
      insurance: items.insurance ?? 0,
      long_term_repair: items.longTermRepairFund ?? 0,
      other: items.other ?? 0,
    };
    for (const [cat, v] of Object.entries(map)) {
      sums[cat][m - 1] += v;
      counts[cat] += 1;
    }
  }
  const out = {} as Record<BudgetCategory, number[]>;
  for (const cat of budgetCategories) {
    const c = Math.max(1, Math.round(counts[cat] / 12));
    out[cat] = sums[cat].map((v) => Math.round(v / c));
  }
  return out;
}

async function loadBudgetWithLines(budgetId: number) {
  const [budget] = await db.select().from(budgetsTable).where(eq(budgetsTable.id, budgetId));
  if (!budget) return null;
  const versions = await db
    .select()
    .from(budgetVersionsTable)
    .where(eq(budgetVersionsTable.budgetId, budgetId));
  const activeVersion = versions.find((v) => v.id === budget.activeVersionId) ?? versions.at(-1) ?? null;
  const lines = activeVersion
    ? await db.select().from(budgetLinesTable).where(eq(budgetLinesTable.versionId, activeVersion.id))
    : [];
  const exec = await db
    .select()
    .from(budgetExecutionsTable)
    .where(eq(budgetExecutionsTable.budgetId, budgetId));
  return { budget, versions, activeVersion, lines, executions: exec };
}

/** budget + version + lines 를 카테고리×월 매트릭스로 직렬화. */
function shapeMatrix(
  lines: { category: string; month: number; amount: number }[],
  executions: { category: string; month: number; amount: number; voucherCount: number }[],
) {
  const blank = () => Array(12).fill(0) as number[];
  const budgetMatrix: Record<string, number[]> = {};
  const execMatrix: Record<string, number[]> = {};
  for (const cat of budgetCategories) {
    budgetMatrix[cat] = blank();
    execMatrix[cat] = blank();
  }
  for (const l of lines) {
    if (l.month >= 1 && l.month <= 12 && budgetMatrix[l.category]) {
      budgetMatrix[l.category][l.month - 1] = Math.round(l.amount);
    }
  }
  for (const e of executions) {
    if (e.month >= 1 && e.month <= 12 && execMatrix[e.category]) {
      execMatrix[e.category][e.month - 1] = Math.round(e.amount);
    }
  }
  return { budgetMatrix, execMatrix };
}

router.get("/budgets", async (req, res) => {
  const buildingId = parseInt0(req.query.buildingId);
  const year = parseInt0(req.query.year) || new Date().getFullYear();
  if (!buildingId) {
    res.status(400).json({ error: "buildingId가 필요합니다" });
    return;
  }
  if (!(await getBuildingScope(req, buildingId))) {
    res.status(403).json({ error: "해당 건물에 접근 권한이 없습니다" });
    return;
  }
  const [existing] = await db
    .select()
    .from(budgetsTable)
    .where(and(eq(budgetsTable.buildingId, buildingId), eq(budgetsTable.year, year)));

  if (!existing) {
    const suggested = await suggestBudgetLines(buildingId, year);
    res.json({
      buildingId,
      year,
      budget: null,
      activeVersion: null,
      versions: [],
      budgetMatrix: suggested,
      execMatrix: Object.fromEntries(budgetCategories.map((c) => [c, Array(12).fill(0)])),
      suggested,
    });
    return;
  }
  const loaded = await loadBudgetWithLines(existing.id);
  if (!loaded) {
    res.status(404).json({ error: "예산을 찾을 수 없습니다" });
    return;
  }
  const { budget, versions, activeVersion, lines, executions } = loaded;
  const { budgetMatrix, execMatrix } = shapeMatrix(lines, executions);
  const suggested = await suggestBudgetLines(buildingId, year);
  res.json({
    buildingId,
    year,
    budget,
    activeVersion,
    versions,
    budgetMatrix,
    execMatrix,
    suggested,
  });
});

// 신규 헤더 + v1 동시 생성. body: { buildingId, year, lines? }
router.post(
  "/budgets",
  requireAction("budget.upsert"),
  audit("budget.upsert", { targetType: "budget" }),
  async (req, res) => {
    const buildingId = parseInt0(req.body?.buildingId);
    const year = parseInt0(req.body?.year);
    if (!buildingId || !year) {
      res.status(400).json({ error: "buildingId/year가 필요합니다" });
      return;
    }
    if (!(await getBuildingScope(req, buildingId))) {
      res.status(403).json({ error: "해당 건물에 접근 권한이 없습니다" });
      return;
    }
    const lines = sanitizeLineMatrix(req.body?.lines);
    const result = await db.transaction(async (tx) => {
      const [budget] = await tx.insert(budgetsTable).values({ buildingId, year }).returning();
      const [version] = await tx
        .insert(budgetVersionsTable)
        .values({ budgetId: budget.id, versionNo: 1, sourceType: "manual", note: "초안" })
        .returning();
      await tx.update(budgetsTable).set({ activeVersionId: version.id }).where(eq(budgetsTable.id, budget.id));
      if (lines.length) {
        await tx.insert(budgetLinesTable).values(lines.map((l) => ({ ...l, versionId: version.id })));
      }
      return { budget: { ...budget, activeVersionId: version.id }, version };
    });
    res.status(201).json(result);
  },
);

// 활성 버전 라인 매트릭스 일괄 upsert (편성 화면 저장).
router.put(
  "/budgets/:id/lines",
  requireAction("budget.upsert"),
  audit("budget.upsert", { targetType: "budget", targetIdParam: "id" }),
  async (req, res) => {
    const id = parseInt0(req.params.id);
    const [budget] = await db.select().from(budgetsTable).where(eq(budgetsTable.id, id));
    if (!budget) {
      res.status(404).json({ error: "예산을 찾을 수 없습니다" });
      return;
    }
    if (!(await getBuildingScope(req, budget.buildingId))) {
      res.status(403).json({ error: "해당 건물에 접근 권한이 없습니다" });
      return;
    }
    if (!budget.activeVersionId) {
      res.status(400).json({ error: "활성 버전이 없습니다" });
      return;
    }
    const lines = sanitizeLineMatrix(req.body?.lines);
    const versionId = budget.activeVersionId;
    await db.transaction(async (tx) => {
      await tx.delete(budgetLinesTable).where(eq(budgetLinesTable.versionId, versionId));
      if (lines.length) {
        await tx.insert(budgetLinesTable).values(lines.map((l) => ({ ...l, versionId })));
      }
    });
    res.json({ ok: true });
  },
);

// 새 버전 생성 (의결 후 신규 버전). 활성 전환은 별도 approve 호출.
router.post(
  "/budgets/:id/versions",
  requireAction("budget.upsert"),
  audit("budget.upsert", { targetType: "budget_version", targetIdParam: "id" }),
  async (req, res) => {
    const id = parseInt0(req.params.id);
    const [budget] = await db.select().from(budgetsTable).where(eq(budgetsTable.id, id));
    if (!budget) {
      res.status(404).json({ error: "예산을 찾을 수 없습니다" });
      return;
    }
    if (!(await getBuildingScope(req, budget.buildingId))) {
      res.status(403).json({ error: "해당 건물에 접근 권한이 없습니다" });
      return;
    }
    const versions = await db
      .select()
      .from(budgetVersionsTable)
      .where(eq(budgetVersionsTable.budgetId, id));
    const nextNo = versions.length === 0 ? 1 : Math.max(...versions.map((v) => v.versionNo)) + 1;
    const lines = sanitizeLineMatrix(req.body?.lines);
    const sourceType = typeof req.body?.sourceType === "string" ? req.body.sourceType : "manual";
    const sourceId = parseInt0(req.body?.sourceId) || null;
    const note = typeof req.body?.note === "string" ? req.body.note.slice(0, 500) : null;
    const result = await db.transaction(async (tx) => {
      const [version] = await tx
        .insert(budgetVersionsTable)
        .values({ budgetId: id, versionNo: nextNo, sourceType, sourceId, note })
        .returning();
      if (lines.length) {
        await tx.insert(budgetLinesTable).values(lines.map((l) => ({ ...l, versionId: version.id })));
      }
      return version;
    });
    res.status(201).json(result);
  },
);

// 버전 의결 승인 — activeVersionId 전환.
router.post(
  "/budgets/:id/versions/:vid/approve",
  requireAction("budget.approve"),
  audit("budget.approve", { targetType: "budget_version", targetIdParam: "vid" }),
  async (req, res) => {
    const id = parseInt0(req.params.id);
    const vid = parseInt0(req.params.vid);
    const [budget] = await db.select().from(budgetsTable).where(eq(budgetsTable.id, id));
    if (!budget) {
      res.status(404).json({ error: "예산을 찾을 수 없습니다" });
      return;
    }
    if (!(await getBuildingScope(req, budget.buildingId))) {
      res.status(403).json({ error: "해당 건물에 접근 권한이 없습니다" });
      return;
    }
    const [version] = await db
      .select()
      .from(budgetVersionsTable)
      .where(and(eq(budgetVersionsTable.id, vid), eq(budgetVersionsTable.budgetId, id)));
    if (!version) {
      res.status(404).json({ error: "버전을 찾을 수 없습니다" });
      return;
    }
    const user = req.user!;
    await db.transaction(async (tx) => {
      await tx
        .update(budgetVersionsTable)
        .set({
          approvedAt: new Date(),
          approvedByUserId: user.userId,
          approvedByName: typeof req.body?.approvedByName === "string" ? req.body.approvedByName : null,
        })
        .where(eq(budgetVersionsTable.id, vid));
      await tx.update(budgetsTable).set({ activeVersionId: vid }).where(eq(budgetsTable.id, id));
    });
    res.json({ ok: true });
  },
);

// 항목별 예산/집행 카드.
router.get("/budgets/:id/execution", async (req, res) => {
  const id = parseInt0(req.params.id);
  const [budget] = await db.select().from(budgetsTable).where(eq(budgetsTable.id, id));
  if (!budget) {
    res.status(404).json({ error: "예산을 찾을 수 없습니다" });
    return;
  }
  if (!(await getBuildingScope(req, budget.buildingId))) {
    res.status(403).json({ error: "해당 건물에 접근 권한이 없습니다" });
    return;
  }
  const loaded = await loadBudgetWithLines(id);
  if (!loaded) {
    res.status(404).json({ error: "예산을 찾을 수 없습니다" });
    return;
  }
  const { lines, executions } = loaded;
  const cards = budgetCategories.map((cat) => {
    const annualBudget = lines
      .filter((l) => l.category === cat && l.month >= 1 && l.month <= 12)
      .reduce((s, l) => s + l.amount, 0);
    const used = executions.filter((e) => e.category === cat).reduce((s, e) => s + e.amount, 0);
    const remaining = annualBudget - used;
    const rate = annualBudget > 0 ? Math.round((used / annualBudget) * 1000) / 10 : 0;
    return {
      category: cat,
      annualBudget: Math.round(annualBudget),
      used: Math.round(used),
      remaining: Math.round(remaining),
      rate,
      level: rate >= 100 ? "over" : rate >= 80 ? "warn" : "ok",
    };
  });
  res.json({ budgetId: id, year: budget.year, cards });
});

// 지출결의 가드 사전 체크. body: { buildingId, category, month, amount }
// 응답: { ok: true, level: 'ok'|'warn'|'over', remaining, annualBudget, monthBudget, projected }
router.post("/budgets/check", async (req, res) => {
  const buildingId = parseInt0(req.body?.buildingId);
  const month = parseInt0(req.body?.month);
  const amount = Number(req.body?.amount);
  const category = String(req.body?.category ?? "");
  if (!buildingId || !(month >= 1 && month <= 12) || !Number.isFinite(amount)) {
    res.status(400).json({ error: "buildingId/category/month/amount가 필요합니다" });
    return;
  }
  if (!(budgetCategories as readonly string[]).includes(category)) {
    res.json({ ok: true, level: "ok", remaining: null, annualBudget: 0, monthBudget: 0, projected: 0, reason: "unknown_category" });
    return;
  }
  if (!(await getBuildingScope(req, buildingId))) {
    res.status(403).json({ error: "해당 건물에 접근 권한이 없습니다" });
    return;
  }
  const year = parseInt0(req.body?.year) || new Date().getFullYear();
  const [budget] = await db
    .select()
    .from(budgetsTable)
    .where(and(eq(budgetsTable.buildingId, buildingId), eq(budgetsTable.year, year)));
  if (!budget || !budget.activeVersionId) {
    res.json({ ok: true, level: "ok", remaining: null, annualBudget: 0, monthBudget: 0, projected: 0, reason: "no_budget" });
    return;
  }
  const lines = await db
    .select()
    .from(budgetLinesTable)
    .where(eq(budgetLinesTable.versionId, budget.activeVersionId));
  const executions = await db
    .select()
    .from(budgetExecutionsTable)
    .where(eq(budgetExecutionsTable.budgetId, budget.id));
  const annualBudget = lines
    .filter((l) => l.category === category && l.month >= 1 && l.month <= 12)
    .reduce((s, l) => s + l.amount, 0);
  const used = executions.filter((e) => e.category === category).reduce((s, e) => s + e.amount, 0);
  const remaining = annualBudget - used;
  const projected = used + amount;
  const level = annualBudget <= 0 ? "ok" : projected > annualBudget ? "over" : projected >= annualBudget * 0.8 ? "warn" : "ok";
  res.json({
    ok: level !== "over",
    level,
    remaining: Math.round(remaining),
    annualBudget: Math.round(annualBudget),
    used: Math.round(used),
    projected: Math.round(projected),
    requiresExtraApproval: level === "over",
  });
});

// helpers ────────────────────────────────────────────────────────────
function sanitizeLineMatrix(input: unknown): { category: BudgetCategory; month: number; amount: number }[] {
  if (!input || typeof input !== "object") return [];
  const out: { category: BudgetCategory; month: number; amount: number }[] = [];
  // 두 가지 입력 모양을 받아준다:
  //   1) { electricity: [m1..m12], water: [...], ... }
  //   2) Array<{ category, month, amount }>
  if (Array.isArray(input)) {
    for (const r of input) {
      const cat = String((r as { category?: unknown }).category ?? "");
      const m = parseInt0((r as { month?: unknown }).month);
      const amt = Number((r as { amount?: unknown }).amount);
      if ((budgetCategories as readonly string[]).includes(cat) && m >= 1 && m <= 12 && Number.isFinite(amt)) {
        out.push({ category: cat as BudgetCategory, month: m, amount: Math.max(0, Math.round(amt)) });
      }
    }
    return out;
  }
  for (const cat of budgetCategories) {
    const arr = (input as Record<string, unknown>)[cat];
    if (!Array.isArray(arr)) continue;
    for (let i = 0; i < 12; i += 1) {
      const v = Number(arr[i]);
      if (Number.isFinite(v) && v > 0) {
        out.push({ category: cat, month: i + 1, amount: Math.max(0, Math.round(v)) });
      }
    }
  }
  return out;
}

// 회계엔진(T6) 트리거 — voucher.confirmed 시 budget_executions 누계 갱신.
//
// 카테고리는 approval/voucher 의 vendorName/title 에서 추정한다(현 단계에선 제목 키워드 매칭).
// 후속 태스크에서 결재 라인에 명시 카테고리 컬럼이 추가되면 그 값을 우선 사용한다.
function inferCategory(title: string, vendor: string | null): BudgetCategory {
  const text = `${title ?? ""} ${vendor ?? ""}`.toLowerCase();
  if (/전기|한전|kepco|electric/.test(text)) return "electricity";
  if (/수도|상수도|water/.test(text)) return "water";
  if (/승강기|엘리베이터|elev/.test(text)) return "elevator";
  if (/청소|환경/.test(text)) return "cleaning";
  if (/경비|보안|security/.test(text)) return "security";
  if (/보험|insurance/.test(text)) return "insurance";
  if (/수선|적립|repair/.test(text)) return "long_term_repair";
  return "other";
}

let listenerRegistered = false;
export function registerBudgetExecutionListener(): void {
  if (listenerRegistered) return;
  listenerRegistered = true;
  voucherEventBus.onTyped("voucher.confirmed", async (p) => {
    try {
      if (!p.buildingId || !p.amount) return;
      const occurredAt = new Date(p.occurredAt);
      const year = occurredAt.getUTCFullYear();
      const month = occurredAt.getUTCMonth() + 1;
      const [budget] = await db
        .select()
        .from(budgetsTable)
        .where(and(eq(budgetsTable.buildingId, p.buildingId), eq(budgetsTable.year, year)));
      if (!budget) return; // 예산이 없는 건물은 통제 대상 아님.
      const cat = inferCategory("", p.vendor);
      const [existing] = await db
        .select()
        .from(budgetExecutionsTable)
        .where(
          and(
            eq(budgetExecutionsTable.budgetId, budget.id),
            eq(budgetExecutionsTable.category, cat),
            eq(budgetExecutionsTable.month, month),
          ),
        );
      if (existing) {
        await db
          .update(budgetExecutionsTable)
          .set({ amount: existing.amount + p.amount, voucherCount: existing.voucherCount + 1 })
          .where(eq(budgetExecutionsTable.id, existing.id));
      } else {
        await db.insert(budgetExecutionsTable).values({
          budgetId: budget.id,
          buildingId: p.buildingId,
          category: cat,
          month,
          amount: p.amount,
          voucherCount: 1,
        });
      }
    } catch (err) {
      logger.error({ err, voucherId: p.voucherId }, "budget execution update failed");
    }
  });
}

export default router;
