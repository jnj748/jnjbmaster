# 관리의달인 (Manager Master)

## Overview
관리의달인 (Manager Master) is an AI-powered property management work tool for Korean apartment and building managers, specifically for collective buildings under 150 units. The platform aims to streamline operations, enhance efficiency, and provide comprehensive insights through automation and data-driven features. Its core capabilities include centralized task and schedule management, tenant/owner/vehicle administration, automated document generation, vendor management, robust multi-step approval workflows, and facility/attendance management. The business vision is to become the leading digital assistant for property managers in Korea, reducing administrative burden and enabling more proactive management decisions.

## User Preferences
- I prefer clear and concise communication.
- I like to see detailed explanations for complex features.
- Please ask for confirmation before making any major structural changes or adding new dependencies.
- I want iterative development with frequent, small updates rather than large, infrequent ones.
- Ensure all generated code is well-commented and follows best practices for readability and maintainability.
- Do not make changes to files related to authentication unless explicitly requested.
- **파일럿 운영 중 (v1 미선언)**: 모든 결정/옵션 선택에서 가장 보수적인 안을 우선. v1 정식 출시 선언 전까지 유지.

## 견적 도착 알림 → 계약 체결 흐름 (Task #335, 2026-04-25)
- **목표**: 파트너가 견적을 제출 → 매니저 대시보드 "필수업무현황" 빨간 신호등 카드("견적 도착, 확인하세요") → 클릭 시 `/rfqs?openQuote={id}` 로 이동해 견적 패널 자동 오픈 → "수락하고 계약 진행" CTA → 기존 결재/계약 자동 생성 → 파트너 vendor portal 에 알림 → 파트너가 "계약 내용에 동의" → 5단계 트래커(견적도착·견적수락·파트너동의·본사결재·계약활성화). 모두 인앱 딥링크.
- **DB 스키마**: `contracts.partner_agreed_at TIMESTAMPTZ` 추가 (`lib/db/drizzle/0017_task335_partner_agreed.sql`).
- **OpenAPI**: `Alert.type` enum 에 `quote_received` 추가, `Contract.partnerAgreedAt` 필드, 신규 `POST /contracts/{id}/agree` (operationId `agreeContractAsPartner`).
- **API**:
  - `POST /quotes`: 제출 시 `manager:{rfq.buildingId}` 에 `quote_received` 알림 삽입.
  - `PATCH /quotes/:id` (accepted): 자동 생성 contract 에 `buildingId` 세팅, `vendor:{vendorId}` 에 `contract_draft_ready` 알림.
  - `GET /dashboard/alerts`: rfqs+quotes 조인하여 `firstViewedAt IS NULL` 인 submitted 견적을 건물 단위(`manager:{buildingId}`) `quote_received` 알림으로 노출 (severity=critical, dueDate=오늘).
  - `POST /contracts/:id/agree` (partner only): 본인 vendor 일치/멱등 처리 후 `partnerAgreedAt` 갱신, `manager:{buildingId}` 에 `contract_partner_agreed` 알림.
- **프론트**:
  - `dashboard-manager-legacy.tsx`: `quote_received` 핸들러 → `/rfqs?openQuote={id}` 라우팅.
  - `rfqs.tsx`: `?openQuote=` 쿼리 파라미터 처리, `useGetQuote` 로 firstViewedAt 자동 기록, 비교 패널 자동 오픈, 대시보드 알림 invalidate. 채택 CTA 라벨 "채택" → "수락하고 계약 진행".
  - `contracts.tsx ContractDetailDialog`: 5단계 트래커 표시 (견적도착·견적수락·파트너동의·본사결재·계약활성화).
  - `vendor-portal.tsx`: `?openContract=` 쿼리 파라미터 → 견적 탭으로 전환 + `ResponsiveDialog` 로 계약 상세 + "계약 내용에 동의" 버튼(`useAgreeContractAsPartner`).
- **라우팅 보정**: 기존 `quotesRouter`/`contractsRouter` 가 `buildingRouter`(파트너 차단) 하위에 마운트되어 파트너 호출이 항상 403 이었음. 다음을 `buildingRouter` 앞 최상단에 마운트해 해결:
  - `quotesRouter` (자체 `requireRole("manager","platform_admin","accountant","partner")` 보유) — `buildingRouter` 내 중복 마운트 제거.
  - `partnerContractsRouter` (신규, `routes/contracts.ts` 에서 named export). 라우터 진입 시 `req.user.role !== "partner"` 면 `next("router")` 로 통째로 패스해, 매니저/HQ 의 `/contracts` 호출이 회귀 없이 뒤의 매니저용 `contractsRouter` 로 흐르게 한다.
    - `GET /contracts` (partner only) — vendorId 가 본인 vendor 와 일치하지 않으면 403, 미지정이면 본인 vendor 로 강제.
    - `GET /contracts/:id` (partner only) — vendor 소유 검증, 타사 계약 조회 시 403.
    - `POST /contracts/:id/agree` (partner only) — vendor 일치 검증, 멱등 처리.
- **수락 → 계약 자동 이동**: 매니저가 "수락하고 계약 진행" 클릭 시 `rfqs.tsx::handleAcceptQuote` 가 PATCH 후 `listContracts()` 로 자동 생성된 계약을 찾아 `/contracts?openContract={id}` 로 이동. 계약 페이지가 자동으로 다이얼로그를 열고 5단계 트래커가 노출된다.
- **타입 안전성**: CreateRfqBody 스키마에 `buildingId` 필드 추가(orval 재생성). `routes/rfqs.ts` 에서 `data: any`/`(incoming as any).buildingId` 캐스트 제거하고 정규 타입으로 처리.
- **신호등 색상 동적화**: `dashboard.ts` quote_received 알림의 severity / dueDate 를 RFQ 마감일 기준으로 산출 (≤1일=critical, ≤3일=warning, 그 외 info). 마감일 없으면 critical 폴백.
- **버그 수정**: 매니저가 작성하는 RFQ 의 `buildingId` 가 비어 있던 문제를 `routes/rfqs.ts` POST 핸들러에서 본인 `users.buildingId` 로 자동 보강. 견적 알림이 정상적으로 건물 단위 매니저에게 도달하도록 함.
- **DB 보정**: `buildings.register_data jsonb` 컬럼이 스키마에는 있으나 DB 에 누락되어 견적 제출 시 500. `ALTER TABLE buildings ADD COLUMN IF NOT EXISTS register_data jsonb` 적용.
- **검증 (curl + executeSql)**: 파트너 견적 제출 → manager:1 알림/대시보드 critical 카드 노출 → 매니저 PATCH accept → contract.building_id=1, vendor:1 알림 → 파트너 agree → contract.partner_agreed_at 세팅, manager:1 알림. 멱등 호출 200, 비파트너 호출 403 확인.

## 관리소장 첫 시작 자동화 (Task #106, 2026-04-18 — Phase 1)
- **법령 임계치 정정**: `domain/statutory.ts` 기계설비유지관리자 등급 임계치 — 특급 30000→60000, 고급 20000→30000 (시행규칙 별표1 정합). 더 엄격→완화 방향이라 안전성 위배 없음.
- **신규 컬럼**: `users.onboarding_preference` (varchar(16) NULL/'started'/'browsing'). 첫 로그인 모달 선택값 영구 저장.
- **신규 API**: `GET /api/onboarding/status` (gate1 hard / gate2 soft 진행률), `POST /api/onboarding/preference`. manager 역할만 동작, 다른 역할은 빈 상태/403.
- **클라이언트 신규**: `OnboardingProvider`, `OnboardingModal`(외부 닫기 차단·강제 선택), `OnboardingGate`(/onboarding redirect, started 모드 한정), `BrowsingBanner`(상단 배너), `/onboarding` 페이지(building-setup 재활용 + 진행 단계 헤더).
- **회귀 보존**: 비-manager 역할은 OnboardingProvider 쿼리 자체가 비활성. /onboarding 직접 접근도 manager 외에는 / 로 redirect. 기존 manager 계정은 첫 로그인 시 모달 강제 선택 후 기존 동작 복귀.
- **후속 (별도 태스크 필요)**:
  - 준공일 기반 역산 스케줄(scheduleFromCompletion.ts) + 하자담보 D-Day 카드 + 위저드 "준공일 모름" 체크
  - 둘러보기 모드에서 자동화 카드 회색 처리 (4개 카드 visual disable)
  - Gate 2 강제: 직원 미등록 시 일일근무점검표 메뉴 회색, 협력사 미등록 시 지출결의서 메뉴 회색
  - UX 가이드 헬퍼(FieldGuidePopover): 한전 청구서 계약전력 위치 등 이미지 가이드
  - 발전용량 합산 로직, 가이드 이미지 에셋, OCR

## 번들 다이나믹 임포트 정비 (Task #145, 2026-04-20)
- **무거운 라이브러리를 동적 import 로 전환** — 초기 번들에서 제외, 실제 사용 시점에만 다운로드:
  - `jspdf` (~386KB / gzip 125KB): `tenants.tsx`/`vehicles.tsx`/`owners.tsx`의 `exportXxxCard()` 핸들러 내부에서 `await import("jspdf")`.
  - `papaparse` (~20KB): `units.tsx`의 `handleCsvFile()` 내부.
  - `html-to-image` (purify.es ~23KB + chunk): `lib/document-export.ts::downloadElementAsPng` 내부 (rfq/완료통지 발급 시점).
- **App.tsx**: `Login` 도 `lazy()` 로 전환 (인증 후 사용자에는 다운로드 안 됨).
- **vite manualChunks 추가**: `framer-motion`→`motion`, `react-day-picker`+`date-fns`→`date`. (recharts/lucide/@radix-ui 는 기존 분리 유지.)
- **번들 비교 (gzip)**:
  | 항목 | Before | After | 비고 |
  |---|---|---|---|
  | initial `index` | 32 KB | 30 KB | Dashboard 셸 분리 |
  | jspdf | tenants/owners/vehicles 페이지 청크에 inline | **125 KB lazy chunk** | 클릭 시점 로드 |
  | papaparse | units 페이지 청크에 inline | **7 KB lazy chunk** | CSV 업로드 시점 |
  | html-to-image (purify+core) | rfq/완료통지 청크에 inline | **8 KB lazy chunk** (+47 KB html2canvas 별도) | PNG 다운로드 시점 |
  | framer-motion | (manualChunks 미설정) | **40 KB `motion` chunk** | |
  | date-fns + react-day-picker | (manualChunks 미설정) | **21 KB `date` chunk** | |
  | recharts | 110 KB `charts` (기존) | 110 KB (변동 없음) | 기존 분리 유지 |
  | Dashboard 셸 | 정적 import (`index` 포함) | 별도 lazy 청크 | 비-대시보드 첫 진입 시 절감 |
- **초기 진입 (gzip 기준)**: react-vendor 46 + ui 58 + index 30 + api-client 19 ≈ **153 KB**. 그 외 청크는 라우트/이벤트 시점 로드.
- **사용자 피드백**: 모든 PDF/CSV 핸들러는 동적 import 중 버튼 disabled + Loader2 스피너 + 실패 시 destructive toast.

## Codebase Cleanup Notes (Task #102, 2026-04-17)
- **삭제 완료 (Task #125, 2026-04-19)**: 미사용 UI 컴포넌트 14개 + `executive-dashboard.tsx` (이전 `artifacts/manager-app/src/_deprecated/`) 영구 삭제. 참조 0건 재확인 후 폴더 제거.
  - UI: accordion, aspect-ratio, breadcrumb, carousel, collapsible, command, context-menu, hover-card, input-otp, kbd, menubar, navigation-menu, pagination, resizable
- **devDependencies 제거 (6개)**: react-icons, cmdk, input-otp, react-day-picker, react-hook-form, @hookform/resolvers (모두 `pnpm why`로 직접 사용처 0건 검증).
- **개발 전용 라우트**: `/__layout-check`는 `import.meta.env.DEV` 가드로 prod 번들에서 제외.
- **법정 상수 추출**: `LEGAL_PRESETS`(법정점검 29개) 및 안전관리자 선임/의무소독 임계치(전기 75/1000kW, 소방 11층/15000㎡, 가스 1000/2000㎥, 기계 1만~3만㎡, 정통 시행일 등)를 `artifacts/api-server/src/domain/statutory.ts`로 verbatim 이동. `routes/inspections.ts`/`routes/buildings.ts`는 import 사용 (값/분기/메시지 무변경, BC 유지).
- **남아있는 후속 정리 후보 (v1 이후)**: 14개 UI에 대응되는 Radix devDeps 7종(@radix-ui/react-accordion 등), embla-carousel-react, large file 분할(buildings.ts/inspections.ts).

## System Architecture
The project is a pnpm workspace monorepo using Node.js 24 and TypeScript 5.9.

**Frontend:**
- Built with React, Vite, and Tailwind CSS, using shadcn/ui for components.
- Features `building`, `hq`, and `partner` portals with role-based dashboards.
- Implements data export using jsPDF and a mobile-first design with a custom 900px desktop breakpoint.
- UI text is exclusively in Korean.

**Backend:**
- An Express 5 API framework with JWT-based authentication and a comprehensive Role-Based Access Control (RBAC) system supporting 6 roles.
- API codegen uses Orval from an OpenAPI specification, with Zod for data validation.

**Database:**
- PostgreSQL is the primary database, managed by Drizzle ORM.
- The schema supports modules for approvals, users, tasks, inspections, vendors, tenants, owners, vehicles, notifications, and various reports and checklists.

**Core Features & Design Patterns:**
- **Modular Monorepo:** Organized into distinct packages (`api-server`, `web`, `db`, `api-spec`).
- **Automated Document Generation:** Generates weekly reports, expense approvals, repair maintenance drafts, and legal inspection notices.
- **Workflow Management:** Supports multi-step approvals (up to 5 levels) for tasks, inspections, RFQs, and work reports.
- **AI Integration:** AI-powered commission record generation and vendor matching.
- **BuildingContext:** Global context for building-specific information, optimized for manager roles.
- **Dashboard & Navigation:** Restructured dashboards with a mobile bottom navigation and desktop sidebar with categorized sections.
- **Calendar Page:** Aggregates all accounting and facility management events with color-coding and detailed event lists.
- **관리비회계 Dashboard (ERP):** ERP-style interface for billing, including pre-billing checklists, a management fee calculation engine, and unit warnings.
- **시설관리 Dashboard:** Hub for facility management, including legal inspections, safety checklists, and maintenance logs.
- **Attendance Management:** PC/mobile check-in/out with automated detection and manager visualizations.
- **Notification System:** In-app notifications for various events.
- **Document Templates:** 5 default system templates with custom template management.
- **Performance Optimization:** Utilizes React.lazy code splitting, Vite manualChunks, and React Query optimizations.
- **Hierarchical Reporting:** Daily reports aggregate into weekly and monthly summaries.
- **Legal Compliance:** Integrates Korean legal requirements for inspections (29 presets) and privacy data auto-destruction (tenant/owner data anonymization after 3 years). Includes traffic light system for alerts and delay reason recording.
- **Meter Reading (검침 관리):** Manages water/electricity/gas/heating meter readings with CSV bulk upload, manual entry, and anomaly detection.
- **Billing & Fees (관리비 부과/수납):** ERP-style billing with summary cards, trend comparison charts, Kakao notifications, and interim settlement.
- **Complaints (민원 관리):** Enhanced complaint management with status workflow, extended categories, sensitivity grading, auto-escalation, recurring complaint detection, and analytics dashboard for HQ.
- **Electronic Voting (전자투표):** Enables creating vote agendas, tracking participation, and displaying results with ballot uniqueness.
- **Accounting→Report Pipeline:** Automated monthly report generation querying structured accounting fields and storing them in `monthly_summary_reports` table.
- **Delinquency Automation (연체 자동화):** Billing-based detection of overdue units, tracking actions (notice, parking suspension), and auto-resolution. Vehicle status includes `suspended`.
- **Partner Marketplace Enhancement:** Extended vendor categories and subcategories, linked to building `approvalDate` for warranty tracking.
- **Warranty Tracking (하자담보):** Tracks warranties with 12 presets, expiry dates, and 60/30-day alerts.
- **Seasonal Maintenance Workflows:** Provides seasonal maintenance suggestions with priority levels and one-click RFQ creation.
- **Geo-based Vendor Matching:** RFQs can auto-match vendors by region.
- **Object Storage:** Used for photo attachments via presigned URLs.
- **Unit Management (호실 관리):** Full CRUD for building units with CSV bulk import and auto-generation.
- **Digital Tenant Card (디지털 입주자카드):** Token-based self-registration for tenants, including personal info, vehicle registration, document uploads, and electronic signature. Manager verification workflow.
- **Building Setup & Integration:** Integrates with the `건축물대장` (Building Register) API for information and automated inspection scheduling, utilizing Kakao Postcode address search.

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
- esbuild
- jsPDF
- @google-cloud/storage
- papaparse
- data.go.kr BldRgstHubService/getBrTitleInfo, getBrRecapTitleInfo, getBrExposPubuseAreaInfo

## Task #296 — 유저유형별 이용현황 분석 대시보드
- DB: `usage_events` (user_id, role, path, menu_key, occurred_at). 180일 보존(스케줄러 일배치).
- API: `POST /api/usage-events` (인증, 서버측 role, platform_admin 자기 트래픽 제외) / `GET /api/platform/usage-analytics?range=7d|30d|90d&role=` (platform_admin only) — summary/byRole/topMenus + 직전 동기간 대비 % 변화율.
- Frontend: `useUsageTracker` hook (wouter location 변경 자동 전송), 페이지 `/platform/usage-analytics`.

## 모바일 앱화 (고정 셸 레이아웃, 2026-04-24)
- `artifacts/manager-app/src/components/layout.tsx` 의 모바일(@media max-width:899px) 레이아웃을 "고정 셸"로 전환:
  - `.layout-grid` height = `calc(100dvh - 60px - safe-area)` + `overflow: hidden` (하단 네비 위까지 정확히 차지).
  - `.layout-column` 은 그리드 100% 채움, `min-height: 0` 으로 flex 자식 높이 제한 해제.
  - `.layout-content-area` 가 `flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding-bottom: 0` 로 내부 스크롤 컨테이너가 됨.
- 효과: 컨텐츠가 1뷰포트 안에 들어가는 페이지(대시보드 위젯이 적은 경우, 짧은 폼 등)는 스크롤바가 전혀 안 뜨고, 긴 페이지는 헤더/하단네비 고정한 채 본문만 스크롤(앱 같은 동작).
- 데스크탑(≥900px)은 기존 body-scroll 유지 — 사이드바 + body scroll 그대로.
- `artifacts/manager-app/src/pages/ai-assistant.tsx` 의 `.ai-assistant-fill` 도 부모가 이미 100dvh-bound 가 됐으므로 `height: calc(100% + 패딩)` 로 단순화. 데스크탑은 dvh 기반 유지.