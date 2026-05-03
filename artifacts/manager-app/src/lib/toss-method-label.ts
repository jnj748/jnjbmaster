// [Task #760] 토스 통합결제창에서 반환되는 `method` 값을 사람이 읽기 쉬운 한국어 라벨로
// 변환한다. 토스는 결제 confirm 응답에 한국어 문자열(예: "카드", "간편결제", "계좌이체",
// "가상계좌", "휴대폰", "상품권")을 내려주지만, 일부 환경에서는 영문 코드가 그대로 들어올
// 수 있어 양쪽 모두 매핑한다.
export function tossMethodLabel(m: string | null | undefined): string {
  if (!m) return "-";
  const map: Record<string, string> = {
    카드: "카드",
    간편결제: "간편결제",
    계좌이체: "계좌이체",
    가상계좌: "가상계좌",
    휴대폰: "휴대폰",
    상품권: "상품권",
    문화상품권: "문화상품권",
    도서문화상품권: "도서문화상품권",
    게임문화상품권: "게임문화상품권",
    CARD: "카드",
    TRANSFER: "계좌이체",
    VIRTUAL_ACCOUNT: "가상계좌",
    MOBILE_PHONE: "휴대폰",
    EASY_PAY: "간편결제",
    FOREIGN_EASY_PAY: "간편결제",
    CULTURE_GIFT_CERTIFICATE: "문화상품권",
    BOOK_GIFT_CERTIFICATE: "도서문화상품권",
    GAME_GIFT_CERTIFICATE: "게임문화상품권",
  };
  return map[m] ?? m;
}
