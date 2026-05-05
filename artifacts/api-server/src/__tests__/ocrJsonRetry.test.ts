// [Task #868] LLM JSON 자동 재시도 헬퍼 단위 테스트.
// LLM 호출(retry 콜백)은 직접 주입하므로 외부 의존성 없이 결정적으로 검증된다.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test:test@localhost:5432/test";

const { parseJsonWithRetry, OcrJsonRetryError } = await import("../lib/ocrJsonRetry.js");

const parseJson = (t: string) => JSON.parse(t) as unknown;

test("첫 파싱이 성공하면 retry 콜백을 호출하지 않는다", async () => {
  let retryCalled = false;
  const out = await parseJsonWithRetry({
    initialText: '{"a":1}',
    parser: parseJson,
    retry: async () => {
      retryCalled = true;
      return "{}";
    },
    caller: "test-success",
  });
  assert.deepEqual(out, { a: 1 });
  assert.equal(retryCalled, false);
});

test("첫 파싱 실패 → retry 가 정상 JSON 돌려주면 두 번째 파싱 결과를 쓴다", async () => {
  let retryCalled = 0;
  const out = await parseJsonWithRetry({
    initialText: "이건 자연어이고 JSON 이 아닙니다.",
    parser: parseJson,
    retry: async () => {
      retryCalled += 1;
      return '{"b":2}';
    },
    caller: "test-retry-success",
  });
  assert.deepEqual(out, { b: 2 });
  assert.equal(retryCalled, 1);
});

test("retry 콜백 자체가 throw 하면 친화적 에러로 감싸 던진다", async () => {
  await assert.rejects(
    parseJsonWithRetry({
      initialText: "broken",
      parser: parseJson,
      retry: async () => {
        throw new Error("network down");
      },
      caller: "test-retry-throw",
    }),
    (err: unknown) => err instanceof OcrJsonRetryError,
  );
});

test("retry 결과도 깨진 JSON 이면 친화적 에러로 감싸 던진다", async () => {
  await assert.rejects(
    parseJsonWithRetry({
      initialText: "first broken",
      parser: parseJson,
      retry: async () => "still broken",
      caller: "test-retry-broken",
    }),
    (err: unknown) => err instanceof OcrJsonRetryError,
  );
});

test("OcrJsonRetryError 의 사용자 메시지는 한국어 단문이다", () => {
  const err = new OcrJsonRetryError();
  assert.match(err.message, /자료 인식이 일시적으로 실패/);
  assert.match(err.message, /다시 업로드/);
});
