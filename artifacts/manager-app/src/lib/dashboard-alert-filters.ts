// [Task #495] manager-main-widget 의 필수/제안 알림 분리 로직을 별도 함수로 추출.
//   원본 출처: dashboard-manager-legacy.tsx (Task #184/#221/#389).
// [Task #681] 경리(accountant)/시설(facility_staff) 대시보드의 "필수업무현황"
//   카드를 관리소장 패턴(같은 섹션·페이지네이션·D-day 신호등·액션 모달) 으로
//   통일하기 위해 split 함수가 role 인자를 받아 역할별로 다른 필터를 적용하도록
//   확장한다. role 미지정(=manager) 일 때는 기존 동작이 그대로 유지된다.
// [Task #697] 카테고리/타입 화이트리스트는 서버와 같은 SoT
//   (`@workspace/shared/role-routing`) 를 사용한다. 분류 우선순위:
//
//   1. `alert.targetRoles` 가 비어있지 않으면 **그 배열만 보고** 결정한다.
//      (= 본부/관리자 가 명시 지정한 역할 라우팅이 서버 추정보다 무조건 우선)
//   2. 비어있거나 누락이면 type/category/taskType 휴리스틱으로 폴백.
//
//   이렇게 분리해야 "이 알림은 시설기사 카드에서 빼고 소장만 봐라" 같은 명시
//   지정이 type 기반 fallback 에 묻혀 다시 시설기사 카드로 새는 회귀를 막을
//   수 있다.

import type { DashboardAlert } from "@/lib/alert-utils";
import {
  ACCOUNTING_TASK_CATEGORIES,
  ACCOUNTING_TASK_TYPES,
  FACILITY_TASK_CATEGORIES,
  FACILITY_TASK_TYPES,
} from "@workspace/shared/role-routing";

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

export interface SplitDashboardAlerts {
  legalAlerts: DashboardAlert[];
  proposedAlerts: DashboardAlert[];
}

// [Task #681] 역할 식별자. 필요한 세 역할만 지원하며 그 외/미지정은 manager 동작.
export type DashboardAlertRole = "manager" | "accountant" | "facility_staff";

/**
 * [Task #697] explicit `targetRoles` 만 보고 inclusion 을 결정한다.
 * 비어있거나 배열이 아니면 `null` 을 반환해 호출자가 휴리스틱 폴백으로 갈 수
 * 있도록 신호한다.
 */
function decideByTargetRoles(
  alert: DashboardAlert,
  role: DashboardAlertRole,
): boolean | null {
  const list = alert.targetRoles;
  if (!Array.isArray(list) || list.length === 0) return null;
  return list.includes(role);
}

// [Task #681/#697] 경리 카드 필터.
//   1) explicit targetRoles 가 있으면 그것만 본다 (포함되면 노출, 아니면 제외).
//   2) 없으면 type 기반 fallback:
//      - tax_due: 모두 노출 (세무 일정 = 경리의 핵심 업무)
//      - task_overdue / task_followup: tasks.category ∈ 회계 화이트리스트
//      - task_template_mandatory: 템플릿 taskType ∈ {accounting/fee}
//      - 그 외(시설 점검·하자·자료파기·공고문 등) 는 모두 제외
function isAccountantLegalAlert(alert: DashboardAlert): boolean {
  const explicit = decideByTargetRoles(alert, "accountant");
  if (explicit !== null) return explicit;

  if (alert.type === "tax_due") return true;
  if (alert.type === "task_overdue" || alert.type === "task_followup") {
    const cat = alert.category ?? null;
    return !!cat && ACCOUNTING_TASK_CATEGORIES.has(cat);
  }
  if (alert.type === "task_template_mandatory") {
    const tt = alert.taskType ?? null;
    return !!tt && ACCOUNTING_TASK_TYPES.has(tt);
  }
  return false;
}

// [Task #681/#697] 시설 카드 필터.
//   1) explicit targetRoles 가 있으면 그것만 본다.
//   2) 없으면 type 기반 fallback:
//      - inspection_due: administrative 외 모두 노출
//        (시설 대시보드는 "필수업무현황" 단일 섹션만 사용. administrative 는
//         소장 단독 영역으로 간주.)
//      - warranty_expiry: 모두 노출
//      - task_template_mandatory: taskType ∈ 시설 화이트리스트
//      - task_overdue / task_followup: category ∈ 시설 화이트리스트
//        (category=null/other 처럼 모호한 항목은 시설 카드로 새지 않게 한다.)
//      - 그 외(tax_due·data_destruction·공고문 등) 는 제외
function isFacilityLegalAlert(alert: DashboardAlert): boolean {
  const explicit = decideByTargetRoles(alert, "facility_staff");
  if (explicit !== null) return explicit;

  if (alert.type === "inspection_due") {
    return alert.inspectionType !== "administrative";
  }
  if (alert.type === "warranty_expiry") return true;
  if (alert.type === "task_template_mandatory") {
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
