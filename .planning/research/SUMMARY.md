# Project Research Summary

**Project:** Authentication & Permissions System for CLMC Procurement
**Domain:** Firebase Authentication, Role-Based Access Control (RBAC), Static SPA Security
**Researched:** 2026-01-31
**Confidence:** HIGH

## Executive Summary

Firebase Authentication v10.7.1 combined with Firestore-based RBAC provides the optimal security architecture for this zero-build static SPA procurement system. The key technical decision is storing roles and permissions in Firestore (not Firebase custom claims alone) because custom claims require Firebase Admin SDK, which cannot run client-side in a browser environment. This hybrid approach—Firestore for immediate permission storage with Security Rules for server-side enforcement—delivers real-time permission updates without requiring user logout, while maintaining a zero-backend architecture.

The authentication system must support an invitation code registration workflow where users self-register with generic codes, then await Super Admin approval before gaining access. Permission granularity operates at two levels: role-based tab access (view/edit/none for each section) and project-based data filtering (Operations Users see only assigned projects, while admins see all). Real-time Firestore listeners enable immediate permission changes—when an admin updates user permissions, the active session reflects changes instantly without re-authentication.

Critical risks center on migration complexity and security enforcement. The existing system has 40+ MRFs, PRs, and POs that lack project assignment fields required by the new permission model. Phased migration with graceful degradation (allowing null project codes initially, backfilling data, then enforcing strict rules) prevents catastrophic user lockout. Firestore Security Rules provide the only true security layer—client-side permission checks are for UX only and must be backed by comprehensive server-side rules that validate user status, role, project access, and permission level for every operation.

## Key Findings

### Recommended Stack

Firebase Authentication v10.7.1 with email/password provider integrates seamlessly with the existing Firebase Firestore setup. The zero-build constraint eliminates server-side options (no Cloud Functions, no Admin SDK), making Firestore-based role storage the only viable approach. Real-time snapshot listeners on user documents enable immediate permission synchronization across active sessions.

**Core technologies:**
- **Firebase Auth 10.7.1 (CDN)**: User authentication and session management — already in use, email/password provider is simple and secure, CDN distribution matches zero-build pattern
- **Firebase Firestore 10.7.1 (CDN)**: User profiles, role storage, approval workflow — real-time listeners enable immediate permission updates without logout, no backend needed
- **Firestore Security Rules v2**: Server-side permission enforcement — zero-trust security prevents client-side bypasses, supports complex role and project-access logic

**Supporting patterns:**
- **Auth State Listener** (`onAuthStateChanged`): Detects login/logout, initializes user session data from Firestore user document
- **Firestore Snapshot Listener**: Monitors user document for real-time role/permission/status changes during active sessions
- **Route Guards**: Hash-based router checks authentication and role before rendering protected views
- **Session Persistence** (`browserLocalPersistence`): Maintains login across browser sessions by default

### Expected Features

**Must have (table stakes):**
- **Invitation code registration** — Generic codes (not role-specific) managed in Firestore, validated during registration, tracked for usage (one-time or limited-use)
- **User approval workflow** — Self-registration creates `status: pending` user, Super Admin reviews and assigns role/permissions/projects, user gains access upon approval
- **Role-based tab access** — Five roles (Super Admin, Operations Admin, Operations User, Finance, Procurement) with granular permissions (view/edit/none) for each tab
- **Project-based data filtering** — Operations Users see only assigned projects, other roles see all or none based on permissions
- **Real-time permission updates** — Admin changes take effect immediately in active sessions without requiring logout

**Should have (competitive):**
- **Project management tab** — CRUD for projects with status tracking (For Approval, Approved, On-going, Completed), budget management, payment milestones
- **Payment milestone tracking** — Contract-based milestones (e.g., 30% downpayment, 40% progress billing, 30% final) with triggered/paid status
- **PO payment status** — Track payment terms (Net 30/60), payment due dates, amount paid vs total, payment percentage
- **Invoice upload and tracking** — Firebase Storage for invoice files with Firestore metadata linking to POs, approval workflow for invoices
- **Finance dashboard enhancements** — Payables by supplier, collectibles by project, calculated from PO payment status and project milestones

**Defer (v2+):**
- **Email notifications** — Notify users on approval, permission changes, or account deactivation (requires Cloud Functions or external service)
- **Audit logging** — Comprehensive change tracking for compliance (adds complexity, can use Firestore triggers later)
- **Password reset flow** — Firebase provides built-in email reset, but custom UI improves UX (not critical for internal system)
- **Two-factor authentication** — Enhanced security for sensitive roles (overkill for internal procurement system initially)

### Architecture Approach

The authentication layer integrates with the existing hash-based router through client-side route guards that check authentication state and user permissions before rendering views. Four-layer permission enforcement (route-level, view-level, action-level, server-level) provides defense-in-depth: the router blocks unauthorized navigation, views disable editing in view-only mode, action functions validate before Firestore writes, and Security Rules enforce true server-side security. Data filtering happens at query-level using Firestore `where` clauses for project assignments (with `in` operator limited to 10 items, requiring batch queries for users with many projects).

**Major components:**
1. **Auth State Manager** (in router.js) — Listens to `onAuthStateChanged`, loads user document from Firestore, checks account status, starts permission listener, handles route protection
2. **Permission Checker** (layered) — Route guards (tab access), view renderers (edit vs view-only UI), action validators (pre-write checks), Firestore Rules (server enforcement)
3. **User Management Views** (new) — Login page, registration page with invitation code, pending approval screen, Super Admin user dashboard for approval/role assignment
4. **Data Filters** (per view) — Query-level filtering by `assignedProjects` array (supports "all" for admins, specific project codes for Operations Users), real-time listeners with filtered queries

**Key patterns:**
- **Hash routing protection**: Client-side guard saves intended route to sessionStorage, redirects to login, restores route after authentication
- **Permission caching**: Global state object stores current user data, updated via Firestore listener, prevents repeated `getDoc()` calls
- **Phased migration**: Add auth without breaking existing system, add permissions with soft enforcement, deploy Security Rules for hard enforcement, then add new features
- **Graceful degradation**: Allow null `project_code` in rules temporarily, backfill data with admin-assisted mapping, enforce strict rules after validation

### Critical Pitfalls

1. **Client-side permission checks only** — JavaScript checks can be bypassed via browser console; Firestore Security Rules are the only true security layer. Prevention: Implement comprehensive Security Rules for all collections, validate user status/role/permissions server-side, test by attempting console-based bypasses.

2. **User lockout during migration** — Deploying Security Rules that require new fields (e.g., `project_code`) immediately breaks access to existing records without those fields. 40% of auth migrations fail due to lockouts. Prevention: Phased migration with graceful fallback (allow null values in rules temporarily), backfill data before enforcing strict rules, test in emulator, have rollback plan ready.

3. **Invitation code reuse** — Without usage tracking, codes can be shared indefinitely, allowing unauthorized registrations. Prevention: Store `status: active/used/expired` in Firestore, query for active codes only, atomically update status to used after registration, monitor usage in admin dashboard.

4. **Permission caching issues** — Loading permissions once and never updating causes admin changes to not take effect until user logs out. Prevention: Use `onSnapshot` listener on user document for real-time updates, refresh UI when permissions change, detect account deactivation and force logout.

5. **Super Admin account lockout** — Deactivating the last Super Admin account makes the system unmanageable. Prevention: Require 2+ active Super Admins always, check count before deactivation, use Firebase Console as fallback for manual Firestore edits, document recovery process.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Core Authentication
**Rationale:** Establish authentication foundation without breaking existing system. Must come first as all subsequent phases depend on user context.
**Delivers:** Login/registration pages, invitation code system, Firebase Auth integration, pending approval workflow
**Addresses:** Must-have features (invitation code registration, user approval workflow)
**Avoids:** Pitfall #2 (user lockout) by keeping existing routes accessible initially, adding auth as parallel system

### Phase 2: Role & Permission Infrastructure
**Rationale:** Add permission structure with soft enforcement before hard security rules. Allows testing UX without risk of lockout.
**Delivers:** User document schema (role, status, permissions, assignedProjects), router guards with bypass for testing, UI-level restrictions (hide/disable based on permissions)
**Uses:** Firestore snapshot listeners for real-time updates, global state management pattern
**Implements:** Permission Checker component (layers 1-3), Auth State Manager
**Avoids:** Pitfall #4 (permission caching) by implementing real-time listeners from start

### Phase 3: Security Rules Enforcement
**Rationale:** Deploy server-side security after testing client-side UX. Critical gate before exposing to production.
**Delivers:** Comprehensive Firestore Security Rules for all collections (mrfs, prs, pos, transport_requests, suppliers, projects, users, invitation_codes), rules testing in emulator
**Addresses:** Pitfall #1 (client-side only checks) by enforcing server-side validation
**Uses:** Firestore Rules v2 with helper functions (isActiveUser, getUserRole, hasProjectAccess)
**Research flag:** Complex rules syntax requires careful testing; use Firebase Rules Playground for validation

### Phase 4: Data Migration
**Rationale:** Backfill existing records with project assignments after security infrastructure is in place but before strict enforcement.
**Delivers:** Project code assignment to existing MRFs/PRs/POs, migration script with batched writes, admin UI for mapping ambiguous project names
**Addresses:** Pitfall #2 (user lockout) by ensuring data compatibility before strict rules
**Uses:** Firestore batched writes (500 doc limit), preserve original fields as backups
**Implements:** Graceful degradation pattern (allow nulls, backfill, enforce)

### Phase 5: Super Admin User Management
**Rationale:** Enable user approval and permission management once auth/permission infrastructure is stable.
**Delivers:** Admin dashboard for pending user approvals, role assignment UI, project assignment UI, invitation code management, user deactivation with safeguards
**Addresses:** Must-have features (user approval workflow completed)
**Implements:** User Management Views component
**Avoids:** Pitfall #5 (Super Admin lockout) by checking admin count before deactivation, Pitfall #3 (code reuse) by tracking usage

### Phase 6: Project Management Tab
**Rationale:** New feature that depends on project-based permissions being fully operational.
**Delivers:** Project CRUD operations, status tracking (For Approval, Approved, On-going, Completed), budget and contract management, payment milestone definition
**Addresses:** Should-have features (project management)
**Uses:** Project assignment array pattern for permission filtering
**Implements:** Data Filters component for project-based access control

### Phase 7: Payment & Invoice Tracking
**Rationale:** Finance features that build on project and PO data structures established in earlier phases.
**Delivers:** PO payment status tracking (unpaid, partial, paid), payment terms and due dates, invoice upload to Firebase Storage, invoice metadata linking, payables/collectibles calculations
**Addresses:** Should-have features (payment milestone tracking, PO payment status, invoice tracking, finance dashboard enhancements)
**Uses:** Firebase Storage for file uploads, Firestore for metadata
**Research flag:** Firebase Storage setup needs configuration; pricing model research for large file volumes

### Phase Ordering Rationale

- **Authentication first** because all features depend on user context; cannot implement role-based access without knowing who the user is
- **Soft enforcement before hard enforcement** to test UX without risking production lockout; client-side restrictions validate workflow before deploying irreversible Security Rules
- **Migration before strict enforcement** to ensure data compatibility; backfilling project codes after Security Rules deployed would create race condition where rules block the backfill operation itself
- **Admin tools after infrastructure** because admin dashboard requires stable authentication and permission system to function; cannot approve users without approval workflow in place
- **New features last** because project management and payment tracking are additive features that depend on mature permission system; can be deferred if timeline is tight

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (Security Rules):** Complex rules syntax with nested `get()` calls for user data lookups; performance implications of rules reading user document on every operation (costs ~$0.036 per 100K operations); testing strategy with Firebase Emulator Suite
- **Phase 7 (Invoice Tracking):** Firebase Storage configuration and integration pattern; file upload UX (progress indicators, size limits); Storage Security Rules for restricting access by PO ownership

Phases with standard patterns (skip research-phase):
- **Phase 1 (Core Auth):** Well-documented Firebase Auth email/password setup; official docs cover all use cases
- **Phase 5 (Admin Dashboard):** Standard CRUD operations on Firestore users collection; existing procurement tabs provide UI patterns
- **Phase 6 (Project Management):** Similar to existing MRF/PR/PO management; reuses established patterns

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Official Firebase documentation verified for all critical decisions; email/password auth and Firestore RBAC are mature, well-documented patterns; CDN version compatibility confirmed |
| Features | HIGH | Invitation code and approval workflow patterns validated across multiple sources; project-based filtering aligns with Firestore best practices; payment milestone structure matches industry standards |
| Architecture | MEDIUM | Hash routing protection pattern validated; four-layer permission enforcement is best practice but requires careful implementation; phased migration approach is sound but execution risk remains |
| Pitfalls | HIGH | Security pitfalls (client-side only checks, overly permissive rules) are well-documented anti-patterns; migration lockout risk confirmed by industry data (40% failure rate); prevention strategies are proven |

**Overall confidence:** HIGH

### Gaps to Address

- **Firebase version upgrade path**: Current version 10.7.1 (January 2024) is stable but outdated; latest is v12.8.0 (January 2026). No breaking changes expected in modular API, but should validate during Phase 1 whether to upgrade immediately or defer to post-milestone. Risk is low but should be explicit decision.

- **Firestore query performance with >10 projects**: `where('project_code', 'in', array)` limited to 10 items requires batch queries for users assigned to many projects. Architecture document proposes solution (chunking into batches of 10), but actual implementation complexity and performance impact needs validation during Phase 2. May need to reconsider "all" vs specific project array if performance degrades.

- **Security Rules testing strategy**: Comprehensive rules testing before production deployment is critical to avoid lockout (Pitfall #2). Need to establish testing workflow during Phase 3: Firebase Emulator Suite for local testing, Rules Playground for syntax validation, manual testing with multiple user roles in staging environment. Should document specific test cases for each collection and permission combination.

- **Existing data project assignment mapping**: Migration script requires mapping existing MRF `project_name` strings to new `project_code` values. Some project names may be ambiguous or require admin input (e.g., "Office Renovation" could map to multiple projects). Phase 4 should include admin review UI for mapping validation before batch update. Consider manual review threshold (auto-map confident matches, flag ambiguous ones for admin).

- **Super Admin bootstrap**: First Super Admin account needs creation outside normal approval flow (cannot approve yourself). Need manual Firestore write via Firebase Console or initialization script run once. Should document in Phase 1 or Phase 5 setup instructions.

## Sources

### Primary (HIGH confidence)
- [Firebase Authentication - Password-Based Accounts](https://firebase.google.com/docs/auth/web/password-auth) — Email/password setup, `createUserWithEmailAndPassword` usage
- [Firebase Auth - Get Started](https://firebase.google.com/docs/auth/web/start) — Auth initialization, `onAuthStateChanged` pattern
- [Firestore Role-Based Access](https://firebase.google.com/docs/firestore/solutions/role-based-access) — Security rules for role validation, user document lookup pattern
- [Security Rules and Auth](https://firebase.google.com/docs/rules/rules-and-auth) — Using `request.auth` in rules, `get()` function for reading user data
- [Firestore Best Practices](https://firebase.google.com/docs/firestore/best-practices) — Array vs subcollection guidance, query performance
- [Firestore Data Model](https://firebase.google.com/docs/firestore/data-model) — Document size limits (1MB), array field efficiency

### Secondary (MEDIUM confidence)
- [Firebase Custom Claims vs Firestore RBAC](https://medium.com/@chaitanyayendru/migrating-to-firebase-custom-claims-for-role-based-access-control-26c08f852795) — Comparison of custom claims vs Firestore roles
- [FreeCodeCamp - Firebase RBAC Tutorial](https://www.freecodecamp.org/news/firebase-rbac-custom-claims-rules/) — Implementation patterns for role-based access
- [Permission-based Access in Firestore](https://vojtechstruhar.medium.com/permission-based-access-in-google-firestore-a8eefd10111e) — Granular permission structures
- [How to Validate Invitation Codes - Prefinery](https://help.prefinery.com/article/18-validating-invitation-codes) — Invitation code validation patterns
- [Single Page Application Routing Using Hash or URL](https://dev.to/thedevdrawer/single-page-application-routing-using-hash-or-url-9jh) — Hash routing protection strategies
- [Auth Migration Hell - Why Identity Projects Fail](https://securityboulevard.com/2025/09/auth-migration-hell-why-your-next-identity-project-might-keep-you-up-at-night/) — 40% migration failure rate statistic
- [Contract Milestones in Project Management](https://www.sirion.ai/library/contract-management/contract-milestones/) — Payment milestone structure patterns
- [Milestone Billing Guide for Contractors](https://trusspayments.com/blog-posts/understanding-milestone-billing-a-guide-for-contractors-and-clients) — Standard percentage breakdowns

### Tertiary (LOW confidence)
- [Firestore Query Performance Best Practices 2026](https://estuary.dev/blog/firestore-query-best-practices/) — `in` query 10-item limit, batch query patterns
- [Arrays vs Maps vs Subcollections](https://saturncloud.io/blog/arrays-vs-maps-vs-subcollections-choosing-the-right-data-structure-for-objects-on-cloud-firestore/) — Data structure trade-offs

---
*Research completed: 2026-01-31*
*Ready for roadmap: yes*
