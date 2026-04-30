// [Task #495] manager-main-widget 의 필수/제안 알림 분리 로직을 별도 함수로 추출.
//   원본 출처: dashboard-manager-legacy.tsx (Task #184/#221/#389).
// [Task #681] 경리(accountant)/시설(facility_staff) 대시보드의 "필수업무현황"
//   카드를 관리소장 패턴(같은 섹션·페이지네이션·D-day 신호등·액션 모달) 으로
//   통일하기 위해 split 함수가 role 인자를 받아 역할별로 다른 필터를 적용하도록
//   확장한다. role 미지정(=manager) 일 때는 기존 동작이 그대로 유지된다.

import type { DashboardAlert } from "@/lib/alert-utils";

// [Task #184] 점검 알림을 inspectionType 기준으로 분리한다.
//  - 필수업무현황: legal 점검 + 비점검 알림(세무·기한초과·하자만료·자료파기 등)
//  - 제안업무현황: self_regular / biweekly / seasonal / administrative 점검
// 분류는 클라이언트에서 수행하며, 알림 발생 로직(주기/임계치)은 그대로다.
const PROPOSED_INSPECTION_TYPES = new Set([
  "self_regular",
  "biweekly",
  "seasonal",
  "administrative",
]);

// [Task #681] 역할별 필터에 사용하는 카테고리/유형 집합. 한 곳에서 관리한다.
const ACCOUNTING_TASK_CATEGORIES = new Set(["accounting", "tax", "finance"]);
const ACCOUNTING_TASK_TYPES = new Set(["accounting", "fee"]);
const FACILITY_TASK_TYPES = new Set(["facility", "security", "cleaning"]);
// [Task #681 코드리뷰 반영] 시설 task_overdue/task_followup 필터를 "회계 제외"
//   negative 방식에서 "시설 카테고리 화이트리스트" positive 방식으로 변경한다.
//   범위가 모호한 category=null/other 항목이 시설 카드로 새는 회귀를 막기 위함.
const FACILITY_TASK_CATEGORIES = new Set([
  "facility",
  "security",
  "cleaning",
  "maintenance",
  "inspection",
  "safety",
]);

export interface SplitDashboardAlerts {
  legalAlerts: DashboardAlert[];
  proposedAlerts: DashboardAlert[];
}

// [Task #681] 역할 식별자. 필요한 세 역할만 지원하며 그 외/미지정은 manager 동작.
export type DashboardAlertRole = "manager" | "accountant" | "facility_staff";

function targetRolesIncludes(
  alert: DashboardAlert,
  role: DashboardAlertRole,
): boolean {
  const list = alert.targetRoles;
  if (!Array.isArray(list) || list.length === 0) return false;
  return list.includes(role);
}

// [Task #681] 경리 카드 필터.
//   - tax_due: 모두 노출 (세무 일정 = 경리의 핵심 업무)
//   - task_overdue / task_followup: tasks.category ∈ {accounting/tax/finance} 만
//   - task_template_mandatory: 템플릿 taskType ∈ {accounting/fee} 또는
//     targetRoles 에 accountant 가 포함된 경우만
//   - 그 외(시설 점검·하자·자료파기·공고문 등) 는 모두 제외
function isAccountantLegalAlert(alert: DashboardAlert): boolean {
  if (alert.type === "tax_due") return true;
  if (alert.type === "task_overdue" || alert.type === "task_followup") {
    const cat = alert.category ?? null;
    return !!cat && ACCOUNTING_TASK_CATEGORIES.has(cat);
  }
  if (alert.type === "task_template_mandatory") {
    if (targetRolesIncludes(alert, "accountant")) return true;
    const tt = alert.taskType ?? null;
    return !!tt && ACCOUNTING_TASK_TYPES.has(tt);
  }
  return false;
}

// [Task #681] 시설 카드 필터.
//   - inspection_due: 모두 노출 (legal/self_regular/biweekly/seasonal/administrative
//     모두 시설담당의 시야에 들어가야 한다. 시설 대시보드는 "필수업무현황" 단일
//     섹션만 사용하므로, 매니저처럼 legal vs self_regular 를 분리하지 않는다).
//   - warranty_expiry: 모두 노출 (하자 만료 = 시설 핵심 업무)
//   - task_template_mandatory: 템플릿 taskType ∈ {facility/security/cleaning}
//     또는 targetRoles 에 facility_staff 포함된 경우만
//   - task_overdue / task_followup: tasks.category ∈ {facility/security/cleaning/
//     maintenance/inspection/safety} 인 것만 (시설 카테고리 화이트리스트).
//     category=null/other 처럼 모호한 항목은 시설 카드로 새지 않게 한다.
//   - 그 외(tax_due·data_destruction·공고문 등) 는 제외
function isFacilityLegalAlert(alert: DashboardAlert): boolean {
  if (alert.type === "inspection_due") return true;
  if (alert.type === "warranty_expiry") return true;
  if (alert.type === "task_template_mandatory") {
    if (targetRolesIncludes(alert, "facility_staff")) return true;
    const tt = alert.taskType ?? null;
    return !!tt && FACILITY_TASK_TYPES.has(tt);
  }
  if (alert.type === "task_overdue" || alert.type === "task_followup") {
    const cat = alert.category ?? null;
    return !!cat && FACILITY_TASK_CATEGORIES.has(cat);
  }
  return false;
}

export function splitDashboardAlerts(
  alerts: DashboardAlert[] | null | undefined,
  role: DashboardAlertRole = "manager",
): SplitDashboardAlerts {
  const alertList: DashboardAlert[] = (alerts ?? []) as DashboardAlert[];

  if (role === "accountant") {
    // [Task #681] 경리 카드는 제안업무 섹션을 사용하지 않는다(빈 배열).
    return {
      legalAlerts: alertList.filter(isAccountantLegalAlert),
      proposedAlerts: [],
    };
  }
  if (role === "facility_staff") {
    // [Task #681] 시설 카드도 제안업무는 별도 위젯이 처리하므로 빈 배열 반환.
    return {
      legalAlerts: alertList.filter(isFacilityLegalAlert),
      proposedAlerts: [],
    };
  }

  // [Task #221] 본사 관리 업무 템플릿 알림은 type=task_template_mandatory/
  // task_template_suggested 로 동일 응답에 포함된다. 필수업무는 법정 점검과
  // task_template_mandatory 를, 제안업무는 자체점검 계열과 task_template_suggested
  // 를 같은 섹션에 노출한다.
  const legalAlerts = alertList.filter((a) => {
    if (a.type === "task_template_suggested") return false;
    if (a.type === "inspection_due") {
      return a.inspectionType === "legal" || !a.inspectionType;
    }
    return true;
  });
  const proposedAlerts = alertList.filter((a) => {
    if (a.type === "task_template_suggested") return true;
    // [Task #389] 공고문 게시 자동알림은 제안업무 섹션에 노출.
    if (a.type === "notice_posting") return true;
    if (a.type === "inspection_due") {
      return (
        !!a.inspectionType && PROPOSED_INSPECTION_TYPES.has(a.inspectionType)
      );
    }
    return false;
  });
  return { legalAlerts, proposedAlerts };
}
