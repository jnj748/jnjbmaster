// [Task #669] 시설담당 대시보드 좌측 2행에서 "최근문서함"과 "처리 내역"을 한 셀
//   안에 위·아래로 묶어 보여주는 thin wrapper 위젯. 우측 셀의 "오늘 업무일지"
//   강조 카드(prominent variant) 와 시각적 높이를 맞추기 위해 같은 half 그리드
//   셀 안에서 두 진입 카드를 세로 스택으로 배치한다.
//
//   각 카드 자체의 권한 체크/노출 로직은 기존 위젯 그대로 재사용해 노출 조건이
//   한 곳에서 관리되도록 한다(권한 없으면 각 카드가 null 을 반환).

import RecentDocumentsEntryWidget from "./recent-documents-entry-widget";
import WorkLogActivityEntryWidget from "./work-log-activity-entry-widget";

export default function FacilityLeftColumnStackWidget() {
  return (
    <div
      data-testid="facility-left-column-stack-widget"
      className="h-full flex flex-col gap-2"
    >
      <RecentDocumentsEntryWidget />
      <WorkLogActivityEntryWidget />
    </div>
  );
}
