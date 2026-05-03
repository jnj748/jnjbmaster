// [Task #783] classifyDocument 단위 테스트.
// LLM 호출은 __setRoutedGenerateForTests 로 스텁한다.
// 픽스처는 작은 더미 버퍼로 충분하다 — 분류 결과는 LLM 응답으로 결정되고,
// 본 테스트는 응답을 종류별로 고정한 뒤 매핑이 의도대로 동작하는지 검증한다.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test:test@localhost:5432/test";

const {
  classifyDocument,
  normalizeClassifyToken,
  __setRoutedGenerateForTests,
} = await import("../lib/ocrPipeline.js");
const { documentIngestionKinds } = await import("@workspace/db");

type RoutedResult = {
  text: string;
  tier: "tier0";
  model: "stub";
  inputTokens: null;
  outputTokens: null;
  costEstimateUsd: 0;
};
function stubReply(text: string): () => Promise<RoutedResult> {
  return async () => ({
    text,
    tier: "tier0",
    model: "stub",
    inputTokens: null,
    outputTokens: null,
    costEstimateUsd: 0,
  });
}

const PNG_BUFFER = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
const PDF_BUFFER = Buffer.from("%PDF-1.4\n%dummy");

test("normalizeClassifyToken 은 잡문/대소문자/구두점을 떨어낸다", () => {
  assert.equal(normalizeClassifyToken("RECEIPT"), "receipt");
  assert.equal(normalizeClassifyToken("  bill.\n"), "bill");
  assert.equal(normalizeClassifyToken("```bank_statement```"), "bank_statement");
  assert.equal(normalizeClassifyToken("'tax_invoice'."), "tax_invoice");
  assert.equal(normalizeClassifyToken("의결문 → resolution"), "resolution");
  assert.equal(normalizeClassifyToken(""), "");
});

test("classifyDocument: hint 가 유효하면 LLM 을 호출하지 않고 그대로 돌려준다", async () => {
  let called = false;
  __setRoutedGenerateForTests((async () => {
    called = true;
    return stubReply("receipt")();
  }) as never);
  try {
    const k = await classifyDocument({ buffer: PNG_BUFFER, mimeType: "image/png", hint: "contract" });
    assert.equal(k, "contract");
    assert.equal(called, false, "hint 가 있으면 LLM 호출이 일어나면 안된다");
  } finally {
    __setRoutedGenerateForTests(null);
  }
});

test("classifyDocument: hint 가 알 수 없는 키이면 무시하고 LLM 으로 떨어진다", async () => {
  __setRoutedGenerateForTests(stubReply("receipt") as never);
  try {
    const k = await classifyDocument({
      buffer: PNG_BUFFER,
      mimeType: "image/png",
      hint: "bogus_kind" as never,
    });
    assert.equal(k, "receipt");
  } finally {
    __setRoutedGenerateForTests(null);
  }
});

test("classifyDocument: CSV/Excel mimeType 은 LLM 거치지 않고 bank_statement", async () => {
  let called = false;
  __setRoutedGenerateForTests((async () => {
    called = true;
    return stubReply("receipt")();
  }) as never);
  try {
    const a = await classifyDocument({ buffer: Buffer.from("date,amount\n"), mimeType: "text/csv" });
    const b = await classifyDocument({
      buffer: Buffer.from("xls"),
      mimeType: "application/vnd.ms-excel",
    });
    assert.equal(a, "bank_statement");
    assert.equal(b, "bank_statement");
    assert.equal(called, false, "CSV/Excel 은 LLM 호출 없이 즉답해야 한다");
  } finally {
    __setRoutedGenerateForTests(null);
  }
});

test("classifyDocument: 모든 종류 키에 대해 LLM 응답이 그대로 매핑된다", async () => {
  for (const kind of documentIngestionKinds) {
    __setRoutedGenerateForTests(stubReply(kind) as never);
    const result = await classifyDocument({ buffer: PDF_BUFFER, mimeType: "application/pdf" });
    assert.equal(result, kind, `LLM 이 "${kind}" 라고 답하면 결과도 "${kind}" 여야 한다`);
  }
  __setRoutedGenerateForTests(null);
});

test("classifyDocument: LLM 응답이 코드펜스/구두점/대문자로 오염돼도 정상 매핑된다", async () => {
  const noisySamples: Array<[string, string]> = [
    ["```RECEIPT```", "receipt"],
    ["BILL.", "bill"],
    ["답변: contract\n", "contract"],
    ["'tax_invoice'", "tax_invoice"],
    ["bank_statement!!", "bank_statement"],
    ["  business_reg  ", "business_reg"],
  ];
  for (const [raw, expected] of noisySamples) {
    __setRoutedGenerateForTests(stubReply(raw) as never);
    const result = await classifyDocument({ buffer: PDF_BUFFER, mimeType: "application/pdf" });
    assert.equal(result, expected, `"${raw}" → "${expected}" 가 되어야 한다`);
  }
  __setRoutedGenerateForTests(null);
});

test("classifyDocument: LLM 이 정의되지 않은 키를 돌려주면 unknown", async () => {
  __setRoutedGenerateForTests(stubReply("loremipsum") as never);
  try {
    const k = await classifyDocument({ buffer: PNG_BUFFER, mimeType: "image/png" });
    assert.equal(k, "unknown");
  } finally {
    __setRoutedGenerateForTests(null);
  }
});

test("classifyDocument: LLM 호출이 throw 되면 unknown 으로 폴백한다", async () => {
  __setRoutedGenerateForTests((async () => {
    throw new Error("network error");
  }) as never);
  try {
    const k = await classifyDocument({ buffer: PNG_BUFFER, mimeType: "image/png" });
    assert.equal(k, "unknown");
  } finally {
    __setRoutedGenerateForTests(null);
  }
});
