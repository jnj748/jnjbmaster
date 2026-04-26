// [Task #413] 시설관리 → "필수업무" 페이지.
//   /facility/mandatory-tasks. 사용자 건물의 모든 필수(법정) 알림을
//   60일 컷오프 없이 노출하고, 기한·유형·검색 필터로 좁혀본다.
//   알림 카드 클릭은 대시보드와 동일한 처리 다이얼로그(AlertActionDialog)를 연다.

import { useGetFacilityMandatoryTasks } from "@workspace/api-client-react";
import { FacilityTaskList } from "@/components/facility-task-list";
import type { DashboardAlert } from "@/lib/alert-utils";

export default function FacilityMandatoryTasksPage() {
  const { data, isLoading } = useGetFacilityMandatoryTasks();
  return (
    <FacilityTaskList
      pageTitle="필수업무"
      pageDescription="법정 의무 업무 — 미처리 시 과태료가 발생할 수 있습니다."
      sectionKind="mandatory"
      alerts={(data as DashboardAlert[] | undefined) ?? undefined}
      loading={isLoading}
    />
  );
}
