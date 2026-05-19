// [Phase 1] 관리소장 대시보드 — 목업 기준 카드 순서·구성.

import ManagerWorkLogCard from "./manager-work-log-card";
import ManagerNoticeFormCard from "./manager-notice-form-card";
import ManagerAiQuoteRow from "./manager-ai-quote-row";

export default function ManagerMainWidget() {
  return (
    <div className="space-y-3" data-testid="manager-main-widget">
      <ManagerWorkLogCard />
      <ManagerNoticeFormCard />
      <ManagerAiQuoteRow />
    </div>
  );
}
