// [Task #502] 건축물대장 useAprDay → approvalDate(YYYY-MM-DD) 정규화 회귀 테스트.
//   register-lookup 라우트가 응답에 approvalDate(ISO) 와 completionDate(YYYYMMDD 원본)
//   를 함께 노출해야 위저드가 buildings.approvalDate 를 자동으로 채울 수 있다.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatUseAprDayToIso } from "../routes/buildings/register-lookup.js";

describe("formatUseAprDayToIso (#502)", () => {
  it("8자리 숫자 useAprDay → ISO YYYY-MM-DD", () => {
    assert.equal(formatUseAprDayToIso("20180315"), "2018-03-15");
    assert.equal(formatUseAprDayToIso("19980101"), "1998-01-01");
    assert.equal(formatUseAprDayToIso("20251231"), "2025-12-31");
  });

  it("빈 문자열/잘못된 형식 → 빈 문자열 (안전 폴백)", () => {
    assert.equal(formatUseAprDayToIso(""), "");
    assert.equal(formatUseAprDayToIso("2018-03-15"), ""); // 이미 ISO 형식이지만 8자리 아님
    assert.equal(formatUseAprDayToIso("201803"), "");
    assert.equal(formatUseAprDayToIso("not-a-date"), "");
  });

  it("문자열이 아니면 → 빈 문자열", () => {
    assert.equal(formatUseAprDayToIso(null), "");
    assert.equal(formatUseAprDayToIso(undefined), "");
    assert.equal(formatUseAprDayToIso(20180315), ""); // number 거부 (외부 응답은 항상 string)
  });

  it("앞뒤 공백은 trim 후 검증한다", () => {
    assert.equal(formatUseAprDayToIso(" 20180315 "), "2018-03-15");
  });
});
