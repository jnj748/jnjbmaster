import { Redirect } from "wouter";

// [Task #801] 계정과목 — 기존 회계 허브의 계정과목 탭으로 위임.
export default function AccountingCoaPage() {
  return <Redirect to="/erp/accounting?tab=coa" />;
}
