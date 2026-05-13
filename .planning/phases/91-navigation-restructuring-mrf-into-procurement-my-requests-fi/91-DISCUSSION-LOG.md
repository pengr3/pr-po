# Phase 91: Navigation Restructuring — MRF into Procurement, My Requests Filtered View, Role Permission Overhaul — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-13
**Phase:** 91 — Navigation Restructuring — MRF into Procurement, My Requests Filtered View, Role Permission Overhaul
**Areas discussed:** Sub-tab name and position, My Requests filter behavior, Operations User edit rights, Requestor scope inside Procurement

---

## Sub-tab name and position

| Option | Description | Selected |
|--------|-------------|----------|
| New first tab 'Submit MRF' | Adds a 4th sub-tab; clean separation between submission and management | |
| Merged into 'MRF Management' | Inline form/button at top of existing mrfs tab; 3 tabs remain | |
| Name it "Request" (free text) | User specified the exact name | ✓ |
| Distinct tab (4 tabs total) | Confirmed as a separate tab, not merged | ✓ |
| 'Request' for everyone (default) | Default landing for #/procurement is Request for all roles | ✓ |
| Role-aware default | Requestors land on Request; others land on MRF Management | |
| Keep 'MRF Management' as default | No default change | |

**User's choice:** "Request" as a distinct 4th sub-tab, positioned first. Tab order: Request | MRF Management | Supplier Mgmt | MRF Records. Default tab is "Request" for everyone.
**Notes:** User specified the sub-tab name explicitly as "Request" via free text. Confirmed distinct tab (not merged). Confirmed Request-first default for all roles.

---

## My Requests filter behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Manual toggle, all roles | 'My Requests' toggle button visible to all; off by default | |
| Auto-on for requestors, toggle for others | Auto-applied for operations_user; toggle for others | |
| Project-scoped + manual filter (free text) | User described project-assignment-based base view with My Requests as secondary filter | ✓ |
| In the existing filter toolbar row (dropdown) | Added to the 'All Departments' dropdown | ✓ |
| As a tab within MRF Records | Sub-sub-tabs: All Records / My Requests | |
| Always manual (same for everyone) | Dropdown default stays 'All Departments' for all roles | ✓ |
| Auto-selected for operations_user | Dropdown pre-set to My Requests for operations_user | |

**User's choice:** "My Requests" added as a 4th option in the existing "All Departments" dropdown. Always manual — no auto-select. Filters by `requestor_user_id === currentUser.uid`.
**Notes:** User initially described a project-assignment-based access model (only see MRFs for assigned projects) — confirmed this is already implemented via Phase 7's `getAssignedProjectCodes()` on the MRF Management tab. The Records tab just needs the same pattern applied. User confirmed via screenshot that "My Requests" should live inside the existing dropdown. Only `operations_user` gets the project-scope filter (not finance, procurement, etc.).

---

## Operations User edit rights

| Option | Description | Selected |
|--------|-------------|----------|
| Upgrade procurement:edit to true | One flag for the whole tab; simplest approach | |
| Special-case 'Request' tab as always editable | Keep edit:false but bypass for Request sub-tab | |
| Reuse mrf_form key to gate Request sub-tab | mrf_form key semantics shift from route to sub-tab | |
| Introduce sub-tab permissions (4 keys) | Fine-grained per-sub-tab access control | ✓ |
| procurement_request only (other 3 unchanged) | Minimal schema change — 1 new key | |
| All 4 keys: procurement_request, procurement_mrfs, procurement_suppliers, procurement_records | Full sub-tab permission matrix | ✓ |
| operations_user: Supplier Management — view-only | access:true, edit:false for suppliers | ✓ |
| operations_user: Supplier Management — hidden | access:false for suppliers | |

**User's choice:** Introduce all 4 sub-tab permission keys. operations_user gets `procurement_request:{access:true,edit:true}`, `procurement_mrfs:{access:true,edit:false}`, `procurement_suppliers:{access:true,edit:false}`, `procurement_records:{access:true,edit:false}`.
**Notes:** User explicitly raised the concern about "I can't give edit:true to other tabs" — this drove the decision to introduce fine-grained sub-tab keys rather than reusing the top-level flag. User also mentioned services_user in this context, leading to the follow-up question about mirroring roles.

---

## Requestor scope inside Procurement

| Option | Description | Selected |
|--------|-------------|----------|
| Hide tabs with access:false | Tabs not rendered if access:false; cleaner nav | ✓ |
| Show all, view-only notice on restricted tabs | All 4 tabs always visible; banners for edit-only restrictions | |
| services_user mirrors operations_user | Symmetric permission structure between departments | ✓ |
| Customize services_user separately | Different sub-tab permissions for services roles | |

**User's choice:** Sub-tabs with `access:false` are hidden entirely. `services_user` mirrors `operations_user`; `services_admin` mirrors `operations_admin`.
**Notes:** services_user and services_admin exist in Firestore but are absent from seed-roles.js defaults — researcher should verify their current permission structure before writing updated seed data.

---

## Claude's Discretion

- **Router fallthrough behavior**: When the default tab (Request) is inaccessible for a role, router falls through to first accessible tab. Claude decides the exact implementation.
- **mrf_form key cleanup**: The deprecated `mrf_form` key is kept in role templates (not deleted) to avoid breaking any legacy code that might still reference it. Claude decides when/whether to fully remove it.
- **mrf-form.js integration approach**: Whether to inline mrf-form.js logic into procurement.js or import and render it within the new Request sub-tab. Claude/researcher decides based on what's cleanest given procurement.js is already 4,400+ lines.

## Deferred Ideas

None — discussion stayed within phase scope.
