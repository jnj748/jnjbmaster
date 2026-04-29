/**
 * [Task #589] PDF 다중 페이지 분할 — 행 경계에 정렬된 페이지 컷 계산.
 *
 *   배경: 이전 elementToPdfBlob 은 본문을 한 장의 큰 JPEG 으로 캡처한 뒤
 *     `addImage` 의 y 좌표를 음수로 밀어 페이지마다 동일한 양만큼 슬라이딩
 *     하는 방식으로 다중 페이지를 만들었다. 페이지 경계가 항상 정확히
 *     297mm 마다 떨어지므로 표의 행이 페이지 사이에서 반으로 잘려 출력되는
 *     문제가 있었다.
 *
 *   해결: 캡처 직전 DOM 의 "끊어도 되는 위치" (행/문단 등 블록 요소의
 *     bottom y) 를 모아 두고, 각 페이지의 끝점을 그 후보들 중 페이지 한
 *     장에 들어가는 가장 큰 값으로 스냅한다. 단일 행이 한 페이지보다 더
 *     큰 예외(매우 긴 메모) 는 강제로 페이지 끝에서 자른다.
 *
 *   본 모듈은 순수 함수만 노출해 Node 단위 테스트가 가능하다. 실제 DOM
 *   측정은 elementToPdfBlob 이 책임진다.
 */

/**
 * 페이지 분할 위치(이미지 픽셀 단위, 위에서부터의 누적 y) 를 계산한다.
 *
 * @param totalHeightPx   캡처 이미지의 전체 세로 픽셀 수
 * @param pageHeightPx    PDF 한 장에 담을 수 있는 세로 픽셀 수
 *                        (= PDF page height mm × imgPxPerMm)
 * @param breakCandidates 끊어도 되는 위치(이미지 픽셀, 위에서부터). 정렬 안 되어 있어도 됨.
 *                        보통 표의 각 tr / 헤더 / 문단의 bottom 좌표를 넣는다.
 * @returns 누적 컷 배열. 항상 [0, ..., totalHeightPx] 형태이고
 *          연속한 두 컷의 차이가 pageHeightPx 를 (스냅이 가능한 한) 넘지 않는다.
 *          페이지 수 = 결과 길이 - 1.
 */
export function computePageBreakCuts(
  totalHeightPx: number,
  pageHeightPx: number,
  breakCandidates: readonly number[],
): number[] {
  if (!Number.isFinite(totalHeightPx) || totalHeightPx <= 0) return [0, 0];
  if (!Number.isFinite(pageHeightPx) || pageHeightPx <= 0) {
    return [0, totalHeightPx];
  }
  // 한 페이지에 모두 들어가면 단일 페이지.
  if (totalHeightPx <= pageHeightPx + 0.5) return [0, totalHeightPx];

  // 후보 정리: 0 < x < totalHeightPx, 정수로 반올림 후 중복 제거, 오름차순.
  const sorted = Array.from(
    new Set(
      breakCandidates
        .filter((x) => Number.isFinite(x) && x > 0 && x < totalHeightPx)
        .map((x) => Math.round(x)),
    ),
  ).sort((a, b) => a - b);

  const cuts: number[] = [0];
  let cursor = 0;
  // 무한 루프 안전망: 페이지 수는 totalHeight/pageHeight + 1 보다 크지 않다.
  const safetyMax = Math.ceil(totalHeightPx / Math.max(1, pageHeightPx)) + 4;
  let iter = 0;
  while (cursor < totalHeightPx && iter++ < safetyMax) {
    const limit = cursor + pageHeightPx;
    if (limit >= totalHeightPx) {
      cuts.push(totalHeightPx);
      break;
    }
    // (cursor, limit] 구간 안에서 가장 큰 후보를 선택한다.
    let chosen = -1;
    for (const b of sorted) {
      if (b <= cursor) continue;
      if (b > limit) break;
      chosen = b;
    }
    if (chosen <= cursor) {
      // 후보가 없거나 단일 행이 한 페이지보다 큼 — 강제 컷.
      chosen = Math.floor(limit);
    }
    cuts.push(chosen);
    cursor = chosen;
  }
  // 안전망 발동 시: 마지막 컷이 totalHeight 와 다르면 마지막을 강제로 채운다.
  if (cuts[cuts.length - 1] < totalHeightPx) cuts.push(totalHeightPx);
  return cuts;
}

/**
 * 주어진 DOM 요소에서 "끊어도 되는 y 좌표" 후보(요소 기준 CSS px) 를 모은다.
 *
 *   - 표의 각 tr (행 단위) bottom
 *   - thead / tfoot 그룹 bottom (다음 페이지에서 헤더 반복은 브라우저 기본동작이지만,
 *     PDF 슬라이딩 모드에서는 헤더가 없는 페이지가 생기므로 그룹 단위 컷도 후보)
 *   - 본문 블록(p, h*, li, div) 의 bottom — 단, 텍스트/표 컨테이너 내부 분할을
 *     너무 잘게 만들지 않기 위해 height 가 0 인 wrapper 는 제외.
 *
 *   주의: 이 함수는 브라우저 환경(getBoundingClientRect 사용) 에서만 호출된다.
 */
export function collectBreakCandidatesCssPx(element: HTMLElement): number[] {
  if (typeof window === "undefined") return [];
  const containerRect = element.getBoundingClientRect();
  const out: number[] = [];
  const selectors = "tr, thead, tfoot, p, li, h1, h2, h3, h4";
  const nodes = element.querySelectorAll<HTMLElement>(selectors);
  for (const el of Array.from(nodes)) {
    const r = el.getBoundingClientRect();
    if (r.height <= 0) continue;
    const bottom = r.bottom - containerRect.top;
    if (bottom > 0 && bottom <= containerRect.height + 0.5) {
      out.push(bottom);
    }
  }
  return out;
}
