# 관리의달인 (Manager Master)

## Overview
관리의달인 (Manager Master) is an AI-powered property management work tool designed for Korean apartment and building managers, specifically for collective buildings under 150 units (subject to 집합건물법). The platform aims to streamline operations, enhance efficiency, and provide comprehensive insights through automation and data-driven features. Key capabilities include centralized task and schedule management, tenant/owner/vehicle administration, automated document generation, vendor management, robust multi-step approval workflows, and facility/attendance management. The business vision is to become the leading digital assistant for property managers in Korea, reducing administrative burden and enabling more proactive management decisions.

## User Preferences
- I prefer clear and concise communication.
- I like to see detailed explanations for complex features.
- Please ask for confirmation before making any major structural changes or adding new dependencies.
- I want iterative development with frequent, small updates rather than large, infrequent ones.
- Ensure all generated code is well-commented and follows best practices for readability and maintainability.
- Do not make changes to files related to authentication unless explicitly requested.

## System Architecture

The project is built as a pnpm workspace monorepo using Node.js 24 and TypeScript 5.9.

**Frontend:**
- Developed with React, Vite, and Tailwind CSS.
- Utilizes shadcn/ui for UI components, ensuring a consistent and modern design.
- Features three distinct portals: `building` (managers, accountants, facility staff), `hq` (HQ executives, platform admins), and `partner` users, with role-appropriate dashboards and navigation.
- Data export functionality (e.g., tenant/owner/vehicle cards) is implemented using jsPDF.
- Designed with a mobile-first approach, featuring a custom 900px desktop breakpoint, bottom navigation for mobile, and touch-friendly UX.
- UI text is exclusively in Korean.

**Backend:**
- An Express 5 API framework handles all backend logic.
- Authentication is JWT-based with a comprehensive Role-Based Access Control (RBAC) system supporting 6 roles: `manager`, `partner`, `platform_admin`, `hq_executive`, `accountant`, `facility_staff`. Privilege escalation is prevented (only platform_admin can create hq_executive/platform_admin accounts). Password can be auto-generated as temp password for admin-created accounts.
- API codegen uses Orval to generate hooks and Zod schemas from an OpenAPI specification.
- Data validation is performed using Zod (`zod/v4`) and `drizzle-zod`.

**Database:**
- PostgreSQL is used as the primary database.
- Drizzle ORM facilitates database interactions and schema management.
- The schema supports various modules including approvals, users, tasks, inspections, legal inspections, drafts, tax schedules, vendors, commissions, tenants, owners, vehicles, notifications, document checklists, RFQs, quotes, work reports, settlements, safety checklists, maintenance logs, safety trainings, data destruction logs, vehicle history, tax deadline checklists, and attendance.

**Core Features & Design Patterns:**
- **Modular Monorepo:** Organized into distinct packages (`api-server`, `web`, `db`, `api-spec`) using pnpm workspaces.
- **Automated Document Generation:** Logic for auto-generating weekly reports, expense approvals, repair maintenance drafts, and legal inspection notices.
- **Workflow Management:** Robust workflows for tasks, legal inspections, RFQ/quote processes, work report submissions, and multi-step approvals (up to 5 levels).
- **AI Integration:** AI-powered features for commission record generation and AI matching for vendor recommendations/bid requests.
- **BuildingContext:** Global `BuildingProvider` (wraps authenticated routes) fetches building info via `/buildings/my` once (10min staleTime). Provides `useBuilding()` hook with `building`, `isLoading`, `refetch`. Query is gated to manager role only (partners skip). Dashboard, RFQ creation, and other pages consume building data from context instead of local fetch.
- **Dashboard Restructuring:** Bottom nav uses 홈/일정/회계/시설/업무. Desktop sidebar organized with section headers (관리비회계, 시설관리, 입주/자산관리, 보고/서식). StatCards are clickable with `href` navigation. Dashboard shows building name from BuildingContext when registered.
- **Calendar Page:** Monthly calendar view at `/calendar` aggregating all 관리비회계 and 시설관리 events. Data sources: tax_schedules, tasks, inspections, safety_checklists, maintenance_logs, safety_trainings. Color-coded dots (blue=accounting, green=facility, red=overdue). Date selection shows event detail list. Backend endpoint: `/calendar/events?year=&month=`.
- **관리비회계 Dashboard:** Hub page at `/accounting` with summary stats (결재 대기, 세무 예정, 이번달 지출) and menu cards linking to sub-pages (결재함, 지출현황, 세무일정, 기안서, 수수료, 견적요청, 작업검수, 보고서 등).
- **시설관리 Dashboard:** Hub page at `/facility` with navigation cards (법정점검, 안전점검표, 기전 업무일지, 안전교육) plus detailed stats and charts for facility status.
- **Facility Management:** Detailed capabilities including safety checklists, maintenance logs, and safety training tracking.
- **Attendance Management:** PC/mobile check-in/out with automated detection of late/early-leave, and manager-facing visualizations.
- **Notification System:** In-app notifications for various events.
- **Document Templates:** 5 default system templates with CRUD management for custom ones.
- **Performance Optimization:** React.lazy code splitting for route pages (Dashboard and Login eager, all others lazy). Vite manualChunks: react-vendor (react/react-dom), ui (radix-ui/lucide-react/cva), charts (recharts/d3), api-client. Dashboard uses `enabled`-gated deferred queries for tenants/vehicles (load after summary). Layout uses useMemo/useCallback. React Query: staleTime 2min, gcTime 10min. Notification polling at 60s intervals.
- **Hierarchical Reporting:** Daily reports aggregate into weekly and monthly summaries.
- **Legal Compliance:** Incorporates Korean legal requirements for inspections (23 presets, 11 categories) and privacy data auto-destruction (tenant/owner data anonymization after 3 years).
- **Geo-based Vendor Matching:** RFQs can auto-match vendors by region (`sido`, `sigungu`).
- **Object Storage:** Utilizes Replit Object Storage via `@google-cloud/storage` for photo attachments (presigned URLs).
- **Unit Management (호실 관리):** Full CRUD for building units with `unitsTable` (unitNumber, floor, exclusiveArea, commonArea, usage, notes, status). Features: floor-grouped list view, status badges (공실/입주/정비중), CSV bulk import (papaparse), auto-generate from floor/unit range, sample CSV download. Mobile-first grid layout on small screens, table layout on desktop. Navigation: 입주/자산관리 section in sidebar.
- **Digital Tenant Card (디지털 입주자카드):** Token-based self-registration system. Managers generate per-unit links (`tenantCardTokens` table with UUID tokens, 7-day expiry). Tenants fill mobile-optimized public form (`/tenant-card/:token`) without login — personal info, business/guarantor info, vehicle registration, document uploads, 4 management contract consent clauses (관리비 납부, 체납 조치, 특별충당금, 개인정보 보관), electronic signature. Auto-calculates `billingStartDate` from min(interiorStartDate, moveInDate). Manager verification workflow: approve/reject with notification. `managementContractTemplates` table stores editable clause text per building. Dashboard shows unverified tenant alerts. Vehicle page shows "미확인" badge for unverified tenants. PDF export of tenant card + management contract via jsPDF. All endpoints enforce building-scoped authorization.
- **Building Setup & Integration:** Includes a `buildings` table, links users to buildings, and integrates with the `건축물대장` (Building Register) API for building information and automated inspection scheduling based on legal criteria.

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
- @google-cloud/storage (for Object Storage)
- papaparse (for CSV parsing)
- data.go.kr BldRgstHubService/getBrTitleInfo (for 건축물대장 API integration)