# 관리의달인 (Manager Master)

## Overview
관리의달인 (Manager Master) is an AI-powered property management work tool designed for Korean apartment and building managers, specifically for collective buildings under 150 units. The platform aims to revolutionize property management by streamlining operations, enhancing efficiency, and providing comprehensive, data-driven insights. Key capabilities include centralized task and schedule management, tenant/owner/vehicle administration, automated document generation, vendor management, robust multi-step approval workflows, and facility/attendance management. The business vision is to become the leading digital assistant in the Korean property management sector, significantly reducing administrative burdens and enabling more proactive management decisions through automation and intelligent features.

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

- **개발 의사결정 질문 원칙(인터랙티브 선택지 사용)**: **개발 진행 중 사용자의 결정·선택이 필요한 사안**(스펙 분기, 옵션 선택, 우선순위, 적용 범위, 마이그레이션 방식, UI 분기 등)을 물을 때는 일반 텍스트가 아니라 **인터랙티브 질문 기능(클릭형 선택지)** 으로 제시해 사용자가 항목을 클릭만으로 답할 수 있게 한다. 적용 규칙:
  - 단일 선택이면 라벨이 명확한 클릭형 옵션 목록(choice)으로 제시한다. 각 옵션 라벨에는 핵심 영향/리스크를 짧게 포함한다(예: `옵션 A — 영향: …, 리스크: …`).
  - 복수 선택이 필요한 경우, 각 항목을 "예/아니오" 단일 질문으로 분해하거나 그룹별 단일 선택으로 나눠 여러 개의 인터랙티브 질문을 한 번에 제시한다.
  - 권장안이 있으면 라벨 끝에 `(권장)` 을 붙인다.
  - 정해진 보기에 맞지 않을 가능성이 있을 때만 마지막 옵션으로 "기타(직접 입력)" 를 두고, 선택 시에만 별도 텍스트 입력으로 후속 질의한다.
  - 결정에 영향을 주는 맥락(영향 범위, 호환성 리스크, SoT 위치 등)은 질문 직전 본문에서 요약 제공하고, 질문 자체에는 옵션과 짧은 설명만 둔다.
  - 개발 의사결정이 아닌 일반 대화·확인·진행 보고에는 적용하지 않는다.
  - 마크다운 체크박스(`- [ ]`) 표기는 채팅 UI에서 클릭이 불가능한 단순 텍스트이므로 사용하지 않는다.

## System Architecture
The project utilizes a pnpm workspace monorepo structure, built with Node.js 24 and TypeScript 5.9.

**Frontend:**
- Built with React, Vite, and Tailwind CSS, using shadcn/ui for components.
- Features distinct portals for `building` managers, `hq` (headquarters), and `partner` vendors, each with role-based dashboards.
- Implements a mobile-first design approach with a custom 900px desktop breakpoint and UI text exclusively in Korean.
- Supports data export functionalities, leveraging `jsPDF` for PDF generation.
- Mobile layouts are designed as a "fixed shell" while desktop retains body scrolling.
- Performance optimization includes React.lazy code splitting, Vite manualChunks, and React Query optimizations.

**Backend:**
- Built on an Express 5 API framework.
- Employs JWT-based authentication and a comprehensive Role-Based Access Control (RBAC) system supporting 6 distinct roles.
- API definitions are managed via OpenAPI specifications, with Orval used for API client codegen and Zod for robust data validation.

**Database:**
- PostgreSQL serves as the primary database, managed by Drizzle ORM.
- The database schema supports a wide range of modules including users, tasks, inspections, vendors, tenants, owners, vehicles, notifications, and approvals.
- Schema migration is automated on API server boot, ensuring idempotency and preventing stale schemas.

**Core Features & Design Patterns:**
- **Modular Monorepo:** Codebase is organized into `api-server`, `web`, `db`, and `api-spec` packages.
- **Automated Document Generation:** Supports generating various reports and notices.
- **Multi-step Approval Workflows:** Implements flexible approval processes (up to 5 levels) for tasks, inspections, RFQs, and work reports, including detailed tracking and deep-linking.
- **AI Integration:** Incorporates AI for commission record generation and intelligent vendor matching.
- **BuildingContext:** Provides a global context for building-specific information.
- **Dynamic Dashboards:** Role-based dashboards with mobile navigation and desktop sidebar.
- **Integrated Calendar:** Aggregates and color-codes accounting and facility management events.
- **ERP-style Accounting Dashboard:** Features pre-billing checklists, management fee calculation, and unit-specific warnings.
- **Facility Management Dashboard:** Central hub for legal inspections, safety checklists, and maintenance logs with compliance features.
- **Attendance Management:** PC/mobile check-in/out with automated detection.
- **In-app Notification System:** Provides real-time alerts.
- **Document Templates:** Offers 5 default system templates with custom management options.
- **Hierarchical Reporting:** Aggregates daily reports into weekly and monthly summaries.
- **Legal Compliance:** Integrates Korean legal requirements, including privacy data auto-destruction.
- **Meter Reading Management:** Handles various meter readings with bulk upload, manual entry, and anomaly detection.
- **Billing & Collections:** ERP-style billing, trend analysis, Kakao notifications, interim settlements, and automated delinquency detection.
- **Complaints Management:** Enhanced workflow with status tracking, auto-escalation, and analytics.
- **Electronic Voting:** Functionality for agendas, participation tracking, and result display.
- **Monthly Reporting Pipeline:** Automated generation of monthly summary reports.
- **Partner Marketplace:** Extended vendor categories, subcategories, and warranty tracking.
- **Seasonal Maintenance:** Provides suggestions and one-click RFQ creation.
- **Geo-based Vendor Matching:** RFQs can automatically match vendors based on location.
- **Object Storage Integration:** Utilizes presigned URLs for secure photo attachments.
- **Unit Management:** Full CRUD operations for building units, including bulk import.
- **Digital Tenant Card:** Token-based self-registration for tenants with manager verification.
- **Building Setup & Integration:** Integrates with the Korean `건축물대장` (Building Register) API and Kakao Postcode.
- **Usage Analytics Dashboard:** Tracks user activity for platform administrators.
- **Onboarding Automation:** Streamlined first-time manager login and guided setup.
- **Role Display Labels (Single Source):** All role display names are centrally defined in `lib/shared/src/role-labels.ts` for consistency across front and backend.
- **Unified Alert Action Modal (#511):** All alert types share the same modal with four tabs — 처리완료 / 처리예정 / 연기 / 비교견적. The 비교견적 tab no longer hosts an inline RFQ form; it routes to `/rfqs?prefill=1&...`. 처리예정 actions store a `scheduled_date` on `alert_actions`; alerts remain visible on the dashboard with a yellow `예정 D-N` badge (red `예정 경과 N일` after the date passes).
- **Per-role Daily Journals:** Within one building, manager / accountant / facility_staff each maintain their own daily journals (DB unique key `(building_id, journal_date, role)`). The 4 journal sections share columns `security/cleaning/facility/complaint` but display role-specific labels (manager: 보안/청소/시설/민원, accountant: 수납·연체/지출/결재·기안/민원, facility_staff: 소방/전기/기계설비/기타). Work-log categories are also role-scoped (manager: facility/bill/complaint, accountant: receivable/expense/draft/complaint, facility_staff: fire/electric/mechanical/other). The manager preview auto-includes subordinate work-log entries for the same date with role labels, and surfaces "M월 D일자 OO 일보" lateArrivals when subordinates back-date a journal. Weekly/monthly reports stay journal-date based. Permissions: manager sees all building entries; subordinates only see their own.

## External Dependencies
- Node.js
- TypeScript
- pnpm
- React
- Vite
- Tailwind CSS
- shadcn/ui
- Express
- PostgreSQL
- Drizzle ORM
- Zod
- Orval
- jsPDF
- @google-cloud/storage
- papaparse
- data.go.kr (BldRgstHubService/getBrTitleInfo, getBrRecapTitleInfo, getBrExposPubuseAreaInfo)