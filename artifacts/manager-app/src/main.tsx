import { createRoot } from "react-dom/client";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

// [DEV 분할 격자 호환] React Query 의 generated hooks 가 호출하는 customFetch 는 이
//   getter 로 Authorization 헤더용 토큰을 매번 가져온다. DEV 격자 환경에서는 사용자별
//   로 분리된 키 (`auth_token__dev__<email>`) 에 토큰이 박혀 있으므로 prod 키
//   (`auth_token`) 만 보면 격자 셀의 모든 데이터 호출이 토큰 헤더 없이 나가서 401
//   다발이 발생한다(증상: 격자 셀이 "로딩 중…" 만 보이고 본문이 안 뜸).
//
//   가드:
//   - DEV: URL `?devAs=` 또는 sessionStorage `__dev_as__` 로 키를 분기.
//     auth-context.tsx 의 getAuthStorageKey 와 동일한 규약을 사용한다(DRY 보다 prod
//     dead-code 제거 보장 우선 — 두 곳 다 import.meta.env.DEV 분기로 prod 차단).
//   - prod: 하단 else 만 살고 위 if 블록은 vite/esbuild 가 통째로 dead code 로 제거.
//     이로써 `auth_token__dev__` / `__dev_as__` 문자열이 prod 번들에 들어가지 않으며,
//     `scripts/check-no-dev-leak.mjs` 가 빌드 후 자동으로 grep 검증한다.
if (import.meta.env.DEV) {
  setAuthTokenGetter(() => {
    // **URL ?devAs= 우선** (auth-context.tsx#getAuthStorageKey 와 같은 규약).
    //   sessionStorage 가 같은 origin iframe 사이에서 분리되지 않거나 마지막
    //   iframe 의 setItem 이 앞 iframe 의 값을 덮어쓰는 환경에서, 격자 4셀이 모두
    //   같은 사용자 토큰을 사용하는 회귀를 방지. URL 은 iframe 별 고유.
    const fromUrl = new URLSearchParams(window.location.search).get("devAs");
    const devAs = fromUrl || window.sessionStorage.getItem("__dev_as__");
    return localStorage.getItem(devAs ? `auth_token__dev__${devAs}` : "auth_token");
  });
} else {
  setAuthTokenGetter(() => localStorage.getItem("auth_token"));
}

createRoot(document.getElementById("root")!).render(<App />);
