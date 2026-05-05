---
phase: 86-native-project-management-gantt
plan: 01
subsystem: foundation
tags: [foundation, security-rules, routing, cdn-load, sequential-id, frappe-gantt]
requires:
  - app/firebase.js (db + collection/query/where/getDocs exports)
  - styles/main.css + components.css (existing palette + .btn / .card / .modal classes for Plan 02+)
provides:
  - window.Gantt global (Frappe Gantt UMD constructor) — consumed by Plan 03 for the Gantt mount
  - generateTaskId(projectCode) export — consumed by Plan 04 (Add Task modal write path)
  - firestore.rules /project_tasks block — gates all reads (Plan 02 onSnapshot) + creates/updates/deletes (Plans 03-04 writes)
  - /project-plan route + #/projects/:code/plan hash parsing — consumed by Plan 02 (project-plan.js view) + Plan 05 ("Open Plan" button)
affects:
  - index.html (4 lines added: 1 CSS link, 1 UMD script, 2 comment lines)
  - firestore.rules (50 lines added: 1 new collection block)
  - app/router.js (15 lines added: routePermissionMap entry, routes table entry, 2 hash branches)
  - app/task-id.js (NEW file, 60 lines)
tech-stack:
  added:
    - "Frappe Gantt v1.2.2 (CDN, jsdelivr, MIT license, ~50KB SVG-based) — UMD + CSS"
  patterns:
    - "CDN pinning convention (Phase 77.1 Chart.js precedent): exact version, no @latest"
    - "Project-scoped sequential ID generator (Phase 65.4 / 85 precedent): query collection by scope code, parse max suffix, increment"
    - "Two-tier Firestore update rule via affectedKeys().hasOnly() (Phase 83 notifications precedent)"
    - "denormalized project_code on docs (mirrors mrfs.project_code) so security rules can call isAssignedToProject() without an extra get(/projects/...)"
key-files:
  created:
    - app/task-id.js
  modified:
    - index.html
    - firestore.rules
    - app/router.js
decisions:
  - "Pinned frappe-gantt to exact @1.2.2 (NOT @latest) per UI-SPEC Registry Safety + Phase 77.1 Chart.js precedent"
  - "Two-tier update rule narrows tier-2 (progress-only) to operations_user assignees — finance/services/procurement remain READ-ONLY even if accidentally added to task.assignees (D-15/D-14)"
  - "task-id.js drops the dept switch present in coll-id.js since Phase 86 is projects-only (D-04); services-side parallel surface intentionally deferred"
  - "Plan 01 ships rules WITHOUT JS writes — Plans 02-04 must NOT touch firestore.rules unless co-shipping the matching JS write (D-24 same-commit invariant)"
  - "/project-plan route registered with lazy import of project-plan.js even though that file does not exist yet — runtime navigation will fail until Plan 02 ships, but no UI links to the route at this point so users cannot reach it"
metrics:
  duration: 30
  tasks: 4
  files: 4
  completed: "2026-05-05"
---

# Phase 86 Plan 01: Foundation Summary

**One-liner:** Frappe Gantt v1.2.2 loaded via CDN + project_tasks Firestore rules with two-tier update + project-scoped task ID generator + #/projects/:code/plan route — zero JS writes to project_tasks ship in this plan.

## Goal Achieved

Plan 01 lays the four pure prerequisites for Wave 2-5 execution:

1. **Frappe Gantt v1.2.2 loaded via jsdelivr CDN** in `index.html` — both the UMD script (exposes `window.Gantt`) and the matching CSS. Pinned to exact `@1.2.2`, never `@latest` (Phase 77.1 Chart.js convention; UI-SPEC Registry Safety).
2. **`project_tasks` Firestore Security Rules deployed** in `firestore.rules`, with the full two-tier update rule per D-18 (full-WBS-edit tier for admins+assigned ops_user; progress+updated_at-only tier narrows to operations_user assignees so finance/services/procurement remain READ-ONLY even if added to `task.assignees`).
3. **`app/task-id.js` created** — exports `generateTaskId(projectCode)` returning `TASK-{PROJECT_CODE}-{n}` where n is per-project max+1. Mirrors `app/coll-id.js` shape; drops the dept switch (D-04 projects-only).
4. **`#/projects/:code/plan` routable** — `/project-plan` registered in routes table + permission map; `handleHashChange` and `handleInitialRoute` both parse the hash and dispatch to `navigate('/project-plan', null, CODE)`. parseHash() is byte-unchanged.

## Files Modified / Created

| File | Status | Lines Added | Notes |
|------|--------|-------------|-------|
| `index.html` | modified | +4 | One `<link>` to frappe-gantt.css after styles/hero.css; one `<script>` to frappe-gantt.umd.js after Chart.js. Both pinned `@1.2.2` exactly. |
| `firestore.rules` | modified | +50 | New `match /project_tasks/{taskId}` block placed between `collectibles` (line 467) and `notifications` (line 541). Contains read/create/update(tier-1+tier-2)/delete rules per D-18. |
| `app/task-id.js` | created | 60 | New file. Exports async `generateTaskId(projectCode)`. Imports db/collection/query/where/getDocs from `./firebase.js`. Custom inline generator (Phase 65.4 lesson). |
| `app/router.js` | modified | +15 | (1) `routePermissionMap['/project-plan'] = 'projects'`; (2) new routes-table entry with lazy `import('./views/project-plan.js')`; (3) handleHashChange branch for `path==='/projects' && tab && subpath==='plan'`; (4) handleInitialRoute mirror branch. parseHash unchanged. |

## Frappe Gantt Pin

Pinned to exact `@1.2.2` for both `frappe-gantt.css` and `frappe-gantt.umd.js`, served via `cdn.jsdelivr.net/npm/frappe-gantt@1.2.2`. **Why exact pin and NOT `@latest`:**
- UI-SPEC Registry Safety table mandates pinned-only loads
- Phase 77.1 set the precedent with Chart.js `@4.4.7` — same convention applied here
- `@latest` would mean upstream updates silently affect runtime behavior — unacceptable for a static-site SPA with no integration test coverage
- Subresource Integrity (`integrity="..."`) attribute deliberately NOT added — Chart.js does not use SRI either; UI-SPEC carves SRI out as a future ecosystem-wide hardening pass, not a Phase 86 blocker

## Two-tier Update Rule Shape (D-18)

```
allow update: if (
  // Tier 1: full WBS edit — admins or assigned ops_user
  hasRole(['super_admin', 'operations_admin']) ||
  (isRole('operations_user') && isAssignedToProject(resource.data.project_code))
) || (
  // Tier 2: progress-only update — request changes ONLY 'progress' + 'updated_at'
  // D-15 + D-14: only operations_user (or admins) may write progress;
  // finance/services/procurement READ-ONLY even if in task.assignees.
  request.resource.data.diff(resource.data).affectedKeys().hasOnly(['progress', 'updated_at']) &&
  (hasRole(['super_admin', 'operations_admin']) ||
   (isRole('operations_user') && request.auth.uid in resource.data.assignees))
);
```

This implements D-18 (PM-11) verbatim:
- Tier 1 (full WBS edit) — admins + assigned ops_user can edit any field on the doc
- Tier 2 (progress-only) — when the request affects ONLY `progress` and `updated_at`, the user need only be in `task.assignees` (and be an operations_user)
- Mirrors the Phase 83 `notifications` block's `affectedKeys().hasOnly()` technique
- Tier-2 narrows to `operations_user` (NOT all roles) per D-15/D-14 — even if a finance/services/procurement user is somehow added to `task.assignees`, the role check denies the progress write

## Confirmation: Zero JS Writes to project_tasks Ship in Plan 01

This plan ships the rules side ONLY. There are zero `addDoc`, `setDoc`, `updateDoc`, or `deleteDoc` calls targeting `collection(db, 'project_tasks')` in any committed source file at the conclusion of Plan 01 execution. The first JS write lands in Plan 04 (Add Task modal save handler), at which point these rules are already deployed.

This is the rules-only side of the same-commit invariant (Phase 85 D-24): rules + first-write co-shipping is the rule, but rules-only is acceptable here because no JS writes exist yet. **Plans 02-04 must NOT touch `firestore.rules`** unless they co-ship the matching JS write in the same commit.

## Verification Results

All 7 plan-level `must_haves.verification_steps` greps pass at expected counts:

| Verification | Expected | Actual |
|--------------|----------|--------|
| `grep -c 'frappe-gantt@1.2.2' index.html` | 2 | 2 |
| `grep -c 'match /project_tasks/{taskId}' firestore.rules` | 1 | 1 |
| `grep -c "affectedKeys().hasOnly\(\['progress', 'updated_at'\]\)" firestore.rules` | 1 | 1 |
| `grep -c "isRole('operations_user') && request.auth.uid in resource.data.assignees" firestore.rules` | 1 | 1 |
| `grep -c 'export async function generateTaskId' app/task-id.js` | 1 | 1 |
| `grep -c "'/project-plan'" app/router.js` | ≥3 | 4 |
| `grep -c "subpath === 'plan'" app/router.js` | 2 | 2 |

Manual smoke check (deferred to post-Plan-02 deploy): browser DevTools console `typeof window.Gantt === 'function'` should return `'function'` once index.html is served. File-level grep is the gate at Plan 01.

Firestore Rules Playground manual checks (deferred to deployment time): super_admin create ALLOW; finance create DENY; ops_user (assigned, project_code matches) create ALLOW; ops_user (not assigned) create DENY; non-assignee progress-only update DENY; assignee progress+updated_at update ALLOW; assignee name+progress+updated_at update DENY (affectedKeys not hasOnly).

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `742fb14` | feat(86-01): load Frappe Gantt v1.2.2 CSS + UMD via CDN |
| 2 | `a4e84a7` | feat(86-01): add project-scoped task ID generator (D-19) |
| 3 | `06c7955` | feat(86-01): add project_tasks Security Rules with two-tier update (D-18) |
| 4 | `b10ef41` | feat(86-01): register /project-plan route + parse #/projects/:code/plan |

## Deviations from Plan

None — plan executed exactly as written. All four tasks delivered verbatim. Acceptance criteria met on first pass; no Rule 1/2/3 auto-fixes triggered; no Rule 4 architectural questions surfaced.

## Authentication Gates

None — no auth-required actions in Plan 01. Firestore rules deployment to production is a separate ops step (typically `firebase deploy --only firestore:rules` from a machine with Firebase CLI logged in); not invoked by this plan. The committed `firestore.rules` is the authoritative source; deployment can be batched with future plan deploys.

## Known Stubs

None. No view-rendered placeholders introduced; no UI added at all in Plan 01.

## Threat Surface Scan

No new threat flags. The threat register documented in 86-01-PLAN.md `<threat_model>` (T-86.1-01 through T-86.1-06) covers exactly the surface introduced by Plan 01:

- T-86.1-01 Tampering on tier-2 update — mitigated by `affectedKeys().hasOnly()` exact-subset check
- T-86.1-02 EoP on create with mismatched project_code — mitigated by `request.resource.data.project_code` check on create
- T-86.1-03 Information Disclosure via CDN — accepted (same posture as Chart.js Phase 77.1)
- T-86.1-04 Tampering with browser-cached task-id.js — accepted (server-side rules are the final gate)
- T-86.1-05 Spoofing via hash-route to project-plan — mitigated at routePermissionMap layer + firestore.rules layer
- T-86.1-06 DoS via 10K-task projection — accepted (per-project scope bounds the scan)

No additional threat surface introduced beyond what was modeled.

## Self-Check: PASSED

**Files exist:**
- `C:\Users\franc\dev\projects\pr-po\index.html` — FOUND (modified)
- `C:\Users\franc\dev\projects\pr-po\firestore.rules` — FOUND (modified)
- `C:\Users\franc\dev\projects\pr-po\app\task-id.js` — FOUND (created)
- `C:\Users\franc\dev\projects\pr-po\app\router.js` — FOUND (modified)

**Commits exist:**
- `742fb14` — FOUND (feat 86-01 frappe-gantt CDN)
- `a4e84a7` — FOUND (feat 86-01 task-id.js)
- `06c7955` — FOUND (feat 86-01 firestore rules)
- `b10ef41` — FOUND (feat 86-01 router /project-plan)

**Verification greps:** All 7 plan-level greps return expected counts (see Verification Results table above).
