// [Task #793] 분할부과 회차 인식 — 순수 함수 헬퍼.
//
// 스케줄러(`scheduler.ts`)와 분리해 단위 테스트가 가능하도록 발췌. db 의존성이 없다.
//   - monthDiff: YYYY-MM 두 값의 월 차이 (b - a)
//   - addMonths: YYYY-MM 에 n 개월 더한 결과 (UTC 기준 1일 anchor)
//   - computeRoundAmount: 회차별 인식액. 마지막 회차에서 라운딩 잔여를 흡수해
//     선급비용(1200) 잔액이 정확히 0 이 되도록 보정한다.

export function monthDiff(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}

export function addMonths(yyyymm: string, n: number): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function computeRoundAmount(round: number, months: number, totalAmount: number, monthlyAmount: number): number {
  if (round < 1 || round > months) return 0;
  if (round < months) return monthlyAmount;
  // 마지막 회차: 라운딩 누락분을 흡수.
  return Math.max(0, totalAmount - monthlyAmount * (months - 1));
}

/** active 스케줄 1건이 currentMonth 까지 진행해야 할 회차 수(expectedRound). */
export function expectedRound(startMonth: string, currentMonth: string, months: number): number {
  const diff = monthDiff(startMonth, currentMonth);
  if (diff < 0) return 0;
  return Math.min(diff + 1, months);
}
