// [Task #783] classifyDocument 픽스처 기반 통합 테스트.
// src/__tests__/fixtures/ocrPipeline/ 에 종류별 샘플 파일을 두고,
// 각 파일을 buffer 로 로드 → classifyDocument 에 넣어 의도된 kind 가
// 나오는지 검증한다. 실제 LLM 호출은 비결정적이고 비용이 들기 때문에
// __setRoutedGenerateForTests 로 스텁한다. 다만 스텁은 호출 인자를
// 그대로 받아, mimeType / base64 페이로드 / 프롬프트가 의도대로
// 라우팅됐는지를 함께 검증한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test:test@localhost:5432/test";

const { classifyDocument, __setRoutedGenerateForTests } = await import("../lib/ocrPipeline.js");
const { documentIngestionKinds } = await import("@workspace/db");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, "fixtures", "ocrPipeline");

type Tier = "tier0" | "tier1" | "tier2";
type RoutedResult = {
  text: string;
  tier: Tier;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  costEstimateUsd: number;
};
type CapturedCall = {
  tier: Tier | undefined;
  parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
};

function loadFixture(name: string): Buffer {
  const p = path.join(FIXTURE_DIR, name);
  return fs.readFileSync(p);
}

function makeStub(reply: string): { fn: (opts: unknown) => Promise<RoutedResult>; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  return {
    calls,
    fn: async (opts: unknown) => {
      const o = opts as { tier?: Tier; parts: CapturedCall["parts"] };
      calls.push({ tier: o.tier, parts: o.parts });
      return {
        text: reply,
        tier: o.tier ?? "tier0",
        model: "stub-model",
        inputTokens: null,
        outputTokens: null,
        costEstimateUsd: 0,
      };
    },
  };
}

type FixtureSpec = {
  file: string;
  mimeType: string;
  expected: (typeof documentIngestionKinds)[number];
};

const FIXTURES: FixtureSpec[] = [
  { file: "receipt.pdf", mimeType: "application/pdf", expected: "receipt" },
  { file: "bill.pdf", mimeType: "application/pdf", expected: "bill" },
  { file: "contract.pdf", mimeType: "application/pdf", expected: "contract" },
  { file: "resolution.pdf", mimeType: "application/pdf", expected: "resolution" },
  { file: "tax_invoice.pdf", mimeType: "application/pdf", expected: "tax_invoice" },
  { file: "business_reg.pdf", mimeType: "application/pdf", expected: "business_reg" },
  { file: "memo.png", mimeType: "image/png", expected: "memo" },
  { file: "meter_photo.png", mimeType: "image/png", expected: "meter_photo" },
];

test("픽스처 디렉터리에 모든 종류별 샘플 파일이 존재한다", () => {
  for (const f of FIXTURES) {
    const p = path.join(FIXTURE_DIR, f.file);
    assert.ok(fs.existsSync(p), `픽스처 파일이 누락됨: ${f.file}`);
    assert.ok(fs.statSync(p).size > 0, `픽스처가 비어있음: ${f.file}`);
  }
  assert.ok(fs.existsSync(path.join(FIXTURE_DIR, "bank_statement.csv")));
});

test("classifyDocument: 종류별 픽스처가 의도된 kind 로 분류된다", async () => {
  for (const fx of FIXTURES) {
    const buffer = loadFixture(fx.file);
    const stub = makeStub(fx.expected);
    __setRoutedGenerateForTests(stub.fn as never);
    try {
      const kind = await classifyDocument({ buffer, mimeType: fx.mimeType });
      assert.equal(kind, fx.expected, `${fx.file} 는 "${fx.expected}" 로 분류되어야 한다`);

      // LLM 호출 인자도 함께 검증 — 라우팅이 tier0 (분류기) 인지,
      // 첨부의 mimeType 과 페이로드가 픽스처와 일치하는지.
      assert.equal(stub.calls.length, 1, `${fx.file}: LLM 이 정확히 1회 호출되어야 한다`);
      const call = stub.calls[0];
      assert.equal(call.tier, "tier0", "분류기는 tier0 으로 라우팅되어야 한다");
      const inline = call.parts.find((p) => p.inlineData)?.inlineData;
      assert.ok(inline, `${fx.file}: inlineData 첨부가 있어야 한다`);
      assert.equal(inline!.mimeType, fx.mimeType, `${fx.file}: mimeType 이 그대로 전달되어야 한다`);
      assert.equal(
        inline!.data,
        buffer.toString("base64"),
        `${fx.file}: 파일 바이트가 base64 로 그대로 전달되어야 한다`,
      );
      const promptText = call.parts.find((p) => typeof p.text === "string")?.text;
      assert.ok(
        promptText && promptText.includes(fx.expected),
        `${fx.file}: 분류 프롬프트가 종류 키 "${fx.expected}" 를 포함해야 한다`,
      );
    } finally {
      __setRoutedGenerateForTests(null);
    }
  }
});

test("classifyDocument: bank_statement.csv 픽스처는 LLM 호출 없이 즉시 분류된다", async () => {
  const csvBuffer = loadFixture("bank_statement.csv");
  const stub = makeStub("receipt"); // 잘못된 응답을 줘도 LLM 까지 못 가야 한다
  __setRoutedGenerateForTests(stub.fn as never);
  try {
    const kind = await classifyDocument({ buffer: csvBuffer, mimeType: "text/csv" });
    assert.equal(kind, "bank_statement", "CSV 픽스처는 항상 bank_statement 로 분류된다");
    assert.equal(stub.calls.length, 0, "CSV 경로는 LLM 호출이 일어나면 안된다");
  } finally {
    __setRoutedGenerateForTests(null);
  }
});

test("classifyDocument: 픽스처와 LLM 응답이 어긋나면 unknown 으로 폴백한다", async () => {
  // 회귀 방지 — LLM 이 종류 매핑을 망가뜨려도 알 수 없는 키만 빠져나가게 한다.
  const buffer = loadFixture("receipt.pdf");
  __setRoutedGenerateForTests(makeStub("totally-not-a-kind").fn as never);
  try {
    const kind = await classifyDocument({ buffer, mimeType: "application/pdf" });
    assert.equal(kind, "unknown");
  } finally {
    __setRoutedGenerateForTests(null);
  }
});
