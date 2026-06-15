---
phase: 95-notification-row-redesign
plan: "02"
subsystem: notifications
tags: [notifications, call-sites, data-model, object_name, actor_name]
dependency_graph:
  requires: [95-01]
  provides: [notification-call-sites-object_name, notification-call-sites-actor_name]
  affects:
    - app/proposal-modal.js
    - app/views/finance.js
    - app/views/home.js
    - app/views/mrf-form.js
    - app/views/procurement.js
    - app/views/project-detail.js
    - app/views/register.js
    - app/views/service-detail.js
tech_stack:
  added: []
  patterns: [human-actor-pattern, system-actor-pattern, fire-and-forget-notif]
key_files:
  modified:
    - app/proposal-modal.js
    - app/views/finance.js
    - app/views/home.js
    - app/views/mrf-form.js
    - app/views/procurement.js
    - app/views/project-detail.js
    - app/views/register.js
    - app/views/service-detail.js
decisions:
  - "[Phase 95-02]: All 27 createNotification* call sites across 8 files now pass object_name and actor_name; total confirmed by grep (2+1+1+1+2+2+6+12=27)"
  - "[Phase 95-02]: Human-actor pattern (window.getCurrentUser?.()?.full_name || 'System') applied to 25 of 27 sites; 2 sites use actor_name: 'System' (PO_DELIVERED automated status + REGISTRATION_PENDING self-service)"
  - "[Phase 95-02]: object_name sources: proposal.title, projectOrServiceLabel, email, currentProject.project_name, notifServiceName, rfp.supplier_name, po/tr.supplier_name, poDataFresh.supplier_name, mrfData.project_name, rejectedMrfSnap.project_name, pr.mrf_id, tr.mrf_id, request.mrf_id, targetName"
  - "[Phase 95-02]: finance.js PR_DECIDED/TR_DECIDED use mrf_id as object_name fallback — the MRF project name is not on PR/TR docs; this is the best available name context per plan spec"
metrics:
  duration: "~20 min"
  completed: "2026-05-26"
  tasks: 3
  files: 8
---

# Phase 95 Plan 02: Notification Row Redesign — Call Site Upgrade Summary

**One-liner:** Extended all 27 createNotification* call sites across 8 files to supply object_name (human-readable document label) and actor_name (user display name or 'System') for the 3-line anatomy renderer built in Plan 95-01.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update proposal-modal.js, home.js, mrf-form.js, register.js (5 call sites) | 5360641 | app/proposal-modal.js, app/views/home.js, app/views/mrf-form.js, app/views/register.js |
| 2 | Update project-detail.js and service-detail.js (4 call sites) | f4bddd9 | app/views/project-detail.js, app/views/service-detail.js |
| 3 | Update finance.js (6 call sites) and procurement.js (12 call sites) | ac4176b | app/views/finance.js, app/views/procurement.js |

## What Was Built

**Task 1 — 5 call sites in 4 files:**
- `proposal-modal.js` PROPOSAL_SUBMITTED: `object_name: proposal.title`, `actor_name: actorName` (already computed variable at line 988)
- `proposal-modal.js` PROPOSAL_DECIDED: `object_name: proposal.title`, `actor_name: getCurrentUser` pattern
- `home.js` PROPOSAL_DECIDED (queue handler): `object_name: proposal.title`, `actor_name: getCurrentUser` pattern
- `mrf-form.js` MRF_SUBMITTED: `object_name: projectOrServiceLabel` (already computed), `actor_name: getCurrentUser` pattern
- `register.js` REGISTRATION_PENDING: `object_name: email || ''`, `actor_name: 'System'` (self-service event — no named approver yet)

**Task 2 — 4 call sites in 2 files (.catch() pattern preserved):**
- `project-detail.js` PROJECT_STATUS_CHANGED: `object_name: currentProject.project_name || ''`, human actor
- `project-detail.js` PROJECT_COST_CHANGED: `object_name: currentProject.project_name || ''`, human actor
- `service-detail.js` PROJECT_STATUS_CHANGED: `object_name: notifServiceName || ''`, human actor
- `service-detail.js` PROJECT_COST_CHANGED: `object_name: notifServiceName || ''`, human actor

**Task 3 — 18 call sites in 2 files:**

finance.js (6 sites):
- RFP_PAID: `object_name: rfp.supplier_name || ''`
- COLLECTIBLE_CREATED: `object_name: targetName || ''` (project or service name computed at line 1814)
- PR_DECIDED approve: `object_name: pr.mrf_id || ''` (best available — MRF project name not on PR doc)
- TR_DECIDED approve: `object_name: tr.mrf_id || ''`
- TR_DECIDED reject: `object_name: request.mrf_id || ''`
- PR_DECIDED reject: `object_name: request.mrf_id || ''`

procurement.js (12 sites):
- submitRFP RFP_REVIEW_NEEDED: `object_name: po.supplier_name || ''`
- submitTRRFP RFP_REVIEW_NEEDED: `object_name: tr.supplier_name || ''`
- submitDeliveryFeeRFP RFP_REVIEW_NEEDED: `object_name: po.supplier_name || ''`
- inline MRF MRF_SUBMITTED: `object_name: projectOrServiceLabel`
- rejectMRF MRF_REJECTED: `object_name: rejectedMrfSnap.project_name || ''`
- submitTransportRequest TR_REVIEW_NEEDED: `object_name: mrfData.project_name || ''`
- generatePR MRF_APPROVED: `object_name: mrfData.project_name || ''`
- generatePR PR_REVIEW_NEEDED: `object_name: mrfData.project_name || ''`
- generatePRandTR MRF_APPROVED: `object_name: mrfData.project_name || ''`
- generatePRandTR PR_REVIEW_NEEDED: `object_name: mrfData.project_name || ''`
- generatePRandTR TR_REVIEW_NEEDED: `object_name: mrfData.project_name || ''`
- PO_DELIVERED: `object_name: poDataFresh.supplier_name || ''`, `actor_name: 'System'` (automated status change)

## Deviations from Plan

None. Plan executed exactly as specified. All 27 call sites confirmed by grep count (2+1+1+1+2+2+6+12=27). No try/catch structures, variable assignments, or Firestore writes changed beyond the notification argument objects.

## Known Stubs

None. All 27 call sites now write object_name and actor_name to Firestore. The 3-line anatomy renderer (Plan 95-01) will display these fields immediately for any notification created after this plan is deployed. Pre-existing notifications (without these fields) will still render via the fallback chains in Plan 95-01 (n.object_name || n.message for Line 2; Line 3 omitted when actor_name absent or 'System').

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced. The two fields written to Firestore (object_name, actor_name) are display-only data covered by the existing threat model dispositions:
- T-95-02-01 (actor_name stores full_name): accepted — non-sensitive display data, notification docs already user-scoped
- T-95-02-02 (object_name from Firestore fields): accepted — escapeHTML at render time (Plan 95-01 Task 2) is the mitigation; no new injection surface

## Self-Check: PASSED

- app/proposal-modal.js: FOUND (2 object_name occurrences)
- app/views/home.js: FOUND (1 object_name occurrence)
- app/views/mrf-form.js: FOUND (1 object_name occurrence)
- app/views/register.js: FOUND (1 object_name occurrence)
- app/views/project-detail.js: FOUND (2 object_name occurrences)
- app/views/service-detail.js: FOUND (2 object_name occurrences)
- app/views/finance.js: FOUND (6 object_name occurrences)
- app/views/procurement.js: FOUND (12 object_name occurrences)
- Total: 27 call sites confirmed
- Commit 5360641 (Task 1): FOUND
- Commit f4bddd9 (Task 2): FOUND
- Commit ac4176b (Task 3): FOUND
