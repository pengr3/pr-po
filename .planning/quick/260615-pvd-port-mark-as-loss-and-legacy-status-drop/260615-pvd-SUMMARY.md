---
phase: quick-260615-pvd
plan: 01
subsystem: service-detail
tags: [services-parity, mark-as-loss, legacy-status-dropdown, lifecycle]
dependency_graph:
  requires: [proposals._applyProposalStateTransition, saveServiceField, updateServiceLifecycleBadge]
  provides: [openServiceLossModal, submitServiceLoss, hdrServiceStatusSelect]
  affects: [app/views/service-detail.js]
tech_stack:
  added: []
  patterns: [dual-path-loss-writer, legacy-status-IIFE, select-aware-badge-updater]
key_files:
  created: []
  modified:
    - app/views/service-detail.js
decisions:
  - "Mirrored project-detail.js behavior 1:1 (rename map applied); no architectural changes"
  - "No firestore.rules edit required — services_user update rule is unmasked; proposals BRANCH-2 mask already permits loss_reason"
metrics:
  duration: ~25 minutes
  completed: 2026-06-15
---

# Quick 260615-pvd: Port Mark as Loss and Legacy Status Dropdown to service-detail.js

Ported two already-shipped project-detail.js features to service-detail.js for services behavioral parity: a legacy-only header status dropdown (FEATURE A) and a stage-agnostic Mark-as-Loss dual-path writer (FEATURE B).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | FEATURE A — legacy-only header status dropdown + select-aware badge updater | b6f4059 | app/views/service-detail.js |
| 2 | FEATURE B — stage-agnostic Mark as Loss button + dual-path writer | 9ba7906 | app/views/service-detail.js |

## What Was Built

### FEATURE A — Legacy-only Status Dropdown

Replaced the static `#hdrServiceStatusBadge` span in the service detail header with an IIFE that:
- Checks `const _isLegacy = _curStatus && !UNIFIED_STATUS_OPTIONS.includes(_curStatus);`
- When `showEditControls && _isLegacy`: renders `<select id="hdrServiceStatusSelect">` with the legacy status as a pre-selected option followed by all 10 canonical statuses; onchange calls `window.saveServiceField('project_status', this.value)` — carrying all side-effects (status_changed_at stamp, NOTIF-11) for free
- Otherwise: renders the original `<span id="hdrServiceStatusBadge">` read-only pill

`updateServiceLifecycleBadge()` is now select-aware: if `#hdrServiceStatusSelect` exists it sets `.value = status` and returns; otherwise falls back to the `#hdrServiceStatusBadge` span update. This prevents live onSnapshot re-renders from clobbering the dropdown while it is open.

### FEATURE B — Stage-agnostic Mark as Loss

Added to `renderServiceLifecycleCard()`:
- canDrive computation (same adminRoles/assignedRoles/personnel shape as loadProposalCard)
- `showLossBtn = !['Loss','Completed'].includes(status) && canDrive`
- lc-footer div with "Mark as Loss" danger button (only rendered when showLossBtn)

Registered two new window functions in `attachWindowFunctions()`:

**`window.openServiceLossModal(serviceId)`**: defense-in-depth gate re-check, removes any stale `#serviceLossModal`, injects the reason-capture modal with `#serviceLossReason` textarea and `#serviceLossReasonError` error div.

**`window.submitServiceLoss(serviceId)`**: defense-in-depth gate re-check, 10-char reason validation, then:
- PATH A (open proposal found via `proposals where project_id == serviceId`, status not client_approved/loss): `_applyProposalStateTransition({newStatus:'loss', newProjectStatus:'Loss', ...})` + parity `updateDoc` writing `loss_reason` to services doc + `loadProposalCard` refresh
- PATH B (no open proposal): single `updateDoc` to services doc (`project_status:'Loss'`, `loss_reason`, `status_changed_at`, `updated_at`) + fire-and-forget `recordEditHistory(...,'services')` + NOTIF-11 to assigned personnel
- Both paths: fire-and-forget `addServiceAuditEntry` + `_addServiceActivityEntry`

Teardown in `destroy()`: `delete window.openServiceLossModal`, `delete window.submitServiceLoss`, `document.getElementById('serviceLossModal')?.remove()`.

## Verification

- `node --check app/views/service-detail.js` — passes on both task commits
- `grep -c "hdrServiceStatusSelect"` — returns 2 (IIFE render + badge updater lookup)
- `grep -c "window.openServiceLossModal"` — returns 3 (register + modal confirm href + delete)
- `grep -c "window.submitServiceLoss"` — returns 3 (register + modal confirm call + delete)
- `grep -c "_applyProposalStateTransition"` — returns 6 (import + existing uses + new PATH A call)
- `git diff --name-only` confirms only `app/views/service-detail.js` changed; `firestore.rules` untouched

## Deviations from Plan

None — plan executed exactly as written. The rename map was applied without deviation.

## Known Stubs

None — both features are fully wired to existing service-domain helpers.

## Self-Check: PASSED

- b6f4059 exists in git log (Task 1 commit)
- 9ba7906 exists in git log (Task 2 commit)
- `app/views/service-detail.js` modified in both commits
- `firestore.rules` not touched
