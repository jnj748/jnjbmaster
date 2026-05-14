// 파트너 크레딧 원장(credit_ledger) 의 kind / source 영문 enum 을
//   사용자에게 보일 한글 라벨로 변환한다.
//   파트너 대시보드 / 크레딧 페이지 등에서 공통으로 사용한다.

export function ledgerKindLabel(k: string | null | undefined): string {
  switch (k) {
    case "consumption":
      return "차감";
    case "refund":
      return "환불";
    case "manual_credit":
      return "수동 충전";
    case "manual_debit":
      return "수동 차감";
    case "package_purchase":
      return "충전";
    case "rebate":
      return "리베이트";
    case "adjustment":
      return "조정";
    case "bonus_points":
      return "보너스 포인트";
    case "signup_bonus":
      return "가입 기본 지급";
    case "event_grant":
      return "이벤트 지급";
    default:
      return k ?? "-";
  }
}

export function ledgerSourceLabel(s: string | null | undefined): string {
  switch (s) {
    case "manual":
      return "수동";
    case "package_purchase":
      return "패키지 결제";
    case "quote_consumption":
      return "견적 차감";
    case "quote_refund":
      return "견적 환불";
    case "signup":
      return "가입 보너스";
    case "event":
      return "이벤트";
    default:
      return s ?? "";
  }
}
