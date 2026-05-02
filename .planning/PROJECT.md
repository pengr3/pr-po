# CLMC Procurement System

## What This Is

A zero-build static SPA for managing engineering procurement workflows (MRFs, PRs, POs, TRs, RFPs) with comprehensive project lifecycle tracking, payables tracking, and role-based access control. All procurement activities are anchored to either projects (large-scale fit-outs) or services (repair/maintenance work) with auto-generated codes (CLMC-CLIENT-YYYY###; clientless projects supported with deferred code issuance), a unified 10-option project/service status, and complete client management. Multi-user system with 7 roles supporting two operational departments (Projects and Services), invitation-only registration, granular permissions, and assignment-based access for department users. End-to-end document-backed payment workflow: Request for Payment (per-tranche, PO-scoped IDs), Finance Payables tab with auto-derived status, partial-payment recording with void/audit, and proof-of-procurement document linking. Fully mobile-optimized — Finance and MRF tabs render card-per-row layouts under 768px while desktop layouts (≥769px) are unchanged. Built with vanilla JavaScript and Firebase (Firestore + Auth + Storage + Chart.js v4 via CDN).

## Core Value

Projects tab must work — it's the foundation where project name and code originate, and everything in the procurement system connects to it. Money out (PRs/POs/payables) and money in (project contract) must both reconcile against the project record.

## Current State

**Latest shipped:** v3.2 Supplier Search, Proof of Procurement & Payables Tracking (2026-04-28) — 28 phases, 55 plans, 107/107 requirements satisfied. Major additions: full RFP / Payables Tracking workflow, proof-of-procurement document links, Financial Breakdown modal with Payables tab, Finance + MRF mobile card layouts, clientless project creation, home dashboard Chart.js visualizations, unified 10-option project/service status, and Delete-Rejected-MRFs cleanup.

**Active milestone:** v4.0 — Procurement → Full Management Portal (started 2026-04-28).

See `.planning/MILESTONES.md` for full milestone history and `.planning/changelogs/v3.2.md` for the user-facing release notes.

## Current Milestone: v4.0 Procurement → Full Management Portal

**Goal:** Transform CLMC from a procurement-focused system into a full management portal — adding native project management, in-app notifications, manual collectibles tracking, end-to-end proposal lifecycle, and a Super Admin management hub for approval queues and engagement creation.

**Target features:**
- **Project Management (native Gantt/task tracker)** — task hierarchy, dependencies, % progress per task, milestone dates, anchored to existing project records
- **Notification System (in-app)** — Firestore-backed notifications with bell/dropdown UI, triggered by approval events (proposal submitted, MRF approved, RFP filed, project status changes, user-registration approvals, etc.)
- **Collectibles Tracking (manual entry)** — Operations Admin / Finance manually create collectibles against a project; PM acts as filter/context (auto-trigger from PM progress deferred)
- **Proposal Tracking (full lifecycle)** — multi-step internal approval workflow with audit trail, document upload + versioning, proposal-specific dashboard/queue (lives inside Mgmt Tab), client communication log
- **Management Tab (Super Admin only)** — centralized decision-making hub: proposal approval queue + project/service creation hub with auto-routing (one-time vs recurring)

**Key context:**
- Major version bump (procurement → management portal identity shift)
- Phase numbering continues from 83 (no reset)
- Notification email/push, ProjectLibre file import, per-task billing, collectibles auto-trigger from PM progress, and role-configurable Mgmt Tab access all explicitly deferred
- v3.2 deferred items (Phase 68.1 subcon scorecard fix, Phase 70 cancel-PR rework) deferred to v4.1+ — kept v4.0 focused on the 5 portal-transformation features
- Phase order to be determined by roadmapper based on dependency analysis

## Requirements

### Validated (Shipped in v1.0)

**Existing System (Pre-v1.0):**
- ✓ MRF submission with dynamic line items — existing
- ✓ MRF approval workflow (Pending/Approved/Rejected) — existing
- ✓ PR/TR generation from approved MRFs — existing
- ✓ Supplier database management — existing
- ✓ Finance approval workflow for PRs/TRs — existing
- ✓ PO creation and tracking — existing
- ✓ Real-time dashboard with procurement statistics — existing
- ✓ Sequential ID generation (MRF-YYYY-###, PR-YYYY-###, PO-YYYY-###) — existing

**Clients Management (v1.0):**
- ✓ Create clients with client_code, company_name, contact_person, contact_details — v1.0
- ✓ Edit existing clients — v1.0
- ✓ Delete clients — v1.0
- ✓ List view of all clients — v1.0
- ✓ Client code uniqueness validation — v1.0

**Projects Tab (v1.0):**
- ✓ Create projects with auto-generated code (CLMC_CLIENT_YYYY###) — v1.0
- ✓ Required fields: project_name, client (dropdown) — v1.0
- ✓ Optional fields: budget, contract_cost, personnel (freetext) — v1.0
- ✓ Internal status tracking (4 options) — v1.0
- ✓ Project status tracking (7 options) — v1.0
- ✓ Active/inactive flag to control MRF creation — v1.0
- ✓ Edit existing projects — v1.0
- ✓ Delete projects — v1.0
- ✓ Project list view with columns: Code, Name, Client, Internal Status, Project Status — v1.0
- ✓ Filter by: Internal Status, Project Status, Client — v1.0
- ✓ Search by project code or project name — v1.0
- ✓ Sort by most recent first — v1.0
- ✓ Click row to view full project details — v1.0
- ✓ New page UI (not modal) for create/edit with back navigation — v1.0
- ✓ Budget/contract_cost positive number validation — v1.0
- ✓ Full-page detail view with inline editing and auto-save — v1.0

**MRF-Project Integration (v1.0):**
- ✓ Add project_code dropdown to MRF form — v1.0
- ✓ Dropdown displays: "CLMC_CODE_YYYY### - Project Name" — v1.0
- ✓ Dropdown shows only active projects (inactive excluded) — v1.0
- ✓ Dropdown sorted by most recent first — v1.0
- ✓ Display project code and name in MRF lists — v1.0
- ✓ Display project info in MRF details view — v1.0
- ✓ Denormalized storage (project_code + project_name) for performance — v1.0
- ✓ Backward compatible display for legacy MRFs — v1.0

### Validated (Shipped in v2.0)

**Authentication & User Management:**
- ✓ Self-registration with invitation code validation (generic codes) — v2.0
- ✓ Super Admin generates one-time invitation codes with 3-hour expiration — v2.0
- ✓ Account approval workflow (pending → active, role assigned during approval) — v2.0
- ✓ Secure login/logout with Firebase Auth session persistence — v2.0
- ✓ User management (deactivate, delete, reactivate with confirmations) — v2.0
- ✓ Auto-logout for deactivated users via real-time listener — v2.0
- ✓ Super Admin dashboard (invitation codes, pending approvals, all users) — v2.0

**Permission System:**
- ✓ 5 role templates (Super Admin, Operations Admin, Operations User, Finance, Procurement) — v2.0
- ✓ Tab-based access control (navigation shows only permitted tabs by role) — v2.0
- ✓ Edit vs view-only permissions enforced within tabs — v2.0
- ✓ Project assignment for Operations Users (see only assigned projects) — v2.0
- ✓ Permission changes take effect immediately (no logout required) — v2.0
- ✓ Real-time permission updates via Firestore listeners — v2.0
- ✓ Super Admin can configure role permissions via checkbox matrix — v2.0

**Security Rules:**
- ✓ Firebase Security Rules validate user status (active) for all operations — v2.0
- ✓ Firebase Security Rules validate role permissions for all operations — v2.0
- ✓ Firebase Security Rules validate project assignments for filtering — v2.0
- ✓ 17/17 automated tests passing, production deployed — v2.0
- ✓ Console bypass protection verified — v2.0

**Route Protection:**
- ✓ Unauthenticated users redirected to login page — v2.0
- ✓ Deep link support (saves and restores intended route) — v2.0
- ✓ Pending users restricted to /pending page — v2.0
- ✓ Minimum 2 Super Admin safeguard prevents lockout — v2.0
- ✓ Navigation visibility control for unauthenticated users — v2.0

**Validated (v2.1 System Refinement):**
- ✓ Supplier click opens modal showing all purchases from that supplier — v2.1 (Phase 13)
- ✓ Timeline button in PR-PO Records shows full audit trail (MRF → PRs → POs → Delivered) — v2.1 (Phase 13)
- ✓ PO viewing blocked until Payment Terms, Condition, Delivery Date are filled — v2.2 (Phase 18)
- ✓ Fix Transport Request Review button error (window.viewTRDetails is not a function) — v2.1 (Phase 12)
- ✓ Fix Material Purchase Request Review button error — v2.1 (Phase 12)
- ✓ Restore Project List tab with financial overview and expense breakdown modal — v2.1 (Phase 13)
- ✓ Allow Operations Admin role to receive project assignments — v2.1 (Phase 11)
- ✓ Fix Clients tab permission denied error for Super Admin — v2.1 (Phase 11)
- ✓ Fix Projects tab permission denied error for Super Admin — v2.1 (Phase 11)
- ✓ Ensure Super Admin has proper permission structure or Security Rules bypass — v2.1 (Phase 11)

**Validated (v2.2 Workflow & UX Enhancements):**
- ✓ Auto-populate user data in MRF forms for efficiency — v2.2 (Phase 15)
- ✓ Restrict project creation to admin roles only — v2.2 (Phase 15)
- ✓ Restructure project detail page with card-based layout — v2.2 (Phase 16)
- ✓ Comprehensive procurement status tracking with visual indicators (red/yellow/green) — v2.2 (Phase 17)
- ✓ PR creator tracking and side-by-side PR/PO display — v2.2 (Phase 17)
- ✓ Finance signature capture in approval workflow — v2.2 (Phase 18)
- ✓ Detailed project expense breakdown with category/material/transport views — v2.2 (Phase 18)
- ✓ Consolidated admin navigation (Settings/Assignments/Users merged) — v2.2 (Phase 19)
- ✓ Multi-personnel selection with pill UI and array storage — v2.2 (Phase 20)
- ✓ Automatic personnel-to-assignment sync for operations users — v2.2 (Phase 21)

### Validated (Shipped in v2.3)

**Services Management:**
- ✓ Services collection with CRUD operations mirroring Projects functionality — v2.3 (Phase 28)
- ✓ Service code generation sharing CLMC_CLIENT_YYYY### sequence with Projects — v2.3 (Phase 27)
- ✓ Services tab with sub-tabs: Services (one-time work), Recurring (contract-based work) — v2.3 (Phase 28)
- ✓ service_type field differentiation ('one-time' or 'recurring') — v2.3 (Phase 28)
- ✓ Same fields as Projects: budget, contract_cost, personnel, internal_status, project_status, active/inactive — v2.3 (Phase 28)
- ✓ Services detail page with inline editing and auto-save — v2.3 (Phase 28)
- ✓ Assignment system for services_user (see only assigned services) — v2.3 (Phase 28, 32, 39)
- ✓ Service detail page includes expense breakdown (MRFs/PRs/POs linked to service) — v2.3 (Phase 33, 36)

**Role & Permission System:**
- ✓ services_admin role with full Services tab access (create/edit/delete, manage assignments) — v2.3 (Phase 26)
- ✓ services_user role with assignment-based Services tab access — v2.3 (Phase 26)
- ✓ Department isolation: operations roles see only Projects tab, services roles see only Services tab — v2.3 (Phase 26, 28)
- ✓ Super Admin bypass for both departments — v2.3 (Phase 26)
- ✓ Finance and Procurement cross-department access — v2.3 (Phase 30)
- ✓ Firebase Security Rules enforcement for services collection — v2.3 (Phase 26, 32, 35)
- ✓ Role template configuration in Super Admin settings — v2.3 (Phase 26)

**MRF Integration:**
- ✓ Role-based dropdown visibility in MRF form (operations users see Projects, services users see Services) — v2.3 (Phase 29)
- ✓ Denormalized storage (service_code + service_name) for performance — v2.3 (Phase 29)
- ✓ Services appear in MRF lists, details, and procurement workflow — v2.3 (Phase 29, 30)
- ✓ Backward compatibility with existing project-based MRFs — v2.3 (Phase 29)

**Cross-Department & Dashboard:**
- ✓ Finance Pending Approvals shows PRs/TRs from both Projects and Services with department badges — v2.3 (Phase 30)
- ✓ Procurement PO Tracking shows POs from both Projects and Services with department indicators — v2.3 (Phase 30)
- ✓ Department filter dropdown in Finance and Procurement views — v2.3 (Phase 30, 34)
- ✓ Dashboard shows active services count and Services-linked MRFs count — v2.3 (Phase 31)
- ✓ Dashboard role-aware stats (operations sees Projects only, services sees Services only, dual-dept sees both) — v2.3 (Phase 31)

**Code Quality & UX (v2.3 Phase 36-40):**
- ✓ Unified expense breakdown modal (project + service modes in single showExpenseBreakdownModal) — v2.3 (Phase 36)
- ✓ getMRFLabel() and getDeptBadgeHTML() defined once in components.js — v2.3 (Phase 38)
- ✓ Admin Assignments overhaul with unified table+modal interface — v2.3 (Phase 39)
- ✓ Badge color standardization across all procurement statuses — v2.3 (Phase 39)
- ✓ generateProjectCode() queries both collections preventing code collisions — v2.3 (Phase 39)
- ✓ My Requests sub-tab for requestor MRF self-service tracking — v2.3 (Phase 40)
- ✓ Client detail modal with linked projects/services — v2.3 (Phase 40)
- ✓ Procurement timeline fixes (emoji removal, Invalid Date, PR->PO grouping) — v2.3 (Phase 40)

### Validated (Shipped in v2.4)

**Export & Data Portability:**
- ✓ CSV export for all major list views (MRFs, PRs/POs, PO Tracking, Projects, Services) — v2.4 (Phase 41)
- ✓ CSV export for project and service expense breakdowns — v2.4 (Phase 42)

**Responsive Design:**
- ✓ Mobile hamburger navigation at narrow viewport widths — v2.4 (Phase 43)
- ✓ Horizontal scroll containers for data tables — v2.4 (Phase 44)
- ✓ Split-panel vertical stacking and responsive modals — v2.4 (Phase 44)

**Visual Polish & Branding:**
- ✓ Company logo on login and registration pages — v2.4 (Phase 45, 47)
- ✓ Navigation standardized (no underlines, no emojis, uniform Admin button) — v2.4 (Phase 45)

**Code Cleanup:**
- ✓ Dead files removed (project-assignments.js, service-assignments.js, procurement-base.js) — v2.4 (Phase 46)
- ✓ Unified MRF creation dropdown in Procurement matching mrf-form.js — v2.4 (Phase 46)

**Sortable Tables:**
- ✓ Finance Pending Approvals tables sortable by column headers — v2.4 (Phase 47)
- ✓ Procurement MRF Records table sortable by column headers — v2.4 (Phase 47.1)

**Data Propagation & UX:**
- ✓ PR documents carry urgency_level from parent MRF — v2.4 (Phase 47)
- ✓ Create MRF requestor name auto-filled from logged-in user — v2.4 (Phase 47.2)

**Performance Optimization:**
- ✓ Firebase offline persistence via IndexedDB — v2.4 (Phase 48)
- ✓ Skeleton loading screens across all data views — v2.4 (Phase 48)
- ✓ Stale-while-revalidate for dashboard stats — v2.4 (Phase 48)
- ✓ Parallel data fetching and TTL-cached reference data — v2.4 (Phase 48)

### Validated (Shipped in v2.5)

**Security Audit:**
- ✓ XSS protection via escapeHTML() utility applied across all 12 view files — v2.5 (Phase 49)
- ✓ Injection risk review (Firestore query manipulation, eval usage) — v2.5 (Phase 49)
- ✓ Sensitive data exposure cleanup (console logs, PII leakage) — v2.5 (Phase 49)
- ✓ Firebase Security Rules audit across all 12 collections — v2.5 (Phase 49)
- ✓ Auth edge cases reviewed (session handling, token expiry, role escalation) — v2.5 (Phase 49)
- ✓ CSP headers hardened for production — v2.5 (Phase 49)

**Database Safety:**
- ✓ Backup export script for all Firestore collections to local JSON — v2.5 (Phase 50)
- ✓ Data integrity verification identifying orphaned references and schema issues — v2.5 (Phase 50)
- ✓ Restore procedure documented and verified — v2.5 (Phase 50)

**Data Management:**
- ✓ Standalone wipe script clearing all collections except users with dry-run and confirmation — v2.5 (Phase 51)
- ✓ CSV import script for projects and services with validation and error reporting — v2.5 (Phase 51.1)

**UI Enhancements (v2.5):**
- ✓ Clickable Active/Inactive badges for bulk project and service status toggling — v2.5 (Phase 51.2)
- ✓ Finance sub-tabs for Services and Recurring with search and sorting — v2.5 (Phase 52.1)

### Validated (Shipped in v3.0)

- ✓ MRF Tables (My Requests + Procurement MRF Records): PO ID displayed inline beside its corresponding PR ID with null-slot em-dash when no PO exists — v3.0 (Phase 54)
- ✓ Procurement MRF Records: Procurement Status dropdown aligned on the same row as its specific PR/PO pair — v3.0 (Phase 54)
- ✓ Finance Pending Approvals PR table: Date Issued + Date Needed columns added, Status column removed — v3.0 (Phase 55)
- ✓ Finance Pending Approvals TR table: "Date" renamed to "Date Issued", Date Needed column added, Status column removed — v3.0 (Phase 55)
- ✓ MRF Processing layout: full-width (1600px) with Pending MRFs and MRF Details spanning full content band — v3.0 (Phase 56)
- ✓ Sub-tab nav alignment: Material Request, Procurement, Admin bars all at 1600px matching Finance — v3.0 (Phase 56)
- ✓ Finance Approved This Month scoreboard: dynamically counts POs by date_issued in current calendar month plus approved TRs — v3.0 (Phase 55)

### Validated (Shipped in v3.1)

- Item category "DELIVERY BY SUPPLIER" routes to PR/PO path (not TR) — v3.1 (Phase 57)
- TR rejection fully decoupled from MRF status with dedicated editing panel — v3.1 (Phase 60)
- MRF soft-reject replacing hard delete with full audit trail — v3.1 (Phase 62)
- TR details modal accessible from clickable TR badges in records tables — v3.1 (Phase 62)
- Add/delete line items on rejected TRs before resubmitting — v3.1 (Phase 62.1)
- MRF rejection event shown on Procurement Timeline — v3.1 (Phase 62.2)
- Project/service dropdowns sort alphabetically, codes use dash format — v3.1 (Phases 61, 62)
- Responsive workspace for 1366px laptops, sortable My Requests, real-time MRF Records — v3.1 (Phases 59, 59.1)

### Validated (Shipped in v3.2)

**Supplier Search & Proof of Procurement:**
- ✓ Supplier search bar filtering by name and contact person with filter-aware pagination — v3.2 (Phase 63)
- ✓ Proof-of-procurement: paste any `https://` URL onto a PO at any procurement status (including post-Delivered) — v3.2 (Phase 64)
- ✓ Three-state proof indicators (URL / remarks / none) on MRF Records, My Requests, Finance PO Tracking — v3.2 (Phase 64)
- ✓ Proof attachment timeline event in procurement timeline — v3.2 (Phase 64)
- ✓ Transport Request proof indicators with `transport_requests` collection targeting; same indicators on Material+TR mixed MRF rows — v3.2 (Phases 66.1, 67)

**RFP / Payables Tracking:**
- ✓ Request for Payment workflow with per-tranche RFPs, PO-scoped IDs (`RFP-{PO-ID}-{n}`), invoice/amount/terms/due date — v3.2 (Phases 65, 65.4)
- ✓ Finance Payables tab dual-table layout: RFP Processing (flat, action-priority sort) + PO Payment Summary (grouped per PO with expandable tranche sub-rows, paginated 15/page) — v3.2 (Phases 65.1, 65.7)
- ✓ Auto-derived RFP payment status (Pending / Partially Paid / Fully Paid / Overdue) — Finance never manually sets — v3.2 (Phase 65)
- ✓ Record / void payment with audit-preserved void records (read-modify-write pattern) — v3.2 (Phase 65)
- ✓ RFP cancellation for zero-payment RFPs via right-click on PO IDs and TR badges; cancelled RFPs free up tranche for re-filing with pre-filled data — v3.2 (Phase 65.10)
- ✓ Delivery fee RFPs as standalone payment requests with red/green PO ID dot indicator — v3.2 (Phase 65.9)
- ✓ Bank Transfer mode with Add Alternative Bank toggle (manual second bank entry; saved-bank dropdown removed in Phase 76 in favor of simpler manual UX) — v3.2 (Phases 65.6, 76)
- ✓ Default Fully-Paid RFP exclusion from RFP Processing table; historical RFPs available via PO Payment Summary — v3.2 (Phase 65.2)
- ✓ Active Tranche column shows payment progress percentage (e.g., "Tranche 2 (50%) — 30% Paid") — v3.2 (Phase 65.3)
- ✓ Clickable PO IDs in Finance RFP Processing open a PO detail modal — v3.2 (Phase 65.5)
- ✓ Transport Request RFP parity: right-click TR badges to file RFPs, `RFP-{TR-ID}-{n}` format, Finance Payables guard for TR-linked RFPs — v3.2 (Phase 67)

**Cancel PRs / MRF Restoration:**
- ✓ Right-click MRF ID in MRF Records to cancel PRs and restore MRF to In Progress; force-recall path for Finance-Approved PRs at Pending Procurement; block path for in-progress POs — v3.2 (Phase 70) *[basic flow shipped; rework for proper approval/audit/soft-delete deferred to v3.3]*
- ✓ Delete Rejected MRFs cleanup button on MRF Details panel with cascade to linked PRs/POs/TRs — v3.2 (Phase 82)

**Expense / Financial Breakdown Modal:**
- ✓ Renamed Expense Breakdown → Financial Breakdown modal — v3.2 (Phase 71)
- ✓ Payables tab in Financial Breakdown showing read-only worklist (POs / Delivery Fees / TRs sorted action-needed first) — v3.2 (Phase 71)
- ✓ Item-detail tables (Item / Qty / Unit / Unit Cost / Subtotal) replacing PO ID columns — v3.2 (Phase 68)
- ✓ Total Cost scoreboard cleanup (no document-count subtitle) — v3.2 (Phase 68)
- ✓ Payable scoreboard row (Total Requested / Paid / Remaining Payable) with formula correctness (totalCost − totalPaid non-voided) — v3.2 (Phases 69, 69.1)

**Project / Service Financial Summary:**
- ✓ Paid + Remaining Payable cells on Project and Service detail Financial Summary cards (always rendered for zero-state visibility) — v3.2 (Phases 72, 72.1, 75)
- ✓ Refresh button refreshes data AND opens Financial Breakdown modal in one click — v3.2 (Phase 72)
- ✓ Service Remaining Payable formula correctness: `(poTotal + trTotal) − rfpTotalPaid` (no PR+PO double-count) — v3.2 (Phase 75)

**Mobile Optimization:**
- ✓ Finance tab card-header stacking with 44px touch targets at ≤768px — v3.2 (Phase 73)
- ✓ All 5 Finance table groups (Material PRs, Transport Requests, Purchase Orders, RFP Processing, PO Payment Summary, Project List × 3) render as vertical card stacks at ≤768px via CSS dual-mode pattern — v3.2 (Phase 73.1)
- ✓ PR / TR Details modals collapse to 1-column grid + horizontally scrollable item tables on mobile — v3.2 (Phase 73.2)
- ✓ Financial Breakdown modal scorecard rows collapse to 1-column at ≤768px — v3.2 (Phase 73.2)
- ✓ Finance sub-tab navigation rebuilt as unified sticky pill bar with scroll-hide/show UX (replaces desktop tabs + mobile dropdown) — v3.2 (Phase 73.3)
- ✓ MRF items table → card-per-item layout on mobile with paired card/table sync — v3.2 (Phase 74)
- ✓ My Requests table → MRF summary cards with 3-dot Edit/Cancel action menu — v3.2 (Phase 74)
- ✓ MRF sub-tab navigation as sticky pill bar matching Finance pattern — v3.2 (Phase 74)

**MRF Form & Details Polish:**
- ✓ MRF Details panel shows Date Submitted and Justification for existing MRFs — v3.2 (Phase 79)
- ✓ Quantity input column widened to prevent 5-digit truncation — v3.2 (Phase 79)
- ✓ Searchable combobox replacing native project/service `<select>` in MRF form — v3.2 (Phase 79)

**Layout Fixes:**
- ✓ MRF Processing right-panel no longer overflows viewport at 1366×768 (`min-width: 0` on grid children + `max-width: 100%` on items-table wrapper) — v3.2 (Phase 80)
- ✓ Top navbar no longer wraps or vertically stacks brand between 769–1400px (compression `@media` + `flex-wrap: nowrap`) — v3.2 (Phase 80)
- ✓ Supplier column removed from PR Details modal items table (already shown in modal header) — v3.2 (Phase 73.3)

**Project / Service Status Unification:**
- ✓ Single unified `project_status` field replaces dual internal/project status with 10 options (For Inspection, For Proposal, Proposal for Internal Approval, Proposal Under Client Review, For Revision, Client Approved, For Mobilization, On-going, Completed, Loss) — v3.2 (Phase 81)
- ✓ All forms, filters, table columns, CSV exports, validation, edit-history labels, and home dashboard charts updated — v3.2 (Phase 81)
- ✓ Legacy status values display with `(legacy)` suffix in tables and filter dropdowns — v3.2 (Phase 81)
- ✓ Edit history field renamed to "Internal Status (Legacy)" for auditor-friendly historical records — v3.2 (Phase 81)

**Clientless Projects:**
- ✓ Projects can be created without a client (`client_id: null`); project code deferred until client assigned — v3.2 (Phase 78)
- ✓ MRF dropdowns show "(No code yet)" for clientless projects with `data-type/data-name` dataset attributes — v3.2 (Phase 78)
- ✓ Confirmation-modal-gated batched backfill of `project_code` and `client_code` across linked MRFs / PRs / POs / TRs / RFPs — v3.2 (Phase 78)
- ✓ DB-level lock via Firestore Security Rules: locked fields immutable once issued — v3.2 (Phase 78)
- ✓ Deep-link resolution by Firestore doc ID for clientless projects, surviving code issuance — v3.2 (Phase 78)
- ✓ `project_id` denormalized on all MRF / PR / TR / PO / RFP writes for backfill traceability — v3.2 (Phase 78)

**Home Dashboard Visualizations:**
- ✓ Project and Service status breakdowns rendered as Chart.js (v4.4.7 CDN) horizontal bar charts with brand-palette highlighted statuses — v3.2 (Phase 77.1)
- ✓ Card height + canvas + legend proportions tuned so bars fill the card visibly (180px desktop / 220px mobile, 28px barThickness) — v3.2 (Phase 77.2)

**Procurement View Lifecycle Cleanup:**
- ✓ `procurement.js` `destroy()` resets `rfpsByTR` state and removes `window.showTRRFPContextMenu` / `window.openTRRFPModal` / `window.submitTRRFP` registrations to prevent stale state across view re-entries — v3.2 (Phase 75)

### Future (v3.3+)

- Phase 68.1 — Subcon cost scorecard fix (subcon items in `items_json` not summed when PO `is_subcon` flag unset)
- Phase 70 rework — Cancel PR flow needs proper approval workflow, audit trail, soft-delete, role-based access (BACKLOG: "Recall Process with Finance Approval")
- VERIFICATION.md backfill for Phases 73.2 and 79 (process gap; reqs satisfied)
- Dead CSS housekeeping (`styles/hero.css` orphan classes; `views.css:1748` `.mrf-sub-nav--hidden`)

### Future (v4.0+)

#### Activity Logging
- Structured activity entries on projects
- Activity types: Inspection, Meeting, Proposal Submitted, Site Visit, Other
- Fields: activity type, description, date, logged by (auto), attachments
- Visible to all personnel assigned to project
- Visible to users with sufficient permissions

#### Document Management
- Upload BOQ files to projects
- Upload contract documents
- Upload inspection reports/photos
- Upload milestone reports (to support payment triggers)
- View/download uploaded documents

#### Payment Milestones
- Configure milestones at project creation (percentage, description, amount)
- Operations Admin can trigger milestones (with supporting documents)
- Track milestone status (pending, triggered, paid)
- Finance sees triggered milestones in dashboard

#### Payment Tracking
- PO payment status tracking (percentage paid)
- Payment terms on POs (Net 30, Net 60, custom)
- Payment due date calculation
- Operations can trigger collection milestones
- Finance receives collection milestone notifications

#### Invoice Management
- Procurement uploads supplier invoices to Firebase Storage
- Invoice attachment indicator in PR-PO records
- Finance can view uploaded invoices
- Invoice metadata tracking (date, amount, status)

#### Finance Dashboard Enhancements
- Payables calculation (total unpaid/partial POs by supplier)
- Payables detail view (breakdown by PO, payment status)
- Collectibles calculation (contract cost minus payments received by project)
- Collectibles detail view (breakdown by project, milestones)
- Payment milestone tracking and status updates

### Out of Scope

- Email notifications — Security and simplicity; all communication happens in-app
- Mobile app — Desktop-first for operational efficiency; mobile deferred to future
- OAuth/SSO login — Email/password sufficient for v1; complexity not warranted yet
- Real-time chat/comments — Not core to procurement workflow
- Automated email verification — Invitation codes provide sufficient security control
- BOQ creation/editing in system — BOQ created externally, only uploaded for reference
- Automated expense tracking — Manual MRF creation provides oversight and control

## Context

**System Architecture:**
- Zero-build static SPA (pure JavaScript ES6 modules)
- Firebase Firestore for data, no backend server
- Hash-based routing with lazy-loaded views
- Deployed on Netlify with direct push

**Shipped v1.0 (2026-01-30):**
- 9,312 lines of JavaScript across 9 core files
- Collections: clients, projects, mrfs, prs, pos, transport_requests, suppliers, deleted_mrfs
- 4 phases, 10 plans, 17 feature commits
- 59 days from first commit to ship
- 100% requirements coverage (32/32), zero tech debt

**Shipped v2.0 (2026-02-04):**
- 14,264 lines of JavaScript total (+20,115 / -178 lines in v2.0)
- New collections: users, invitation_codes, role_templates, deleted_users
- 6 phases, 26 plans, 84 files modified
- 64 days from first v2.0 commit to ship (2025-12-02 → 2026-02-04)
- 100% requirements coverage (51/51), all phases verified
- Firebase Security Rules: 247 lines, 17/17 tests passing

**Shipped v2.3 (2026-02-26):**
- 15 phases, 34 plans, 142 files changed, +27,307/-895 lines
- New collections: services
- New files: app/views/services.js, app/views/service-detail.js, app/views/mrf-records.js, app/views/assignments.js, app/expense-modal.js, app/edit-history.js
- 65/65 requirements satisfied
- 7 roles (added services_admin, services_user)

**Shipped v2.4 (2026-03-01):**
- 10 phases, 24 plans, 28 code files changed, +1,515/-1,208 lines
- No new collections or files — focused on polish, exports, and performance
- 30/30 requirements satisfied
- Major additions: downloadCSV utility, skeleton screens, TTL caching, mobile hamburger nav, sortable headers
- Total JS codebase: 22,883 LOC

**Shipped v2.5 (2026-03-02):**
- 7 phases, 12 plans, 30 code files changed, +3,398/-557 lines
- No new collections — focused on security hardening, database tooling, and UI polish
- New scripts: backup.js, restore.js, verify-integrity.js, wipe.js, import.js
- 23/23 requirements satisfied
- Total JS codebase: 27,008 LOC

**Shipped v3.0 (2026-03-04):**
- 3 phases, 4 plans, 5 view files changed, +361/-157 lines
- No new collections or files — focused on display precision and layout consistency
- 12/12 requirements satisfied
- Total JS codebase: ~27,369 LOC (11,123 LOC across 5 modified files)

**Shipped v3.1 (2026-03-10):**
- 11 phases, 22 plans, 105 commits
- 84 files changed, +9,383 / -2,490 lines
- 6 days from first commit to ship (2026-03-05 → 2026-03-10)
- 18/18 requirements satisfied (100% coverage)

**Shipped v3.2 (2026-04-28):**
- 28 phases, 55 plans (Phases 63 through 82)
- 49 days from milestone start to ship (2026-03-13 → 2026-04-28)
- 107/107 formal requirements satisfied (100% coverage)
- New collection: `rfps` (Request-for-Payment documents with `payment_records` array, tranche metadata, void support)
- New shared module: `app/proof-modal.js` (reusable proof URL modal accepting collection parameter)
- Chart.js v4.4.7 added via CDN (UMD `window.Chart` global) for home dashboard visualizations
- Audit verdict: `tech_debt` (no blockers, deferred items tracked for v3.3)

**Current Codebase State:**
- Auth System: app/auth.js, app/permissions.js
- Auth Views: register.js, login.js, pending.js
- Admin Views: role-config.js, user-management.js, assignments.js (unified, replaces project-assignments.js + service-assignments.js)
- Client/Project CRUD: clients.js, projects.js, project-detail.js
- Services CRUD: services.js, service-detail.js
- MRF/Procurement: mrf-form.js (with My Requests sub-tab), mrf-records.js, procurement.js
- Finance: finance.js (with cross-department dept badges and filters)
- Shared Modules: app/expense-modal.js (unified project+service modal), app/edit-history.js
- Security: firestore.rules (services rules deployed), test/firestore.test.js
- Utils: app/utils.js (generateServiceCode, generateProjectCode, getAssignedServiceCodes, syncServicePersonnelToAssignments)
- Components: app/components.js (getMRFLabel, getDeptBadgeHTML, skeletonTableRows as named exports)

**Technical Environment:**
- Frontend: Vanilla JavaScript ES6 modules, no framework
- Database: Firebase Firestore v10.7.1 (CDN), Project ID: clmc-procurement
- Storage: Firebase Storage (for future invoice uploads)
- Auth: Firebase Authentication v10.7.1 (implemented in v2.0)
- Deployment: Netlify (auto-deploy from git)

**User Feedback Themes:**
- v1.0: Project tracking working as expected
- v1.0: Need for access control (✓ delivered in v2.0)
- Desired: Document upload for project files (deferred to v2.5+)
- Desired: Activity logging on projects (deferred to v2.5+)
- Desired: Payment milestone tracking (deferred to v2.5+)

**Known Issues:**
- Role template seeding requires manual browser console step (one-time, 5 minutes)
- First Super Admin requires manual Firestore document edit (one-time, 2 minutes)
- Firestore 'in' query limited to 10 items (project assignments use client-side filtering)
- Firebase SDK IndexedDB reads ~500-850ms (known SDK limitation, not perceptibly faster than network)

## Constraints

- **Tech stack**: Must use Firebase (Firestore + Auth + Storage), pure JavaScript (no build system)
- **Deployment**: Netlify direct push, no CI/CD complexity
- **Browser**: Desktop-first with mobile-responsive support, modern browsers only (Chrome, Edge, Firefox)
- **Security**: Invitation-only access (v2.0 ✓), granular permissions (v2.0 ✓), Firebase Security Rules (v2.0 ✓), confirmation dialogs for destructive actions
- **Data continuity**: Existing MRFs/PRs/POs must remain functional during v2.0 auth migration
- **Performance**: Real-time listeners already in use, maintain responsiveness

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Build Projects first, auth/permissions later (v2.0) | Core value is project tracking; get foundation working before securing it | ✓ Good - v1.0 shipped successfully, foundation solid |
| Project lifecycle starts at lead stage | Track all expenses from first contact, measure what you pursue vs win | ✓ Good - complete visibility achieved |
| Two status fields (Internal + Project Status) | Internal status tracks Operations steps, Project Status tracks client relationship | ✓ Good - clear separation working well |
| Project codes include client: CLMC_CLIENT_YYYY### | Group projects by client, see win/loss rates per client over time | ✓ Good - enables valuable client analytics |
| Active/inactive flag controls MRF creation | Can create MRFs for completed projects (warranty work) but not lost opportunities | ✓ Good - flexible workflow validated |
| Freetext personnel field in v1.0 | No user system yet; structured assignment deferred to v2.0 when auth exists | ✓ Good - pragmatic interim solution |
| New page UI (not modal) for project create/edit | Projects have many fields; full page provides better UX than cramped modal | ✓ Good - detail view with inline editing highly effective |
| Start fresh with Projects collection | Clean data model - existing MRFs are test data, no migration needed | ✓ Good - clean slate enabled fast development |
| Desktop-first vs responsive design | Primary users work at desks, mobile usage rare, optimize for main use case | ✓ Good - focus on primary use case validated |
| Denormalize project_code + project_name in MRFs | Performance optimization - no join needed for display, historical accuracy preserved | ✓ Good - 21 display points work efficiently |
| Composite ID generation with regex parsing | Handles client codes with underscores, per-client per-year uniqueness | ✓ Good - robust implementation |
| Inline editing with auto-save on blur | Efficient editing workflow without save buttons for every field | ✓ Good - UX improvement validated |
| Focus preservation during real-time updates | Prevents cursor jump when typing and Firestore update arrives | ✓ Good - smooth editing experience |
| Generic invitation codes (not role-specific) | Simpler UX - Super Admin assigns role during approval step, not during code generation | ✓ Good - streamlined approval workflow |
| Operations User sees only assigned projects | Clean, focused view - users don't need to see unrelated projects | ✓ Good - immediate filtering in 4 views |
| Finance creates POs (not Procurement) | Finance controls spending after PR/TR approval, maintains separation of duties | ✓ Good - permission enforcement verified |
| 5 roles instead of 3 | Added Finance and Procurement roles for granular access control aligned with workflows | ✓ Good - configurable role templates working |
| Real-time permission updates via Firestore listeners | Changes take effect immediately without logout | ✓ Good - permissionsChanged and assignmentsChanged events |
| Firebase Security Rules server-side enforcement | Client-side checks can be bypassed, server validation required | ✓ Good - 17/17 tests passing, console bypass blocked |
| UUID invitation codes with 3-hour expiration | Balance security with reasonable signup window | ✓ Good - auto-cleanup prevents code accumulation |
| Minimum 2 Super Admin safeguard | Prevents complete system lockout | ✓ Good - enforced at deactivation and role change |
| Two-step deletion (deactivate first) | Reversible action before permanent deletion | ✓ Good - safety mechanism validated |
| Strict equality (=== false) for permission checks | Distinguishes no permission from loading state | ✓ Good - prevents UI flickering |
| Phase 26: Services mirrors Projects (reuse patterns, duplicate UI modules) | Fastest path to parallel department — copy then adapt; avoids premature abstraction | ✓ Good - reduced Services build time significantly |
| Phase 27: Parallel query for shared sequence (acceptable race condition at current scale) | Promise.all on projects+services for max code number; collision probability negligible at current user count | ✓ Good - no collision observed in production |
| Phase 29: Department field stored as binary string discriminator ('projects'/'services') | Denormalized on MRF/PR/TR avoids joins in all display code; dual-condition check handles legacy docs without field | ✓ Good - consistent pattern across 20+ display locations |
| Phase 35: canEdit === true guard (treats undefined as read-only) eliminates flash of edit controls | Strict equality blocks renders during permission-loading race; services_user sees read-only from first render | ✓ Good - no edit-control flash observed |
| Phase 36: Unified showExpenseBreakdownModal with mode branching — single definition eliminates divergent implementations | Services modal was missing transport_requests; unified function fixed gap and prevents future divergence | ✓ Good - single export, 3 consumers, zero divergence |
| Phase 38: getMRFLabel/getDeptBadgeHTML extracted to components.js as named exports | Duplicate definitions in finance.js and procurement.js — single source of truth removes drift risk | ✓ Good - clean import pattern adopted |
| Phase 39: assignments.js replaces project-assignments.js + service-assignments.js — unified admin UI | Per-user assignment pages were bloated; table+modal pattern handles both departments in one view | ✓ Good - admin UX significantly improved |
| Phase 40: createMRFRecordsController factory with containerId-namespaced window functions — prevents cross-instance state leakage | My Requests and Procurement both need MRF records tables; factory isolates state per instance | ✓ Good - zero cross-instance interference |
| Phase 41: downloadCSV as shared utility in utils.js | Single implementation reused by 8 view files across 7 export requirements | ✓ Good - zero duplication, consistent CSV format |
| Phase 43: Mobile hamburger nav as sibling to desktop nav | Position:fixed without height constraint; max-height CSS transition for animation | ✓ Good - smooth animation, no layout impact |
| Phase 46: Unified project/service dropdown in Procurement Create MRF | Same pattern as mrf-form.js — native optgroup, data-type/data-name attributes | ✓ Good - consistent UX across both MRF creation paths |
| Phase 48: persistentLocalCache with singleTabManager for offline persistence | Correct v10.7.1 API (not deprecated enableIndexedDbPersistence); single-tab avoids coordination overhead | ✓ Good - IndexedDB cache works, though SDK reads are slow (~500-850ms) |
| Phase 48: TTL-cached reference data (5-min TTL) with destroy() timestamp reset | Guards check data.length > 0 AND timestamp freshness; prevents stale data on view re-entry | ✓ Good - measurably fewer Firestore reads on tab switching |

| Phase 49: escapeHTML() utility for XSS protection — single function handles all 5 HTML special chars | Only user-supplied data needs escaping; systematic classification avoids over-escaping static UI strings | ✓ Good - consistent pattern across all 12 view files |
| Phase 49: 'unsafe-inline' kept in CSP script-src | Hundreds of inline onclick handlers make nonce-based approach impractical; refactor deferred | ⚠️ Revisit - future refactor to event listeners would allow tighter CSP |
| Phase 50: Firebase Admin SDK scripts with ES module syntax | Modern Node.js pattern; createRequire() for JSON key loading; consistent across all 5 scripts | ✓ Good - clean, consistent script architecture |
| Phase 51: Typed confirmation gate for destructive wipe script | User must type exact word before irreversible action proceeds | ✓ Good - prevents accidental data loss |
| Phase 51.1: Auto-detect CSV delimiter (tab vs comma) | Real Excel exports use TSV not CSV; single parser handles both transparently | ✓ Good - zero user friction with real production data |
| Phase 52.1: Client-side TR aggregation instead of composite index | Avoids requiring uncreated Firestore composite index; acceptable at current data scale | ✓ Good - pragmatic trade-off, no performance issues |
| Phase 54: posByPrId index keyed on po.pr_id for O(1) PR-to-PO pairing | Maps each PR to its PO(s) in a single pass; null slot em-dash shown when no match | ✓ Good - clean lookup pattern, no schema change needed |
| Phase 54: Retain 8-column table structure with inline flex sub-rows | PRs, POs, Procurement Status stay in separate columns; per-PR pairing via flex rows within cells | ✓ Good - alignment correct, SUMMARY description inaccurate but code is correct |
| Phase 55: mrfCache Map populated via batch getDocs in onSnapshot callbacks | Avoids N+1 queries for date_needed; 30-item chunks with Promise.all; warm-cache path renders synchronously | ✓ Good - clean pattern, reused for both PRs and TRs |
| Phase 55: approvedTRsThisMonthCount loaded once at init() | TR approval count stable within session; recalculates on view reload | ✓ Good - by design; minor UX staleness accepted |
| Phase 56: Remove .container class from procurement.js content wrapper | .container resolves to 1400px via main.css; replaced with inline max-width: 1600px to match Finance reference | ✓ Good - root cause fix rather than override |
| Phase 56: Finance tab as reference alignment (do not modify) | All other tabs normalize to Finance's two-level sub-nav pattern and 1600px width | ✓ Good - clear single source of truth for layout |
| v3.2 scoping: Supplier search pure client-side on in-memory `suppliersData` array | No Firestore changes; `filteredSuppliersData` drives pagination exclusively | ✓ Good - simple, fast, no schema impact |
| v3.2 scoping: Proof URL stored as optional `proof_url` string on `pos` documents | No new collection; updateable at any procurement status including post-Delivered | ✓ Good - lowest-friction implementation |
| v3.2 scoping: RFP/payment data in dedicated `rfps` collection (not embedded on PO) | Mandatory for partial payment tracking and Finance-independent filtering | ✓ Good - clean separation, supports future analytics |
| v3.2 scoping: Payment status auto-derived from `total_paid` vs `amount_requested` arithmetic | Finance never manually sets status — eliminates a source of human error | ✓ Good - data integrity by construction |
| v3.2 scoping: Firebase Storage rejected for proof documents (paste-a-link instead) | User decision — storage cost; any `https://` URL accepted | ✓ Good - zero ongoing cost, works with existing user habits |
| v3.2 scoping: RFP IDs use PO-scoped format `RFP-{PO-ID}-{n}` (Phase 65.4 amended initial project-code-scoped format) | Initial project-code-scoped format collided when multiple POs shared a project code | ✓ Good - guaranteed uniqueness, explicit lineage |
| Phase 65.1: Dual-table Payables layout (RFP Processing flat + PO Payment Summary grouped) with 4 separate filter state variables | Each table has independent status + dept filters — no shared state surprises | ✓ Good - clean filter independence |
| Phase 65.10: Cancel RFP via right-click on PO IDs and TR badges; payments-array guard via `isRFPCancellable` | Consistent with `cancelMRFPRs` pattern; client-side payment guard mirrors server intent | ✓ Good - simple guard, no race risk at current scale |
| Phase 67: `proof-modal.js` `collectionName` defaults to `'pos'` for backward compatibility | Existing PO callers unaffected; TR callers pass `'transport_requests'` explicitly | ✓ Good - no caller-site churn |
| Phase 67: TR RFP fetch on-demand from Firestore (not pre-loaded into memory) | TRs are not in the in-memory `poData` array; on-demand fetch avoids holding all TRs in RAM | ✓ Good - acceptable latency, lower memory pressure |
| Phase 71: Rename Expense Breakdown → Financial Breakdown is user-visible only; internal symbols frozen | Per D-09: zero-risk one-line diff; downstream tests / `window._*` handlers untouched | ✓ Good - no regressions, fast change |
| Phase 73.1: CSS dual-mode pattern (table + card list both in DOM, media query hides inactive) | No JS viewport detection; works on first render at any width; testable in DevTools without reload | ✓ Good - reused for all 5 Finance table groups and MRF tab |
| Phase 73.3: New `.finance-sub-nav-tab` class prefix (not `.tab-btn`) for Finance pill style | Keeps Finance scope independent — Procurement `.tab-btn` rules untouched | ✓ Good - prevents cross-tab style collisions |
| Phase 75: Spec amendment over code revert for POSUMPAG-01 (page size 10 → 15) | User usage pattern drifted upward post-verification; accepted as preferred | ✓ Good - keeps user happy, doc reflects reality |
| Phase 76: Comprehensive audit closure pass (10 retroactive VERIFICATION.md, REQUIREMENTS.md sweep) | Better to flatten audit debt periodically than carry forever; surfaces undocumented decisions | ✓ Good - milestone passable, no permanent backfill load |
| Phase 78: Allow clientless project creation with deferred `project_code` issuance | `project_code` requires `client_code`; deferring lets users capture leads before legal/contract paperwork | ✓ Good - real workflow accommodated, no fake-client workaround |
| Phase 78: Confirmation-modal-gated batched backfill across 5 collections on client assignment | Visible cascade count + atomic write; children pushed first / project doc last for safe retry | ✓ Good - explicit user consent, atomicity marker (`is_issued: true`) |
| Phase 78: DB-level lock on `project_code` / `client_code` / `client_id` once issued (Firestore Security Rules) | Server-side guard supplements UI lock — defense in depth | ✓ Good - prevents reassignment regardless of client-side bugs |
| Phase 81: Single unified `project_status` field replacing dual internal/project status | Two status fields confused users; collapsed to 10 explicit options that span the full lifecycle | ✓ Good - simpler mental model, single source of truth |
| Phase 81: Legacy values display with `(legacy)` suffix instead of being purged | Auditor-friendly for historical records; clean migration without data loss | ✓ Good - preserves history, signals stale entries |
| Phase 82: Delete Rejected MRFs without `deleted_mrfs` audit row (lightweight cleanup) | Soft-deleted MRFs already have rejection audit trail (reason, actor, timestamp); double-audit overkill for pure cleanup | ✓ Good - low-friction UX, mirrors Delete TR pattern |
| Phase 82: Dual-site button render (initial render + re-render path) gated by same eligibility expression | Any data-driven button whose container is rewritten by re-render must be appended at both sites | ✓ Good - generalizable pattern for future buttons |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-28 — v4.0 milestone started: Procurement → Full Management Portal. Adds native Gantt-based Project Management, in-app Notifications, manual Collectibles Tracking, full Proposal lifecycle (approval workflow + doc versioning + dashboard + client log), and Super-Admin-only Management Tab (proposal approvals + project/service creation hub). Major version bump; phases continue from 83.*
