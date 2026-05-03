// [Task #783] runGenericExtractor 의 LLM 응답 파서 단위 테스트.
// 실제 LLM 응답은 형식이 자주 흔들린다 — 코드펜스로 감싸기, JSON 앞뒤에
// 자연어가 붙기, 마크다운 헤더가 섞이기 등. parseExtractionJson 이 이 변형을
// 안전하게 흡수하는지 확인한다.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test:test@localhost:5432/test";

const { parseExtractionJson } = await import("../lib/ocrPipeline.js");

test("parseExtractionJson: 순수 JSON 객체를 그대로 파싱한다", () => {
  const raw = '{"vendor":"홍길동마트","amount":12000,"date":"2026-04-30"}';
  const out = parseExtractionJson(raw);
  assert.equal(out.vendor, "홍길동마트");
  assert.equal(out.amount, 12000);
  assert.equal(out.date, "2026-04-30");
});

test("parseExtractionJson: ```json 코드펜스를 벗겨낸다", () => {
  const raw = "```json\n{\"vendor\":\"A\",\"amount\":1000}\n```";
  const out = parseExtractionJson(raw);
  assert.equal(out.vendor, "A");
  assert.equal(out.amount, 1000);
});

test("parseExtractionJson: 언어 표시 없는 ``` 코드펜스도 처리한다", () => {
  const raw = "```\n{\"vendor\":\"B\",\"amount\":2000}\n```";
  const out = parseExtractionJson(raw);
  assert.equal(out.vendor, "B");
  assert.equal(out.amount, 2000);
});

test("parseExtractionJson: JSON 앞뒤로 자연어 잡문이 붙어도 추출한다", () => {
  const raw =
    '다음은 추출 결과입니다.\n{"vendor":"C","amount":3000,"date":"2026-01-01"}\n참고: 이 영수증은 ...';
  const out = parseExtractionJson(raw);
  assert.equal(out.vendor, "C");
  assert.equal(out.amount, 3000);
});

test("parseExtractionJson: 여러 줄 JSON + 중첩 객체도 첫 { ~ 마지막 } 로 잡힌다", () => {
  const raw = `여기 JSON 입니다:\n{
  "vendor": "D",
  "amount": 4000,
  "date": "2026-02-02",
  "items": [
    {"name": "물품A", "amount": 1000, "quantity": 2},
    {"name": "물품B", "amount": 2000, "quantity": 1}
  ],
  "kindSpecific": {"foo": {"bar": 1}}
}\n끝.`;
  const out = parseExtractionJson(raw);
  assert.equal(out.vendor, "D");
  assert.deepEqual((out.items as unknown[]).length, 2);
  assert.deepEqual(out.kindSpecific, { foo: { bar: 1 } });
});

test("parseExtractionJson: 마크다운 헤더 + 코드펜스 조합도 처리한다", () => {
  const raw =
    "## 결과\n\n아래 JSON 을 참고하세요.\n\n```json\n{\"vendor\":\"E\",\"amount\":5000}\n```\n\n감사합니다.";
  const out = parseExtractionJson(raw);
  assert.equal(out.vendor, "E");
  assert.equal(out.amount, 5000);
});

test("parseExtractionJson: 객체가 전혀 없으면 throw", () => {
  assert.throws(() => parseExtractionJson("죄송하지만 추출하지 못했습니다."));
  assert.throws(() => parseExtractionJson(""));
  assert.throws(() => parseExtractionJson("```json\n[1,2,3]\n```"));
});

test("parseExtractionJson: 깨진 JSON 은 SyntaxError 로 throw 된다", () => {
  assert.throws(
    () => parseExtractionJson('{"vendor":"F","amount":}'),
    (err: unknown) => err instanceof SyntaxError,
  );
});

test("parseExtractionJson: 닫는 } 가 여는 { 보다 앞에 오는 경우 throw", () => {
  assert.throws(() => parseExtractionJson("} 그리고 { 는 오타."));
});
