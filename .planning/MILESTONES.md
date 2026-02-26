# Project Milestones: CLMC Procurement System

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

**What's next:** Planning v2.3 milestone - Address moderate tech debt (Finance rejection attribution), consider edit history PDF export for compliance, and evaluate new feature requests from UAT feedback.

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
