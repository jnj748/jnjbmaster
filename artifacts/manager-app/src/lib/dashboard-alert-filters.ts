// [Task #495] manager-main-widget 의 필수/제안 알림 분리 로직을 별도 함수로 추출.
//   원본 출처: dashboard-manager-legacy.tsx (Task #184/#221/#389).

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

export interface SplitDashboardAlerts {
  legalAlerts: DashboardAlert[];
  proposedAlerts: DashboardAlert[];
}

export function splitDashboardAlerts(
  alerts: DashboardAlert[] | null | undefined,
): SplitDashboardAlerts {
  const alertList: DashboardAlert[] = (alerts ?? []) as DashboardAlert[];
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
