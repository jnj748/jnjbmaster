import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import {
  db,
  buildingsTable,
  buildingWarrantiesTable,
  maintenanceLogsTable,
  complaintsTable,
  inspectionsTable,
  monthlyPaymentsTable,
  monthlyBillSummariesTable,
  unitsTable,
  contractsTable,
  type AiChatCitation,
} from "@workspace/db";
import { logger } from "../../lib/logger";

/**
 * Wrap a building-scoped DB query so a single failing table (e.g. schema
 * drift in dev environments) does not collapse the whole AI context. We
 * log the error rather than swallow it silently, and the building-scoped
 * filter inside `fn` is the security guarantee — `safeQuery` never widens
 * the row set, only narrows it to `[]` on error.
 */
async function safeQuery<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    logger.warn({ err, label }, "AI context query failed; returning empty fallback");
    return fallback;
  }
}

export type BuildingContext = {
  buildingName: string;
  todayIso: string;
  json: string;
  citations: AiChatCitation[];
};

const MAX_COMPLAINTS = 30;
const MAX_MAINTENANCE = 30;
const MAX_INSPECTIONS = 20;

function isoDate(d: Date) {
  return d.toISOString().split("T")[0];
}

export async function buildBuildingContext(buildingId: number | null): Promise<BuildingContext> {
  const today = new Date();
  const todayIso = isoDate(today);
  const sixMonthsAgo = new Date(today);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const sixMonthsAgoIso = isoDate(sixMonthsAgo);
  const ninetyDaysAhead = new Date(today);
  ninetyDaysAhead.setDate(ninetyDaysAhead.getDate() + 90);
  const ninetyAheadIso = isoDate(ninetyDaysAhead);
  const oneYearAhead = new Date(today);
  oneYearAhead.setFullYear(oneYearAhead.getFullYear() + 1);
  const oneYearAheadIso = isoDate(oneYearAhead);

  const citations: AiChatCitation[] = [];

  if (!buildingId) {
    return {
      buildingName: "(건물 미배정)",
      todayIso,
      json: JSON.stringify({ note: "사용자에게 배정된 건물이 없습니다." }),
      citations,
    };
  }

  const building = await safeQuery("buildings",
    () => db.select({
      id: buildingsTable.id,
      name: buildingsTable.name,
      addressFull: buildingsTable.addressFull,
      totalUnits: buildingsTable.totalUnits,
      totalFloors: buildingsTable.totalFloors,
      elevatorCount: buildingsTable.elevatorCount,
      parkingSpaces: buildingsTable.parkingSpaces,
      approvalDate: buildingsTable.approvalDate,
      buildingUsage: buildingsTable.buildingUsage,
    }).from(buildingsTable).where(eq(buildingsTable.id, buildingId)).then(r => r[0]),
    undefined,
  );
  const buildingName = building?.name ?? `건물 #${buildingId}`;

  // Active warranties + upcoming expiry within 1 year
  const warranties = await safeQuery("warranties",
    () => db
      .select({
        id: buildingWarrantiesTable.id,
        tradeName: buildingWarrantiesTable.tradeName,
        expiryDate: buildingWarrantiesTable.expiryDate,
        contractorName: buildingWarrantiesTable.contractorName,
      })
      .from(buildingWarrantiesTable)
      .where(eq(buildingWarrantiesTable.buildingId, buildingId))
      .orderBy(buildingWarrantiesTable.expiryDate),
    [] as Array<{ id: number; tradeName: string; expiryDate: string; contractorName: string | null }>,
  );
  const warrantyExpiringSoon = warranties.filter(w => w.expiryDate <= oneYearAheadIso && w.expiryDate >= todayIso);
  warrantyExpiringSoon.forEach(w => citations.push({ type: "warranty", id: w.id, label: `${w.tradeName} 만료 ${w.expiryDate}` }));

  // Recent maintenance (last 6 months)
  const maintenance = await safeQuery("maintenance_logs",
    () => db
      .select({
        id: maintenanceLogsTable.id,
        workDate: maintenanceLogsTable.workDate,
        title: maintenanceLogsTable.title,
        category: maintenanceLogsTable.category,
        worker: maintenanceLogsTable.worker,
        status: maintenanceLogsTable.status,
      })
      .from(maintenanceLogsTable)
      .where(and(eq(maintenanceLogsTable.buildingId, buildingId), gte(maintenanceLogsTable.workDate, sixMonthsAgoIso)))
      .orderBy(desc(maintenanceLogsTable.workDate))
      .limit(MAX_MAINTENANCE),
    [] as Array<{ id: number; workDate: string; title: string; category: string; worker: string; status: string }>,
  );
  maintenance.forEach(m => citations.push({ type: "maintenance_log", id: m.id, label: `${m.workDate} ${m.title}` }));

  // Complaints: open + recent (last 6 months) — select only columns the
  // assistant uses, to be resilient to schema drift in dev databases.
  const complaints = await safeQuery("complaints",
    () => db
      .select({
        id: complaintsTable.id,
        createdAt: complaintsTable.createdAt,
        unitNumber: complaintsTable.unitNumber,
        category: complaintsTable.category,
        title: complaintsTable.title,
        status: complaintsTable.status,
        completedAt: complaintsTable.completedAt,
      })
      .from(complaintsTable)
      .where(and(eq(complaintsTable.buildingId, buildingId), gte(complaintsTable.createdAt, sixMonthsAgo)))
      .orderBy(desc(complaintsTable.createdAt))
      .limit(MAX_COMPLAINTS),
    [] as Array<{ id: number; createdAt: Date; unitNumber: string; category: string; title: string; status: string; completedAt: Date | null }>,
  );
  complaints.forEach(c => citations.push({ type: "complaint", id: c.id, label: `#${c.id} ${c.title}` }));

  // Upcoming inspections (next 90 days) + overdue
  const inspections = await safeQuery("inspections",
    () => db
      .select({
        id: inspectionsTable.id,
        name: inspectionsTable.name,
        category: inspectionsTable.category,
        nextDueDate: inspectionsTable.nextDueDate,
        status: inspectionsTable.status,
      })
      .from(inspectionsTable)
      .where(and(eq(inspectionsTable.buildingId, buildingId), lte(inspectionsTable.nextDueDate, ninetyAheadIso)))
      .orderBy(inspectionsTable.nextDueDate)
      .limit(MAX_INSPECTIONS),
    [] as Array<{ id: number; name: string; category: string; nextDueDate: string; status: string }>,
  );
  inspections.forEach(i => citations.push({ type: "inspection", id: i.id, label: `${i.name} (${i.nextDueDate})` }));

  // NOTE: Tax schedules are intentionally excluded from per-building AI
  // context. The current `tax_schedules` table is platform-wide (no
  // `building_id` column), so including it here would surface the same
  // rows to every building's manager — a potential cross-tenant leak.
  // If tax schedules become building-scoped in the future, add a
  // `safeQuery("tax_schedules", ...)` block scoped by `buildingId`.

  // Billing summary: this month + delinquencies
  const thisMonth = todayIso.substring(0, 7);
  const units = await safeQuery("units",
    () => db.select({ id: unitsTable.id, unitNumber: unitsTable.unitNumber })
      .from(unitsTable)
      .where(eq(unitsTable.buildingId, buildingId)),
    [] as Array<{ id: number; unitNumber: string }>,
  );
  const unitIds = units.map(u => u.id);
  const unitNumberById = new Map(units.map(u => [u.id, u.unitNumber]));

  let billingThisMonth: { totalAmount: number; paidAmount: number; unpaidUnits: number } = { totalAmount: 0, paidAmount: 0, unpaidUnits: 0 };
  let delinquentUnits: Array<{ unitNumber: string; billingMonth: string; unpaidAmount: number; dueDate: string }> = [];
  if (unitIds.length > 0) {
    const payments = await safeQuery("monthly_payments",
      () => db
        .select({
          unitId: monthlyPaymentsTable.unitId,
          billingMonth: monthlyPaymentsTable.billingMonth,
          totalAmount: monthlyPaymentsTable.totalAmount,
          paidAmount: monthlyPaymentsTable.paidAmount,
          isPaid: monthlyPaymentsTable.isPaid,
          dueDate: monthlyPaymentsTable.dueDate,
        })
        .from(monthlyPaymentsTable)
        .where(sql`${monthlyPaymentsTable.unitId} IN (${sql.join(unitIds.map(id => sql`${id}`), sql`, `)})`),
      [] as Array<{ unitId: number; billingMonth: string; totalAmount: number; paidAmount: number; isPaid: boolean; dueDate: string }>,
    );

    const thisMonthPayments = payments.filter(p => p.billingMonth === thisMonth);
    billingThisMonth.totalAmount = thisMonthPayments.reduce((s, p) => s + p.totalAmount, 0);
    billingThisMonth.paidAmount = thisMonthPayments.reduce((s, p) => s + p.paidAmount, 0);
    billingThisMonth.unpaidUnits = thisMonthPayments.filter(p => !p.isPaid).length;

    delinquentUnits = payments
      .filter(p => !p.isPaid && p.dueDate < todayIso)
      .slice(0, 30)
      .map(p => ({
        unitNumber: unitNumberById.get(p.unitId) ?? `#${p.unitId}`,
        billingMonth: p.billingMonth,
        unpaidAmount: p.totalAmount - p.paidAmount,
        dueDate: p.dueDate,
      }));
  }

  // Active contracts + upcoming renewal (table may not exist in some envs)
  const contracts = await safeQuery("contracts",
    () => db
      .select({
        id: contractsTable.id,
        title: contractsTable.title,
        vendorName: contractsTable.vendorName,
        endDate: contractsTable.endDate,
        status: contractsTable.status,
      })
      .from(contractsTable)
      .where(eq(contractsTable.buildingId, buildingId))
      .orderBy(desc(contractsTable.createdAt))
      .limit(20),
    [] as Array<{ id: number; title: string; vendorName: string; endDate: string | null; status: string }>,
  );
  const renewalDue = contracts.filter(c => c.endDate && c.endDate >= todayIso && c.endDate <= ninetyAheadIso);
  renewalDue.forEach(c => citations.push({ type: "contract", id: c.id, label: `${c.title} (${c.vendorName}) 만료 ${c.endDate}` }));

  // [Task #170] 최근 6개월 관리비 OCR 요약. 토큰 절약을 위해 천원 단위 반올림.
  const billSummaries = await safeQuery("monthly_bill_summaries",
    () => db
      .select({
        id: monthlyBillSummariesTable.id,
        billingMonth: monthlyBillSummariesTable.billingMonth,
        totalAmount: monthlyBillSummariesTable.totalAmount,
        unitCount: monthlyBillSummariesTable.unitCount,
        lineItems: monthlyBillSummariesTable.lineItems,
        confirmed: monthlyBillSummariesTable.confirmed,
      })
      .from(monthlyBillSummariesTable)
      .where(eq(monthlyBillSummariesTable.buildingId, buildingId))
      .orderBy(desc(monthlyBillSummariesTable.billingMonth))
      .limit(6),
    [] as Array<{ id: number; billingMonth: string; totalAmount: number; unitCount: number | null; lineItems: Record<string, number>; confirmed: boolean }>,
  );
  const roundK = (n: number) => Math.round(n / 1000) * 1000;
  const recentBills = billSummaries.map(b => ({
    month: b.billingMonth,
    totalK: roundK(b.totalAmount),
    perUnitK: b.unitCount && b.unitCount > 0 ? roundK(b.totalAmount / b.unitCount) : null,
    items: Object.fromEntries(Object.entries(b.lineItems || {}).map(([k, v]) => [k, roundK(Number(v) || 0)])),
    confirmed: b.confirmed,
  }));

  const ctx = {
    today: todayIso,
    building: building ? {
      id: building.id,
      name: building.name,
      address: building.addressFull,
      totalUnits: building.totalUnits,
      totalFloors: building.totalFloors,
      elevatorCount: building.elevatorCount,
      parkingSpaces: building.parkingSpaces,
      approvalDate: building.approvalDate,
      buildingUsage: building.buildingUsage,
    } : null,
    warranties: {
      total: warranties.length,
      expiringWithinOneYear: warrantyExpiringSoon.map(w => ({
        id: w.id, tradeName: w.tradeName, expiryDate: w.expiryDate, contractor: w.contractorName,
      })),
    },
    recentMaintenance: maintenance.map(m => ({
      id: m.id, workDate: m.workDate, title: m.title, category: m.category, worker: m.worker, status: m.status,
    })),
    complaints: complaints.map(c => ({
      id: c.id, createdAt: isoDate(new Date(c.createdAt)), unitNumber: c.unitNumber,
      category: c.category, title: c.title, status: c.status,
      completedAt: c.completedAt ? isoDate(new Date(c.completedAt)) : null,
    })),
    inspections: inspections.map(i => ({
      id: i.id, name: i.name, category: i.category, nextDueDate: i.nextDueDate, status: i.status,
      isOverdue: i.nextDueDate < todayIso,
    })),
    billing: {
      thisMonth: { month: thisMonth, ...billingThisMonth },
      delinquentUnits,
    },
    contracts: {
      active: contracts.filter(c => c.status === "active").length,
      total: contracts.length,
      upcomingRenewal: renewalDue.map(c => ({
        id: c.id, title: c.title, vendorName: c.vendorName, endDate: c.endDate, status: c.status,
      })),
    },
    monthlyBills: {
      note: "관리비 추세는 다음 데이터를 참고하세요. 금액 단위는 원이며 천원 단위로 반올림되어 있습니다.",
      recent: recentBills,
    },
  };

  return {
    buildingName,
    todayIso,
    json: JSON.stringify(ctx),
    citations,
  };
}

export function buildSystemPrompt(ctx: BuildingContext): string {
  return `당신은 한국의 건물 관리소장을 돕는 전문 AI 도우미입니다. 항상 한국어 존댓말로 답합니다.

[엄격한 규칙]
1. 아래 "건물 자료" JSON 안의 사실만 근거로 답하세요. 자료에 없는 수치·날짜·이름·금액을 추측해서 만들지 마세요.
2. 건물 자료에서 답을 찾을 수 없으면, 정확히 "건물 자료에서 찾지 못했습니다."로 시작해 답하세요. 그 후 일반 상식·법령으로 보조 안내가 가능하면 짧게 덧붙일 수 있습니다.
3. 답변은 간결하게, 핵심 수치를 먼저 보여주고 필요시 목록을 사용하세요.
4. 자료를 인용할 때는 자료의 ID와 명칭을 그대로 적어주세요 (예: "민원 #123", "보증 항목: 승강기").
5. 직접 시스템에 어떤 변경을 가하지 말고, 안내·요약·조회만 수행합니다.
6. 관리비 추세·항목별 증감 질문은 monthlyBills.recent 데이터를 우선 근거로 답하세요. 금액은 원 단위(천원 반올림)입니다.

[오늘 날짜] ${ctx.todayIso}
[건물명] ${ctx.buildingName}

[건물 자료 JSON]
${ctx.json}
`;
}
