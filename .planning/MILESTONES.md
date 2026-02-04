# Project Milestones: CLMC Procurement System

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
