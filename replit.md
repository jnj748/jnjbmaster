# 관리의달인 (Manager Master)

## Overview

AI-powered property management work tool for Korean apartment/building managers (소장). Built as a pnpm workspace monorepo with TypeScript.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Features

1. **Dashboard** - Overview with task counts, inspection alerts, tax reminders, tenant/vehicle stats
2. **Task Management (업무 관리)** - Daily/weekly to-do list with category, priority, status filters
3. **Legal Inspections (법정 점검)** - Elevator, water tank, fire safety, electrical, playground, safety inspections with advance alerts, legal basis tracking, printable notices, preset-based registration, completion logging, auto-draft generation
4. **Tax Schedules (세무 일정)** - Withholding tax, VAT, property tax tracking with recurrence
5. **Tenant Management (입주민 관리)** - Tenant card registration with all fields, document checklist, privacy consent
6. **Owner Management (소유자 관리)** - Owner card registration with document checklist and privacy consent
7. **Vehicle Management (차량 관리)** - Vehicle registration cards with primary/additional vehicles, ownership-based document requirements
8. **Vendor Management (협력업체)** - Vendor registry with two types: contracted (building-specific) and platform (self-registered). Portal selection screen at app entry.
9. **Commission Tracking (수수료)** - Vendor matching revenue dashboard with status management
14. **RFQ Management (견적 요청)** - Create and manage RFQs, send to platform vendors, compare submitted quotes
15. **Quote Submission (견적서)** - Vendor quote submission and acceptance/rejection workflow
16. **Work Reports (작업 완료 보고)** - Photo-attached work completion reports with manager inspection approval/rejection
17. **Settlements (정산)** - Contract amount, fee deduction, payment status tracking for vendors
18. **Vendor Portal (업체 포털)** - Full vendor dashboard with RFQ viewing, quote submission, work reports, settlement monitoring
10. **Weekly Reports (주간보고)** - Auto-generated weekly summaries with next-week inspection forecasts
11. **Draft Documents (기안서)** - Auto-generated expense approvals, repair maintenance drafts from inspections
12. **Notifications (알림)** - In-app notification bell with unread count badge, auto-generated on tenant registration/update
13. **Export** - Tenant/owner/vehicle cards can be exported as PDF files (jsPDF)

## Authentication & Authorization

- **Auth method**: JWT-based (Bearer token in Authorization header)
- **Token storage**: localStorage (`auth_token` key)
- **User roles**: `manager` (관리소장), `executive` (최고관리자), `facility_staff` (시설관리 담당자), `vendor` (견적 업체)
- **Portal types**: `building` (건물관리 관계자), `vendor` (가입업체)
- **Self-registration**: Only `facility_staff` and `vendor` roles can self-register; `manager`/`executive` must be created by a manager via admin
- **RBAC**: Auth middleware protects all routes except `/healthz` and `/auth/*`; role-based middleware on user management endpoints
- **Navigation**: Building portal shows full management menu; vendor portal shows limited menu (dashboard, vendor info, commissions); user management only visible to manager/executive roles

## Database Tables

- `users` - User accounts with email, password_hash, name, role, phone, portal_type
- `tasks` - To-do items with category, priority, status, due dates
- `inspections` - Legal inspection cycles with frequency, legal cycle months, advance alert days, legal basis (legalBasis)
- `legal_inspection_presets` - Built-in preset data for standard legal inspections (9 presets)
- `inspection_logs` - Inspection completion history with result (good/fair/poor), memo, inspector
- `drafts` - Auto-generated draft documents (expense_approval, vendor_selection, repair_maintenance)
- `tax_schedules` - Tax/accounting schedules with recurrence patterns
- `vendors` - Vendor registry with type (contracted/platform), contact info, ratings, type-specific fields (contract dates, business reg number, service area)
- `commissions` - Commission records from vendor matching
- `tenants` - Tenant cards with all personal info, dates, document checklist, guarantor info
- `owners` - Owner cards with personal info, dates, document checklist
- `vehicles` - Vehicle registration cards with FK to tenants, ownership type, document checklist
- `notifications` - In-app notifications with read status, related entity references
- `document_checklists` - Dedicated document checklist table with entity_type/entity_id/document_name unique constraint
- `rfqs` - RFQ (Request for Quotation) records with category, building, deadline, target vendor IDs
- `quotes` - Vendor-submitted quotes with amount, scope, estimated days, status (submitted/accepted/rejected)
- `work_reports` - Work completion reports with photo URLs, review status (submitted/approved/rejected)
- `settlements` - Settlement records with contract amount, fee rate/amount, payment status

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## API Endpoints

### Authentication
- `POST /api/auth/register` - Self-register (facility_staff/vendor only)
- `POST /api/auth/login` - Login with email, password, portalType
- `GET /api/auth/me` - Get current user (requires auth)

### User Management (manager only)
- `GET /api/users` - List all users (manager/executive)
- `POST /api/users` - Create user with any role (manager only)
- `PATCH /api/users/:id` - Update user (manager only)
- `DELETE /api/users/:id` - Delete user (manager only)

### Tasks
- `GET/POST /api/tasks` - List/create tasks (filterable by status, priority, date)
- `GET/PATCH/DELETE /api/tasks/:id` - Get/update/delete task

### Inspections
- `GET/POST /api/inspections` - List/create inspections
- `PATCH/DELETE /api/inspections/:id` - Update/delete inspection
- `GET /api/inspections/upcoming` - Inspections due within 30 days
- `GET /api/inspections/presets` - List legal inspection presets (auto-seeded)
- `POST /api/inspections/:id/complete` - Complete inspection with result logging
- `GET /api/inspections/:id/logs` - Inspection history logs
- `POST /api/inspections/generate-alerts` - Generate alerts and auto-draft documents

### Drafts
- `GET /api/drafts` - List all draft documents
- `GET /api/drafts/:id` - Get draft detail
- `PATCH /api/drafts/:id` - Update draft (body, status)

### Tax Schedules
- `GET/POST /api/tax-schedules` - List/create schedules
- `PATCH/DELETE /api/tax-schedules/:id` - Update/delete schedule

### Tenants (입주자)
- `GET/POST /api/tenants` - List/create tenants (filterable by status, unit, search)
- `GET/PATCH/DELETE /api/tenants/:id` - Get/update/delete tenant

### Owners (소유자)
- `GET/POST /api/owners` - List/create owners (filterable by status, unit, search)
- `GET/PATCH/DELETE /api/owners/:id` - Get/update/delete owner

### Vehicles (차량)
- `GET/POST /api/vehicles` - List/create vehicles (filterable by unit, tenantId, search; max 4 additional + 1 primary per unit enforced; tenantId-unit consistency validated)
- `GET/PATCH/DELETE /api/vehicles/:id` - Get/update/delete vehicle (max vehicle constraint enforced on update too)
- `GET /api/vehicles/unregistered` - Unregistered/doc-missing vehicle review (queries actual data)

### Document Checklists (서류 체크리스트)
- `GET /api/document-checklists` - List checklist items by entityType + entityId
- `POST /api/document-checklists` - Upsert document checklist item

### Notifications (알림)
- `GET /api/notifications` - List notifications
- `GET /api/notifications/unread-count` - Unread notification count
- `PATCH /api/notifications/:id/read` - Mark notification as read

### Vendors
- `GET/POST /api/vendors` - List/create vendors (filterable by category and type: contracted/platform)
- `PATCH/DELETE /api/vendors/:id` - Update/delete vendor
- `GET /api/vendors/recommend` - Recommended vendors by category
- `POST /api/vendors/register` - Platform vendor self-registration

### RFQs (견적 요청)
- `GET/POST /api/rfqs` - List/create RFQs (filterable by status, vendorId)
- `GET/PATCH/DELETE /api/rfqs/:id` - Get/update/delete RFQ

### Quotes (견적서)
- `GET/POST /api/quotes` - List/create quotes (filterable by rfqId, vendorId, status)
- `GET/PATCH /api/quotes/:id` - Get/update quote status

### Work Reports (작업 완료 보고)
- `GET/POST /api/work-reports` - List/create work reports (filterable by vendorId, status)
- `GET/PATCH /api/work-reports/:id` - Get/review work report

### Settlements (정산)
- `GET/POST /api/settlements` - List/create settlements (filterable by vendorId, status)
- `PATCH /api/settlements/:id` - Update settlement status

### App Routing
- `/` - Portal selection (건물관리 관계자 / 가입업체)
- `/manager/*` - Manager app (dashboard, tasks, inspections, rfqs, work-reports, etc.)
- `/vendor-portal` - Vendor portal with login, dashboard, RFQ list, quote submission, work reports, settlements

### Commissions
- `GET/POST /api/commissions` - List/create commissions
- `PATCH /api/commissions/:id` - Update commission status

### Dashboard & Reports
- `GET /api/dashboard/summary` - KPI summary
- `GET /api/dashboard/alerts` - Active alerts (auto-generates drafts for upcoming inspections)
- `GET /api/dashboard/activity` - Recent activity feed
- `GET /api/reports/weekly` - Auto-generated weekly report with next-week inspection forecasts

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
