---
status: partial
phase: 104-service-detail-parity
source: [104-VERIFICATION.md]
started: 2026-06-13
updated: 2026-06-13
---

## Current Test

[awaiting human testing — run on clmc-procurement-dev AFTER the DEV rules deploy]

## Prerequisite (blocking)

**Deploy the Phase 104 rules to DEV before any test below:**
`firebase deploy --only firestore:rules --project dev`
(CLI active project is PROD — the `--project dev` flag is MANDATORY. Reply "deployed" or paste any compile error.)

## Tests

### 1. Lifecycle accordion replaces the status dropdown (D-01/D-02)
expected: On a service detail page, a "Project Lifecycle" accordion appears above the cards (8-stage track + current-stage badge). Card 3 "Status & Assignment" shows a read-only status pill (NO editable status dropdown). Works for both one-time and recurring services.
result: [pending]

### 2. Lifecycle gates advance status + stamp the clock (D-04/D-06)
expected: As services_admin (or assigned services_user), attach the required doc at a gate and Advance — status moves to the next stage, the accordion + pill update live, and the gate button is disabled until the doc is attached. The Completion gate (Mark as Completed) is enabled ONLY for services_admin/super_admin (an assigned services_user sees it blocked).
result: [pending]

### 3. Gate writes audit + activity + last_activity_at (D-12/D-14)
expected: After advancing a gate, the Activity Feed shows a system entry (e.g. "Status advanced to For Proposal by …"). No console errors. (A non-team poster's denied parent-doc write must never block the gate or its entries.)
result: [pending]

### 4. Completion gate DLP capture only with a retention tranche (D-07)
expected: On an On-going service WITH a retention tranche, the Completion gate shows the DLP fieldset (Retention % / DLP Months / DLP Start). Marking Completed captures DLP fields. On a service WITHOUT a retention tranche, the DLP fieldset is absent and completion writes no DLP fields.
result: [pending]

### 5. Draft-status service renders cleanly (D-05)
expected: A Draft service detail page renders without errors; the lifecycle accordion shows no "current" node and defers to the proposal/Draft funnel card below. No crash.
result: [pending]

### 6. Activity Journal panel — visibility gate (D-10/D-11)
expected: The 3-tab Journal panel (Activity Feed · Progress Updates · Issues) is HIDDEN before For Mobilization and for Loss; VISIBLE + writeable at For Mobilization / On-going; READ-ONLY at Completed.
result: [pending]

### 7. Journal writes — post / progress / issue (D-10/D-12)
expected: Posting an activity note, submitting a progress update (% + summary), and logging an issue each persist and appear live. Resolving an issue requires a resolution note and posts a "resolved" system Feed entry; re-opening posts a system entry. A contract/budget edit posts a cost-change system Feed entry (D-12).
result: [pending]

### 8. DLP finance bar — 4 states (D-07/D-08)
expected: A Completed service with a retention tranche shows the DLP finance bar in the correct state: amber "In Defect Liability Period" (in-dlp), red "DLP expired — overdue" (past expiry), green "Retention released" (after release / fully collected). A non-completed service shows the plain utilization bar.
result: [pending]

### 9. Inline tranche editor + Ret? toggle (D-07)
expected: "⚙ Edit Tranches" opens the inline editor (admin/assigned only). Add/label/percentage rows, flag exactly one as Retention via the Ret? toggle, total must equal 100% and all labels required to Save. Saving writes collection_tranches to the service and the display + lifecycle rows refresh.
result: [pending]

### 10. Finance-only Record Release (D-15)
expected: On a Completed in-DLP/expired service, only a Finance user sees the "Record Release" button. Clicking it (confirm) writes retention_released_at and flips the bar to green/Released live. A non-Finance user has no button and is rules-rejected if attempted.
result: [pending]

### 11. PO-Delivered posts to the owning service journal (D-12)
expected: Mark a non-subcon PO (whose MRF carries a service_code) as Delivered → a "PO … marked Delivered" system entry appears in that service's Activity Feed (joined via service_code). The PO status update is never blocked even if the journal write fails.
result: [pending]

### 12. One-time On-going quiet signal; recurring stays quiet (D-13)
expected: On the Services portfolio, a one-time On-going service with no recent journal activity shows 🟠 "Quiet for N days" (>7d) then 🔴 "No activity in N days" (>14d), reading last_activity_at. A recurring On-going service stays On Track (suppressed) regardless of inactivity.
result: [pending]

## Summary

total: 12
passed: 0
issues: 0
pending: 12
skipped: 0
blocked: 0

## Gaps
