import { Redirect } from "wouter";

// [Task #801] 전표 조회 — 회계 허브의 분개장 탭으로 위임.
export default function AccountingJournalSearchPage() {
  return <Redirect to="/erp/accounting?tab=journal" />;
}
