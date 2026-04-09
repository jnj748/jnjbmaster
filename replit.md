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

1. **Dashboard** - Overview with task counts, inspection alerts, tax reminders, commission stats
2. **Task Management (업무 관리)** - Daily/weekly to-do list with category, priority, status filters
3. **Legal Inspections (법정 점검)** - Elevator, water tank, fire safety, electrical, playground, safety inspections with advance alerts, legal basis tracking, printable notices, preset-based registration, completion logging, auto-draft generation
4. **Tax Schedules (세무 일정)** - Withholding tax, VAT, property tax tracking with recurrence
5. **Vendor Management (협력업체)** - Vendor registry with category, contact info, ratings, recommendations
6. **Commission Tracking (수수료)** - Vendor matching revenue dashboard with status management
7. **Weekly Reports (주간보고)** - Auto-generated weekly summaries with next-week inspection forecasts
8. **Draft Documents (기안서)** - Auto-generated expense approvals, repair maintenance drafts from inspections

## Database Tables

- `tasks` - To-do items with category, priority, status, due dates
- `inspections` - Legal inspection cycles with frequency, legal cycle months, advance alert days, legal basis (legalBasis)
- `legal_inspection_presets` - Built-in preset data for standard legal inspections (9 presets)
- `inspection_logs` - Inspection completion history with result (good/fair/poor), memo, inspector
- `drafts` - Auto-generated draft documents (expense_approval, vendor_selection, repair_maintenance)
- `tax_schedules` - Tax/accounting schedules with recurrence patterns
- `vendors` - Vendor registry with contact info and ratings
- `commissions` - Commission records from vendor matching

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## API Endpoints

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

### Vendors
- `GET/POST /api/vendors` - List/create vendors (filterable by category)
- `PATCH/DELETE /api/vendors/:id` - Update/delete vendor
- `GET /api/vendors/recommend` - Recommended vendors by category

### Commissions
- `GET/POST /api/commissions` - List/create commissions
- `PATCH /api/commissions/:id` - Update commission status

### Dashboard & Reports
- `GET /api/dashboard/summary` - KPI summary
- `GET /api/dashboard/alerts` - Active alerts (auto-generates drafts for upcoming inspections)
- `GET /api/dashboard/activity` - Recent activity feed
- `GET /api/reports/weekly` - Auto-generated weekly report with next-week inspection forecasts

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
