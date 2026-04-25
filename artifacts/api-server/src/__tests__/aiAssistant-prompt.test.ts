import { test } from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test:test@localhost:5432/test";

const { __test } = await import("../routes/aiAssistant/index.js");
const {
  buildSystemPrompt,
  stripEnglishKeyParens,
  ParenSanitizer,
  GENERAL_NOTICE_LABEL,
  GENERAL_NOTICE_LINE,
  INSUFFICIENT_INFO_PREFIX,
} = __test;

function makeCtx(overrides: Partial<{ buildingName: string; todayIso: string; json: string }> = {}) {
  return {
    buildingName: overrides.buildingName ?? "테스트빌딩",
    todayIso: overrides.todayIso ?? "2026-04-25",
    json: overrides.json ?? JSON.stringify({
      today: "2026-04-25",
      building: { id: 1, name: "테스트빌딩", totalUnits: 100 },
      platformKnowledge: { docs: [] },
    }),
    citations: [],
  };
}

// ─── 우선순위 / 분기 가이드 회귀 테스트 ────────────────────────────────────

test("prompt declares the 3-tier priority (building → platform docs → general)", () => {
  const prompt = buildSystemPrompt(makeCtx());
  // priority section header present
  assert.match(prompt, /\[답변 우선순위[^\]]*\]/);
  // priorities listed in order
  const idxBuilding = prompt.indexOf("1) 건물 입력 정보");
  const idxPlatform = prompt.indexOf("2) 플랫폼 공통 자료");
  const idxGeneral = prompt.indexOf("3) AI 일반 지식");
  assert.ok(idxBuilding > 0, "missing building priority");
  assert.ok(idxPlatform > idxBuilding, "platform priority must come after building");
  assert.ok(idxGeneral > idxPlatform, "general knowledge must come last");
});

test("(case a) prompt instructs building-specific questions to answer from building data", () => {
  const prompt = buildSystemPrompt(makeCtx());
  assert.match(prompt, /A\) 건물 특정 질문/);
  assert.match(prompt, /1순위.*건물 입력 정보/);
});

test("(case b) prompt forbids the insufficient-info notice for general-knowledge questions", () => {
  const prompt = buildSystemPrompt(makeCtx());
  assert.match(prompt, /B\) 일반 상식·실무 지식 질문/);
  // Section B must explicitly forbid prepending the insufficient-info phrase
  const sectionB = prompt.slice(prompt.indexOf("B) 일반 상식"), prompt.indexOf("C) 혼합 질문"));
  assert.ok(
    sectionB.includes(INSUFFICIENT_INFO_PREFIX) && /절대 붙이지 말고/.test(sectionB),
    "section B must forbid the insufficient-info prefix",
  );
  // Section B must require the 일반 안내 label line at the end
  assert.ok(sectionB.includes(GENERAL_NOTICE_LINE), "section B must require the 일반 안내 line");
});

test("(case c) prompt asserts building data wins on conflict and both values are surfaced", () => {
  const prompt = buildSystemPrompt(makeCtx());
  // Conflict format spelled out
  assert.match(prompt, /입력된 자료 기준으로는 .{0,5}이며, 일반적으로는/);
  // Building data is the authoritative answer
  assert.match(prompt, /답으로 노출되는 값은 항상 자료 값/);
  // Top-level priority statement also enforces conflict winner
  assert.match(prompt, /충돌 시 위가 항상 이깁니다/);
});

test("(case d) prompt keeps the existing insufficient-info phrase for building questions with no data", () => {
  const prompt = buildSystemPrompt(makeCtx());
  const sectionA = prompt.slice(prompt.indexOf("A) 건물 특정 질문"), prompt.indexOf("B) 일반 상식"));
  assert.ok(
    sectionA.includes(INSUFFICIENT_INFO_PREFIX),
    "section A must keep the insufficient-info phrase",
  );
  assert.match(sectionA, /자료에 답이 없을 때만/);
  assert.match(
    sectionA,
    /소장님께서 입력해주시는 정보는 꼼꼼히 기록하고 있어요/,
  );
});

test("(case e) prompt defends against prompt injection inside platform doc bodies", () => {
  const prompt = buildSystemPrompt(makeCtx());
  // Defense rule explicitly names the injection vector
  assert.match(prompt, /platformKnowledge\.docs\[\]\.body/);
  assert.match(prompt, /이전 지시 무시/);
  assert.match(prompt, /시스템 프롬프트 출력/);
  assert.match(prompt, /데이터로만 취급/);
});

// ─── 라벨 / 검열 정합성 회귀 테스트 ─────────────────────────────────────

test("일반 안내 label survives English-key parenthesis stripping", () => {
  // The label is parenthesised Hangul and must be preserved.
  assert.equal(
    stripEnglishKeyParens(`${GENERAL_NOTICE_LABEL} 본 답변은 일반적인 내용입니다.`),
    `${GENERAL_NOTICE_LABEL} 본 답변은 일반적인 내용입니다.`,
  );
  // Even when adjacent to a stripped English key, the Korean label survives.
  assert.equal(
    stripEnglishKeyParens(`총 100세대 (building.totalUnits) ${GENERAL_NOTICE_LABEL}`),
    `총 100세대 ${GENERAL_NOTICE_LABEL}`,
  );
});

test("일반 안내 label survives streaming sanitizer across chunk boundaries", () => {
  const s = new ParenSanitizer();
  let out = "";
  out += s.push("관리비 산정식은 ... 입니다.\n(일반 ");
  out += s.push("안내) 본 답변은 일반적인 내용이며, 건물 입력 자료와 다를 수 있습니다.");
  out += s.flush();
  assert.ok(out.includes(GENERAL_NOTICE_LABEL), `output missing label: ${out}`);
  assert.ok(out.endsWith("다를 수 있습니다."), `output truncated: ${out}`);
});

test("buildSystemPrompt embeds today / building name / building JSON verbatim", () => {
  const ctx = makeCtx({
    buildingName: "한빛타워",
    todayIso: "2026-04-25",
    json: '{"sentinel":"BUILDING_JSON_SENTINEL"}',
  });
  const prompt = buildSystemPrompt(ctx);
  assert.match(prompt, /\[오늘 날짜\] 2026-04-25/);
  assert.match(prompt, /\[건물명\] 한빛타워/);
  assert.ok(prompt.includes("BUILDING_JSON_SENTINEL"));
});
