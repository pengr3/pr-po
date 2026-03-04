# Project Milestones: CLMC Procurement System
## v2.5 Data & Application Security (Shipped: 2026-03-02)

**Delivered:** Production security hardening with XSS protection, Firebase Security Rules audit, database backup/restore/wipe toolkit, CSV data migration scripts, and Finance sub-tab expansion.

**Phases completed:** 49-53 (7 phases, 12 plans, 3 inserted phases)

**Key accomplishments:**

- XSS hardening across all 12 view files with escapeHTML() utility — systematic user-data classification, innerHTML protection, and onclick attribute escaping for defense-in-depth
- Firebase Security Rules audit covering all 12 collections + 2 subcollections — field-level self-update restriction prevents privilege escalation, Firestore listener error forces logout for broken session recovery
- CSP headers hardened with 7 directives whitelisting Firebase CDN origins, X-Frame-Options DENY, Referrer-Policy, and Permissions-Policy; SECURITY-AUDIT.md documenting all 11 findings (10 fixed, 1 accepted risk)
- Database safety toolkit: backup.js exports all 13 collections to JSON, restore.js batch re-imports with typed confirmation, verify-integrity.js identifies orphaned references and schema inconsistencies
- Data wipe script with dry-run preview and typed confirmation safeguard — clears 10 collections while preserving users/role_templates/deleted_users
- CSV data migration script (import.js) with auto-delimiter detection, multiline quoted field parsing, dry-run mode, and row-level error reporting — verified against real production CSVs
- Clickable Active/Inactive status badges in project and service list views replacing separate Activate/Deactivate buttons
- Finance sub-tabs: Services and Recurring tabs with search bar, sortable columns, and expense breakdown modal in Finance Project List view

**Stats:**

- 30 code files changed, +3,398 / -557 lines
- 7 phases, 12 plans, 63 commits
- 2 days from first commit to ship (2026-03-01 → 2026-03-02)
- 23/23 requirements satisfied (100% coverage)
- Total JS codebase: 27,008 LOC

**Git range:** v2.4..HEAD (63 commits)

**What's next:** No active milestone. Run `/gsd:new-milestone` to plan v2.6.

---

## v2.4 Productivity & Polish (Shipped: 2026-03-01)

**Delivered:** Data export, mobile-responsive UI, visual polish, code cleanup, sortable tables, and performance optimization with offline persistence and skeleton loading.

**Phases completed:** 41-48 (10 phases, 24 plans)

**Key accomplishments:**

- CSV export for all major list views (MRFs, PRs/POs, PO Tracking, Projects, Services) and detail page expense breakdowns via shared downloadCSV utility
- Mobile hamburger navigation with slide-down menu at <768px, role-based visibility mirroring desktop nav, and scroll lock
- Responsive layouts: horizontal scroll containers for data tables, modal footer stacking on mobile, split-panel auto-collapse for MRF detail view
- Visual polish: company logo on login and registration pages replacing "CL" placeholder, standardized navigation (no underlines/emojis), uniform Admin button styling
- Code cleanup: removed dead files (project-assignments.js, service-assignments.js, procurement-base.js), ad-hoc console.log sweep, unified MRF creation dropdown in Procurement matching mrf-form.js pattern
- Sortable column headers in Finance Pending Approvals (Material PRs, Transport Requests) and Procurement MRF Records (MRF ID, Date Needed, MRF Status, Procurement Status)
- Firebase offline persistence via IndexedDB, skeleton loading screens across all 13 data views, stale-while-revalidate for dashboard stats, parallel data fetching, and TTL-cached reference data (suppliers, projects, services)
- Urgency level propagation from MRFs to PRs so Finance sees correct urgency in approval workflow
- Create MRF requestor name auto-filled from logged-in user identity

**Stats:**

- 28 code files changed, +1,515 / -1,208 lines
- 10 phases, 24 plans
- 3 days from first commit to ship (2026-02-27 → 2026-03-01)
- Velocity: 0.3 days/phase (high velocity maintained)
- 30/30 requirements satisfied (100% coverage)
- Total JS codebase: 22,883 LOC

**Git range:** `feat(41-01)` → `fix(48)` (38 feature commits)

**What's next:** No active milestone. Run `/gsd:new-milestone` to plan v2.5.

---


## v2.3 Services Department Support (Shipped: 2026-02-26)

**Delivered:** Parallel Services department workflow with complete role-based isolation, shared procurement pipeline, and 7 new UI modules.

**Phases completed:** 26-40 (15 phases, 34 plans)

**Key accomplishments:**

- Firebase Security Rules and role templates for services_admin and services_user roles, enabling complete department isolation from day one
- Services collection with CRUD, dual status tracking (internal_status + project_status), service_type differentiation (one-time vs recurring), and assignment system mirroring Projects
- Shared CLMC_CLIENT_YYYY### code sequence across Projects and Services via parallel Promise.all query — no code collisions
- Role-based MRF form dropdown visibility: operations roles see Projects, services roles see Services, cross-department roles see both
- Cross-department Finance and Procurement workflows with department badges (color-coded) and optional department filter dropdowns across all tabs
- Dashboard role-aware statistics: operations roles see Projects stats, services roles see Services stats, admin/finance/procurement see both groups labeled
- Unified expense breakdown modal (showExpenseBreakdownModal with mode branching) replacing separate project and service implementations — services modal now correctly includes transport_requests
- Admin Assignments overhaul replacing per-user assignment pages with compact table+modal interface (assignments.js) handling both departments
- Badge color standardization across all procurement statuses using getStatusClass() and CSS classes in components.css
- generateProjectCode() now queries both collections (mirrors generateServiceCode) — closes pre-existing code collision gap
- My Requests sub-tab in MRF form: requestor self-service MRF tracking with PR/PO detail modals, procurement timeline, and View PR/PO document generation buttons
- Client detail modal with linked projects/services and clickable navigation to detail pages
- Procurement timeline fixes: emoji removal, Invalid Date resolution, PR->PO grouping, per-PO procurement status display

**Stats:**

- 142 files changed, +27,307/-895 lines
- 15 phases, 34 plans
- 8 days from first commit to ship (2026-02-18 → 2026-02-26)
- Velocity: 0.5 days/phase (maintained from v2.2)
- 65/65 requirements satisfied (100% coverage)
- 3 audit cycles before milestone passed

**New files:**
- app/views/services.js — Services list view with sub-tabs, CRUD, filtering
- app/views/service-detail.js — Service detail page with inline editing and expense breakdown
- app/views/mrf-records.js — Reusable MRF records table controller (createMRFRecordsController factory)
- app/views/assignments.js — Unified admin assignments UI (replaces project-assignments.js + service-assignments.js)
- app/expense-modal.js — Unified expense breakdown modal for projects and services
- app/edit-history.js — Edit history recording and timeline modal (parameterized by collection name)

**New collections:** services

**Git range:** `feat(26-01)` → `feat(40-07)` (15 phases, 34 plans)

**What's next:** No active milestone. Run `/gsd:new-milestone` to plan v2.4.

---

## v2.2 Workflow & UX Enhancements (Shipped: 2026-02-10)

**Delivered:** Comprehensive workflow and UX improvements across all major areas with auto-population, restructured interfaces, comprehensive status tracking, signature capture, and consolidated navigation.

**Phases completed:** 15-25 (37 plans total)

**Key accomplishments:**

- Auto-populated user data in MRF forms with readonly requestor name field using getCurrentUser(), eliminating manual entry and ensuring attribution accuracy
- Restructured project detail page with 3-card layout (Project Info, Financial Summary, Status), manual expense calculation via aggregation, and detailed breakdown modal with scorecards
- Comprehensive procurement status tracking with color-coded MRF badges (red: Awaiting PR, yellow: Partial PO, green: Complete), PR creator attribution across 3 generation paths, and serverTimestamp for millisecond-precision timeline tracking
- Finance signature capture using signature_pad library with canvas-based drawing, base64 PNG storage in PO documents, and dual attribution (Prepared By + Approved By) in generated documents
- Consolidated admin navigation replacing 3 separate tabs (Settings, Assignments, Users) with single dropdown using wrapper view pattern and _pendingAdminSection coordination for seamless section switching
- Multi-personnel pill selection with parallel array storage (personnel_user_ids + personnel_names), normalizePersonnel() handling 4 legacy formats, and automatic sync to assigned_project_codes via arrayUnion/arrayRemove for real-time project visibility
- Project edit history audit trail with 7 instrumented mutation points, append-only Firestore subcollection, and timeline modal showing field changes with old → new values and user attribution

**Stats:**

- 24 files modified (app/views: 9 files, app core: 3 files, styles: 2 files, index.html)
- ~18,500 lines of JavaScript (cumulative across 4 milestones)
- 11 phases, 37 plans, ~120+ tasks
- 5 days from first commit to ship (2026-02-06 → 2026-02-10)
- Velocity: 0.14 days per plan (sustained high velocity from v2.1)

**Git range:** `feat(15-02)` → `feat(25-02)` (37 feature commits)

**What's next:** Planning v2.3 milestone - Services Department Support with two new roles, services collection, and shared procurement pipeline.

---

## v2.1 System Refinement (Shipped: 2026-02-06)

**Delivered:** Critical bug fixes and incomplete features from v2.0 enabling proper testing, resolving finance workflow errors, and adding financial dashboard features.

**Phases completed:** 11-13 (9 plans total)

**Key accomplishments:**

- Security foundation fixes with admin bypass logic in Firestore Security Rules, Operations Admin project assignment support, and comprehensive test coverage (8 clients tests, 3 assignment tests)
- Finance review workflow restoration with window function lifecycle management using attachWindowFunctions() pattern and AbortController for event listener cleanup
- Finance dashboard with Project List tab showing aggregated expense totals via getAggregateFromServer, expense breakdown modal with category scorecards, supplier purchase history modal, and procurement timeline using createTimeline component
- Manual refresh buttons for aggregation queries (Firebase doesn't support real-time aggregation listeners)
- Composite indexes for multi-field Firestore queries enabling efficient supplier history and timeline queries

**Stats:**

- 12 files modified
- ~15,800 lines of JavaScript (cumulative)
- 3 phases, 9 plans, ~35+ tasks
- 2 days from first commit to ship (2026-02-05 → 2026-02-06)
- Velocity: 0.2 days per plan (dramatic improvement from v2.0's 3.8 days/plan)

**Git range:** `feat(11-01)` → `feat(13-05)`

**What's next:** Workflow & UX enhancements (v2.2) - Auto-populate user data, restructure project detail page, add signature capture, and consolidate admin navigation.

---

## v2.0 Authentication & Permissions (Shipped: 2026-02-04)

**Delivered:** Complete role-based access control system securing the foundation with authentication, granular permissions, and user management.

**Phases completed:** 5-10 (26 plans total)

**Key accomplishments:**

- Self-registration with invitation codes, pending approval workflow, and persistent session management with auto-logout for deactivated users
- 5-role RBAC system (Super Admin, Operations Admin, Operations User, Finance, Procurement) with real-time permission updates via Firestore listeners
- Project assignment system enabling Operations Users to see only assigned projects, with immediate filtering across 4 views (projects, project-detail, mrf-form, procurement)
- Server-side Firebase Security Rules protecting all 10 collections with 17/17 automated tests passing, preventing client-side bypasses
- Super Admin dashboard managing complete user lifecycle: invitation generation → pending approval → role assignment → project assignments → deactivation/deletion
- Multi-layer route protection with authentication guards, deep-link support, navigation visibility control, and minimum 2 Super Admin safeguards

**Stats:**

- 84 files created/modified
- 14,264 lines of JavaScript (+20,115 / -178 lines in v2.0)
- 6 phases, 26 plans, ~90+ tasks
- 64 days from first commit to ship (2025-12-02 → 2026-02-04)

**Git range:** `feat(05-01)` → `feat(10-02)`

**What's next:** Activity logging and document management (v2.1) - Enable project activity tracking, BOQ/contract uploads, and payment milestone management.

---

## v1.0 Core Projects Foundation (Shipped: 2026-01-30)

**Delivered:** Project lifecycle tracking from lead to completion, with structured client management and MRF integration.

**Phases completed:** 1-4 (10 plans total)

**Key accomplishments:**

- Client management foundation with uppercase codes, uniqueness validation, and real-time Firestore sync
- Composite project code generation (CLMC_CLIENT_YYYY###) with dual-status tracking (Internal + Project Status)
- Full-page project detail view with inline editing, auto-save on blur, and focus preservation during real-time updates
- Active/inactive project lifecycle management with toggle button controlling MRF eligibility
- Project-anchored MRF workflow with dropdown integration ("CODE - Name" format), denormalized storage for performance
- Consistent filtering, search, and sorting across all views with 21 integration points verified

**Stats:**

- 9 files created/modified
- 9,312 lines of JavaScript
- 4 phases, 10 plans, ~40+ tasks
- 59 days from first commit to ship (2025-12-02 → 2026-01-30)

**Git range:** `feat(01-01)` → `feat(04-02)`

**What's next:** Authentication & permissions system (v2.0) - Secure the foundation with role-based access control, user management, and project assignment permissions.

---

## v3.0 Fixes (Shipped: 2026-03-04)

**Delivered:** Frontend precision fixes — PR/PO inline pairing in procurement tables, Finance Pending Approvals column restructure, and UI layout standardization across all tabs.

**Phases completed:** 54-56 (3 phases, 4 plans)

**Key accomplishments:**

- PR/PO inline pairing in My Requests: each PR row shows its PO ID beside it using a `posByPrId` index; PRs with no PO show an em-dash null slot in the same column position
- PR/PO inline pairing in Procurement MRF Records: same pairing behavior with an editable Procurement Status dropdown on the same row as each PR/PO pair
- Finance Pending Approvals PR table restructured: Date Issued + Date Needed columns added (from linked MRF via `mrfCache`), redundant Status column removed — reviewers now see actionable date context
- Finance Pending Approvals TR table same restructure; PR review modal gains JUSTIFICATION row between Delivery Address and Total Amount
- Approved This Month scoreboard fixed: `updateStats()` dynamically counts PO documents by `date_issued` in the current calendar month (Timestamp/seconds/string fallback) plus approved TRs — no longer hardcoded to 0
- All sub-tab nav bars (Material Request, Procurement, Admin) standardized to 1600px width matching Finance tab; MRF Processing content expanded from `max-width: 1400px` (.container) to `max-width: 1600px` inline style

**Stats:**
- Timeline: 2026-03-04 (single day)
- Files changed: 5 view files (mrf-records.js, procurement.js, finance.js, admin.js, mrf-form.js)
- Changes: 361 insertions, 157 deletions
- Requirements: 12/12 satisfied

---

