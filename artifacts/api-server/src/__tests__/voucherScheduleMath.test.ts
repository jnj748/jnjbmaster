import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { monthDiff, addMonths, computeRoundAmount, expectedRound } from "../lib/voucherScheduleMath.js";

// [Task #793] 분할부과 회차 인식 헬퍼 단위 테스트.
//   - 마지막 회차에서 라운딩 잔여를 흡수해 합계가 totalAmount 와 정확히 일치
//   - expectedRound 가 catch-up(여러 달 누락 후 한 번에 진행) 시나리오를 정확히 산출
//   - 동일 currentMonth 에서 expectedRound 는 변하지 않음(멱등 보장)

describe("voucherScheduleMath (#793)", () => {
  it("monthDiff returns signed month difference", () => {
    assert.equal(monthDiff("2026-01", "2026-04"), 3);
    assert.equal(monthDiff("2026-04", "2026-01"), -3);
    assert.equal(monthDiff("2025-11", "2026-02"), 3);
  });

  it("addMonths handles year/month rollover via UTC anchor", () => {
    assert.equal(addMonths("2026-01", 0), "2026-01");
    assert.equal(addMonths("2026-01", 11), "2026-12");
    assert.equal(addMonths("2026-01", 12), "2027-01");
    assert.equal(addMonths("2026-11", 3), "2027-02");
  });

  it("computeRoundAmount: 마지막 회차가 라운딩 잔여를 흡수해 합계가 totalAmount", () => {
    const total = 100_000;
    const months = 3;
    const monthly = Math.round(total / months); // 33,333
    const sum =
      computeRoundAmount(1, months, total, monthly) +
      computeRoundAmount(2, months, total, monthly) +
      computeRoundAmount(3, months, total, monthly);
    assert.equal(sum, total, "회차별 인식액 합계가 totalAmount 와 같아야 한다");
    // 첫·중간 회차는 monthly, 마지막은 잔액.
    assert.equal(computeRoundAmount(1, months, total, monthly), monthly);
    assert.equal(computeRoundAmount(3, months, total, monthly), total - monthly * (months - 1));
  });

  it("computeRoundAmount: 정확히 나누어 떨어지는 경우에도 합계 보존", () => {
    const sum =
      computeRoundAmount(1, 4, 200_000, 50_000) +
      computeRoundAmount(2, 4, 200_000, 50_000) +
      computeRoundAmount(3, 4, 200_000, 50_000) +
      computeRoundAmount(4, 4, 200_000, 50_000);
    assert.equal(sum, 200_000);
  });

  it("expectedRound: catch-up — 여러 달 누락 시 expected 가 누적 회차를 반환", () => {
    // start 2026-01, current 2026-04 → 4개 회차까지 진행되어야 함.
    assert.equal(expectedRound("2026-01", "2026-04", 12), 4);
    // months 상한 적용.
    assert.equal(expectedRound("2026-01", "2026-12", 6), 6);
    // startMonth 가 미래면 0 (진행 X).
    assert.equal(expectedRound("2026-06", "2026-04", 12), 0);
    // 동일 월: 1회차만 진행.
    assert.equal(expectedRound("2026-04", "2026-04", 12), 1);
  });

  it("멱등성: 동일 currentMonth 에서 expectedRound 는 변하지 않는다", () => {
    const a = expectedRound("2026-01", "2026-03", 6);
    const b = expectedRound("2026-01", "2026-03", 6);
    assert.equal(a, b);
    assert.equal(a, 3);
  });
});
