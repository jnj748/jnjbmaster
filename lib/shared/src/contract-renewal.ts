// 계약 갱신 알림 공통 상수 — Task #369
//
// 만료까지 남은 일수가 이 값 이하인 활성 계약에 대해 갱신 검토 알림을
// 발송하고, /contracts 페이지의 "만료 임박" 배너 / 필터·체크박스 기본값
// 으로도 사용된다. 서버(`api-server`)와 클라이언트(`manager-app`,
// 대시보드 위젯) 모두 이 단일 상수를 import 해 같은 임계값을 본다.
//
// 운영 결정으로 임계값을 바꿀 때는 이 파일만 고치면 백엔드 알림 잡과
// 프런트엔드 배너/필터가 동시에 반영된다.
export const CONTRACT_RENEWAL_ALERT_THRESHOLD_DAYS = 75;

// 알림 본문 / 배너 메시지 단일 포맷.
//   "○○계약이 연장여부 검토해야 합니다. YYYY-MM-DD 기준으로 자동 연장됩니다"
// title 은 계약 제목, endDate 는 YYYY-MM-DD 문자열을 그대로 받는다.
export function formatContractRenewalReviewMessage(opts: {
  title: string;
  endDate: string;
}): string {
  return `${opts.title}계약이 연장여부 검토해야 합니다. ${opts.endDate} 기준으로 자동 연장됩니다`;
}

// "만료 N일 이내만" 식 라벨 — 같은 임계값을 한국어로 표기.
//   현재 75일 = "2개월 15일"
export const CONTRACT_RENEWAL_ALERT_THRESHOLD_LABEL = "2개월 15일";
