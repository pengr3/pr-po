---
phase: 102-dlp-retention-management
plan: "04"
subsystem: project-detail / firestore-rules
tags: [dlp, retention, record-release, finance, firestore-rules, affectedKeys]
dependency_graph:
  requires:
    - "102-03 (getDlpState + renderDlpFinanceBar with the commented Plan-04 placeholder slot + retention_released_at:null seed)"
  provides:
    - "app/views/project-detail.js window.recordRetentionRelease(projectId) — Finance-only direct write of retention_released_at"
    - "Record Release button rendered in the in-dlp + expired DLP strips (Finance-only)"
    - "firestore.rules — projects update rule permits 6 DLP fields for assigned ops users + dedicated Finance branch gating retention_released_at"
  affects:
    - "app/views/project-detail.js (renderDlpFinanceBar strip slots, init() registration, destroy() teardown)"
    - "firestore.rules (match /projects/{projectId} allow update)"
tech_stack:
  added: []
  patterns:
    - "Finance-gated direct write (code guard role==='finance' + rules affectedKeys field-mask) — defense in depth"
    - "No new listener — existing project onSnapshot flips the bar to green/Released after the write (D-21)"
    - "Dedicated third allow-update branch with affectedKeys().hasOnly([retention_released_at, updated_at]) — Phase 87.2 field-mask pattern"
key_files:
  created: []
  modified:
    - path: "app/views/project-detail.js"
      change: "window.recordRetentionRelease (Finance-gated updateDoc + audit + activity); Record Release button injected into in-dlp + expired strips replacing the Plan-03 placeholder; init register + destroy delete"
    - path: "firestore.rules"
      change: "operations_user affectedKeys allow-list extended with 6 DLP fields; new Finance allow-update branch gating retention_released_at"
decisions:
  - "Record Release rendered in BOTH in-dlp and expired states (D-21), Finance-only via window.getCurrentUser()?.role === 'finance'"
  - "retention_released_at written as a 'YYYY-MM-DD HH:MM:SS' string (same format as the other lifecycle timestamps), not a serverTimestamp, so getDlpState's truthiness + display read it directly"
  - "Dedicated Finance rules branch added even though Finance is already in branch 1 — branch 1 requires the project_code/client lock to be re-satisfied; the field-masked branch makes the release write unambiguous on code-locked projects"
metrics:
  duration: "~8 minutes (code); checkpoints pending"
  completed: "2026-06-12 (code-complete)"
  tasks: 2 auto + 2 checkpoints
  files: 2
---

# Phase 102 Plan 04: Finance-only Record Release + firestore.rules Gate

**One-liner:** Adds the Finance-only "Record Release" action (Spike 036) — a direct, role-gated write of `retention_released_at` that flips the project to the green/Released state via the existing onSnapshot — plus a `firestore.rules` update permitting DLP-field writes by project-editing roles while gating `retention_released_at` to Finance.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | recordRetentionRelease + Record Release button (in-dlp + expired) + window register/teardown | `91bc8c6` | app/views/project-detail.js |
| 2 | firestore.rules — DLP fields in ops allow-list + Finance retention_released_at branch | `e2510dc` | firestore.rules |

## Verification

**Automated (all PASS):**
- `node --check app/views/project-detail.js` exits 0.
- Task 1: `recordRetentionRelease` present, `window.recordRetentionRelease =` registered, `delete window.recordRetentionRelease` in destroy(), `role === 'finance'` gate present, Plan-03 placeholder comment removed.
- Task 2: all 6 DLP field names present in firestore.rules; `hasRole(['finance'])` release branch present; brace count balanced (69/69).
- Button call site: `renderDlpFinanceBar(currentProject)` (project-detail.js:702) → `project.id === currentProject.id`, so the button's `projectId` satisfies the `recordRetentionRelease` identity guard.

## Checkpoints Reached (both blocking, PENDING)

1. **human-action — dev rules deploy:** run `firebase deploy --only firestore:rules` (dev project; CLI active project is PROD → use `--project dev` per project memory). Prod deploy deferred to the standing v3.3→main merge debt. Resume signal: "deployed".
2. **human-verify — Finance release UAT:** Finance user sees Record Release on in-dlp/expired → click flips bar green/Released without reload; non-Finance sees no button and is rules-rejected if forced; Firestore shows `retention_released_at` set. Resume signal: "approved".

## Deviations from Plan

- None functional. The plan suggested audit detail string `'retention_released_at set'`; used `'retention_released_at: ' + now` to match the neighboring lifecycle audit entries (lcMarkProjectComplete etc.). No behavioral difference.

## Threat Flags

Mitigations implemented per the plan threat model:
- **T-102-01 (EoP on retention_released_at):** dedicated Finance-only rules branch (`affectedKeys().hasOnly([retention_released_at, updated_at])`) + code-side `role === 'finance'` guard.
- **T-102-02 (Tampering — DLP writes by unassigned users):** DLP keys added only to the *assigned* operations_user branch; admins/finance covered by branch 1.
- **T-102-03 (Repudiation):** `addProjectAuditEntry('RETENTION_RELEASED')` + system `_addActivityEntry` on every release.

Note: the rules change is **not effective until deployed** (checkpoint 1). Until then the Finance write would be blocked by the un-updated dev rules.

## Self-Check: PASSED (code) / PENDING (checkpoints)

- [x] `app/views/project-detail.js` + `firestore.rules` modified — commits 91bc8c6 + e2510dc
- [x] `node --check` PASS; rules braces balanced
- [x] recordRetentionRelease Finance-gated, registered in init() + deleted in destroy()
- [x] Record Release button in in-dlp + expired strips, Finance-only; Plan-03 placeholder gone
- [x] firestore.rules: ops DLP allow-list extended + Finance release branch added
- [ ] Dev rules deploy (human-action checkpoint)
- [ ] Finance release browser UAT (human-verify checkpoint)
