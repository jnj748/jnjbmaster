import { test } from "node:test";
import assert from "node:assert/strict";
import { computePageBreakCuts } from "./pdf-page-break.ts";

test("내용이 한 페이지 안에 들어가면 단일 페이지", () => {
  const cuts = computePageBreakCuts(800, 1000, [200, 400, 600]);
  assert.deepEqual(cuts, [0, 800]);
});

test("후보가 없으면 페이지 높이만큼 강제로 자른다", () => {
  const cuts = computePageBreakCuts(2500, 1000, []);
  // 0, 1000, 2000, 2500
  assert.equal(cuts[0], 0);
  assert.equal(cuts[cuts.length - 1], 2500);
  assert.equal(cuts.length, 4); // 3 페이지
});

test("행 경계가 있으면 페이지 끝을 행 bottom 으로 스냅한다", () => {
  // 페이지 = 1000. 후보들: 200, 500, 980, 1100, 1900
  // 첫 페이지: cursor=0, limit=1000 → 후보 중 (0,1000] 최대 = 980 → cut 980
  // 둘째 페이지: cursor=980, limit=1980 → (980,1980] 최대 = 1900 → cut 1900
  // 셋째 페이지: cursor=1900, limit=2900 ≥ total → cut total
  const cuts = computePageBreakCuts(2400, 1000, [200, 500, 980, 1100, 1900]);
  assert.deepEqual(cuts, [0, 980, 1900, 2400]);
});

test("길이가 정확히 페이지 배수일 때도 마지막 페이지가 한 장으로 처리된다", () => {
  const cuts = computePageBreakCuts(2000, 1000, [500, 1000, 1500]);
  // first page snaps to 1000, then [1000,2000] → second page covers rest
  assert.equal(cuts[0], 0);
  assert.equal(cuts[cuts.length - 1], 2000);
  assert.equal(cuts.length, 3);
});

test("한 행이 페이지 한 장보다 더 클 때는 강제로 페이지 끝에서 자른다", () => {
  // 페이지 1000. 후보들 모두 1500 이상 (한 페이지를 넘는 위치).
  // 첫 페이지에서는 (0,1000] 안에 후보가 없으므로 강제 컷 1000.
  const cuts = computePageBreakCuts(2400, 1000, [1500, 2000]);
  assert.equal(cuts[0], 0);
  assert.equal(cuts[1], 1000);
  // 1500 이 (1000,2000] 안에 들어오므로 둘째 페이지는 1500 또는 2000 으로 스냅
  assert.ok(cuts[2] >= 1500 && cuts[2] <= 2000);
  assert.equal(cuts[cuts.length - 1], 2400);
});

test("총 길이가 0 또는 음수면 빈 페이지 반환", () => {
  assert.deepEqual(computePageBreakCuts(0, 1000, []), [0, 0]);
  assert.deepEqual(computePageBreakCuts(-10, 1000, []), [0, 0]);
});

test("페이지 높이가 0/음수면 단일 페이지로 폴백", () => {
  assert.deepEqual(computePageBreakCuts(2000, 0, [500]), [0, 2000]);
  assert.deepEqual(computePageBreakCuts(2000, -5, [500]), [0, 2000]);
});

test("중복/비정상 후보는 무시한다", () => {
  const cuts = computePageBreakCuts(2400, 1000, [
    500,
    500,
    NaN,
    -100,
    3000,
    2400,
    980,
  ]);
  assert.equal(cuts[0], 0);
  assert.equal(cuts[1], 980); // 중복/범위 밖 제거 후 (0,1000] 의 최대
});

test("긴 보고서가 다중 페이지로 나뉜다 (Daily/Weekly/Monthly 회귀 차단)", () => {
  // 가정: A4 한 장 ≈ 1700 image-pixels (height in img px), 본문이 5500 px → 4 페이지.
  // 후보는 100 px 간격 행들.
  const candidates: number[] = [];
  for (let y = 100; y < 5500; y += 100) candidates.push(y);
  const cuts = computePageBreakCuts(5500, 1700, candidates);
  // 페이지 수 ≥ 2 (회귀 가드)
  assert.ok(cuts.length - 1 >= 2, `expected ≥ 2 pages, got ${cuts.length - 1}`);
  // 모든 페이지 크기는 1700 이하
  for (let i = 1; i < cuts.length; i++) {
    assert.ok(cuts[i] - cuts[i - 1] <= 1700, `page ${i} too large`);
  }
  // 마지막 컷은 정확히 totalHeight
  assert.equal(cuts[cuts.length - 1], 5500);
});
