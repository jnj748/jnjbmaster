# 관리의달인 (Manager Master)

## Overview
관리의달인 (Manager Master) is an AI-powered property management work tool designed for Korean apartment and building managers. The project aims to streamline various property management tasks, improve operational efficiency, and provide comprehensive insights through automation and data-driven features. Its core purpose is to simplify daily operations, ensure compliance with legal requirements, and enhance communication and transparency among stakeholders (managers, residents, owners, vendors, and executives). The platform has significant market potential by addressing the specific needs of the Korean property management sector, offering a robust solution for task management, legal compliance, financial tracking, and resident/vendor relations.

관리의달인 (Manager Master) is an AI-powered property management platform designed for Korean 집합건물 (collective buildings under 150 units, subject to 집합건물법, NOT 공동주택관리법). It aims to streamline daily operations, automate recurring tasks, enhance operational efficiency, and provide comprehensive tools for managing various aspects of property administration. Its key capabilities include:
- Centralized task and schedule management (inspections, taxes).
- Comprehensive tenant, owner, and vehicle administration.
- Automated document generation (weekly reports, expense approvals, repair maintenance drafts) and notification systems.
- Vendor management, RFQ processes, and commission tracking.
- Robust multi-step approval workflows (up to 5 levels) with digital signatures and financial oversight.
- Unified manager dashboard with all features accessible to the 관리소장 role.
- Facility management with safety checklists, maintenance logs, and safety training tracking.
- Attendance management with PC/mobile check-in/out, automated late/early-leave detection, and chart visualizations.

The business vision is to become the leading digital assistant for property managers in Korea, reducing administrative burden and enabling more proactive and data-driven management decisions.

## User Roles (3 roles)

- **manager (관리소장)**: Full access to ALL features — building management, approvals, inspections, reports, spending, user management, etc. Portal: `building`.
- **partner (파트너사)**: Replaces the old `vendor` role. Limited portal for partner companies — vendor info, commissions. Portal: `partner`.
- **platform_admin (플랫폼 관리자)**: System-wide admin. Can manage users and view all data. Portal: `building`.

### Portal Types
- `building` — for manager and platform_admin users
- `partner` — for partner users

### Legal Context
- 집합건물법 적용 (공동주택관리법 비적용, 150세대 미만)
- 23 comprehensive inspection presets across 11 categories (fire_safety, electrical, elevator, water_tank, septic, hygiene, building_safety, safety_check, playground, gas, administrative)
- Presets include 5 inspection types: legal (법정), self_regular (자체정기), biweekly (격주), seasonal (계절별), administrative (행정)
- Each preset has legal basis, recommended months, sub-items, and seasonal notes
- Administrative calendar events: 안전점검의 날 (매월 4일), 차량 등록 정리 (3월/9월), 불조심 강조 기간 (11월)

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
- Utilizes shadcn/ui for UI components, ensuring a consistent and modern design aesthetic.
- The UI/UX is designed to be intuitive, with distinct portals for `building` (managers) and `partner` users, each offering role-appropriate dashboards and navigation.
- Data export functionality (e.g., tenant/owner/vehicle cards) is implemented using jsPDF.

**Backend:**
- An Express 5 API framework handles all backend logic and serves API endpoints.
- Authentication is JWT-based, with tokens stored in `localStorage` and a comprehensive Role-Based Access Control (RBAC) system supporting `manager`, `partner`, and `platform_admin` roles.
- API codegen is handled by Orval, generating hooks and Zod schemas from an OpenAPI specification.
- Data validation is performed using Zod (`zod/v4`) and `drizzle-zod`.

**Database:**
- PostgreSQL is used as the primary database.
- Drizzle ORM facilitates database interactions and schema management.
- The database schema includes tables for `approvals`, `users`, `tasks`, `inspections`, `legal_inspection_presets`, `inspection_logs`, `drafts`, `tax_schedules`, `vendors`, `commissions`, `tenants`, `owners`, `vehicles`, `notifications`, `document_checklists`, `rfqs`, `quotes`, `work_reports`, `settlements`, `safety_checklists`, `safety_checklist_items`, `maintenance_logs`, `safety_trainings`, `data_destruction_logs`, `vehicle_history`, `tax_deadline_checklists`, and `attendance`.

**Core Features & Design Patterns:**

- **Modular Monorepo Structure:** Organizes the codebase into distinct packages for `api-server`, `web`, `db`, and `api-spec` using pnpm workspaces, enhancing maintainability and scalability.
- **Automated Document Generation:** Implements logic to auto-generate weekly reports, expense approvals, repair maintenance drafts, and legal inspection notices based on system data and events.
- **Workflow Management:** Features robust workflows for tasks, legal inspections (with alerts and logs), RFQ/quote processes, work report submissions, and multi-step approvals (up to 5 levels with approval lines, draft save, and digital signatures).
- **AI Integration:** Includes AI-powered features for commission record generation, and AI matching for vendor recommendations and bid request generation based on upcoming inspections.
- **Comprehensive Dashboard:** Manager gets a unified dashboard with all features — approvals, spending, inspections, reports, facility management, and user administration.
- **Facility Management:** Incorporates detailed facility management capabilities, including safety checklists, maintenance logs with reporting to managers, safety training tracking, and scheduled facility alerts.
- **Attendance Management:** PC/mobile check-in/out with automated late/early-leave detection, monthly stats, and manager-facing chart visualizations (attendance rate, late/early frequency).
- **Notification System:** An in-app notification system provides real-time alerts for various events, such as tenant registration, updates, and inspection reminders.
- **Document Templates:** 5 default system templates (일반 기안지, 증명서 신청서, 부재 일정 신청서, 급여 증명서, 수선유지비 지출 기안) with CRUD management for custom templates.
- **Hierarchical Report System:** Daily reports (경비/미화/유지보수/보안 일지) → Weekly summary aggregation → Monthly summary aggregation. Role-based access for submission, review, and forwarding.
- **Shared Utility:** `formatDate` in `src/lib/utils.ts` handles `string | null | undefined`, strips ISO T-suffix, used by all date-display pages.

## Mobile Optimization

- **Mobile-first design**: App optimized for 관리소장 working in the field on smartphones
- **Layout**: CSS Grid at 900px breakpoint. Desktop: 220px sidebar + content. Mobile: bottom nav + mobile header
- **Bottom nav**: 5 tabs (홈, 업무, 점검, 결재, 더보기) — mobile only
- **Mobile header**: Page title + notification bell; back button on sub-pages
- **ResponsiveDialog** (`components/ui/responsive-dialog.tsx`): Dialog on desktop, Drawer (vaul) on mobile. All pages use this instead of raw Dialog.
- **Custom breakpoint**: `--breakpoint-desktop: 900px` in `@theme` — all mobile/desktop toggles use `desktop:` prefix (not `md:`) to match 900px layout breakpoint. `useIsMobile()` also uses 900px.
- **Mobile card views**: Table-based pages (tenants, vehicles, owners, commissions, attendance) use `hidden desktop:block` table + `desktop:hidden` card pattern
- **Touch UX**: min 44px touch targets, `-webkit-tap-highlight-color`, `font-size:16px` on inputs (prevents iOS zoom), safe-area-inset padding, `inputMode` on phone/email/number fields
- **PWA**: `manifest.json` with theme color, apple-mobile-web-app meta tags, `viewport-fit=cover`

## Important Technical Notes

- Backend route order: `/inspections/upcoming` MUST be registered BEFORE `/inspections/:id` in Express 5.
- Color scheme: deep navy sidebar (`hsl(215 30% 18%)`) with teal accent (`hsl(199 89% 48%)`).
- Logo: `artifacts/manager-app/public/logo.png` — white text on transparent bg, works on dark sidebar.
- All UI text MUST be in Korean — labels, headings, buttons, empty states, error messages.

## External Dependencies

- **Node.js**: Runtime environment.
- **TypeScript**: Superset of JavaScript for type-safety.
- **pnpm**: Package manager for monorepo.
- **React**: Frontend library.
- **Vite**: Frontend build tool.
- **Tailwind CSS**: Utility-first CSS framework.
- **shadcn/ui**: UI component library.
- **Express**: Web application framework for Node.js.
- **PostgreSQL**: Relational database system.
- **Drizzle ORM**: TypeScript ORM for database interaction.
- **Zod**: Schema declaration and validation library.
- **Orval**: OpenAPI to TypeScript client generator.
- **esbuild**: JavaScript bundler.
- **jsPDF**: Library for generating PDF documents on the client side.

## Privacy Data Auto-Destruction System

Implements personal data destruction complying with Korean privacy law (퇴거 후 3년 자동 파기):
- `dataDestructionDate` column on tenants and owners tables (auto-calculated as moveOutDate + 3 years)
- `dataDestructionLogs` table for audit trail of all destruction operations
- API endpoints for: listing destruction schedule, processing destructions (anonymization), 30-day pre-alerts, viewing audit logs
- Anonymization process: sets name to "***", nullifies PII fields (phone, email, residentId, etc.), sets status to "destroyed"
- Tenant/Owner status values: `active`, `moved_out`, `destroyed`
- Frontend: destruction status badge, "파기완료" filter option on tenants/owners pages

## Vehicle Monthly Inspection Automation

- Vehicle status tracking: `registered` / `cancelled` with `cancelledAt` timestamp
- `vehicleHistory` table for registration/cancellation timeline
- API endpoints: individual cancel, batch cancel, history timeline, monthly inspection (detects units with active tenants but no registered vehicles)
- Frontend vehicles page: status filter, checkbox batch selection, batch cancel button, per-vehicle cancel, history timeline dialog, monthly inspection trigger button

## Tax Deadline Checklist System

- `tax_deadline_checklists` table for per-schedule preparation items with completion tracking
- CRUD + init endpoints with 8 default checklist items per tax schedule
- All write endpoints (create/update/delete/init) restricted to manager/executive roles
- D-7/D-3/D-Day alert banners on tax schedules page
- Expandable checklist panel with checkbox completion tracking

## Attendance Management System

- `attendance` table: check-in/out records with device type, IP, user agent, status
- Server-side check_out requires prior check_in validation
- Duplicate prevention (409 for repeated same-day actions)
- Manager-only endpoints for all-staff attendance view
- Frontend: check-in/out buttons, monthly stats cards, daily records table
- Manager charts: BarChart for attendance rate, BarChart for late/early/absent frequency
