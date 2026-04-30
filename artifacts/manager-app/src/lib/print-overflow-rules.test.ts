/**
 * [Task #720] 인쇄 미디어에서 다중 페이지 분할이 깨지지 않도록 보장하는
 * CSS 규칙 회귀 테스트.
 *
 * 회귀 시나리오: 화면용 base 규칙 `html, body { height: 100%; overflow-x: hidden }` 가
 *   인쇄 미디어에서도 그대로 살아 있으면, W3C css-overflow-3 §3.2 의 규정상
 *   한 축이 hidden 이고 다른 축이 visible 이면 visible 은 자동으로 auto 로
 *   승격된다. 그 결과 인쇄 시 body 가 사실상 overflow-y: auto 로 동작해
 *   본문이 페이지 흐름으로 분할되지 않고 body 의 스크롤 영역으로 밀려
 *   들어가, 인쇄 엔진이 첫 페이지 한 장만 보게 된다.
 *
 * 본 테스트는 `src/index.css` 의 `@media print` 블록 안에 다음이 모두
 *   명시되어 있는지 검증한다:
 *     - html, body 셀렉터 규칙에 `overflow-x: visible !important` 와
 *       `overflow-y: visible !important` 가 둘 다 존재
 *     - html, body 셀렉터 규칙에 `height: auto !important` 와
 *       `min-height: 0 !important` 가 존재
 *     - `[data-printing]` 셀렉터(인쇄 격리 컨테이너 직계 부모) 에도 동일한
 *       overflow 해제가 존재 — 인쇄 컨테이너 위 단계에서 잠금이 다시 걸리는
 *       회귀를 차단하는 안전망
 *
 * 어느 하나라도 빠지거나 한 축만 풀려 있으면 테스트가 실패한다.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(__dirname, "../index.css");
const cssRaw = readFileSync(cssPath, "utf8");

/** CSS 주석 `/* ... *\/` 을 모두 제거 — 셀렉터 매칭의 위치 잡음을 없앤다. */
function stripCssComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

const css = stripCssComments(cssRaw);

/**
 * `@media print { ... }` 블록 본문(중괄호 안) 만 추출한다.
 * 중첩 중괄호(@page workReport 같은) 를 정확히 잡기 위해 깊이 카운트로 슬라이스.
 */
function extractMediaPrintBlock(source: string): string {
  const re = /@media\s+print\s*\{/g;
  const m = re.exec(source);
  assert.ok(m, "@media print 블록을 찾지 못했습니다");
  const start = m.index + m[0].length;
  let depth = 1;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i);
    }
  }
  throw new Error("@media print 블록의 닫는 중괄호를 찾지 못했습니다");
}

/**
 * 주어진 텍스트 안에서 셀렉터로 시작하는 규칙(중괄호 한 쌍) 본문을 모두
 * 반환한다. 동일 셀렉터로 여러 규칙이 있을 수 있으므로 배열로 반환.
 *
 * 셀렉터의 시작이 다른 셀렉터의 부분 문자열로 잡히지 않도록, 셀렉터 직전
 * 문자가 (a) 텍스트의 처음, (b) 공백/줄바꿈, (c) `{` 또는 `}` 중 하나여야
 * 한다. 셀렉터 직후는 공백/줄바꿈을 허용한 뒤 곧바로 `{` 가 와야 한다 —
 * 즉 더 긴 결합 셀렉터(예: `[data-printing] [data-print-root]`) 와 구분된다.
 */
function findRuleBodies(block: string, selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|[\\s{}])${escaped}\\s*\\{`, "g");
  const bodies: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const start = m.index + m[0].length;
    let depth = 1;
    for (let i = start; i < block.length; i += 1) {
      const ch = block[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          bodies.push(block.slice(start, i));
          re.lastIndex = i + 1;
          break;
        }
      }
    }
  }
  return bodies;
}

const printBlock = extractMediaPrintBlock(css);

test("@media print: html, body 규칙에 overflow-x/-y: visible 이 둘 다 명시되어 있다", () => {
  const bodies = findRuleBodies(printBlock, "html, body");
  assert.ok(bodies.length > 0, "@media print 안에 `html, body` 규칙이 없습니다");
  // 여러 규칙이 있더라도 회귀 방지 규칙이 어느 한 곳에는 존재해야 한다.
  const hasOverflowX = bodies.some((b) => /overflow-x\s*:\s*visible\s*!important/.test(b));
  const hasOverflowY = bodies.some((b) => /overflow-y\s*:\s*visible\s*!important/.test(b));
  assert.ok(
    hasOverflowX,
    "회귀: @media print 의 `html, body` 에 `overflow-x: visible !important` 가 없습니다. " +
      "한 축만 hidden 이어도 다른 축이 auto 로 승격되어 인쇄 시 다중 페이지 분할이 깨집니다.",
  );
  assert.ok(
    hasOverflowY,
    "회귀: @media print 의 `html, body` 에 `overflow-y: visible !important` 가 없습니다.",
  );
});

test("@media print: html, body 규칙에 height/min-height 화면 잠금 해제가 있다", () => {
  const bodies = findRuleBodies(printBlock, "html, body");
  const hasHeightAuto = bodies.some((b) => /(?<![-\w])height\s*:\s*auto\s*!important/.test(b));
  const hasMinHeightZero = bodies.some((b) => /min-height\s*:\s*0\s*!important/.test(b));
  assert.ok(
    hasHeightAuto,
    "회귀: @media print 의 `html, body` 에 `height: auto !important` 가 없습니다. " +
      "화면용 `height: 100%` 가 인쇄 페이지 높이 캡으로 작용해 다중 페이지가 잘릴 수 있습니다.",
  );
  assert.ok(
    hasMinHeightZero,
    "회귀: @media print 의 `html, body` 에 `min-height: 0 !important` 가 없습니다.",
  );
});

test("@media print: [data-printing] 격리 부모에도 overflow visible/height auto 가 있다 (안전망)", () => {
  // `[data-printing]` 단독 셀렉터(자손/자식 결합자 없음) 규칙을 찾는다.
  const bodies = findRuleBodies(printBlock, "[data-printing]");
  assert.ok(
    bodies.length > 0,
    "회귀: @media print 안에 `[data-printing]` 단독 셀렉터 규칙이 없습니다. " +
      "인쇄 컨테이너 직계 부모(=body) 단계에서 height/overflow 잠금이 다시 걸리는 회귀를 막는 안전망입니다.",
  );
  const hasOverflowX = bodies.some((b) => /overflow-x\s*:\s*visible\s*!important/.test(b));
  const hasOverflowY = bodies.some((b) => /overflow-y\s*:\s*visible\s*!important/.test(b));
  const hasHeightAuto = bodies.some((b) => /(?<![-\w])height\s*:\s*auto\s*!important/.test(b));
  assert.ok(hasOverflowX, "회귀: `[data-printing]` 에 `overflow-x: visible !important` 가 없습니다");
  assert.ok(hasOverflowY, "회귀: `[data-printing]` 에 `overflow-y: visible !important` 가 없습니다");
  assert.ok(hasHeightAuto, "회귀: `[data-printing]` 에 `height: auto !important` 가 없습니다");
});

test("@media print: [data-print-root] 안쪽 자연 흐름 보장 규칙이 유지된다 (Task #560 회귀 방지)", () => {
  // 기존(#560) 규칙이 본 패치에서 함께 깨지지 않았는지 확인.
  const bodies = findRuleBodies(printBlock, "[data-printing] [data-print-root]");
  assert.ok(bodies.length > 0, "[data-printing] [data-print-root] 규칙이 사라졌습니다");
  const hasOverflowVisible = bodies.some((b) => /overflow\s*:\s*visible\s*!important/.test(b));
  const hasHeightAuto = bodies.some((b) => /(?<![-\w])height\s*:\s*auto\s*!important/.test(b));
  assert.ok(hasOverflowVisible, "회귀: `[data-print-root]` 의 `overflow: visible !important` 가 없습니다");
  assert.ok(hasHeightAuto, "회귀: `[data-print-root]` 의 `height: auto !important` 가 없습니다");
});
