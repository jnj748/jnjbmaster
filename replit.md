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