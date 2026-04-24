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

## Task #323 — 업무일지 단일폴더 휴대용 앱 (work-log-standalone, 2026-04-24)
- **목표**: manager-app의 "관리소장 업무기록 → 일지 → 주보 → 월보" 흐름을 의존성 없는 단일 폴더로 추출 (`artifacts/work-log-standalone/`).
- **휴대성**: 폴더 전체를 통째로 복사하면 어디서든 `npm install && npm run dev` 로 동작. `@workspace/*` 또는 `catalog:` 의존성 0건. SQLite(`better-sqlite3`)로 외부 DB/인증/멀티테넌트 제거.
- **기능**: 4단계 일일 위저드(보안/미화/시설/민원, 상태 필수 + "특이사항" 선택 시 메모 필수 검증 모달), 카테고리/사진URL 빠른 메모, 일보/주보/월보 수동 생성 + A4 인쇄 CSS, 특이사항 강조 표시(요약 타일 + 별도 강조 섹션 + 행 하이라이트, 인쇄에도 색상 유지).
- **구성**: React 18.3 + Vite 6 + Express 4 + Drizzle, dev/prod 모두 단일 HTTP 서버에 Vite middleware/static 마운트. tsx는 `node ./node_modules/tsx/dist/cli.mjs`로 직접 호출(pnpm `.bin` 심볼릭 링크 의존성 회피, yarn PnP 미지원 — README 명시).
- **검증**: e2e 테스트(주요 흐름 전부) + healthz/today smoke API 통과.

## Task #296 — 유저유형별 이용현황 분석 대시보드
- DB: `usage_events` (user_id, role, path, menu_key, occurred_at). 180일 보존(스케줄러 일배치).
- API: `POST /api/usage-events` (인증, 서버측 role, platform_admin 자기 트래픽 제외) / `GET /api/platform/usage-analytics?range=7d|30d|90d&role=` (platform_admin only) — summary/byRole/topMenus + 직전 동기간 대비 % 변화율.
- Frontend: `useUsageTracker` hook (wouter location 변경 자동 전송), 페이지 `/platform/usage-analytics`.