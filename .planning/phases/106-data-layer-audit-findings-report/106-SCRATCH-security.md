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

### S-01 — invitation_codes public read + public update (`allow: if true`)
- severity: High
- category: security-rules
- collection: invitation_codes
- anchor: firestore.rules:185 (`allow read: if true`), firestore.rules:191 (`allow update: if true`); documented ACCEPTED RISK at firestore.rules:102 + block comment firestore.rules:174-182; code: app/auth.js:103 (mark used), app/views/user-management.js:1615 (create)
- impact: The collection is world-readable AND world-writable with no auth (`if true`). Public READ is the milder half — a random UUID-like code only reveals existence, and registration still gates on Firebase Auth + admin approval (new users land `pending`), so a pre-auth read is plausibly required. Public **UPDATE** is the real exposure: any unauthenticated client can mutate ANY invitation_codes doc — mark valid codes `used` (denial-of-registration), flip `used`→unused, or overwrite code fields — with zero authentication (Information Disclosure + Tampering/Elevation, T-106-12).
- recommendation: Re-evaluate in Phase 112. Keep `allow read: if true` ONLY if the register flow genuinely needs a pre-auth read (106-INVENTORY.md shows register.js does zero Firestore ops and the code read happens in auth.js *after* sign-in — if so, tighten read to `isSignedIn()` or a code-hash lookup). Replace `allow update: if true` with a single-use-transition mask, e.g. `resource.data.used == false && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['used','used_by','used_at'])`, or move redemption behind an authenticated path.
- handling: code-fix
- target_phase: 112
- note: **Flagged despite the documented ACCEPTED RISK (firestore.rules:102) — surfaced for re-evaluation, NOT as a fresh bug.** The open READ was a deliberate, recorded decision for the pre-auth register flow; the narrow ask is to re-tighten **public UPDATE** in particular (mark-used tampering) now that the single-use invariant can be expressed as a field-mask.

### S-02 — edit_history (+ baselines) create-gate excludes assigned non-admin editors → silent audit-trail gap
- severity: Medium
- category: security-rules
- collection: projects/*/edit_history + services/*/edit_history (same class: projects/*/baselines)
- anchor: firestore.rules:268 (projects/edit_history create), firestore.rules:600 (services/edit_history create), firestore.rules:278 (baselines create); write path app/edit-history.js:90 (fire-and-forget `catch` :98-100); trigger app/views/project-detail.js:4181 (submitProjectLoss) + app/views/service-detail.js:3821; the parent-doc write the SAME role is allowed to make sits at firestore.rules:220-252 (assigned-user field-mask incl. `project_status`+`loss_reason`)
- impact: `edit_history` is an append-only audit trail whose create gate is stricter than the parent write the code performs in the same flow. `projects/edit_history` create (268) = `[super_admin, operations_admin, services_admin, finance]` — **excludes operations_user and services_user**; `services/edit_history` create (600) = `[super_admin, services_admin, services_user, operations_admin]` — **excludes operations_user** (cross-dept assigned via 260706-mco). Yet an assigned `operations_user` may legitimately mutate the parent (mark a project **Loss** — rules 227-230 allow `project_status`+`loss_reason`; code writes it at project-detail.js:4172-4177) then calls `recordEditHistory(...)` at :4181. Because that helper is fire-and-forget (silent `catch`, edit-history.js:98-100), the edit_history create is **denied silently** — the Loss commits but the audit entry "Status → Loss by <user>" never lands. Net: gaps in an append-only accountability log (Repudiation surface, T-106-13), not a blocked flow or data exposure.
- recommendation: Extend the `edit_history` create gate on BOTH parents to admit the assigned non-admin editors, mirroring what `audit_log` already does — firestore.rules:287-292 / 609-614 were expanded for kg0/mco assigned users, but edit_history (268/600) and baselines (278) were left behind. e.g. append `|| ((isRole('operations_user') || isRole('services_user')) && request.auth.uid in get(<parent>).data.personnel_user_ids)`. Also re-check `baselines` create (278, admin-only) against assigned-ops_user plan editing (project_tasks create at 741 already admits them) — same asymmetry class.
- handling: code-fix
- target_phase: 112
- note: Severity **Medium not High** — D-08 rates under-permissioning High when it *blocks a user flow*, but here the denied write is a fire-and-forget audit sidecar (primary action commits), so impact is audit-trail completeness rather than blocked access/exposure. Escalate to High in Phase 112 if the lifecycle audit trail is deemed integrity-critical.

## Dead / unreferenced rule leads — RESOLVED (zero dead rules)

The two recon leads that do NOT show up in a naive `collection(db,'X')` grep are both **live**, via access paths the literal grep misses (D-10). Neither is dead; no rule block should be trimmed.

| Lead | Rule block | Why grep-blind | Actual access | Resolution |
|---|---|---|---|---|
| deleted_users | firestore.rules:533 | accessed by **document reference** `doc(db,'deleted_users',uid)`, never `collection(db,'deleted_users')` | read auth.js:332 + login.js:157 (deactivation check); write setDoc user-management.js:1312 | **live → OK**, not dead |
| audit_log | firestore.rules:284 (projects), :606 (services) | **nested subcollection** `collection(db,'<parent>',id,'audit_log')`, not a top-level literal | write project-detail.js:2949, service-detail.js:2679 | **live → OK**, not dead |

**Homonym caution for Plan 07 / Phase 112:** `proposals.audit_log` is an **in-document array field** on each proposals doc (governed by the proposals block at firestore.rules:920) — a different thing from the `audit_log` **subcollection** under projects/services. The field needs no match block; the subcollection has its own (284/606). Do not conflate.

**Conclusion: 0 dead/unreferenced rule blocks.** Every one of the 33 match blocks is exercised by code (22 top-level + 11 nested), consistent with the 1:1 surface match in 106-INVENTORY.md.

## Subcollection nesting reconciliation (D-10)

For every journal/audit subcollection, the rule nests under the SAME parent the code accesses it through — a top-level rule would NOT govern a nested path, so this confirms the gates actually apply. **All six confirmed nesting-OK:**

| Subcollection | Rule nests under | Code accesses as | Match? |
|---|---|---|---|
| activity_entries | projects (firestore.rules:301) + services (firestore.rules:620) | `collection(db,'projects'/'services',id,'activity_entries')` — procurement.js:7955/7976, project-detail.js:3191, service-detail.js:2690 | yes |
| progress_updates | projects (firestore.rules:312) + services (firestore.rules:628) | `collection(db,…,id,'progress_updates')` — project-detail.js:3347, service-detail.js:3041 | yes |
| issues | projects (firestore.rules:325) + services (firestore.rules:639) | `collection(db,…,id,'issues')` — project-detail.js:3541, service-detail.js:3222 | yes |
| baselines | projects only (firestore.rules:276) | `collection(db,'projects',id,'baselines')` — project-plan.js:3201/3246 (no services variant in code or rules) | yes |
| audit_log | projects (firestore.rules:284) + services (firestore.rules:606) | `collection(db,…,id,'audit_log')` — project-detail.js:2949, service-detail.js:2679 | yes |
| edit_history | projects (firestore.rules:263) + services (firestore.rules:596) | `collection(db, collectionName, id,'edit_history')`, `collectionName ∈ {'projects','services'}` — edit-history.js:90; callers pass `'projects'` (default) or `'services'` (services.js:1489/1566, service-detail.js:3821, engagement-create.js:126) | yes |

**No nesting mismatch.** The `edit_history` dynamic parent (`collectionName`) resolves only to `projects` or `services` across all confirmed callers, both of which have a nested rule block. The edit_history problem is create-gate **role** coverage (S-02), not the nesting path.

## Over-permissioning scan — other broad gates reviewed (not flagged)

Beyond invitation_codes (S-01 — the only fully-public `if true`), the remaining broad gates are all **authenticated and documented-accepted**; reviewed and NOT raised as fresh findings:

- **users.list = isActiveUser** (firestore.rules:127) — exposes full_name/email/role/status to any active user; documented-accepted (T-84.1-01) for notification fan-out; no PII beyond name/email. Note for 112 only.
- **billing_requests.create = isActiveUser** (firestore.rules:706) — any active user files an *advisory* request; Finance re-derives the authoritative amount at approval (documented D-04). Authenticated; acceptable.
- **notifications.create / client_errors.create = isSignedIn** (firestore.rules:1029 / 1059) — intentionally below isActiveUser so `pending` users can fire notifications/diagnostics; both **pin actor_id/uid == request.auth.uid** (anti-impersonation). Documented CR-04. Acceptable.
- **activity_entries / progress_updates / issues create = isActiveUser** (firestore.rules:303/314/327 + services mirror) — journal is intentionally no-role-gated (spike-032 / D-15: any user with project access may post). By design.

## Handoff to Plan 07 (106-FINDINGS.md)

| Temp ID | Severity | Category | Collection | One-line |
|---|---|---|---|---|
| S-01 | High | security-rules | invitation_codes | Public read + **public update** (`if true`); re-evaluate public UPDATE despite documented acceptance |
| S-02 | Medium | security-rules | projects/services edit_history (+ baselines) | Create-gate excludes assigned non-admin editors → fire-and-forget audit-trail gap |

- **0** under-permissioned *unruled* collections (clean 1:1 surface match); the single UNDER finding (S-02) is a rule-stricter-than-access case, not a missing rule.
- **0** dead/unreferenced rule blocks (both leads resolved live).
- **6/6** subcollections nesting-OK (D-10).
- Both actionable findings → **handling: code-fix, target_phase: 112** (rules-only; no backfill scripts). Low/accepted broad-gate notes flow to the AUDIT-06 deferral list.
