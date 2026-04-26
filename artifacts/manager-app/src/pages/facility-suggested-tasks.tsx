// [Task #413] 시설관리 → "제안업무" 페이지.
//   /facility/suggested-tasks. 사용자 건물의 모든 제안 알림(자체 점검·계절 제안·
//   공고문 게시·제안 업무 템플릿 등)을 노출하고, 기한·유형·검색 필터로 좁혀본다.
//   알림 카드 클릭은 대시보드와 동일한 처리 다이얼로그(AlertActionDialog)를 연다.

import { useGetFacilitySuggestedTasks } from "@workspace/api-client-react";
import { FacilityTaskList } from "@/components/facility-task-list";
import type { DashboardAlert } from "@/lib/alert-utils";

export default function FacilitySuggestedTasksPage() {
  const { data, isLoading } = useGetFacilitySuggestedTasks();
  return (
    <FacilityTaskList
      pageTitle="제안업무"
      pageDescription="권장 업무 — 건물 컨디션을 유지하기 위한 비법정 업무입니다."
      sectionKind="suggested"
      alerts={(data as DashboardAlert[] | undefined) ?? undefined}
      loading={isLoading}
    />
  );
}
