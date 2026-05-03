import { Router, type IRouter } from "express";
import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";
import {
  db,
  buildingsTable,
  monthlyBillSummariesTable,
  complaintsTable,
  inspectionsTable,
  buildingWarrantiesTable,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth";
import { routedGenerate } from "../lib/llmRouter";

// [Task #761] MVP-1: 플랫폼 운영자 대시보드용 포트폴리오 이상치 위젯.
//
// 룰 기반으로 후보를 뽑은 뒤 Tier 1 LLM 으로 카드별 1줄 한국어 코멘트를 생성한다.
// platform_admin 만 접근 가능하다 — 다른 역할에게는 식별 가능한 다건물 데이터를
// 한 번에 노출하지 않는다(매니저용 비교는 익명 집계만 노출하는 별도 통로 사용).
const router: IRouter = Router();

type Anomaly = {
  buildingId: number;
  buildingName: string;
  kind:
    | "bill_mom_spike"
    | "bill_yoy_spike"
    | "complaint_surge"
    | "complaint_backlog"
    | "inspection_overdue"
    | "inspection_imminent"
    | "warranty_expiring";
  severity: "info" | "warn" | "critical";
  metric: string;
  summary: string;
};

router.get(
  "/platform/portfolio-anomalies",
  requireRole("platform_admin"),
  async (req, res) => {
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const thirtyAhead = new Date(today); thirtyAhead.setDate(thirtyAhead.getDate() + 30);
    const thirtyAheadIso = thirtyAhead.toISOString().slice(0, 10);

    // Pull all buildings; the dashboard is platform-wide so we don't
    // shrink this list by user scope.
    const buildings = await db
      .select({ id: buildingsTable.id, name: buildingsTable.name, totalUnits: buildingsTable.totalUnits })
      .from(buildingsTable);
    if (buildings.length === 0) {
      res.json([]);
      return;
    }
    const ids = buildings.map((b) => b.id);
    const nameById = new Map(buildings.map((b) => [b.id, b.name]));

    // Pull recent bill summaries (last 13 months) for MoM/YoY checks.
    const thirteenMonthsAgo = new Date(today);
    thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);
    const thirteenAgoMonth = thirteenMonthsAgo.toISOString().slice(0, 7);
    const bills = await db
      .select({
        buildingId: monthlyBillSummariesTable.buildingId,
        billingMonth: monthlyBillSummariesTable.billingMonth,
        totalAmount: monthlyBillSummariesTable.totalAmount,
        unitCount: monthlyBillSummariesTable.unitCount,
      })
      .from(monthlyBillSummariesTable)
      .where(and(
        inArray(monthlyBillSummariesTable.buildingId, ids),
        gte(monthlyBillSummariesTable.billingMonth, thirteenAgoMonth),
      ));

    // Group bills by building for trend calc.
    const byBuilding = new Map<number, Array<{ month: string; perUnit: number }>>();
    for (const b of bills) {
      if (!b.unitCount || b.unitCount <= 0) continue;
      const arr = byBuilding.get(b.buildingId) ?? [];
      arr.push({ month: b.billingMonth, perUnit: b.totalAmount / b.unitCount });
      byBuilding.set(b.buildingId, arr);
    }
    for (const arr of byBuilding.values()) arr.sort((x, y) => x.month.localeCompare(y.month));

    // Complaints (last 6 months) per building.
    const sixMonthsAgo = new Date(today); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const complaintsRaw = await db
      .select({
        buildingId: complaintsTable.buildingId,
        cnt: sql<number>`count(*)::int`,
      })
      .from(complaintsTable)
      .where(and(
        inArray(complaintsTable.buildingId, ids),
        gte(complaintsTable.createdAt, sixMonthsAgo),
      ))
      .groupBy(complaintsTable.buildingId);
    const complaintCount = new Map(complaintsRaw.map((r) => [r.buildingId, r.cnt]));
    // Compute platform 95th percentile for complaint count (peer baseline).
    const counts = [...complaintCount.values()].sort((a, b) => a - b);
    const p95 = counts.length > 0 ? counts[Math.floor((counts.length - 1) * 0.95)] : 0;

    // Overdue inspections per building (이미 기한 지난 미완료).
    const overdueInsp = await db
      .select({
        buildingId: inspectionsTable.buildingId,
        cnt: sql<number>`count(*)::int`,
      })
      .from(inspectionsTable)
      .where(and(
        inArray(inspectionsTable.buildingId, ids),
        lte(inspectionsTable.nextDueDate, todayIso),
        sql`${inspectionsTable.status} <> 'completed'`,
      ))
      .groupBy(inspectionsTable.buildingId);
    const overdueByB = new Map(overdueInsp.map((r) => [r.buildingId, r.cnt]));

    // [Task #761] Imminent unprocessed statutory inspections — 30일 이내 도래 + 미완료.
    // 운영팀이 미리 일정을 잡을 수 있도록 "임박" 단계를 별도 카드로 분리한다.
    const imminentInsp = await db
      .select({
        buildingId: inspectionsTable.buildingId,
        cnt: sql<number>`count(*)::int`,
      })
      .from(inspectionsTable)
      .where(and(
        inArray(inspectionsTable.buildingId, ids),
        gte(inspectionsTable.nextDueDate, todayIso),
        lte(inspectionsTable.nextDueDate, thirtyAheadIso),
        sql`${inspectionsTable.status} <> 'completed'`,
      ))
      .groupBy(inspectionsTable.buildingId);
    const imminentByB = new Map(imminentInsp.map((r) => [r.buildingId, r.cnt]));

    // [Task #761] 미해결 민원 누적 — 30일 이상 status != 'completed' 인 민원.
    const thirtyAgo = new Date(today); thirtyAgo.setDate(thirtyAgo.getDate() - 30);
    const backlog = await db
      .select({
        buildingId: complaintsTable.buildingId,
        cnt: sql<number>`count(*)::int`,
      })
      .from(complaintsTable)
      .where(and(
        inArray(complaintsTable.buildingId, ids),
        sql`${complaintsTable.status} <> 'completed'`,
        lte(complaintsTable.createdAt, thirtyAgo),
      ))
      .groupBy(complaintsTable.buildingId);
    const backlogByB = new Map(backlog.map((r) => [r.buildingId, r.cnt]));

    // Warranties expiring within 30 days.
    const warrExpiring = await db
      .select({
        buildingId: buildingWarrantiesTable.buildingId,
        cnt: sql<number>`count(*)::int`,
      })
      .from(buildingWarrantiesTable)
      .where(and(
        inArray(buildingWarrantiesTable.buildingId, ids),
        gte(buildingWarrantiesTable.expiryDate, todayIso),
        lte(buildingWarrantiesTable.expiryDate, thirtyAheadIso),
      ))
      .groupBy(buildingWarrantiesTable.buildingId);
    const warrByB = new Map(warrExpiring.map((r) => [r.buildingId, r.cnt]));

    // Build raw rule-based candidates.
    const raw: Anomaly[] = [];
    for (const b of buildings) {
      const series = byBuilding.get(b.id) ?? [];
      if (series.length >= 2) {
        const last = series[series.length - 1];
        const prev = series[series.length - 2];
        if (prev.perUnit > 0) {
          const mom = (last.perUnit - prev.perUnit) / prev.perUnit;
          if (Math.abs(mom) >= 0.25) {
            raw.push({
              buildingId: b.id,
              buildingName: b.name,
              kind: "bill_mom_spike",
              severity: Math.abs(mom) >= 0.4 ? "critical" : "warn",
              metric: `${last.month} 세대당 관리비 전월대비 ${(mom * 100).toFixed(0)}%`,
              summary: "",
            });
          }
        }
        // YoY: same month one year earlier, if available.
        const yoyTarget = series.find((s) => s.month === addMonths(last.month, -12));
        if (yoyTarget && yoyTarget.perUnit > 0) {
          const yoy = (last.perUnit - yoyTarget.perUnit) / yoyTarget.perUnit;
          if (Math.abs(yoy) >= 0.3) {
            raw.push({
              buildingId: b.id,
              buildingName: b.name,
              kind: "bill_yoy_spike",
              severity: Math.abs(yoy) >= 0.5 ? "critical" : "warn",
              metric: `${last.month} 세대당 관리비 전년동월대비 ${(yoy * 100).toFixed(0)}%`,
              summary: "",
            });
          }
        }
      }
      const cc = complaintCount.get(b.id) ?? 0;
      if (p95 > 0 && cc >= p95 && cc >= 5) {
        raw.push({
          buildingId: b.id,
          buildingName: b.name,
          kind: "complaint_surge",
          severity: "warn",
          metric: `최근 6개월 민원 ${cc}건 (전체 95퍼센타일 ${p95}건)`,
          summary: "",
        });
      }
      const od = overdueByB.get(b.id) ?? 0;
      if (od >= 1) {
        raw.push({
          buildingId: b.id,
          buildingName: b.name,
          kind: "inspection_overdue",
          severity: od >= 3 ? "critical" : "warn",
          metric: `미이행 점검 ${od}건`,
          summary: "",
        });
      }
      const imm = imminentByB.get(b.id) ?? 0;
      if (imm >= 1) {
        raw.push({
          buildingId: b.id,
          buildingName: b.name,
          kind: "inspection_imminent",
          severity: imm >= 3 ? "warn" : "info",
          metric: `30일 이내 도래 미완료 점검 ${imm}건`,
          summary: "",
        });
      }
      const bk = backlogByB.get(b.id) ?? 0;
      if (bk >= 3) {
        raw.push({
          buildingId: b.id,
          buildingName: b.name,
          kind: "complaint_backlog",
          severity: bk >= 8 ? "critical" : "warn",
          metric: `30일 넘은 미해결 민원 ${bk}건`,
          summary: "",
        });
      }
      const wr = warrByB.get(b.id) ?? 0;
      if (wr >= 1) {
        raw.push({
          buildingId: b.id,
          buildingName: b.name,
          kind: "warranty_expiring",
          severity: "info",
          metric: `30일 이내 보증만료 ${wr}건`,
          summary: "",
        });
      }
    }

    // Cap at 20 rule candidates and ask Tier 1 for short Korean comments.
    raw.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
    const cards = raw.slice(0, 20);

    if (cards.length > 0) {
      try {
        const list = cards
          .map((c, i) => `${i + 1}. [${c.kind}] ${c.buildingName} — ${c.metric}`)
          .join("\n");
        const prompt = `다음은 한국 건물 관리 SaaS 의 포트폴리오 이상치 후보입니다. 각 항목에 대해 관리소장이 즉시 행동 가능한 1문장(40자 이내, 한국어 존댓말)로 코멘트만 돌려주세요. 설명·서론 없이 JSON 배열만 출력합니다. 형식: [{"i":1,"comment":"…"}, ...]\n\n${list}`;
        const r = await routedGenerate({
          tier: "tier1",
          json: true,
          parts: [{ text: prompt }],
          inputTextForRouting: prompt,
        });
        req.log.info(
          { caller: "portfolioAnomalies", tier: r.tier, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costEstimateUsd: r.costEstimateUsd },
          "LLM accounting",
        );
        try {
          const parsed = JSON.parse(r.text) as Array<{ i: number; comment: string }>;
          for (const item of parsed) {
            const idx = item.i - 1;
            if (idx >= 0 && idx < cards.length && typeof item.comment === "string") {
              cards[idx].summary = item.comment.trim();
            }
          }
        } catch (parseErr) {
          req.log.warn({ err: parseErr }, "portfolio anomaly LLM JSON parse failed; using fallback summaries");
        }
      } catch (err) {
        req.log.warn({ err }, "portfolio anomaly LLM summary failed; returning rule-only cards");
      }
    }

    // Fallback summary if LLM didn't fill it in
    for (const c of cards) {
      if (!c.summary) c.summary = defaultSummary(c);
      void nameById; // silence unused; kept for future name resolution
    }

    res.json(cards);
  },
);

function severityRank(s: Anomaly["severity"]): number {
  if (s === "critical") return 3;
  if (s === "warn") return 2;
  return 1;
}

function addMonths(yyyymm: string, delta: number): string {
  const [y, m] = yyyymm.split("-").map((x) => Number(x));
  const d = new Date(Date.UTC(y, (m - 1) + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function defaultSummary(c: Anomaly): string {
  switch (c.kind) {
    case "bill_mom_spike":
    case "bill_yoy_spike":
      return "관리비 변동 폭이 큽니다. 항목별 추세를 확인하세요.";
    case "complaint_surge":
      return "민원이 비교군 평균보다 많습니다. 상위 카테고리를 점검해 주세요.";
    case "complaint_backlog":
      return "30일 이상 미해결 민원이 누적되어 있습니다. 우선순위 재배정이 필요합니다.";
    case "inspection_overdue":
      return "미이행 정기점검이 있습니다. 일정 재배정이 필요합니다.";
    case "inspection_imminent":
      return "30일 이내 법정 점검이 임박했지만 아직 미완료 입니다. 일정을 확정해 주세요.";
    case "warranty_expiring":
      return "30일 안에 만료되는 보증이 있습니다. 연장·재계약을 검토하세요.";
  }
}

export default router;
