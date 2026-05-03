import { Redirect } from "wouter";

// [Task #801] 월마감 — T9 마감·보고엔진(/erp/closings) 으로 위임.
export default function AccountingMonthClosePage() {
  return <Redirect to="/erp/closings" />;
}
