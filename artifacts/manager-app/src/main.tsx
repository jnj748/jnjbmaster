import { createRoot } from "react-dom/client";
import { setAuthTokenGetter } from "@workspace/api-client-react";
// [Task #657] DEV 격자 단일 진실 — 모듈 스코프 핀 + history 래핑.
//   prod 에서는 dead code 제거되어 본 import 자체가 빈 모듈처럼 동작한다.
import { getAuthStorageKey } from "@/lib/dev-auth";
import App from "./App";
import "./index.css";

// React Query 의 generated hooks 가 호출하는 customFetch 는 이 getter 로
// Authorization 헤더용 토큰을 매번 가져온다.
//
// [Task #657 회귀 방지]
//   과거에는 main.tsx 와 auth-context.tsx 두 곳이 각자 URL/sessionStorage 를
//   따로 읽어 키를 만들었고, 4셀 격자에서 sessionStorage 가 공유/덮어쓰기되어
//   manager 셀이 facility/accountant 토큰을 들고 RFQ 생성을 시도 → 403.
//   이제는 두 곳 모두 `lib/dev-auth.ts` 의 모듈 스코프 핀 (`getAuthStorageKey`)
//   만 본다. 핀은 iframe 의 JS 컨텍스트 평가 시점에 한 번만 결정되고, 그 이후
//   sessionStorage / URL 변화에 영향받지 않는다 → 셀 간 토큰 오염 불가.
setAuthTokenGetter(() => localStorage.getItem(getAuthStorageKey()));

createRoot(document.getElementById("root")!).render(<App />);
