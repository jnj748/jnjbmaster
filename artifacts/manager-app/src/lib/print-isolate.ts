/**
 * [Task #554] 인쇄 격리 유틸.
 *
 *   배경: Task #543~#545 가 모달(Radix Dialog)/드로어(Vaul) 안에서 인쇄할 때
 *     본문이 좌·우로 어긋나는 현상을 잡으려고 `.a4-document` 를
 *     `position: fixed; left:0; top:0; right:0; bottom:auto` 로 페이지에
 *     못박았다. 좌·우 정렬은 잡혔지만 두 가지 회귀가 따라왔다.
 *       (1) 본문이 페이지 상단이 아니라 중상단부터 시작해 위에 빈 공간이 누적
 *       (2) 1페이지 분량을 넘는 문서의 2페이지 이후가 통째로 백지로 출력
 *     `position: fixed` 요소는 인쇄 시 다음 페이지로 흘러가지 않기 때문이다.
 *
 *   해결: 인쇄 트리거 직전 대상 DOM 노드를 `cloneNode(true)` 로 deep-clone 해
 *     `<body>` 직속 전용 컨테이너 `[data-print-root]` 에 넣는다. 이 컨테이너는
 *     다이얼로그/드로어/포털/프레임 등 어떤 positioned wrapper 안에도 있지
 *     않으므로 `.a4-document` 의 컨테이닝 블록은 자연스럽게 *initial
 *     containing block*(=@page content area) 이 된다. `position: fixed` 없이도
 *       - 좌·우 정렬: 페이지 콘텐츠 영역 폭(=A4 - @page margin)에 그대로 맞춰짐
 *       - 다중 페이지 흐름: 자연스러운 블록 흐름이라 페이지 경계에서 자동 분할
 *     두 회귀가 모두 동시에 풀린다.
 *
 *   인쇄 종료(`afterprint` 또는 `matchMedia('print')` change → matches:false) 시
 *     컨테이너를 비우고 `body[data-printing]` 플래그를 제거해 화면 미리보기
 *     상태를 원복한다. 원본 React 트리는 일절 건드리지 않으므로 모달/드로어
 *     열림 상태/스크롤 위치/A4DocumentFrame 의 scale/Editor 입력 값이 그대로
 *     보존된다.
 *
 *   클론 기반인 이유: 원본 노드를 잠시 옮겼다가 되돌리는 방식은 React 가
 *     reconciliation 중에 옮겨진 노드를 잃거나 잘못된 형제 옆에 다시 끼워
 *     넣을 위험이 있다. 클론은 React 가 모르는 별개의 DOM 트리이므로 안전.
 *     클론은 inline 속성/CSS class 만 복제하고 React 이벤트 핸들러나 canvas
 *     픽셀은 옮기지 않는다 — 인쇄용 정적 출력에서는 둘 다 불필요하다.
 */

const PRINT_ROOT_ATTR = "data-print-root";
const PRINT_BODY_ATTR = "data-printing";

let printRoot: HTMLDivElement | null = null;
let pendingCleanup: (() => void) | null = null;

function getOrCreatePrintRoot(): HTMLDivElement {
  if (printRoot && document.body.contains(printRoot)) return printRoot;
  const el = document.createElement("div");
  el.setAttribute(PRINT_ROOT_ATTR, "");
  document.body.appendChild(el);
  printRoot = el;
  return el;
}

function clearPrintRoot(root: HTMLDivElement): void {
  while (root.firstChild) root.removeChild(root.firstChild);
}

/**
 * 대상 노드를 격리된 인쇄 컨테이너에 복제하고 `window.print()` 를 호출한다.
 * 인쇄 종료 시 컨테이너와 `body[data-printing]` 플래그가 자동으로 정리된다.
 *
 * 호출 사이트에서 호출 직전에 추가 준비(예: editMode 해제)가 필요하면 그
 * 호출자에서 처리한 뒤 이 함수를 부른다. 이 함수 자체는 항상 "현재 DOM
 * 시점" 의 노드를 복제한다.
 *
 * @param node 인쇄할 DOM 노드. 보통 `.a4-document` 또는 `.inspection-notice-print`.
 *   null/undefined 면 아무 동작도 하지 않는다(선행 ref 미설정 가드).
 */
export function printIsolatedNode(node: HTMLElement | null | undefined): void {
  if (!node) return;
  if (typeof window === "undefined") return;

  // 이전 인쇄 정리가 아직 안 끝났다면(빠른 연속 인쇄) 먼저 정리해 컨테이너를 비운다.
  if (pendingCleanup) pendingCleanup();

  const root = getOrCreatePrintRoot();
  clearPrintRoot(root);

  const clone = node.cloneNode(true) as HTMLElement;
  // [Task #554] A4DocumentFrame 이 인쇄/캡처 직전 토글하던 `data-print-prepared`
  //   는 화면 상태 마커이므로 격리 컨테이너에서는 의미가 없다. 잠재적 selector
  //   충돌을 피하기 위해 클론에서는 떼어 둔다.
  clone.removeAttribute("data-print-prepared");
  root.appendChild(clone);

  document.body.setAttribute(PRINT_BODY_ATTR, "");

  const mql = typeof window.matchMedia === "function" ? window.matchMedia("print") : null;

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    window.removeEventListener("afterprint", cleanup);
    // [Task #554] iOS Safari ≤13 / 일부 구형 WebKit 은 MediaQueryList 의
    //   addEventListener/removeEventListener 가 없고 addListener/removeListener
    //   만 노출한다. 둘 다 호환되도록 분기.
    if (mql) {
      if (typeof mql.removeEventListener === "function") {
        mql.removeEventListener("change", onMediaChange);
      } else if (typeof (mql as MediaQueryList & { removeListener?: (l: (e: MediaQueryListEvent) => void) => void }).removeListener === "function") {
        (mql as MediaQueryList & { removeListener: (l: (e: MediaQueryListEvent) => void) => void }).removeListener(onMediaChange);
      }
    }
    document.body.removeAttribute(PRINT_BODY_ATTR);
    clearPrintRoot(root);
    if (pendingCleanup === cleanup) pendingCleanup = null;
  };
  const onMediaChange = (e: MediaQueryListEvent) => {
    // print → screen 으로 전환되는 순간만 정리. screen → print 진입 시는 무시.
    if (!e.matches) cleanup();
  };

  pendingCleanup = cleanup;
  window.addEventListener("afterprint", cleanup);
  if (mql) {
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onMediaChange);
    } else if (typeof (mql as MediaQueryList & { addListener?: (l: (e: MediaQueryListEvent) => void) => void }).addListener === "function") {
      (mql as MediaQueryList & { addListener: (l: (e: MediaQueryListEvent) => void) => void }).addListener(onMediaChange);
    }
  }

  // 한 프레임 양보해 격리 스타일(`body[data-printing]` 플래그 + @media print
  // 규칙) 이 적용된 뒤 인쇄 다이얼로그가 뜨도록 한다. requestAnimationFrame
  // 한 번이면 Chromium/Firefox 모두 충분.
  requestAnimationFrame(() => {
    try {
      window.print();
    } catch {
      // 인쇄가 차단된 환경(예: 일부 모바일 PWA)에서는 즉시 정리한다.
      cleanup();
    }
  });
}
