// 계약 갱신 알림 공통 상수 — Task #369 → Task #416
//
// [Task #416] 단일 75일 임계값 → 90일~60일 "검토 윈도우" 로 전환.
//   - 만료 90일 전부터 "계약연장검토" 항목으로 노출되기 시작하고,
//   - 만료 60일에 도달하면(=window 종료) 자동으로 사라진다.
//   - 60일 미만은 너무 촉박해 별도 트랙(결재/재입찰 마감)으로 다루므로
//     이 윈도우의 "검토" 안내에서는 빠진다.
//
// 단일 진실 공급원: 서버 알림 잡(`/contracts/check-renewal-alerts`),
// /contracts 페이지 만료 임박 배너/필터, 대시보드 "건물관련 계약현황"
// 위젯, 신규 "협력업체 주소록" 페이지가 모두 이 파일의 헬퍼로 같은 윈도우를 본다.

/** 검토 윈도우가 열리는 일수 (만료 D-day 기준 양수). 90일 이전이면 윈도우 밖. */
export const RENEWAL_REVIEW_WINDOW_START_DAYS = 90;

/** 검토 윈도우가 닫히는 일수. 만료 60일 이내가 되면 자동으로 사라진다. */
export const RENEWAL_REVIEW_WINDOW_END_DAYS = 60;

/** "만료 3개월~2개월 전 검토" 한국어 라벨. */
export const RENEWAL_REVIEW_WINDOW_LABEL = "만료 3개월~2개월 전";

/**
 * @deprecated [Task #416] 75일 단일 임계값은 폐지. 새 윈도우(90→60일) 헬퍼를 사용하세요.
 *   임시로 새 윈도우의 "시작일(90)" 으로 매핑해 호환성만 유지합니다.
 *   기존 import 가 정리되면 제거 예정.
 */
export const CONTRACT_RENEWAL_ALERT_THRESHOLD_DAYS: number = RENEWAL_REVIEW_WINDOW_START_DAYS;

/**
 * @deprecated [Task #416] 75일 라벨("2개월 15일") 은 폐지. 새 윈도우 라벨을 사용하세요.
 */
export const CONTRACT_RENEWAL_ALERT_THRESHOLD_LABEL: string = RENEWAL_REVIEW_WINDOW_LABEL;

/**
 * 오늘 자정 기준 endDate 까지 남은 일수. endDate 가 null/undefined/잘못된 형식이면 null.
 * 음수면 이미 만료. YYYY-MM-DD 또는 ISO 문자열 모두 허용.
 */
export function daysUntilDate(endDate: string | null | undefined): number | null {
  if (!endDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  if (Number.isNaN(end.getTime())) return null;
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * "계약연장검토" 윈도우가 활성인지(=만료 90일 이전부터 60일 초과까지) 판단.
 *   - 90 ≥ 남은일수 > 60  → true
 *   - 그 외(미만/이상/null) → false
 *
 * 60일 이하로 진입하면 자동으로 false 가 되어 호출부가 별도 처리 없이
 * 안내 배너에서 빠진다.
 */
export function isRenewalReviewActive(endDate: string | null | undefined): boolean {
  const d = daysUntilDate(endDate);
  if (d == null) return false;
  return d <= RENEWAL_REVIEW_WINDOW_START_DAYS && d > RENEWAL_REVIEW_WINDOW_END_DAYS;
}

/**
 * 계약 status 가 "검토 윈도우" 의 잠재적 대상인지.
 *   서버 알림 잡은 active/in_progress 두 상태를 후보로 잡고, 한 번 알림이 가면
 *   renewal_due 로 전이시킨다(중복 발송 방지). 클라이언트 배너는
 *   active/in_progress/renewal_due 모두 같은 "검토 항목" 으로 묶는다.
 *   draft, in_approval 은 아직 체결 전이라 검토 대상이 아니고, completed/terminated
 *   는 종결돼서 후보가 아니다.
 *
 *   서버/클라이언트 모두 이 함수를 통해 같은 상태 기준을 본다(SoT).
 */
export function isRenewalReviewCandidateStatus(
  status: string | null | undefined,
): boolean {
  return status === "active" || status === "in_progress" || status === "renewal_due";
}

/**
 * "검토 윈도우" 안에 들어온 활성 계약 1건인지.
 *   상태(active/in_progress/renewal_due) + 윈도우(90~60일) 양쪽을 모두 만족해야 true.
 *   호출부는 이 한 줄로 배너/위젯/주소록의 검토 대상 판정을 끝낸다.
 */
export function isContractInRenewalReviewWindow(contract: {
  status?: string | null;
  endDate?: string | null;
}): boolean {
  if (!isRenewalReviewCandidateStatus(contract.status)) return false;
  return isRenewalReviewActive(contract.endDate);
}

// 알림 본문 / 배너 메시지 단일 포맷.
//   "○○계약이 연장여부 검토해야 합니다. YYYY-MM-DD 기준으로 자동 연장됩니다"
// title 은 계약 제목, endDate 는 YYYY-MM-DD 문자열을 그대로 받는다.
export function formatContractRenewalReviewMessage(opts: {
  title: string;
  endDate: string;
}): string {
  return `${opts.title}계약이 연장여부 검토해야 합니다. ${opts.endDate} 기준으로 자동 연장됩니다`;
}
