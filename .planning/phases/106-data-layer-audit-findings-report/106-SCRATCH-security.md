---
phase: 106-data-layer-audit-findings-report
plan: 06
requirement: AUDIT-03
artifact: 106-SCRATCH-security.md
provides: "security-rule findings (temp IDs S-0N) + the per-collection rule-vs-access reconciliation table for Plan 07"
temp_id_prefix: S-
category: security-rules
method: "READ-ONLY reconciliation — firestore.rules (33 match blocks) cross-checked against 106-INVENTORY.md § Per-Collection Access Map (28 code-accessed collections: 22 top-level + 6 subcollection). No rules edits, no rules-test suite (zero-build SPA)."
surface: "firestore.rules 1,066 lines · 22 top-level rule blocks + 11 nested subcollection blocks (+ databases meta-match)"
generated: 2026-07-09
---

# Phase 106 — AUDIT-03: Security-Rule Coverage Reconciliation (SCRATCH)

**The rule-gate side of the data-layer audit.** This scratch reconciles every `firestore.rules`
match block against the actual code access recorded in `106-INVENTORY.md` (§ Per-Collection
Access Map — the code-access column; not re-derived here) and flags **over-permissioning**,
**under-permissioning**, **dead/unreferenced rules**, and **subcollection-nesting** mismatches.
Findings carry temp IDs `S-0N` in the canonical D-07 schema; Plan 07 merges them into
`106-FINDINGS.md` re-IDed to `F-00N` by severity. **No rule is edited here** — AUDIT-03 only
READS the rules; remediation is Phase 112 (AUDIT-06/07).

## Method & scope

- **Rule-gate side:** `firestore.rules` (1,066 lines) — every `match` block's `allow
  read/get/list/create/update/delete` condition, read in full.
- **Code-access side:** `106-INVENTORY.md` § Per-Collection Access Map — the exhaustive
  `collection(db,'X')` / `doc(db,…)` / subcollection call-site map (949 anchors). **Used as-is**;
  this plan does not re-scan the view files.
- **Severity (D-08):** over/under-permissioned rules = **High** (data exposure or blocked legit
  access). Dead rules / cosmetic surface = **Low**. Silent audit-trail-only gaps calibrated to
  **Medium** with the rationale noted inline.
- **Surface match (from 106-INVENTORY.md):** rules expose **28 distinct collections** (22
  top-level + 6 subcollection names) and code accesses **exactly these 28** — a clean **1:1
  surface match**: no unruled collection, no orphan rule block at the surface level. AUDIT-03
  therefore audits rule *logic* (gate breadth), plus the two grep-blind leads (`deleted_users`,
  `audit_log`) and the subcollection nesting the naive `collection(db,'X')` grep misses (D-10).
- **`databases/{database}/documents` meta-match (firestore.rules:4)** is the service wrapper, not
  a collection — excluded from the table below (noted here for completeness).

> **Counting note.** 28 distinct collection *names*, but **33 match blocks**: 22 top-level +
> 11 nested (`edit_history`, `audit_log`, `activity_entries`, `progress_updates`, `issues` each
> appear under **both** `projects` and `services` = 10; `baselines` under `projects` only = 1).
> The table lists all 33 rows (both parent variants) so nesting is reconciled per path (D-10).

## Rule ↔ Access Reconciliation

Verdict legend: **OK** = gate matches access · **OVER** = broader than needed / exposes data ·
**UNDER** = rule stricter than the code's legitimate access (denies it) · **nesting-OK** =
subcollection rule nests under the parent the code accesses it through · **dead?→live** =
grep-blind lead resolved to live access. Gate summaries are terse; see `firestore.rules:<line>`
for the exact condition. Code-access column is condensed from 106-INVENTORY.md.

| Collection / path | Rule block | Read gate | Write gate (C/U/D) | Code access (106-INVENTORY.md) | Verdict |
|---|---|---|---|---|---|
| users | firestore.rules:113 | get own/super_admin/dept-admin-of-target; **list: any isActiveUser** (127); +get super_admin docs (134) | C own-pending · U admin-or-self(field-masked, no role/status) · D super_admin(deactivated) | read+write+listener — auth, login, pending, user-management, utils, notifications, +views | OK (list broad but **authenticated + documented-accepted** T-84.1-01) |
| role_templates | firestore.rules:163 | isActiveUser | C/U/D via `write`: super_admin | read (permissions listener, role-config) + write (seed-roles, role-config batch) | OK |
| **invitation_codes** | firestore.rules:183 | **`allow read: if true`** (185) — PUBLIC | C super_admin(188) · **U `if true`** (191) — PUBLIC · D super_admin(194) | write — auth.js:103 (mark used), user-management.js:1615 (create) + codesListener | **OVER → S-01** |
| projects | firestore.rules:200 | isActiveUser | C admin · U admin(code-locked) OR assigned-user field-mask(214-252) OR finance-mask · D admin | read+write+listener — finance, procurement, project-detail, project-plan, projects, utils, +more | OK |
| projects/*/edit_history | firestore.rules:263 | isActiveUser | C `[super_admin, operations_admin, services_admin, finance]` (268) · U/D false | write recordEditHistory(default 'projects') + read showEditHistoryModal — edit-history.js:90, project-detail.js, projects.js, engagement-create.js | **UNDER → S-02** (excludes assigned operations_user/services_user) · nesting-OK |
| projects/*/baselines | firestore.rules:276 | isActiveUser | C `[super_admin, operations_admin]` (278) · U false · D admin | read (getDocs project-plan.js:3201) + write (addDoc project-plan.js:3246, deleteDoc) | nesting-OK · **create-gate same class as S-02** (verify assigned-ops_user in 112) |
| projects/*/audit_log | firestore.rules:284 | isActiveUser | C admin + assigned ops_user/services_user/services_admin (287-292) · U/D false | write addDoc project-detail.js:2949 (subcollection path) | **dead?→live** (D-10 subcollection) · nesting-OK |
| projects/*/activity_entries | firestore.rules:301 | isActiveUser | C isActiveUser · U false · D admin | write+listener — procurement.js:7955, project-detail.js:3191 | OK · nesting-OK |
| projects/*/progress_updates | firestore.rules:312 | isActiveUser | C isActiveUser · U admin-or-member · D admin | write+listener — project-detail.js:3347 | OK · nesting-OK |
| projects/*/issues | firestore.rules:325 | isActiveUser | C isActiveUser · U isActiveUser · D admin | write+listener — project-detail.js:3541 | OK · nesting-OK |
| project_iterations | firestore.rules:341 | isActiveUser | C admin · U admin(field-masked tasks/saved_at) · D admin | read+write — project-detail.js, project-plan.js:3526 | OK |
| clients | firestore.rules:367 | isActiveUser | C/U/D `[super_admin, operations_admin, services_admin]` | read+write+listener — clients, engagement-create, proposal-modal, projects, services | OK |
| mrfs | firestore.rules:384 | get isActiveUser · list broad-roles OR ops_user-scoped(393) | C broad-submitters · U admins/finance/procurement · D `[super_admin, operations_admin, procurement]` | read+write+listener — mrf-form, mrf-records, procurement, finance, home | OK |
| prs | firestore.rules:411 | get isActiveUser · list broad OR ops_user-scoped(425) | C `[super_admin, operations_admin, procurement]` · U admins/finance/procurement · D same-as-C | read+write+listener — procurement, finance, mrf-records, home | OK |
| pos | firestore.rules:443 | get isActiveUser · list broad OR ops_user-scoped(456) | C `[super_admin, finance]` · U `[super_admin, finance, procurement]` · D super_admin | read+write+listener — finance, procurement, mrf-records, home, project/service-detail | OK |
| transport_requests | firestore.rules:474 | get isActiveUser · list broad OR ops_user-scoped(487) | C broad-submitters · U admins/finance/procurement · D `[super_admin, operations_admin, procurement]` | read+write+listener — procurement, finance, mrf-records, expense-modal | OK |
| suppliers | firestore.rules:505 | isActiveUser | C/U/D `[super_admin, procurement]` | read+listener+write — utils, procurement.js:5004/5157 | OK |
| deleted_mrfs | firestore.rules:518 | `[super_admin, operations_admin]` | C `[super_admin, operations_admin, procurement]` · U/D false (append-only) | write addDoc(deletedMrfsRef) procurement.js:4854 (ref-var) | OK |
| deleted_users | firestore.rules:533 | get own/super_admin · list super_admin | C super_admin · U/D false (append-only) | read doc-ref auth.js:332, login.js:157 + write setDoc user-management.js:1312 | **dead?→live** (accessed via `doc(db,'deleted_users',uid)`, not `collection()`) |
| services | firestore.rules:555 | get broad-roles(560) · list scoped services_user/ops_user(572) | C `[super_admin, services_admin]` · U admins+assigned services_user/ops_user/ops_admin+finance-mask · D `[super_admin, services_admin]` | read+write+listener — services, service-detail, service-plan, procurement, utils | OK |
| services/*/edit_history | firestore.rules:596 | broad-roles(597) | C `[super_admin, services_admin, services_user, operations_admin]` (600) · U/D false | write recordEditHistory('services') + read — services.js:1489/1566, service-detail.js:3821 | **UNDER → S-02** (excludes cross-dept assigned operations_user) · nesting-OK |
| services/*/audit_log | firestore.rules:606 | isActiveUser | C admin + assigned services_user/ops_user/ops_admin (609-614) · U/D false | write addDoc service-detail.js:2679 (subcollection path) | **dead?→live** (D-10 subcollection) · nesting-OK |
| services/*/activity_entries | firestore.rules:620 | isActiveUser | C isActiveUser · U false · D admin | write+listener — procurement.js:7976, service-detail.js:2690 | OK · nesting-OK |
| services/*/progress_updates | firestore.rules:628 | isActiveUser | C isActiveUser · U admin-or-member · D admin | write+listener — service-detail.js:3041 | OK · nesting-OK |
| services/*/issues | firestore.rules:639 | isActiveUser | C isActiveUser · U isActiveUser · D admin | write+listener — service-detail.js:3222 | OK · nesting-OK |
| rfps | firestore.rules:650 | isActiveUser | C `[super_admin, procurement]` · U `[super_admin, finance, procurement]` · D `[super_admin, procurement]` | read+write+listener — procurement, finance, project/service-detail, expense-modal | OK |
| collectibles | firestore.rules:674 | isActiveUser | C/U/D `[super_admin, operations_admin, finance]` | read+write+listener — finance, projects, project/service-detail, coll-id, expense-modal | OK |
| billing_requests | firestore.rules:699 | isActiveUser | C **isActiveUser** (706, advisory) · U/D `[super_admin, operations_admin, finance]` | write + listener — project-detail.js:1457, service-detail.js:690, finance | OK (broad C but authenticated + Finance re-derives; documented) |
| project_tasks | firestore.rules:734 | isActiveUser | C admin + assigned ops_user/services_user/services_admin · U two-tier(full/progress) · D admin+assigned | read+write — task-id, project-detail, project-plan | OK |
| service_tasks | firestore.rules:817 | isActiveUser | C admin + assigned services_user/ops_user/ops_admin · U two-tier · D admin+assigned | read+write — service-task-id, service-detail, service-plan | OK |
| proposals | firestore.rules:920 | isActiveUser | C admin(BRANCH A) OR assigned-user(BRANCH B) · U admin OR assigned field-masked(960-1004) · D super_admin | read+write+listener — proposal-modal, proposal-id, home, project/service-detail, proposals | OK (**`audit_log` here is an in-doc ARRAY FIELD** governed by this block — NOT the audit_log subcollection; homonym) |
| notifications | firestore.rules:1021 | read/list own only | C isSignedIn+actor_id-pinned(1029) · U own field-masked · D own | write+listener — notifications.js, views/notifications.js | OK (isSignedIn intentional CR-04, pinned) |
| client_errors | firestore.rules:1058 | read/list super_admin | C isSignedIn+uid-pinned(1059) · U false · D super_admin | write addDoc diagnostics.js:108 (dynamic `import()`, D-09) | OK (isSignedIn intentional, pinned) |

_Note: `databases/{database}/documents` (firestore.rules:4) is the wrapper meta-match, not a collection — no code accesses it as a collection; excluded from the rows above._

## Findings

_S-0N findings, dead-rule resolution, and nesting reconciliation are populated in Task 2 below._
