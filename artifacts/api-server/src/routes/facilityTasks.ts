// [Task #413] 시설관리 그룹의 "필수업무" / "제안업무" 페이지 전용 알림 소스.
//   /dashboard/alerts 와 동일한 출처(점검·세무·기한초과·후속조치·하자담보·자료파기·
//   업무 템플릿·공고문 게시) 를 사용하지만, 60일 윈도우를 풀어 모든 예정 업무를 반환한다.
//   클라이언트가 30/60/180/365/all 마감일 필터, 유형 필터, 검색을 적용한다.
//
// /dashboard/alerts 회귀를 막기 위해 dashboard.ts 의 핸들러는 일절 건드리지 않고,
//   여기서 동일 로직을 확장 파라미터(windowDays)와 함께 재구현한다.

import { Router, type IRouter } from "express";
import {
  and,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  desc,
  sql,
} from "drizzle-orm";
import {
  db,
  alertActionsTable,
  buildingNoticeTemplatesTable,
  buildingsTable,
  buildingWarrantiesTable,
  draftsTable,
  inspectionsTable,
  ownersTable,
  quotesTable,
  rfqsTable,
  tasksTable,
  taxSchedulesTable,
  tenantsTable,
  unitsTable,
  usersTable,
} from "@workspace/db";
import { LEGAL_PRESETS } from "./inspections";
import { resolveActiveTemplateAlerts } from "./taskTemplates";
import { requireRole } from "../middlewares/auth";
import { getAccessibleBuildingIds } from "../middlewares/buildingScope";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { Request } from "express";

const router: IRouter = Router();
// [Task #413] requireRole 은 buildingRouter 의 buildingOnly 와 별도로 한 번 더 가드.
//   manager / facility_staff / platform_admin 만 접근 허용.
router.use(
  ["/facility/mandatory-tasks", "/facility/suggested-tasks"],
  requireRole("manager", "facility_staff", "platform_admin"),
);

interface BuiltAlert {
  id: number;
  type: string;
  title: string;
  message: string;
  severity: "critical" | "warning" | "info";
  relatedId: number | null;
  hasDraft: boolean;
  actionStatus: string | null;
  dueDate: string | null;
  penaltyInfo: string | null;
  inspectionType?: string | null;
  // [Task #413] inspection_due 알림에서 다음 점검 예정일 자동 계산을 위해
  //   AlertActionDialog 가 사용한다. dashboard.ts 와 시그니처 일치(없으면 기본 6개월).
  cycleMonths?: number | null;
  intervalDays?: number | null;
  noticeTemplateId?: number | null;
  // [Task #511] 가장 최근 액션이 scheduled 일 때 노출되는 처리예정 메타.
  //   facility 페이지(필수업무/추천업무)도 같은 알림 카드를 사용하므로 dashboard.ts 와
  //   동일한 형태로 노출해야 D-N 라벨/모달 prefill 이 동작한다.
  scheduledDate?: string | null;
  scheduledNotes?: string | null;
  // [Task #511] 비교견적 prefill 자동 채움용. 가장 최근 액션에 첨부된 사진 URL.
  closeUpPhotoUrl?: string | null;
  widePhotoUrl?: string | null;
  createdAt: string;
}

// [Task #511] dashboard.ts 의 동명 헬퍼와 동일 동작.
//   1) 가장 최근 액션이 scheduled 면 처리예정 메타+actionStatus 를 채움.
//   2) 액션 종류와 무관하게 첨부 사진이 있으면 비교견적 prefill 용으로 노출.
function applyActionMeta(
  alert: BuiltAlert,
  action:
    | {
        actionType: string;
        scheduledDate?: string | null;
        notes?: string | null;
        closeUpPhotoUrl?: string | null;
        widePhotoUrl?: string | null;
      }
    | undefined,
): void {
  if (!action) return;
  if (action.actionType === "scheduled") {
    alert.scheduledDate = action.scheduledDate ?? null;
    alert.scheduledNotes = action.notes ?? null;
    alert.actionStatus = "scheduled";
  }
  if (action.closeUpPhotoUrl) alert.closeUpPhotoUrl = action.closeUpPhotoUrl;
  if (action.widePhotoUrl) alert.widePhotoUrl = action.widePhotoUrl;
}

// 모든 예정/기한초과 알림을 한 번에 빌드한 뒤 mandatory/suggested 분류로 나눠 사용한다.
async function buildAllUpcomingAlerts(req: Request): Promise<BuiltAlert[]> {
  const today = new Date().toISOString().split("T")[0];
  const todayMs = new Date(today).getTime();
  // [Task #596] hq_executive 는 더 이상 전 건물 가시 super-user 가 아니다 —
  //   hq_building_assignments 매핑된 건물 묶음에 한해서만 알림을 본다.
  //   platform_admin 만 진정한 전 건물 가시(unrestricted).
  //   비-관리자(매니저/시설기사 등) buildingId 미할당이면 빈 응답.
  const scope = await getAccessibleBuildingIds(req);
  const isGlobalRole = scope.unrestricted;
  if (!isGlobalRole && scope.ids.length === 0) {
    return [];
  }
  const restrictByBuilding = !isGlobalRole;
  // 단일 건물 매니저 케이스를 빠른 경로로 보존 (기존 eq() 호환).
  //   다중 건물 hq_executive 의 경우 null 이 되어 단일 건물 한정 분기는 비활성화된다
  //   (예: 공고문 게시 템플릿 — 매니저용 단일 건물 흐름).
  const scopedBuildingId: number | null =
    restrictByBuilding && scope.ids.length === 1 ? scope.ids[0] : null;
  // [Task #596] 다중 건물 hq_executive 도 같은 컬럼 필터로 처리할 수 있도록 헬퍼.
  const buildingFilter = (col: AnyPgColumn): SQL =>
    scope.ids.length === 1 ? eq(col, scope.ids[0]) : inArray(col, scope.ids);
  // 기존 코드 호환: reqUserId, reqRole 변수가 아래에서 그대로 쓰인다.
  const reqUserId = req.user?.userId ?? null;
  const reqRole = req.user?.role ?? null;

  const alerts: BuiltAlert[] = [];
  let alertId = 1;

  const recentActions = await db
    .select()
    .from(alertActionsTable)
    .orderBy(desc(alertActionsTable.createdAt));

  // [Task #389] notice_posting 은 템플릿이 모든 건물에 공유되므로 action.userId →
  //   buildingId 로 매핑해 키에 포함해야 cross-tenant 충돌을 피할 수 있다.
  const actionUserIds = Array.from(
    new Set(
      recentActions
        .map((a) => a.userId)
        .filter((id): id is number => typeof id === "number"),
    ),
  );
  const userBuildingMap = new Map<number, number | null>();
  if (actionUserIds.length > 0) {
    const usersForActions = await db
      .select({ id: usersTable.id, buildingId: usersTable.buildingId })
      .from(usersTable)
      .where(inArray(usersTable.id, actionUserIds));
    for (const u of usersForActions) {
      userBuildingMap.set(u.id, u.buildingId ?? null);
    }
  }

  const actionMap = new Map<string, (typeof recentActions)[0]>();
  for (const action of recentActions) {
    let key = `${action.alertType}:${action.relatedEntityId}`;
    if (action.alertType === "notice_posting") {
      const bId = action.userId != null ? userBuildingMap.get(action.userId) ?? null : null;
      key = `${action.alertType}:${action.relatedEntityId}:${bId ?? "none"}`;
    }
    if (!actionMap.has(key)) {
      actionMap.set(key, action);
    }
  }

  // ── Inspections ── 모든 예정(>=today) 점검 + 모든 기한초과(<today)
  const upcomingInspections = await db
    .select()
    .from(inspectionsTable)
    .where(
      and(
        gte(inspectionsTable.nextDueDate, today),
        ...(restrictByBuilding ? [buildingFilter(inspectionsTable.buildingId)] : []),
      ),
    );

  const allDrafts = await db.select().from(draftsTable);
  const draftByInspectionId = new Map<number, boolean>();
  for (const d of allDrafts) {
    if (d.inspectionId) draftByInspectionId.set(d.inspectionId, true);
  }

  for (const inspection of upcomingInspections) {
    const action = actionMap.get(`inspection_due:${inspection.id}`);
    if (action) {
      if (action.actedOnDueDate) {
        if (action.actedOnDueDate >= inspection.nextDueDate) continue;
      } else if (action.actionType === "completed" && action.completedDate) {
        if (action.completedDate >= inspection.nextDueDate) continue;
      } else if (action.actionType === "postponed" && action.postponeDays) {
        const actionDate = new Date(action.createdAt);
        const suppressUntil = new Date(actionDate.getTime() + action.postponeDays * 86400000);
        if (new Date(today) < suppressUntil) continue;
      }
    }
    const preset = LEGAL_PRESETS.find((p) => p.name === inspection.name);
    const penaltyInfo = preset?.penaltyInfo || null;
    const dueMs = new Date(inspection.nextDueDate).getTime();
    const daysLeft = Math.ceil((dueMs - todayMs) / 86400000);
    const severity: BuiltAlert["severity"] =
      daysLeft <= 7 ? "critical" : daysLeft <= 30 ? "warning" : "info";
    const inspAlert: BuiltAlert = {
      id: alertId++,
      type: "inspection_due",
      title: `${inspection.name} 점검 예정`,
      message: `${inspection.nextDueDate}까지 ${inspection.name} 점검을 완료해야 합니다. 업체 선정 및 준비를 시작하세요.`,
      severity,
      relatedId: inspection.id,
      hasDraft: draftByInspectionId.has(inspection.id),
      actionStatus: action?.actionType || null,
      dueDate: inspection.nextDueDate,
      penaltyInfo,
      inspectionType: inspection.inspectionType ?? null,
      cycleMonths: inspection.legalCycleMonths ?? null,
      intervalDays: inspection.intervalDays ?? null,
      createdAt: new Date().toISOString(),
    };
    applyActionMeta(inspAlert, action);
    alerts.push(inspAlert);
  }

  const overdueInspections = await db
    .select()
    .from(inspectionsTable)
    .where(
      and(
        lt(inspectionsTable.nextDueDate, today),
        ...(restrictByBuilding ? [buildingFilter(inspectionsTable.buildingId)] : []),
      ),
    );

  for (const inspection of overdueInspections) {
    const action = actionMap.get(`inspection_due:${inspection.id}`);
    if (action) {
      if (action.actedOnDueDate) {
        if (action.actedOnDueDate >= inspection.nextDueDate) continue;
      } else if (action.actionType === "completed" && action.completedDate) {
        if (action.completedDate >= inspection.nextDueDate) continue;
      } else if (action.actionType === "postponed" && action.postponeDays) {
        const actionDate = new Date(action.createdAt);
        const suppressUntil = new Date(actionDate.getTime() + action.postponeDays * 86400000);
        if (new Date(today) < suppressUntil) continue;
      }
    }
    const presetO = LEGAL_PRESETS.find((p) => p.name === inspection.name);
    const penaltyInfoO = presetO?.penaltyInfo || null;
    const daysOverdue = Math.ceil(
      (todayMs - new Date(inspection.nextDueDate).getTime()) / 86400000,
    );
    const overdueInspAlert: BuiltAlert = {
      id: alertId++,
      type: "inspection_due",
      title: `${inspection.name} 기한 초과`,
      message: `${inspection.nextDueDate} 마감 기한이 ${daysOverdue}일 경과했습니다. 즉시 처리가 필요합니다.`,
      severity: "critical",
      relatedId: inspection.id,
      hasDraft: draftByInspectionId.has(inspection.id),
      actionStatus: action?.actionType || null,
      dueDate: inspection.nextDueDate,
      penaltyInfo: penaltyInfoO,
      inspectionType: inspection.inspectionType ?? null,
      cycleMonths: inspection.legalCycleMonths ?? null,
      intervalDays: inspection.intervalDays ?? null,
      createdAt: new Date().toISOString(),
    };
    applyActionMeta(overdueInspAlert, action);
    alerts.push(overdueInspAlert);
  }

  // ── Tax schedules ── 모든 pending (마감일 무관)
  const pendingTax = await db
    .select()
    .from(taxSchedulesTable)
    .where(eq(taxSchedulesTable.status, "pending"));

  for (const tax of pendingTax) {
    const dueMs = new Date(tax.dueDate).getTime();
    const daysLeft = Math.ceil((dueMs - todayMs) / 86400000);
    let dLabel = "";
    if (daysLeft < 0) dLabel = " (기한 초과)";
    else if (daysLeft === 0) dLabel = " [D-Day]";
    else if (daysLeft <= 30) dLabel = ` [D-${daysLeft}]`;
    let message = `${tax.dueDate}까지 ${tax.title}을(를) 처리해야 합니다.`;
    if (daysLeft <= 30 && daysLeft >= 0) {
      message += " 세무사에게 자료를 준비하세요. (매출/매입 증빙, 급여대장, 4대보험 등)";
    }
    const taxAction = actionMap.get(`tax_due:${tax.id}`);
    if (taxAction) {
      if (taxAction.actionType === "completed") continue;
      if (taxAction.actionType === "postponed" && taxAction.postponeDays) {
        const actionDate = new Date(taxAction.createdAt);
        const suppressUntil = new Date(
          actionDate.getTime() + taxAction.postponeDays * 86400000,
        );
        if (new Date(today) < suppressUntil) continue;
      }
    }
    const severity: BuiltAlert["severity"] =
      daysLeft < 0 ? "critical" : daysLeft <= 30 ? "warning" : "info";
    const taxAlert: BuiltAlert = {
      id: alertId++,
      type: "tax_due",
      title: `${tax.title} 마감 예정${dLabel}`,
      message,
      severity,
      relatedId: tax.id,
      hasDraft: false,
      actionStatus: taxAction?.actionType || null,
      dueDate: tax.dueDate,
      penaltyInfo: null,
      createdAt: new Date().toISOString(),
    };
    applyActionMeta(taxAlert, taxAction);
    alerts.push(taxAlert);
  }

  // ── Tasks (overdue + followup) ──
  const pendingTasks = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.status, "pending"));

  const FOLLOWUP_MARKER = "__followup_source:";
  for (const task of pendingTasks) {
    const isFollowUp = !!task.description && task.description.includes(FOLLOWUP_MARKER);
    const isOverdue = task.dueDate && task.dueDate < today;
    if (!isOverdue && !isFollowUp) continue;
    const alertType = isFollowUp ? "task_followup" : "task_overdue";
    const taskAction =
      actionMap.get(`${alertType}:${task.id}`) ?? actionMap.get(`task_overdue:${task.id}`);
    if (taskAction) {
      if (taskAction.actionType === "completed") continue;
      if (taskAction.actionType === "postponed" && taskAction.postponeDays) {
        const actionDate = new Date(taskAction.createdAt);
        const suppressUntil = new Date(
          actionDate.getTime() + taskAction.postponeDays * 86400000,
        );
        if (new Date(today) < suppressUntil) continue;
      }
    }
    const taskAlert: BuiltAlert = {
      id: alertId++,
      type: alertType,
      title: isFollowUp ? task.title : `${task.title} 기한 초과`,
      message: isFollowUp
        ? task.description?.split("\n")[0] ?? "후속조치로 등록된 1회성 필수업무입니다."
        : `${task.dueDate}이 마감이었던 업무가 아직 완료되지 않았습니다.`,
      severity: isOverdue ? "critical" : task.priority === "high" ? "critical" : "warning",
      relatedId: task.id,
      hasDraft: false,
      actionStatus: taskAction?.actionType || null,
      dueDate: task.dueDate,
      penaltyInfo: null,
      createdAt: new Date().toISOString(),
    };
    applyActionMeta(taskAlert, taskAction);
    alerts.push(taskAlert);
  }

  // ── Data destruction (all upcoming) ──
  // [Task #413] tenants/owners 자체 테이블엔 buildingId 가 없지만 unitId → units.buildingId
  //   조인을 통해 건물 스코핑 가능. 비-글로벌 역할은 본인 건물 unit 에 묶인 입주자/소유자만 노출.
  const upcomingDestructionTenants = restrictByBuilding
    ? (
        await db
          .select({ tenants: tenantsTable })
          .from(tenantsTable)
          .innerJoin(unitsTable, eq(tenantsTable.unitId, unitsTable.id))
          .where(
            and(
              isNotNull(tenantsTable.dataDestructionDate),
              sql`${tenantsTable.dataDestructionDate} >= ${today}`,
              eq(tenantsTable.status, "moved_out"),
              buildingFilter(unitsTable.buildingId),
            ),
          )
      ).map((r) => r.tenants)
    : await db
        .select()
        .from(tenantsTable)
        .where(
          and(
            isNotNull(tenantsTable.dataDestructionDate),
            sql`${tenantsTable.dataDestructionDate} >= ${today}`,
            eq(tenantsTable.status, "moved_out"),
          ),
        );
  const upcomingDestructionOwners = restrictByBuilding
    ? (
        await db
          .select({ owners: ownersTable })
          .from(ownersTable)
          .innerJoin(unitsTable, eq(ownersTable.unitId, unitsTable.id))
          .where(
            and(
              isNotNull(ownersTable.dataDestructionDate),
              sql`${ownersTable.dataDestructionDate} >= ${today}`,
              eq(ownersTable.status, "moved_out"),
              buildingFilter(unitsTable.buildingId),
            ),
          )
      ).map((r) => r.owners)
    : await db
        .select()
        .from(ownersTable)
        .where(
          and(
            isNotNull(ownersTable.dataDestructionDate),
            sql`${ownersTable.dataDestructionDate} >= ${today}`,
            eq(ownersTable.status, "moved_out"),
          ),
        );
  for (const tenant of upcomingDestructionTenants) {
    const daysLeft = Math.ceil(
      (new Date(tenant.dataDestructionDate!).getTime() - todayMs) / 86400000,
    );
    alerts.push({
      id: alertId++,
      type: "data_destruction",
      title: `${tenant.unit}호 입주자 개인정보 파기 예정`,
      message: `${tenant.tenantName}의 개인정보가 ${tenant.dataDestructionDate}에 파기 예정입니다. (${daysLeft}일 남음)`,
      severity: daysLeft <= 30 ? "critical" : "warning",
      relatedId: tenant.id,
      hasDraft: false,
      actionStatus: null,
      dueDate: tenant.dataDestructionDate,
      penaltyInfo: null,
      createdAt: new Date().toISOString(),
    });
  }
  for (const owner of upcomingDestructionOwners) {
    const daysLeft = Math.ceil(
      (new Date(owner.dataDestructionDate!).getTime() - todayMs) / 86400000,
    );
    alerts.push({
      id: alertId++,
      type: "data_destruction",
      title: `${owner.unit}호 소유자 개인정보 파기 예정`,
      message: `${owner.ownerName}의 개인정보가 ${owner.dataDestructionDate}에 파기 예정입니다. (${daysLeft}일 남음)`,
      severity: daysLeft <= 30 ? "critical" : "warning",
      relatedId: owner.id,
      hasDraft: false,
      actionStatus: null,
      dueDate: owner.dataDestructionDate,
      penaltyInfo: null,
      createdAt: new Date().toISOString(),
    });
  }

  // ── Warranty expiry (all upcoming, not just 60d) ──
  const expiringWarranties = await db
    .select()
    .from(buildingWarrantiesTable)
    .where(
      and(
        gte(buildingWarrantiesTable.expiryDate, today),
        ...(restrictByBuilding
          ? [buildingFilter(buildingWarrantiesTable.buildingId)]
          : []),
      ),
    );
  const buildingIdSet = new Set(expiringWarranties.map((w) => w.buildingId));
  const buildingMap = new Map<number, string | null>();
  if (buildingIdSet.size > 0) {
    const buildings = await db
      .select({ id: buildingsTable.id, name: buildingsTable.name })
      .from(buildingsTable)
      .where(inArray(buildingsTable.id, Array.from(buildingIdSet)));
    for (const b of buildings) buildingMap.set(b.id, b.name);
  }
  for (const warranty of expiringWarranties) {
    const daysUntilExpiry = Math.ceil(
      (new Date(warranty.expiryDate).getTime() - todayMs) / 86400000,
    );
    const buildingName = buildingMap.get(warranty.buildingId) || "관리 건물";
    const severity: BuiltAlert["severity"] =
      daysUntilExpiry <= 30 ? "critical" : daysUntilExpiry <= 60 ? "warning" : "info";
    // [Task #511] 하자담보 알림도 다른 알림과 동일하게 가장 최근 액션의 actionType /
    //   처리예정 메타 / 첨부 사진을 같이 흘려보낸다. 그래야 시설관리(필수업무) 페이지의
    //   하자담보 카드에서도 비교견적 진행중 / 처리예정 D-N 라벨이 정확히 표시된다.
    const warrantyAction = actionMap.get(`warranty_expiry:${warranty.id}`);
    const warrantyAlert: BuiltAlert = {
      id: alertId++,
      type: "warranty_expiry",
      title: `[하자담보] ${warranty.tradeName} 만료 ${daysUntilExpiry}일 전`,
      message: `${buildingName}의 ${warranty.tradeName} 하자담보가 ${warranty.expiryDate}에 만료됩니다. 하자 진단을 실시하고 필요시 시공사에 보수를 요구하세요.`,
      severity,
      relatedId: warranty.id,
      hasDraft: false,
      actionStatus: warrantyAction?.actionType ?? null,
      dueDate: warranty.expiryDate,
      penaltyInfo: null,
      createdAt: new Date().toISOString(),
    };
    applyActionMeta(warrantyAlert, warrantyAction);
    alerts.push(warrantyAlert);
  }

  // ── Task templates (windowDaysOverride 로 모든 예정 노출) ──
  const userBuildingId = scopedBuildingId;
  let buildingUsage: string | null = null;
  if (userBuildingId) {
    const [b] = await db
      .select({ buildingUsage: buildingsTable.buildingUsage })
      .from(buildingsTable)
      .where(eq(buildingsTable.id, userBuildingId));
    buildingUsage = b?.buildingUsage ?? null;
  }
  const templateAlerts = await resolveActiveTemplateAlerts(
    new Date().toISOString(),
    alertId + 1000,
    {
      userId: reqUserId,
      buildingId: userBuildingId,
      userRole: reqRole,
      buildingUsage,
      // [Task #413] 60일 cap 을 풀어 모든 예정 템플릿을 노출.
      windowDaysOverride: 365 * 5,
    },
  );
  for (const a of templateAlerts) {
    alerts.push({
      id: a.id,
      type: a.type,
      title: a.title,
      message: a.message,
      severity: a.severity,
      relatedId: a.relatedId,
      hasDraft: a.hasDraft,
      actionStatus: a.actionStatus,
      dueDate: a.dueDate,
      penaltyInfo: a.penaltyInfo,
      inspectionType: a.classification === "legal" ? "legal" : null,
      createdAt: a.createdAt,
      noticeTemplateId: a.noticeTemplateId,
      // [Task #511] resolveActiveTemplateAlerts 가 가장 최근 액션의 scheduled 메타 +
      //   첨부 사진 URL 을 함께 반환하므로 facility 필수/추천업무 카드도 동일하게
      //   D-N 라벨과 비교견적 prefill 을 받게 한다.
      scheduledDate: a.scheduledDate ?? null,
      scheduledNotes: a.scheduledNotes ?? null,
      closeUpPhotoUrl: a.closeUpPhotoUrl ?? null,
      widePhotoUrl: a.widePhotoUrl ?? null,
    });
  }
  alertId += 1000 + templateAlerts.length;

  // ── Quote received (all open RFQs with submitted/unviewed quotes) ──
  const pendingQuotes = await db
    .select({
      quoteId: quotesTable.id,
      vendorName: quotesTable.vendorName,
      submittedAt: quotesTable.createdAt,
      rfqTitle: rfqsTable.title,
      rfqStatus: rfqsTable.status,
      rfqBuildingId: rfqsTable.buildingId,
      rfqDeadline: rfqsTable.deadline,
    })
    .from(quotesTable)
    .innerJoin(rfqsTable, eq(quotesTable.rfqId, rfqsTable.id))
    .where(
      and(
        eq(quotesTable.status, "submitted"),
        isNull(quotesTable.firstViewedAt),
        eq(rfqsTable.status, "open"),
        gte(rfqsTable.deadline, today),
        ...(restrictByBuilding ? [buildingFilter(rfqsTable.buildingId)] : []),
      ),
    );
  for (const q of pendingQuotes) {
    const deadlineStr = q.rfqDeadline ?? today;
    const deadlineDate = new Date(deadlineStr);
    const daysLeft = Math.floor((deadlineDate.getTime() - todayMs) / 86400000);
    const severity: BuiltAlert["severity"] =
      daysLeft <= 1 ? "critical" : daysLeft <= 3 ? "warning" : "info";
    alerts.push({
      id: alertId++,
      type: "quote_received",
      title: "견적 도착, 확인하세요",
      message: `[${q.rfqTitle}] ${q.vendorName} 업체가 견적을 제출했습니다. 즉시 확인 후 채택 여부를 결정해주세요.`,
      severity,
      relatedId: q.quoteId,
      hasDraft: false,
      actionStatus: null,
      dueDate: deadlineStr,
      penaltyInfo: null,
      createdAt: q.submittedAt?.toISOString() ?? new Date().toISOString(),
    });
  }

  // ── Notice posting templates (extended: ignore per-template leadDays cap) ──
  if (userBuildingId) {
    const scheduledTemplates = await db
      .select()
      .from(buildingNoticeTemplatesTable)
      .where(eq(buildingNoticeTemplatesTable.isActive, true));
    const buildingInspections = await db
      .select()
      .from(inspectionsTable)
      .where(eq(inspectionsTable.buildingId, userBuildingId));

    function pad2(n: number): string {
      return n < 10 ? `0${n}` : `${n}`;
    }
    function ymd(d: Date): string {
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }
    function nextYearlyOccurrence(month: number, day: number, todayStr: string): string {
      const t = new Date(todayStr);
      let candidate = new Date(t.getFullYear(), month - 1, day);
      if (ymd(candidate) < todayStr) {
        candidate = new Date(t.getFullYear() + 1, month - 1, day);
      }
      return ymd(candidate);
    }
    function nextMonthlyOccurrence(day: number, todayStr: string): string {
      const t = new Date(todayStr);
      let candidate = new Date(t.getFullYear(), t.getMonth(), day);
      if (ymd(candidate) < todayStr) {
        candidate = new Date(t.getFullYear(), t.getMonth() + 1, day);
      }
      return ymd(candidate);
    }

    for (const tpl of scheduledTemplates) {
      if (!tpl.scheduleType || tpl.scheduleType === "none") continue;
      const cfg = (tpl.scheduleConfig as Record<string, unknown> | null) ?? null;
      let occurrence: string | null = null;
      if (tpl.scheduleType === "yearly") {
        const month = Number(cfg?.month);
        const day = Number(cfg?.day);
        if (!Number.isFinite(month) || !Number.isFinite(day) || month < 1 || month > 12 || day < 1 || day > 31) continue;
        occurrence = nextYearlyOccurrence(month, day, today);
      } else if (tpl.scheduleType === "monthly") {
        const day = Number(cfg?.day);
        if (!Number.isFinite(day) || day < 1 || day > 31) continue;
        occurrence = nextMonthlyOccurrence(day, today);
      } else if (tpl.scheduleType === "before_inspection") {
        const inspectionName = typeof cfg?.inspectionName === "string" ? cfg.inspectionName : null;
        if (!inspectionName) continue;
        const matched = buildingInspections
          .filter((i) => i.name === inspectionName && i.nextDueDate >= today)
          .sort((a, b) => (a.nextDueDate < b.nextDueDate ? -1 : 1));
        if (matched.length === 0) continue;
        occurrence = matched[0].nextDueDate;
      }
      if (!occurrence) continue;

      const occMs = new Date(occurrence).getTime();
      const daysUntil = Math.ceil((occMs - todayMs) / 86400000);
      // [Task #413] leadDays cap 을 풀어 모든 예정 게시(>=today) 를 노출.
      if (daysUntil < 0) continue;

      const action = actionMap.get(`notice_posting:${tpl.id}:${userBuildingId}`);
      if (action) {
        if (action.actedOnDueDate && action.actedOnDueDate >= occurrence) continue;
        if (action.actionType === "completed" && action.completedDate && action.completedDate >= occurrence) continue;
        if (action.actionType === "postponed" && action.postponeDays) {
          const actionDate = new Date(action.createdAt);
          const suppressUntil = new Date(actionDate.getTime() + action.postponeDays * 86400000);
          if (new Date(today) < suppressUntil) continue;
        }
      }
      const dLabel = daysUntil === 0 ? " [D-Day]" : ` [D-${daysUntil}]`;
      const severity: BuiltAlert["severity"] =
        daysUntil <= 1 ? "critical" : daysUntil <= 3 ? "warning" : daysUntil <= 30 ? "warning" : "info";
      alerts.push({
        id: alertId++,
        type: "notice_posting",
        title: `${tpl.title} 게시 예정${dLabel}`,
        message: `${occurrence}까지 「${tpl.title}」 공지문을 입주민에게 게시해야 합니다. 처리완료를 누르면 본문이 채워진 양식이 열립니다.`,
        severity,
        relatedId: tpl.id,
        hasDraft: false,
        actionStatus: action?.actionType || null,
        dueDate: occurrence,
        penaltyInfo: null,
        createdAt: new Date().toISOString(),
      });
    }
  }

  return alerts;
}

// 대시보드와 동일한 분류 규칙으로 필수/제안 분리.
//   - 제안: task_template_suggested OR notice_posting OR (inspection_due && proposed inspectionType)
//   - 필수: 위 외의 모든 알림 (= legal/none inspection_due + tax + tasks + warranty + data_destruction +
//          task_template_mandatory + quote_received)
const PROPOSED_INSPECTION_TYPES = new Set([
  "self_regular",
  "biweekly",
  "seasonal",
  "administrative",
]);

function isSuggested(a: BuiltAlert): boolean {
  if (a.type === "task_template_suggested") return true;
  if (a.type === "notice_posting") return true;
  if (a.type === "inspection_due") {
    return !!a.inspectionType && PROPOSED_INSPECTION_TYPES.has(a.inspectionType);
  }
  return false;
}

function isMandatory(a: BuiltAlert): boolean {
  if (a.type === "task_template_suggested") return false;
  if (a.type === "notice_posting") return false;
  if (a.type === "inspection_due") {
    return a.inspectionType === "legal" || !a.inspectionType;
  }
  return true;
}

router.get("/facility/mandatory-tasks", async (req, res): Promise<void> => {
  const all = await buildAllUpcomingAlerts(req);
  res.json(all.filter(isMandatory));
});

router.get("/facility/suggested-tasks", async (req, res): Promise<void> => {
  const all = await buildAllUpcomingAlerts(req);
  res.json(all.filter(isSuggested));
});

export default router;
