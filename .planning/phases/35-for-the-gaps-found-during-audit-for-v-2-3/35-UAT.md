---
status: complete
phase: 35-for-the-gaps-found-during-audit-for-v-2-3
source: [35-01-SUMMARY.md]
started: 2026-02-20T08:00:00Z
updated: 2026-02-20T08:30:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. Edit History button visible in service detail
expected: Open any service detail page. Card 1 header has an "Edit History" button visible alongside other action buttons.
result: pass

### 2. Edit History modal opens with service entries
expected: Click the Edit History button on a service detail page. A modal opens showing the audit timeline scoped to that service — entries display field changes (e.g., old value → new value) with timestamp and user attribution.
result: issue
reported: "I cannot update anything within services modal as it have numerous errors from the console. saveServiceField fails with permission-denied (services_user cannot updateDoc services), and runAggregationQuery on prs returns 403 Forbidden"
severity: major

### 3. Service edit appears in history after change
expected: Edit any field on a service (e.g., service name or status). After saving, click Edit History — the new entry appears in the timeline showing the field that changed with old and new values.
result: issue
reported: "Blocked by same issues as Test 2 — services_user cannot edit service fields (permission-denied on updateDoc) and expense aggregation fails (403 on prs)"
severity: major

### 4. Project edit history unaffected
expected: Open any project detail page and click its Edit History button. The modal opens and shows that project's edit history correctly — no errors, no missing entries, no regression from the Phase 35 changes.
result: pass

## Summary

total: 4
passed: 2
issues: 2
pending: 0
skipped: 0

## Gaps

- truth: "services_user sees service detail page without edit controls (read-only role)"
  status: failed
  reason: "User reported: saveServiceField fails with permission-denied — services_user is calling updateDoc on services, meaning edit controls are visible and usable for a read-only role. service-detail.js is not hiding inline edit inputs/controls based on canEditTab('services') permission check."
  severity: major
  test: 2
  artifacts: []
  missing: []

- truth: "services_user can view service expense breakdown (refreshServiceExpense shows MRF/PR/PO totals)"
  status: failed
  reason: "User reported: runAggregationQuery on prs returns 403 Forbidden for services_user. refreshServiceExpense in service-detail.js uses getAggregateFromServer on prs filtered by service_code, but Firestore rules do not grant services_user aggregation access to prs collection."
  severity: major
  test: 2
  artifacts: []
  missing: []
