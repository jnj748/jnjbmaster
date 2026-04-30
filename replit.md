# 관리의달인 (Manager Master)

## Overview
관리의달인 (Manager Master) is an AI-powered property management work tool for Korean apartment and building managers of collective buildings under 150 units. It aims to streamline operations, enhance efficiency, and provide data-driven insights through centralized task management, tenant/owner/vehicle administration, automated document generation, vendor management, multi-step approval workflows, and facility/attendance management. The platform's vision is to become the leading digital assistant in Korean property management, reducing administrative burdens and enabling proactive management decisions.

## User Preferences
- I prefer clear and concise communication.
- I like to see detailed explanations for complex features.
- Please ask for confirmation before making any major structural changes or adding new dependencies.
- I want iterative development with frequent, small updates rather than large, infrequent ones.
- Ensure all generated code is well-commented and follows best practices for readability and maintainability.
- Do not make changes to files related to authentication unless explicitly requested.
- **파일럿 운영 중 (v1 미선언)**: 모든 결정/옵션 선택에서 가장 보수적인 안을 우선. v1 정식 출시 선언 전까지 유지.
- **변경 영향 범위 사전 분석 원칙**: 유저유형(역할/포털), 메뉴/사이드바, 권한, 공통 라벨·문구, DB enum, OpenAPI 스키마 등 "여러 화면·역할에 동시에 영향을 줄 수 있는 요소"를 변경할 때는 작업 시작 전에 반드시 영향 범위를 면밀히 조사해 보고하고 사용자가 결정할 수 있도록 한다. 최소한 다음을 함께 제시한다: ① 영향을 받는 역할/포털 목록, ② 변경되는 화면·메뉴·API·DB 항목, ③ 단일 소스(SoT) 위치와 미적용 위치, ④ 호환성 리스크(enum 키·세션·기존 데이터·외부 연동), ⑤ 권장 안과 대안. 사용자의 명시적 승인 후 구현에 들어간다.
- **작업 비용 사전 분류 원칙 (Replit ↔ Cursor 분업)**: 사용자의 새 요청이 들어오면 **착수 전에** 작업의 예상 비용·성격을 자체 분류하고, 다음 두 조건 중 **하나라도 해당**되면 진행 전에 사용자에게 인터랙티브 질문으로 확인을 받는다.
  - (조건 A) 예상 소요가 **30분 초과** (여러 파일·여러 격리 컨테이너·빌드 디버깅·다단계 사이클 동반).
  - (조건 B) 작업 성격이 **Cursor 에서 본인 개발자가 처리하는 게 더 효율적** — 예: 단순 텍스트/한글 라벨 변경, 색·여백·아이콘 잔손, 한 컴포넌트 안의 단순 스타일 조정, 정적 문구 교정, 이미 존재하는 페이지의 사소한 reorder 등.
  - 두 조건 모두 해당 안 되면(=Replit 에서 30분 이내 안전 처리 가능) **묻지 말고 바로 진행**한다(불필요한 인터랙션 회피).
  - 분류 결과는 질문 본문에서 한 줄로 사용자에게 알린다: 예) "이 작업은 약 1~2시간 예상, 격리된 인쇄 CSS 4종을 동시에 손봐야 합니다."
  - 인터랙티브 선택지로 다음 3개 옵션을 제시한다:
    1. `Replit 에서 그대로 진행 (권장 — 사유: …)` 또는 `Replit 에서 그대로 진행`
    2. `Cursor 에 보낼 프롬프트만 받기 — 본인/개발자가 직접 처리`
    3. `작업 더 잘게 쪼개기 — 어디부터 할지 다시 정하기`
  - 사용자가 옵션 2(`Cursor 프롬프트`) 를 선택하면 다음 형식의 **그대로 복사해서 Cursor 에 붙여넣을 수 있는 한국어 프롬프트** 를 코드블록으로 출력한다. 다른 작업은 시작하지 않는다.
    - 한 줄 요약 (무엇을 / 어디에)
    - 관련 파일 경로 목록 (저장소 루트 기준 상대 경로, 필요 시 함수/클래스 이름까지)
    - 변경해야 할 구체 동작 (전/후 동작 명세)
    - 주의사항 (영향 범위, 건드리면 안 되는 곳, 기존 테스트 깨지지 않게 등)
    - 검증 방법 (예: `pnpm --filter @workspace/manager-app run build`, `pnpm --filter @workspace/api-server run typecheck`, 또는 화면 수동 확인 절차)
    - 모노레포 컨텍스트 한 줄 (pnpm workspace, artifact 4개: api-server / manager-app / manager-mode-promo / mockup-sandbox)
  - 사용자가 옵션 3 을 선택하면 작업을 더 작은 단위로 분해한 안을 다시 인터랙티브 선택지로 제시한다.
  - **단순 진행 보고·일반 대화·명백한 한 줄 작업** 에는 본 룰을 적용하지 않는다.
- **신규 모듈 인테이크 체크리스트 (반드시 task 작성 전에 답을 채울 것)**: "검침", "예약", "결재라인", "방문일정" 같은 **신규 도메인 모듈**(=신규 producing 테이블이 1개 이상 생기거나, 신규 입력/조회 화면이 1개 이상 생기는 작업) 을 task 로 넘기기 전에, 반드시 아래 6개 질문에 사장님과 한 줄씩 결정을 채워 task 명세에 박아 넘긴다. **이 칸이 비어 있으면 task 를 시작하지 않는다.** 격리된 task 환경은 권한 SoT 를 자동으로 들고 가지 않으므로, 모듈별 도메인 정책은 명세에 박혀 있어야만 첫 컴파일부터 옳게 짠다.
  1. **본인 vs 직원 공유** — 한 건물 안에서: 입력자 본인만 보는가 / `직원`(관리소장·경리·시설담당) 모두 공유하는가 / 직책별 분리되 보는가?
  2. **본부장 가시성** — 관할 건물(`hq_building_assignments`) 의 데이터를 보는가? 수정 가능한가, 읽기만인가?
  3. **본사(`platform_admin`) 가시성** — 전 건물 통합 모니터링 대상인가? 익명/요약만 보여주는가?
  4. **파트너사 가시성** — 자기 `vendor_id` 와 연결된 행만 보는가, 아예 도메인 분리인가?
  5. **다른 모듈 자동 연동** — 입력 시 어떤 다운스트림이 자동으로 갱신되는가? (예: 검침 → 관리비 산출 / 공지문 토큰 / 일보 위계 / 알림함 / 결재 라인)
  6. **수정·삭제·이력** — 한 번 입력하면 끝인가, 수정 가능한가, 누가 수정 가능한가, 감사 이력 보관 필요한가?
  - 답은 항상 **위 6개 역할 중 누구를 가리키는지 명시** (예: "직원 공유 + 본부장 읽기 + 본사 익명 요약, 파트너 비가시"). 모호한 한국어("관계자 모두") 는 금지.
  - 답이 채워지면 task 명세 상단에 `## 가시성·연동 정책` 섹션으로 인용해 박는다. 동시에 `docs/user-roles/README.md` 와 `lib/shared/src/role-labels.ts` 를 `relevantFiles` 에 의무 첨부.
- **DEV-전용 디버그 도구 가드 (프로덕션 노출 절대 금지)**: "분할 프리뷰", "역할 토글 패널", "씨앗 데이터 시드 버튼" 같은 **개발 환경 검증/시연 전용 UI·라우트·API** 는 반드시 **3중 가드** 로 잠근다. 사장님이 프로덕션 화면에서 디버그 도구를 보시는 일은 절대 없어야 한다.
  1. **서버 라우트 가드** — `if (process.env.NODE_ENV === "production") return;` 또는 라우트 자체를 dev-only 모듈로 분리해서 production 부트에서 마운트되지 않게.
  2. **클라이언트 빌드 가드** — `import.meta.env.DEV` 로 컴포넌트·라우트를 감싸 production 번들에서 dead code 로 제거 (lazy import + DEV 분기).
  3. **시드 데이터 가드** — DEV 시드 함수는 진입 첫 줄에 `NODE_ENV !== "production"` early-return (이미 `seedTestUsers` 패턴). `seed`, `demo`, `test` 표식이 있는 행은 prod 마이그레이션·시드에서 절대 호출되지 않게.
  - task 명세에는 항상 위 3가드의 **각각 어디에 들어가는지 파일 경로 단위로 명시** 한다 ("dev-only" 라는 한 단어로 끝내지 않는다).
  - 검증 (자동화됨): `pnpm --filter @workspace/manager-app run build` 끝에 `node scripts/check-no-dev-leak.mjs` 가 자동 체이닝되어 `dist/public/` 의 모든 .html/.js/.mjs/.css 를 스캔, 디버그 식별자 화이트리스트(`preview-grid`, `auth_token__dev__`, `__dev_as__`, `/__dev/`) 가 1건이라도 발견되면 비-제로 exit 로 빌드 차단. 미래 새 디버그 도구가 생기면 `artifacts/manager-app/scripts/check-no-dev-leak.mjs` 의 `FORBIDDEN_TOKENS` 에 식별자 한 줄 추가만 하면 영구 회귀 보장.
  - **적용 사례 — DEV 분할 프리뷰 격자 (`/__dev/preview-grid`)** — 사용자 간 입력 연계 시각 검증용. 시드 `artifacts/api-server/src/seed-dev-demo-seeds.ts` (vendor + partner.vendor_id 매핑 + RFQ 1건 멱등, 결재 1건은 매 부팅 재시드 — title 화이트리스트 `[DEV 데모] …`). 격자 페이지 `artifacts/manager-app/src/pages/dev/preview-grid.tsx` (직원3 + 파트너1, 자동 polling 없음·새로고침 버튼만). 인증 키 분리는 **두 곳에서 동일 규약을 반복** — auth-context 의 `getAuthStorageKey` (`useAuth` 의 토큰 IO) 와 `main.tsx` 의 `setAuthTokenGetter` (React Query generated hooks 의 `customFetch` 가 매 호출마다 부르는 Authorization 헤더 getter). 둘 다 DEV + `?devAs=<email>` 또는 sessionStorage `__dev_as__` 일 때만 `auth_token__dev__<email>`, prod 는 항상 `auth_token`. 한 곳만 분기시키면(예: `main.tsx` 가 prod 키 하드코딩) 격자 셀의 모든 데이터 호출이 토큰 헤더 없이 나가서 401 다발 → "로딩 중…" 만 보임. DRY 보다 prod dead-code 제거 보장 우선 — 두 곳 다 `import.meta.env.DEV` 분기로 prod 차단(공통 유틸 추출 시 import 경로 따라 트리쉐이킹 실수 리스크). 라우트 등록은 `App.tsx` 의 `import.meta.env.DEV && DevPreviewGrid && location.startsWith("/__dev/preview-grid")` lazy 가드. **viewport 모드 토글** — 격자 헤더 select 또는 URL `?view=mobile|desktop|both` 로 모바일(2×2) / 웹(2×2) / 모바일+웹 동시(2행×4열, 위 모바일·아래 같은 4명 데스크톱) 전환. 데스크톱 셀은 `ScaledDesktopIframe` (iframe width=1024 로 manager-app 의 900px breakpoint 넘겨 `DesktopOnly` 활성 + `ResizeObserver` 로 컨테이너 폭 측정 → CSS `transform: scale(w/1024)` 셀 안 fit, scale 상한 1·`transformOrigin: top-left`·`height: 100/scale%`). 본부장/관리인/관리자는 격자에 안 넣고 빠른 로그인으로 따로 검증 (사장님 결정).
- **권한 SoT 체이너 (모든 신규 모듈 task 의 의무 첨부)**: 신규 모듈 task 명세를 작성할 때, 다음 두 경로는 반드시 `relevantFiles` 와 본문 인용에 함께 들어가야 한다. agent 가 권한 정책을 새로 추정하지 않고 SoT 를 따르도록 잠금:
  - `docs/user-roles/README.md` — 6개 역할 위계도 SoT
  - `lib/shared/src/role-labels.ts` — 역할 키·표시명·HQ 포털 분기 단일 정의
  - 추가로 모듈이 가시성 스코프 미들웨어를 사용한다면 `artifacts/api-server/src/services/approvalPipeline.ts` 의 `accessibleBuildingIds` 헬퍼 도 명시적으로 가리킨다 (본부장 매핑 패턴의 정본).
- **사장님 지시 해석 — 약어 사전(코드/UI 변경 아님, 의미 해석 규칙)**: 다음 약어들은 사장님이 평소 대화·지시·요구사항에서 줄여 부르시는 표현이다. 이 표현이 보이면 즉시 아래 정의로 풀어 해석하고 작업 범위를 잡는다. **사용자 노출 화면 라벨이 아니라 사장님-에이전트 사이의 협업 약어**이므로, 이 정의 자체로 코드/UI 텍스트를 일괄 치환하지 않는다.
  - **"직원"** = `manager`(관리소장) + `accountant`(경리) + `facility_staff`(시설담당) **3개 직책 모드 묶음**. 예: "이 기능을 직원에게 적용해 줘" = "관리소장·경리·시설담당 3개 모드에 모두 적용해 줘". `partner`(파트너사)·`hq_executive`(본부장)·`platform_admin`(본사) 은 직원이 **아니다**.
  - 약어를 다룰 때 모호하면 어느 모드까지 포함하는지 한 줄로 재확인한 뒤 진행한다.
  - 새 약어가 사장님 지시에 등장하면 본 사전에 추가해 박제한다.
- **개발 의사결정 질문 원칙(인터랙티브 선택지 사용)**: **개발 진행 중 사용자의 결정·선택이 필요한 사안**(스펙 분기, 옵션 선택, 우선순위, 적용 범위, 마이그레이션 방식, UI 분기 등)을 물을 때는 일반 텍스트가 아니라 **인터랙티브 질문 기능(클릭형 선택지)** 으로 제시해 사용자가 항목을 클릭만으로 답할 수 있게 한다. 적용 규칙:
  - 단일 선택이면 라벨이 명확한 클릭형 옵션 목록(choice)으로 제시한다. 각 옵션 라벨에는 핵심 영향/리스크를 짧게 포함한다(예: `옵션 A — 영향: …, 리스크: …`).
  - 복수 선택이 필요한 경우, 각 항목을 "예/아니오" 단일 질문으로 분해하거나 그룹별 단일 선택으로 나눠 여러 개의 인터랙티브 질문을 한 번에 제시한다.
  - 권장안이 있으면 라벨 끝에 `(권장)` 을 붙인다.
  - 정해진 보기에 맞지 않을 가능성이 있을 때만 마지막 옵션으로 "기타(직접 입력)" 를 두고, 선택 시에만 별도 텍스트 입력으로 후속 질의한다.
  - 결정에 영향을 주는 맥락(영향 범위, 호환성 리스크, SoT 위치 등)은 질문 직전 본문에서 요약 제공하고, 질문 자체에는 옵션과 짧은 설명만 둔다.
  - 개발 의사결정이 아닌 일반 대화·확인·진행 보고에는 적용하지 않는다.
  - 마크다운 체크박스(`- [ ]`) 표기는 채팅 UI에서 클릭이 불가능한 단순 텍스트이므로 사용하지 않는다.

## System Architecture
The project uses a pnpm monorepo with Node.js 24 and TypeScript 5.9, structured into `api-server`, `web`, `db`, and `api-spec` packages.

**Frontend:**
- Developed with React, Vite, Tailwind CSS, and shadcn/ui.
- Features distinct portals for `building` managers, `hq` (headquarters), and `partner` vendors with role-based dashboards.
- Employs a mobile-first design (900px desktop breakpoint) with Korean UI text.
- Optimizations include React.lazy, Vite manualChunks, and React Query.

**Backend:**
- Built on an Express 5 API framework.
- Utilizes JWT-based authentication and a robust Role-Based Access Control (RBAC) system for 6 roles (`platform_admin`, `hq_executive`, `manager`, `accountant`, `facility_staff`, `partner`).
- API definitions use OpenAPI specifications, with Orval for client codegen and Zod for validation.

**Database:**
- PostgreSQL is the primary database, managed by Drizzle ORM.
- Schema supports users, tasks, inspections, vendors, tenants, owners, vehicles, notifications, and approvals.
- Automated schema migration on API server boot.

**Core Features & Design Patterns:**
- **Modular Monorepo Structure:** Clear separation of concerns.
- **Automated Document Generation:** Reporting and notices.
- **Multi-step Approval Workflows:** Flexible, up to 5 levels, for various processes like tasks and RFQs.
- **AI Integration:** For commission records and vendor matching.
- **Role-Based Access Control (RBAC):** `docs/user-roles/README.md` is the Single Source of Truth.
- **BuildingContext:** Global context for building-specific data.
- **Dynamic Dashboards:** Role-based with mobile navigation.
- **Integrated Calendar:** Aggregates accounting and facility events.
- **ERP-style Accounting Dashboard:** Includes pre-billing checklists and management fee calculations.
- **Facility Management Dashboard:** Central for inspections, safety, and maintenance.
- **Attendance Management:** PC/mobile check-in/out.
- **In-app Notification System:** Real-time alerts.
- **Document Templates:** 5 default system templates with customization.
- **Hierarchical Reporting:** Aggregates daily reports to weekly/monthly.
- **Legal Compliance:** Integrates Korean legal requirements, including privacy data auto-destruction.
- **Meter Reading Management:** Bulk upload, manual entry, anomaly detection.
- **Billing & Collections:** ERP-style billing, trend analysis, Kakao notifications, and delinquency detection.
- **Complaints Management:** Enhanced workflow with status tracking and auto-escalation.
- **Electronic Voting:** Agendas, participation tracking, and results.
- **Monthly Reporting Pipeline:** Automated summary report generation.
- **Partner Marketplace:** Extended vendor categories and warranty tracking.
- **Seasonal Maintenance:** Suggestions and one-click RFQ creation.
- **Geo-based Vendor Matching:** RFQ matching by location.
- **Object Storage Integration:** Presigned URLs for attachments.
- **Unit Management:** CRUD operations for building units, including bulk import.
- **Digital Tenant Card:** Token-based self-registration with manager verification.
- **Building Setup & Integration:** Connects with Korean `건축물대장` API and Kakao Postcode.
- **Usage Analytics Dashboard:** For platform administrators.
- **Onboarding Automation:** Streamlined manager setup.
- **Unified Alert Action Modal:** Common modal for all alerts, routing RFQ actions to a dedicated page.
- **Per-role Daily Journals:** Role-specific journals for manager, accountant, and facility staff.

## External Dependencies
- jsPDF
- @google-cloud/storage
- papaparse
- data.go.kr (BldRgstHubService API for building register info)
- Kakao Postcode API