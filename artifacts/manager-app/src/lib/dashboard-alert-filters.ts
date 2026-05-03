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
import { alertMatchesRole } from "@workspace/shared/role-routing";

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

export function splitDashboardAlerts(
  alerts: DashboardAlert[] | null | undefined,
  role: DashboardAlertRole = "manager",
): SplitDashboardAlerts {
  const alertList: DashboardAlert[] = (alerts ?? []) as DashboardAlert[];

  if (role === "accountant") {
    // [Task #681/#742] 경리 카드는 제안업무 섹션을 사용하지 않는다(빈 배열).
    //   분류 규칙은 `@workspace/shared/role-routing` 의 `alertMatchesRole` 단일 SoT.
    return {
      legalAlerts: alertList.filter((a) => alertMatchesRole(a, "accountant")),
      proposedAlerts: [],
    };
  }
  if (role === "facility_staff") {
    // [Task #681/#742] 시설 카드도 제안업무는 별도 위젯이 처리하므로 빈 배열 반환.
    return {
      legalAlerts: alertList.filter((a) => alertMatchesRole(a, "facility_staff")),
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
