// [Task #434] 한국 표준 전화번호 / 사업자등록번호 포맷터 단위 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractDigits,
  formatBusinessNumber,
  formatKoreanCurrencyCompact,
  formatPhoneNumber,
  formatPhoneNumberPartial,
  phoneToTelHref,
} from "./format-korean";

test("extractDigits: 숫자만 추출", () => {
  assert.equal(extractDigits("010-1234-5678"), "01012345678");
  assert.equal(extractDigits("(02) 123 4567"), "021234567");
  assert.equal(extractDigits(""), "");
  assert.equal(extractDigits(null), "");
  assert.equal(extractDigits(undefined), "");
  assert.equal(extractDigits("abc!@#"), "");
});

test("formatPhoneNumber: 02 서울 9자리 / 10자리", () => {
  assert.equal(formatPhoneNumber("021234567"), "02-123-4567");
  assert.equal(formatPhoneNumber("0212345678"), "02-1234-5678");
});

test("formatPhoneNumber: 02 서울 부분 입력", () => {
  assert.equal(formatPhoneNumber("0"), "0");
  assert.equal(formatPhoneNumber("02"), "02");
  assert.equal(formatPhoneNumber("021"), "02-1");
  assert.equal(formatPhoneNumber("0212"), "02-12");
  assert.equal(formatPhoneNumber("02123"), "02-123");
  assert.equal(formatPhoneNumber("021234"), "02-123-4");
});

test("formatPhoneNumber: 지역번호(031~064) 10자리 / 11자리", () => {
  assert.equal(formatPhoneNumber("0311234567"), "031-123-4567");
  assert.equal(formatPhoneNumber("03112345678"), "031-1234-5678");
  assert.equal(formatPhoneNumber("0641234567"), "064-123-4567");
  assert.equal(formatPhoneNumber("0421234567"), "042-123-4567");
});

test("formatPhoneNumber: 010 휴대폰 11자리 / 10자리(구번호)", () => {
  assert.equal(formatPhoneNumber("01012345678"), "010-1234-5678");
  assert.equal(formatPhoneNumber("0101234567"), "010-123-4567");
});

test("formatPhoneNumber: 011/016~019 구 휴대폰 10자리", () => {
  assert.equal(formatPhoneNumber("0111234567"), "011-123-4567");
  assert.equal(formatPhoneNumber("0191234567"), "019-123-4567");
});

test("formatPhoneNumber: 070 인터넷전화 10/11자리", () => {
  assert.equal(formatPhoneNumber("07012345678"), "070-1234-5678");
  assert.equal(formatPhoneNumber("0701234567"), "070-123-4567");
});

test("formatPhoneNumber: 050X 개인번호 11/12자리", () => {
  assert.equal(formatPhoneNumber("05012345678"), "0501-234-5678");
  assert.equal(formatPhoneNumber("050612345678"), "0506-1234-5678");
  assert.equal(formatPhoneNumber("05061234567"), "0506-123-4567");
});

test("formatPhoneNumber: 080 수신자부담 9/10자리", () => {
  assert.equal(formatPhoneNumber("080123456"), "080-123-456");
  assert.equal(formatPhoneNumber("0801234567"), "080-123-4567");
});

test("formatPhoneNumber: 1588/1577/1644/1566/1899 대표번호 8자리", () => {
  assert.equal(formatPhoneNumber("15880000"), "1588-0000");
  assert.equal(formatPhoneNumber("15771234"), "1577-1234");
  assert.equal(formatPhoneNumber("16440000"), "1644-0000");
  assert.equal(formatPhoneNumber("15660000"), "1566-0000");
  assert.equal(formatPhoneNumber("18990000"), "1899-0000");
});

test("formatPhoneNumber: 대표번호 부분 입력 (4자리 prefix 단독)", () => {
  assert.equal(formatPhoneNumber("1588"), "1588");
  assert.equal(formatPhoneNumber("15880"), "1588-0");
});

test("formatPhoneNumber: 점진적 입력 (010 한 자씩 증가)", () => {
  const seq = [
    "0", "01", "010", "0101", "01012", "010123", "0101234",
    "01012345", "010123456", "0101234567", "01012345678",
  ];
  const expected = [
    "0", "01", "010", "010-1", "010-12", "010-123", "010-123-4",
    "010-123-45", "010-123-456", "010-123-4567", "010-1234-5678",
  ];
  // 길이 6 이하일 땐 010-XXX 단계까지가 자연스럽고, 7~10 자리에서는 구번호
  // 패턴(010-XXX-XXXX)에 잠시 머무르다 11자리에서 010-XXXX-XXXX 로 정착.
  for (let i = 0; i < seq.length; i++) {
    assert.equal(formatPhoneNumber(seq[i]), expected[i], `step ${i}: ${seq[i]}`);
  }
});

test("formatPhoneNumber: 입력에 포함된 잘못된 문자/하이픈 무시", () => {
  assert.equal(formatPhoneNumber("010-1234-5678"), "010-1234-5678");
  assert.equal(formatPhoneNumber("(010) 1234.5678"), "010-1234-5678");
  assert.equal(formatPhoneNumber("abc010def1234ghi5678"), "010-1234-5678");
  assert.equal(formatPhoneNumber(""), "");
});

test("formatPhoneNumber: 12자리 초과 입력은 잘라낸다", () => {
  assert.equal(formatPhoneNumber("0506123456789999"), "0506-1234-5678");
});

test("formatPhoneNumber: 알 수 없는 prefix 는 베스트에포트(휴대폰 패턴)", () => {
  assert.equal(formatPhoneNumber("99912345678"), "999-1234-5678");
  assert.equal(formatPhoneNumber("9991234567"), "999-123-4567");
});

test("formatPhoneNumberPartial 는 formatPhoneNumber 와 동일 결과", () => {
  for (const v of ["010", "0101234", "01012345678", "021234567", "1588"]) {
    assert.equal(formatPhoneNumberPartial(v), formatPhoneNumber(v));
  }
});

test("formatBusinessNumber: 10자리 표준 형식", () => {
  assert.equal(formatBusinessNumber("1234567890"), "123-45-67890");
  assert.equal(formatBusinessNumber("123-45-67890"), "123-45-67890");
});

test("formatBusinessNumber: 부분 입력에서도 점진적 하이픈", () => {
  assert.equal(formatBusinessNumber(""), "");
  assert.equal(formatBusinessNumber("1"), "1");
  assert.equal(formatBusinessNumber("123"), "123");
  assert.equal(formatBusinessNumber("1234"), "123-4");
  assert.equal(formatBusinessNumber("12345"), "123-45");
  assert.equal(formatBusinessNumber("123456"), "123-45-6");
  assert.equal(formatBusinessNumber("1234567"), "123-45-67");
});

test("formatBusinessNumber: 10자리 초과는 잘라낸다", () => {
  assert.equal(formatBusinessNumber("12345678901234"), "123-45-67890");
});

test("formatBusinessNumber: 영문/특수문자는 무시", () => {
  assert.equal(formatBusinessNumber("abc123-45def67890!"), "123-45-67890");
});

test("phoneToTelHref: 숫자만 반환", () => {
  assert.equal(phoneToTelHref("010-1234-5678"), "01012345678");
  assert.equal(phoneToTelHref("02-123-4567"), "021234567");
  assert.equal(phoneToTelHref(null), "");
});

// [Task #715]
test("formatKoreanCurrencyCompact: 1만원 미만은 원 단위 + 콤마", () => {
  assert.equal(formatKoreanCurrencyCompact(0), "0원");
  assert.equal(formatKoreanCurrencyCompact(500), "500원");
  assert.equal(formatKoreanCurrencyCompact(5000), "5,000원");
  assert.equal(formatKoreanCurrencyCompact(9999), "9,999원");
});

test("formatKoreanCurrencyCompact: 만 단위는 절삭하여 만원 표기", () => {
  assert.equal(formatKoreanCurrencyCompact(10000), "1만원");
  assert.equal(formatKoreanCurrencyCompact(260000), "26만원");
  assert.equal(formatKoreanCurrencyCompact(12340000), "1,234만원");
  assert.equal(formatKoreanCurrencyCompact(99990000), "9,999만원");
});

test("formatKoreanCurrencyCompact: 억 단위는 1.2억원 / 12억원 형태", () => {
  assert.equal(formatKoreanCurrencyCompact(100000000), "1억원");
  assert.equal(formatKoreanCurrencyCompact(123450000), "1.2억원");
  assert.equal(formatKoreanCurrencyCompact(999999999), "9.9억원");
  assert.equal(formatKoreanCurrencyCompact(1234500000), "12억원");
  assert.equal(formatKoreanCurrencyCompact(123450000000), "1,234억원");
});

test("formatKoreanCurrencyCompact: 음수는 부호 보존", () => {
  assert.equal(formatKoreanCurrencyCompact(-260000), "-26만원");
  assert.equal(formatKoreanCurrencyCompact(-123450000), "-1.2억원");
});

test("formatKoreanCurrencyCompact: 비유효 입력은 0원", () => {
  assert.equal(formatKoreanCurrencyCompact(null), "0원");
  assert.equal(formatKoreanCurrencyCompact(undefined), "0원");
  assert.equal(formatKoreanCurrencyCompact(Number.NaN), "0원");
  assert.equal(formatKoreanCurrencyCompact(Number.POSITIVE_INFINITY), "0원");
});

test("formatKoreanCurrencyCompact: 결과에 단어 사이 공백이 없다", () => {
  // whitespace-nowrap 없이도 단어 중간 줄바꿈이 일어나지 않도록
  // 단위 사이에는 공백이 들어가서는 안 된다.
  for (const v of [0, 5000, 260000, 12340000, 123450000, 1234500000]) {
    assert.equal(/\s/.test(formatKoreanCurrencyCompact(v)), false, `값 ${v}`);
  }
});
