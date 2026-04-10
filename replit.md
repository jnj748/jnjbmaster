# 관리의달인 (Manager Master)

## Overview

관리의달인 (Manager Master) is an AI-powered property management platform designed for Korean 집합건물 (collective buildings under 150 units, subject to 집합건물법, NOT 공동주택관리법). It aims to streamline daily operations, automate recurring tasks, enhance operational efficiency, and provide comprehensive tools for managing various aspects of property administration. Its key capabilities include:
- Centralized task and schedule management (inspections, taxes).
- Comprehensive tenant, owner, and vehicle administration.
- Automated document generation (weekly reports, expense approvals, repair maintenance drafts) and notification systems.
- Vendor management, RFQ processes, and commission tracking.
- Robust multi-step approval workflows (up to 5 levels) with digital signatures and financial oversight.
- Unified manager dashboard with all features accessible to the 관리소장 role.
- Facility management with safety checklists, maintenance logs, and safety training tracking.

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
- Inspection presets exclude 놀이터 점검 (어린이놀이시설 안전관리법 — 공동주택 전용)
- Legal presets: 저수조 청소, 승강기 정기검사, 소방 점검, 정화조 청소, 안전점검, 전기 안전점검, 가스 안전점검

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
- The database schema includes tables for `approvals`, `users`, `tasks`, `inspections`, `legal_inspection_presets`, `inspection_logs`, `drafts`, `tax_schedules`, `vendors`, `commissions`, `tenants`, `owners`, `vehicles`, `notifications`, `document_checklists`, `rfqs`, `quotes`, `work_reports`, `settlements`, `safety_checklists`, `safety_checklist_items`, `maintenance_logs`, and `safety_trainings`.

**Core Features & Design Patterns:**

- **Modular Monorepo Structure:** Organizes the codebase into distinct packages for `api-server`, `web`, `db`, and `api-spec` using pnpm workspaces, enhancing maintainability and scalability.
- **Automated Document Generation:** Implements logic to auto-generate weekly reports, expense approvals, repair maintenance drafts, and legal inspection notices based on system data and events.
- **Workflow Management:** Features robust workflows for tasks, legal inspections (with alerts and logs), RFQ/quote processes, work report submissions, and multi-step approvals (up to 5 levels with approval lines, draft save, and digital signatures).
- **AI Integration:** Includes AI-powered features for commission record generation, and AI matching for vendor recommendations and bid request generation based on upcoming inspections.
- **Comprehensive Dashboard:** Manager gets a unified dashboard with all features — approvals, spending, inspections, reports, facility management, and user administration.
- **Facility Management:** Incorporates detailed facility management capabilities, including safety checklists, maintenance logs with reporting to managers, safety training tracking, and scheduled facility alerts.
- **Notification System:** An in-app notification system provides real-time alerts for various events, such as tenant registration, updates, and inspection reminders.
- **Document Templates:** 5 default system templates (일반 기안지, 증명서 신청서, 부재 일정 신청서, 급여 증명서, 수선유지비 지출 기안) with CRUD management for custom templates.
- **Hierarchical Report System:** Daily reports (경비/미화/유지보수/보안 일지) → Weekly summary aggregation → Monthly summary aggregation. Role-based access for submission, review, and forwarding.
- **Shared Utility:** `formatDate` in `src/lib/utils.ts` handles `string | null | undefined`, strips ISO T-suffix, used by all date-display pages.

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
