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
- **개발 의사결정 질문 원칙(인터랙티브 선택지 사용)**: **개발 진행 중 사용자의 결정·선택이 필요한 사안**(스펙 분기, 옵션 선택, 우선순위, 적용 범위, 마이그레이션 방식, UI 분기 등)을 물을 때는 일반 텍스트가 아니라 **인터랙티브 질문 기능(클릭형 선택지)** 으로 제시해 사용자가 항목을 클릭만으로 답할 수 있게 한다. 적용 규칙:
  - 단일 선택이면 라벨이 명확한 클릭형 옵션 목록(choice)으로 제시한다. 각 옵션 라벨에는 핵심 영향/리스크를 짧게 포함한다(예: `옵션 A — 영향: …, 리스크: …`).
  - 복수 선택이 필요한 경우, 각 항목을 "예/아니오" 단일 질문으로 분해하거나 그룹별 단일 선택으로 나눠 여러 개의 인터랙티브 질문을 한 번에 제시한다.
  - 권장안이 있으면 라벨 끝에 `(권장)` 을 붙인다.
  - 정해진 보기에 맞지 않을 가능성이 있을 때만 마지막 옵션으로 "기타(직접 입력)" 를 두고, 선택 시에만 별도 텍스트 입력으로 후속 질의한다.
  - 결정에 영향을 주는 맥락(영향 범위, 호환성 리스크, SoT 위치 등)은 질문 직전 본문에서 요약 제공하고, 질문 자체에는 옵션과 짧은 설명만 둔다.
  - 개발 의사결정이 아닌 일반 대화·확인·진행 보고에는 적용하지 않는다.
  - 마크다운 체크박스(`- [ ]`) 표기는 채팅 UI에서 클릭이 불가능한 단순 텍스트이므로 사용하지 않는다.

## 개발 속도·비용 절감 운영 원칙 (Task #493)
- **테스트 정책 (위험도 차등)**:
  - **시각 확인만으로 충분한 변경(스크린샷 1장)**: 색·문구·라벨·아이콘·텍스트 위치·카드/위젯 순서·여백·폰트 크기·CSS print 외 시각 스타일 변경. e2e 테스트를 돌리지 않는다.
  - **e2e 테스트 필수 변경**: DB 스키마/마이그레이션·인증/세션·권한(RBAC)·결제/PG·인쇄(@media print)·관리비·연체·검침 등 **계산 로직**·외부 API(건축물대장·카카오·네이버 등)·다중 화면에 걸친 데이터 흐름·신규 엔드포인트.
  - 그 외 회귀 위험이 모호한 경우 사용자에게 묻지 말고 보수적으로 e2e 1회 수행.
- **요청·작업 묶기 권장**: 같은 화면/같은 도메인의 수정은 한 메시지에 모아서 요청한다. 작업 1건마다 환경 부팅·코드리뷰·머지 후처리·e2e 고정비가 누적되므로, 묶을수록 30~50% 절감된다. 도메인이 다르면 분리.
- **Plan vs Build 사용 기준**:
  - **Build 직접**(Plan 건너뜀): 한 줄·라벨·색·위치·순서 변경, 기존 컴포넌트의 props 추가 같은 단순 수정. 영향 범위가 1개 화면·1개 역할 안에서 끝나는 작업.
  - **Plan 모드 의무**: 여러 역할·여러 화면에 동시 영향(공통 라벨·권한·메뉴·사이드바), DB 스키마/마이그레이션, OpenAPI 스키마 변경, 신규 기능, 거대 파일 분리 같은 리팩터링.
- **거대 파일 가이드 (1,000줄 룰)**: 단일 파일이 1,000줄을 넘으면 후속 변경의 컨텍스트 비용이 5배 이상으로 늘어난다. 해당 파일을 수정할 기회가 생길 때 도메인/탭 단위로 분리해 둔다(현 시점 분리 후보: `pages/work-log.tsx`·`pages/dashboard-manager-legacy.tsx`·`routes/buildings.ts` 등 — Task #494~#496 에서 분리 진행).

## 워크플로 운영 정책 (Task #493)
- 세션 시작 시 자동으로 가동되는 워크플로는 **api-server·manager-app 두 개만**. 나머지 보조 아티팩트는 작업할 때만 수동으로 시작한다.
  - `mockup-sandbox` (디자인 탐색·UI 프로토타입용 Vite 프리뷰): 캔버스에서 컴포넌트 변형을 비교할 때만 시작.
  - `manager-mode-promo` (관리소장 모드 홍보 슬라이드 데크): 데크를 편집·미리보기 할 때만 시작.
- 두 보조 워크플로가 필요해지면 사용자가 "mockup-sandbox 켜줘" / "홍보 데크 띄워줘" 처럼 요청하거나, 직접 `pnpm --filter @workspace/<slug> run dev` 로 실행할 수 있다. 평소엔 메모리/CPU 부담을 줄여 manager-app HMR 속도를 끌어올린다.

## System Architecture
The project utilizes a pnpm workspace monorepo structure, built with Node.js 24 and TypeScript 5.9.

**Frontend:**
- Built with React, Vite, and Tailwind CSS, using shadcn/ui for components.
- Features distinct portals for `building` managers, `hq` (headquarters), and `partner` vendors, each with role-based dashboards.
- Implements a mobile-first design approach with a custom 900px desktop breakpoint and UI text exclusively in Korean.
- Supports data export functionalities, leveraging `jsPDF` for PDF generation.
- Mobile layouts are designed as a "fixed shell" where content scrolls within a fixed header and bottom navigation, mimicking native app behavior, while desktop retains body scrolling.
- Performance optimization includes React.lazy code splitting, Vite manualChunks, and React Query optimizations for heavy libraries like `jspdf`, `papaparse`, and `html-to-image`.

**Backend:**
- Built on an Express 5 API framework.
- Employs JWT-based authentication and a comprehensive Role-Based Access Control (RBAC) system supporting 6 distinct roles.
- API definitions are managed via OpenAPI specifications, with Orval used for API client codegen and Zod for robust data validation.

**Database:**
- PostgreSQL serves as the primary database, managed by Drizzle ORM.
- The database schema supports a wide range of modules including users, tasks, inspections, vendors, tenants, owners, vehicles, notifications, approvals, and various reporting and checklist functionalities.
- **Schema migration policy ([Task #454])**: 개발 DB 는 `scripts/post-merge.sh` 가 머지 직후 `pnpm --filter db push --force` 로 동기화하고, **운영(autoscale) DB 는 api-server 가 부팅할 때 `artifacts/api-server/src/lib/runMigrations.ts` 의 `runMigrations()` 가 `lib/db/drizzle/*.sql` 신규 파일을 자동 적용**한다. `_app_migrations` 테이블이 적용 이력을 추적하며, 신규 환경에서 첫 부팅이면 BASELINE_FILES 목록을 도장만 찍고 스킵한다. 새 마이그레이션 SQL 은 반드시 `IF NOT EXISTS` / `ON CONFLICT DO NOTHING` 등 멱등 패턴으로 작성해야 한다(같은 파일이 dev 에서는 push --force 로 이미 반영된 상태에서 운영 부팅 시 한 번 더 실행되기 때문). 빌드 시 `build.mjs` 가 SQL 파일을 `dist/migrations/` 로 복사한다.
  - **운영 가드레일**:
    - 마이그레이션은 `app.listen` **이전**에 실행되며 실패 시 `process.exit(1)` 로 즉시 부팅을 중단한다(stale schema 로 트래픽 수신 방지).
    - 동시 인스턴스 부팅은 `pg_advisory_lock(4540001)` 로 직렬화되므로 다중 instance autoscale 에서도 안전.
    - 베이스라인 도장(첫 부팅 BASELINE_FILES INSERT)은 단일 트랜잭션. 도중 실패 시 전부 롤백되어 부분-stamped 상태가 남지 않는다.
  - **장애/복구 절차**:
    1) 부팅이 "Failed to run database migrations" 로 깨지면 prod DB 에 직접 `SELECT * FROM "_app_migrations" ORDER BY filename;` 으로 어디까지 적용됐는지 확인.
    2) 문제 파일이 멱등이 아니거나 스키마와 충돌하면 임시로 `INSERT INTO "_app_migrations"(filename) VALUES('0XXX_xxx.sql')` 로 수동 도장 후 재배포.
    3) BASELINE_FILES 목록을 수정해야 할 만큼 운영 스키마가 더 드리프트되어 있다면, 재현용 SQL 을 별도 0XXX 파일로 추가하는 편이 안전(BASELINE_FILES 자체는 손대지 않음).

**Core Features & Design Patterns:**
- **Modular Monorepo:** The codebase is organized into `api-server`, `web`, `db`, and `api-spec` packages.
- **Automated Document Generation:** Supports generating weekly reports, expense approvals, maintenance drafts, and legal inspection notices.
- **Multi-step Approval Workflows:** Implements flexible approval processes (up to 5 levels) for tasks, inspections, RFQs, and work reports. This includes a detailed workflow for quote reception, acceptance, partner agreement, and contract activation with in-app deep-linking and multi-stage trackers.
- **AI Integration:** Incorporates AI for commission record generation and intelligent vendor matching.
- **BuildingContext:** Provides a global context for building-specific information, optimized for manager roles.
- **Dynamic Dashboards:** Role-based dashboards with mobile bottom navigation and desktop sidebar for categorized access, including usage analytics for platform administrators.
- **Integrated Calendar:** Aggregates and color-codes all accounting and facility management events with detailed event lists.
- **ERP-style Accounting Dashboard:** Features pre-billing checklists, a management fee calculation engine, and unit-specific warnings.
- **Facility Management Dashboard:** Central hub for legal inspections (29 presets), safety checklists, and maintenance logs, incorporating legal compliance requirements and a traffic light alert system with delay reason recording.
- **Attendance Management:** PC/mobile check-in/out with automated detection and manager visualizations.
- **In-app Notification System:** Provides real-time alerts for various system events.
- **Document Templates:** Offers 5 default system templates with options for custom template management.
- **Performance Optimization:** Leverages React.lazy for code splitting, Vite manualChunks for bundle optimization, and React Query for efficient data fetching.
- **Hierarchical Reporting:** Aggregates daily reports into weekly and monthly summaries.
- **Legal Compliance:** Integrates Korean legal requirements, including privacy data auto-destruction (tenant/owner data anonymization after 3 years).
- **Meter Reading Management:** Handles water, electricity, gas, and heating meter readings with CSV bulk upload, manual entry, and anomaly detection.
- **Billing & Collections:** ERP-style billing, trend analysis, Kakao notifications, and interim settlements. Includes automated delinquency detection (including `suspended` vehicle status), tracking actions, and auto-resolution.
- **Complaints Management:** Enhanced workflow with status tracking, extended categories, sensitivity grading, auto-escalation, recurring complaint detection, and analytics for HQ.
- **Electronic Voting:** Functionality for creating agendas, tracking participation, and displaying results with ballot uniqueness.
- **Monthly Reporting Pipeline:** Automated generation of monthly summary reports by querying structured accounting data and storing them in `monthly_summary_reports`.
- **Partner Marketplace:** Extended vendor categories, subcategories, and warranty tracking (12 presets, expiry dates, 60/30-day alerts) linked to building approval dates.
- **Seasonal Maintenance:** Provides suggestions with priority levels and one-click RFQ creation.
- **Geo-based Vendor Matching:** RFQs can automatically match vendors based on geographical location.
- **Object Storage Integration:** Utilizes presigned URLs for secure photo attachments.
- **Unit Management:** Full CRUD operations for building units, including CSV bulk import and auto-generation.
- **Digital Tenant Card:** Token-based self-registration for tenants, encompassing personal info, vehicle registration, document uploads, and e-signatures, with manager verification.
- **Building Setup & Integration:** Integrates with the Korean `건축물대장` (Building Register) API for information and automated inspection scheduling, using Kakao Postcode for address searches.
- **Usage Analytics Dashboard:** Tracks user activity (`usage_events`) for platform_admin to analyze usage patterns by role, path, and menu, including percentage changes over time.
- **Onboarding Automation:** Streamlined first-time manager login with preference selection, status tracking, and guided setup.
- **Role Display Labels (Single Source):** 6개 역할(`platform_admin`, `hq_executive`, `manager`, `accountant`, `facility_staff`, `partner`)의 화면 표시명은 `lib/shared/src/role-labels.ts` 의 `ROLE_LABELS` (및 `PORTAL_LABELS`) 한 곳에서만 정의된다. 프런트/백엔드 모든 표시 문구는 `import { ROLE_LABELS } from "@workspace/shared/role-labels"` 로 가져오며, enum 키(`platform_admin` 등)는 DB·API 호환을 위해 절대 변경하지 않는다. 라벨 변경 시 본 파일만 수정하면 전체 반영된다.

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
