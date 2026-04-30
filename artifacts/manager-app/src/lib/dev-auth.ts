// [Task #657] DEV 격자 manager 셀 견적요청 403 회귀 — 단일 진실 토큰 핀.
//
// 문제 요약 (replit.md 와 .local/tasks/task-657.md 참고):
//   `/__dev/preview-grid` 4셀 격자에서 manager 셀의 RFQ 생성이 403 으로 막혔다.
//   원인은 같은 origin iframe 4개가 sessionStorage 의 `__dev_as__` 키를 서로
//   덮어써서, manager 셀이 한 번 wouter setLocation 으로 navigate 한 직후
//   facility/accountant 토큰을 들고 /api/rfqs 를 치고 있었다는 것.
//
// 본 모듈의 역할:
//   - iframe 의 JS 컨텍스트가 처음 평가될 때 단 한 번 `?devAs=<email>` 을 읽어
//     모듈 스코프 변수 `pinnedDevAs` 에 박아 둔다.
//   - 모듈 스코프 변수는 iframe 별 JavaScript 컨텍스트에 고립돼 있어
//     다른 iframe(=다른 사용자) 가 절대 덮어쓸 수 없다 → manager 셀이 자기
//     평생 manager 토큰만 본다.
//   - 그 이후 `setAuthTokenGetter` (main.tsx) 와 AuthProvider (auth-context.tsx)
//     는 모두 본 모듈의 `getAuthStorageKey()` 만 호출 → 단일 진실.
//
// 가드 (prod 누수 0):
//   - 모든 진입은 `if (import.meta.env.DEV)` 또는 `import.meta.env.DEV ? ... :`
//     분기 안에 있다. prod 빌드에서 vite/esbuild 가 `import.meta.env.DEV` 를
//     `false` 로 치환하면 본 파일의 모든 분기가 dead code 가 되어 minifier 가
//     `__dev_as__`, `auth_token__dev__`, `devAs` 문자열까지 통째로 제거한다.
//   - `getAuthStorageKey()` 는 prod 에서 항상 "auth_token" literal 만 반환.
//   - 빌드 후 `scripts/check-no-dev-leak.mjs` (manager-app 의 build 스크립트가
//     `vite build && node scripts/check-no-dev-leak.mjs` 형태로 자동 호출)가
//     dist 번들을 grep 으로 재검증해 회귀를 빌드 시점에 차단한다.
//
// 또한 본 모듈은 DEV 한정으로 `window.history.pushState/replaceState` 를 한 번
// 래핑해, wouter 가 `setLocation("/rfqs")` 처럼 path 만 넘기는 navigation 에서
// `?devAs=<email>` 쿼리가 살아남도록 한다. (사용자가 셀 안에서 새로고침/북마크
// 했을 때도 컨텍스트가 유지되는 보조 효과.)

const DEV_AS_QUERY_PARAM = "devAs";
const DEV_AS_SESSION_KEY = "__dev_as__";

let pinnedDevAs: string | null = null;
let historyPatched = false;

if (import.meta.env.DEV && typeof window !== "undefined") {
  // 1) URL 우선 — iframe 별 src 가 다르므로 URL 은 항상 자기 사용자의 권위 있는 신호.
  const fromUrl = new URLSearchParams(window.location.search).get(DEV_AS_QUERY_PARAM);
  if (fromUrl) {
    pinnedDevAs = fromUrl;
    // sessionStorage 는 best-effort fallback. 다른 iframe 이 이를 덮어써도
    // 본 모듈은 더 이상 sessionStorage 를 읽지 않는다 (모듈 변수만 본다).
    try {
      window.sessionStorage.setItem(DEV_AS_SESSION_KEY, fromUrl);
    } catch {
      /* private mode 등에서 실패 가능 — 무시. URL 핀만 있으면 충분. */
    }
  } else {
    // URL 에 ?devAs= 가 없는 단독 직접 진입(스탠드얼론 디버깅) 케이스.
    // sessionStorage 를 한 번만 읽고 그대로 핀.
    try {
      pinnedDevAs = window.sessionStorage.getItem(DEV_AS_SESSION_KEY);
    } catch {
      pinnedDevAs = null;
    }
  }

  // 2) wouter setLocation 등 path-만 navigation 에서도 `?devAs=` 가 살아남도록
  //    history.pushState/replaceState 를 래핑한다. iframe 의 history 는 부모창과
  //    분리돼 있어 이 래핑은 셀 내부에만 영향.
  if (pinnedDevAs && !historyPatched) {
    historyPatched = true;
    const pin = pinnedDevAs;
    const origPush = window.history.pushState.bind(window.history);
    const origReplace = window.history.replaceState.bind(window.history);

    const preserve = (url: string | URL | null | undefined): string | URL | null | undefined => {
      if (url == null) return url;
      try {
        const u = new URL(url.toString(), window.location.href);
        if (!u.searchParams.has(DEV_AS_QUERY_PARAM)) {
          u.searchParams.set(DEV_AS_QUERY_PARAM, pin);
        }
        // pathname + search + hash 형태로 같은 origin 상대 URL 반환 (history API 권장).
        return `${u.pathname}${u.search}${u.hash}`;
      } catch {
        return url;
      }
    };

    window.history.pushState = function patchedPushState(
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ) {
      return origPush(data, unused, preserve(url) ?? null);
    };
    window.history.replaceState = function patchedReplaceState(
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ) {
      return origReplace(data, unused, preserve(url) ?? null);
    };
  }
}

/**
 * 격자 셀의 devAs 핀 값. prod 빌드에서는 항상 null.
 *
 * 핀은 모듈이 처음 평가될 때 한 번만 결정되며, 이후 어떤 navigation/scroll/
 * sessionStorage 변경에도 변하지 않는다 → 같은 iframe 내 모든 React Query/
 * mutation 호출이 같은 사용자 토큰만 사용함을 보장한다.
 */
export function getDevAsPin(): string | null {
  if (!import.meta.env.DEV) return null;
  return pinnedDevAs;
}

/**
 * AuthProvider / setAuthTokenGetter 가 사용하는 단일 키 결정 함수.
 * - prod: 항상 "auth_token" (string literal — minifier 가 분기 통째로 제거).
 * - DEV + 핀 있음: `auth_token__dev__<email>` (격자 셀별 분리).
 * - DEV + 핀 없음 (스탠드얼론 직접 진입): `auth_token` (단일 사용자 디버깅).
 */
export function getAuthStorageKey(): string {
  if (!import.meta.env.DEV) return "auth_token";
  return pinnedDevAs ? `auth_token__dev__${pinnedDevAs}` : "auth_token";
}
