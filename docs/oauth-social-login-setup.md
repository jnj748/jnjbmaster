# 소셜 로그인 키 발급 가이드 (네이버 · 카카오 · 구글)

이 문서는 운영자가 새로운 환경(로컬 개발, 스테이징, 프로덕션)에 **네이버 / 카카오 / 구글 OAuth 로그인**을 처음부터 끝까지 설정할 수 있도록 정리한 가이드입니다. 코드 동작을 변경하지 않고, 콘솔 등록 절차 · 필요한 동의 항목 · 콜백 URL 형식 · 환경변수 등록법 · 키 누락 시 화면 동작을 한 곳에 모아 두는 것이 목적입니다.

---

## 1. 공통 사항

### 1-1. 콜백(리디렉션) URL 규칙

서버는 환경변수와 요청 도메인을 바탕으로 콜백 URL을 다음 우선순위로 자동 생성합니다 (`artifacts/api-server/src/lib/oauth.ts` 의 `getRedirectBaseUrl`).

1. `OAUTH_REDIRECT_BASE_URL` 환경변수가 있으면 그 값을 베이스로 사용 (끝의 `/` 는 제거됨).
2. 위 값이 없고 `REPLIT_DEV_DOMAIN` 이 있으면 `https://<REPLIT_DEV_DOMAIN>` 사용.
3. 위 값이 없고 `REPLIT_DOMAINS` 가 있으면 콤마로 구분된 첫 번째 도메인을 `https://` 와 함께 사용.
4. 모두 없으면 `http://localhost:5000`.

각 공급자의 콜백 URL은 베이스 뒤에 다음 경로가 붙습니다.

| 공급자 | 콜백 경로 |
| --- | --- |
| 네이버 | `/api/auth/oauth/naver/callback` |
| 카카오 | `/api/auth/oauth/kakao/callback` |
| 구글 | `/api/auth/oauth/google/callback` |

예시 (프로덕션 도메인이 `https://app.example.com` 인 경우):

```
https://app.example.com/api/auth/oauth/naver/callback
https://app.example.com/api/auth/oauth/kakao/callback
https://app.example.com/api/auth/oauth/google/callback
```

> **중요**: 운영하려는 모든 환경(로컬, 스테이징, 프로덕션) 각각의 콜백 URL을 콘솔에 **모두** 등록해야 합니다. 도메인이 한 글자라도 다르면 인증이 실패합니다(`redirect_uri_mismatch`).

### 1-2. 환경변수 한눈에 보기

| 환경변수 | 용도 |
| --- | --- |
| `OAUTH_REDIRECT_BASE_URL` | (선택) 콜백 URL 베이스를 강제로 지정. 예: `https://app.example.com` |
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | 네이버 OAuth 앱 키 |
| `KAKAO_REST_API_KEY` / `KAKAO_CLIENT_SECRET` | 카카오 OAuth 앱 키 (REST API 키 + 보안 ‘Client Secret’) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 구글 OAuth 클라이언트 키 |

> Replit 환경에서는 위 값을 **Secrets 패널**에 등록합니다. 직접 코드나 `.env` 파일에 커밋하지 마세요.

설정 예시 (Replit Secrets):

```
OAUTH_REDIRECT_BASE_URL = https://app.example.com
NAVER_CLIENT_ID         = abcd1234efgh5678
NAVER_CLIENT_SECRET     = ********
KAKAO_REST_API_KEY      = 0123456789abcdef0123456789abcdef
KAKAO_CLIENT_SECRET     = ********
GOOGLE_CLIENT_ID        = 1234567890-xxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET    = ********
```

### 1-3. 키 등록 후 점검

- API 서버를 재시작합니다(Workflow 재시작).
- 브라우저에서 `GET /api/auth/oauth/providers` 를 호출하면 다음과 같이 각 공급자의 활성화 여부를 확인할 수 있습니다.

```json
{
  "providers": [
    { "provider": "naver", "enabled": true },
    { "provider": "kakao", "enabled": true },
    { "provider": "google", "enabled": false }
  ]
}
```

`enabled: false` 인 공급자는 환경변수가 비어 있는 상태입니다.

---

## 2. 네이버 (NAVER Developers)

### 2-1. 콘솔 등록 절차

1. [https://developers.naver.com](https://developers.naver.com) 에 접속하여 로그인합니다.
2. 상단 **Application > 애플리케이션 등록**을 선택합니다.
3. 다음 항목을 입력합니다.
   - **애플리케이션 이름**: 예) `관리의달인 (운영)`
   - **사용 API**: `네이버 로그인` 선택
   - **제공 정보 선택 (필수/선택)**: 아래 “필요한 동의 항목” 참고
4. **로그인 오픈 API 서비스 환경**에서 `PC 웹` 을 추가하고 다음을 입력합니다.
   - **서비스 URL**: 베이스 도메인 (예: `https://app.example.com`)
   - **Callback URL**: `https://app.example.com/api/auth/oauth/naver/callback`
   - 스테이징/로컬도 사용 시, 같은 화면에서 추가 Callback URL을 함께 등록합니다.
5. 등록을 완료하면 **Client ID** 와 **Client Secret** 이 발급됩니다.

### 2-2. 필요한 동의 항목

서버는 네이버에서 `id`, `email`, `name`(또는 `nickname`) 만 사용합니다.

- **필수 제공 정보**: 회원이름(또는 별명) 중 하나
- **선택 제공 정보**: 이메일 주소

> 네이버는 이메일 검증 여부를 응답에 포함하지 않습니다. 그래서 서버는 네이버 이메일을 “미검증”으로 취급하고, 같은 이메일을 가진 기존 계정을 자동으로 연결하지 않습니다(가입 흐름에서 명시적 연결 단계를 거칩니다). 이 정책은 의도된 동작입니다.

### 2-3. 환경변수 매핑

| 콘솔 항목 | 환경변수 |
| --- | --- |
| Client ID | `NAVER_CLIENT_ID` |
| Client Secret | `NAVER_CLIENT_SECRET` |

---

## 3. 카카오 (Kakao Developers)

### 3-1. 콘솔 등록 절차

1. [https://developers.kakao.com](https://developers.kakao.com) 에 접속하여 로그인합니다.
2. **내 애플리케이션 > 애플리케이션 추가하기** 로 새 앱을 만듭니다 (앱 이름, 사업자명 입력).
3. 좌측 메뉴 **앱 설정 > 일반** 에서 **REST API 키** 값을 확인합니다 → `KAKAO_REST_API_KEY` 로 사용합니다.
4. 좌측 메뉴 **제품 설정 > 카카오 로그인** 에서 **카카오 로그인 활성화 = ON** 으로 설정합니다.
5. **Redirect URI** 항목에 다음을 추가합니다.
   - `https://app.example.com/api/auth/oauth/kakao/callback`
   - 스테이징/로컬 도메인용 URI도 함께 추가합니다.
6. **보안 > Client Secret** 메뉴에서 **코드 생성**을 누르고 상태를 **사용함(ON)** 으로 설정합니다 → `KAKAO_CLIENT_SECRET` 으로 사용합니다.
7. **동의 항목** 메뉴에서 아래 항목을 설정합니다.

### 3-2. 필요한 동의 항목

서버가 호출하는 스코프는 `account_email profile_nickname` 입니다 (`oauth.ts` 카카오 설정).

| 동의 항목 | 설정 |
| --- | --- |
| 닉네임 (`profile_nickname`) | **필수 동의** |
| 카카오계정(이메일) (`account_email`) | **선택 동의** 또는 **필수 동의** (선택 동의 시 사용자가 거부하면 이메일이 비어 옵니다) |

> 동의 항목 활성화에는 카카오 측 검수가 필요할 수 있습니다. 비즈 앱 등록을 미리 진행해 두면 절차가 매끄럽습니다.

### 3-3. 환경변수 매핑

| 콘솔 항목 | 환경변수 |
| --- | --- |
| REST API 키 | `KAKAO_REST_API_KEY` |
| 보안 → Client Secret | `KAKAO_CLIENT_SECRET` |

---

## 4. 구글 (Google Cloud Console)

### 4-1. 콘솔 등록 절차

1. [https://console.cloud.google.com](https://console.cloud.google.com) 에 접속하여 프로젝트를 선택(또는 새로 생성)합니다.
2. 좌측 **API 및 서비스 > OAuth 동의 화면** 으로 이동하여 동의 화면을 구성합니다.
   - User Type: **외부(External)**
   - 앱 이름, 사용자 지원 이메일, 개발자 연락처 입력.
   - **앱 도메인** 에 서비스 도메인(예: `app.example.com`) 등록.
   - **승인된 도메인** 에 동일 도메인 추가.
3. **범위(Scopes)** 에서 다음을 추가합니다 (서버가 사용하는 스코프).
   - `openid`
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
4. (선택) 검수 전에는 **테스트 사용자** 목록에 운영자 이메일을 추가해야 로그인 가능.
5. 좌측 **API 및 서비스 > 사용자 인증 정보** 에서 **사용자 인증 정보 만들기 > OAuth 클라이언트 ID** 선택.
   - 애플리케이션 유형: **웹 애플리케이션**
   - **승인된 자바스크립트 원본**: `https://app.example.com`
   - **승인된 리디렉션 URI**: `https://app.example.com/api/auth/oauth/google/callback`
   - 스테이징/로컬용 원본 및 리디렉션 URI도 함께 등록합니다.
6. 생성 후 표시되는 **클라이언트 ID** 와 **클라이언트 보안 비밀** 을 복사합니다.

### 4-2. 필요한 동의 항목

서버는 구글로부터 `sub`(고유 ID), `email`, `email_verified`, `name` 만 사용합니다. 위 3가지 스코프(`openid email profile`)만 있으면 충분합니다.

> 구글은 `email_verified=true` 일 때만 “이메일 검증됨”으로 취급되어, 같은 이메일을 가진 기존 계정과 자동 연결됩니다. 외부 IdP를 통해 가입한 계정 등 검증되지 않은 경우는 명시적 연결 단계를 거칩니다.

### 4-3. 환경변수 매핑

| 콘솔 항목 | 환경변수 |
| --- | --- |
| OAuth 클라이언트 ID | `GOOGLE_CLIENT_ID` |
| OAuth 클라이언트 보안 비밀 | `GOOGLE_CLIENT_SECRET` |

---

## 5. 키가 누락되었을 때의 화면 동작

`/api/auth/oauth/providers` 응답에서 `enabled: false` 로 내려오는 공급자는 로그인 화면(`artifacts/manager-app/src/pages/login.tsx`)에서 다음과 같이 처리됩니다.

- 해당 공급자 버튼이 **흐리게(opacity 40%) 표시**되고, `pointer-events-none` 으로 **클릭이 비활성화**됩니다.
- 버튼에 마우스를 올리면 다음 안내 툴팁이 나타납니다(데스크톱 기준).
  > “관리자가 해당 공급자를 아직 구성하지 않았습니다.”
- `<a aria-disabled="true">` 로 표시되어 보조 기술에서도 비활성 상태로 인식됩니다.
- 비활성 버튼은 `href` 자체가 설정되지 않으며 클릭 이벤트도 차단되어 어떤 요청도 발생하지 않습니다.

`/api/auth/oauth/providers` 는 공급자 3개(naver/kakao/google)를 **항상** 반환하므로, 일반 사용자 포털(`building`/`partner`)에서는 키가 모두 누락되더라도 소셜 버튼 묶음 자체는 화면에 보이고 **모든 버튼이 비활성 상태**로 표시됩니다(예: 모두 회색조). 영역(버튼 묶음 + “또는 이메일로” 구분선) 자체가 사라지는 경우는 응답이 비어 있을 때(`providers.length === 0`) 또는 본사(HQ) 포털일 때뿐입니다.

> 본사(HQ) 포털에서는 정책상 소셜 로그인을 지원하지 않으므로, 키 등록 여부와 무관하게 항상 소셜 버튼이 표시되지 않습니다.

### 모든 공급자가 비활성일 때 응답 예시

```json
{
  "providers": [
    { "provider": "naver",  "enabled": false },
    { "provider": "kakao",  "enabled": false },
    { "provider": "google", "enabled": false }
  ]
}
```

이 상태에서는 화면에 세 개의 비활성(흐림) 버튼이 모두 보이며, 활성화하려면 해당 공급자의 환경변수를 등록한 뒤 API 서버를 재시작해야 합니다.

### 키 등록 후 화면이 살아나는 순서

1. Replit Secrets에 키 등록.
2. API 서버 워크플로우 재시작.
3. 로그인 페이지를 새로고침 → 해당 공급자 버튼이 색상 그대로 표시되며 클릭이 활성화됩니다.

---

## 6. 자주 발생하는 오류

| 증상 | 원인 / 해결 |
| --- | --- |
| 콜백 URL 페이지에서 `error=invalid_state` | CSRF 쿠키 만료/유실. 같은 브라우저·도메인에서 다시 시도하고, 베이스 URL 설정(`OAUTH_REDIRECT_BASE_URL`)이 실제 접속 도메인과 같은지 확인합니다. |
| 공급자 페이지에서 `redirect_uri_mismatch` | 콘솔에 등록한 Redirect URI와 실제 콜백 URL이 한 글자라도 다릅니다. 1-1 절의 규칙을 그대로 등록했는지 확인합니다. |
| 콜백에서 `error=oauth_failed` | 토큰 교환 실패. Client Secret이 잘못 입력됐거나, Kakao의 Client Secret 상태가 “사용 안 함” 인지 확인합니다. |
| 콜백에서 `error=hq_not_allowed` | 본사 포털 계정으로는 소셜 로그인을 사용할 수 없습니다(정책). 이메일·비밀번호로 로그인합니다. |
| 가입 후 `email_collision_unverified` 응답 | 같은 이메일의 기존 계정이 있고, 공급자가 이메일 소유를 검증하지 않은 경우입니다. 이메일·비밀번호로 먼저 로그인한 뒤 [설정 > 소셜 계정] 에서 직접 연결합니다. |

---

## 7. 변경 시 체크리스트

새 환경에 OAuth를 처음부터 설정할 때 한 번에 점검하세요.

- [ ] `OAUTH_REDIRECT_BASE_URL` 가 실제 접속 도메인과 일치한다.
- [ ] 네이버/카카오/구글 콘솔의 Redirect URI 에 해당 도메인용 콜백 URL이 모두 등록되어 있다.
- [ ] 카카오의 **Client Secret** 이 “사용함” 상태이다.
- [ ] 카카오 동의 항목에서 닉네임은 필수, 이메일은 운영 정책에 맞게 설정되어 있다.
- [ ] 구글 OAuth 동의 화면이 게시(또는 테스트 사용자 등록) 상태이며, 스코프가 `openid email profile` 을 포함한다.
- [ ] Replit Secrets에 위 7개 환경변수가 모두 등록되어 있다.
- [ ] API 서버 워크플로우를 재시작했고, `/api/auth/oauth/providers` 가 모든 공급자에 대해 `enabled: true` 를 반환한다.
- [ ] 로그인 화면에서 각 공급자 버튼이 정상 색상으로 보이고 클릭 시 콘솔 로그인 페이지로 이동한다.
