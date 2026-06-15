---
status: complete
phase: 98-ui-fixes-client-contact-notifications-payables-home
source: [98-01-SUMMARY.md, 98-02-SUMMARY.md, 98-03-SUMMARY.md, 98-04-SUMMARY.md]
started: 2026-06-03T07:28:33Z
updated: 2026-06-03T08:05:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Clients — Phone/Email form + validation
expected: Two Phone+Email inputs, at-least-one + email-format validation, saves correctly.
result: pass

### 2. Clients — list columns + legacy fallback
expected: Separate Phone/Email columns; legacy contact_details fallback; inline edit works.
result: pass

### 3. Clients — detail modal
expected: Phone + Email rows; "Contact (legacy)" row for legacy-only clients.
result: pass

### 4. Notifications — inline row alignment
expected: One-line rows; constant message-start-x; label not clipped; time + ✓ right; vertically centered.
result: pass
note: Failed round 1 (oversized ✓), fixed in 9d7d845, re-tested pass.

### 5. Notifications — bell dropdown unchanged + unread styling
expected: Bell dropdown visually unchanged; unread rows keep left blue border + bold.
result: pass

### 6. Finance Payables — PO Ref opens (the reported bug)
expected: PO Ref opens correct PO modal, no "Failed to load PO details".
result: pass
note: Failed round 1 (FirebaseError, empty PO doc id), fixed in 9960d99, re-tested pass.

### 7. Finance Payables — TR link + unlinked + direct nav
expected: TR-linked Ref opens a TR modal; unlinked shows plain "-"; works on direct #/finance nav.
result: skipped
reason: "No TR-linked row in the current data (all Payables rows are PO-linked). TR path got the same doc-id-resolution fix (resolve by tr_id query) but cannot be exercised without a transport-request row. Recommended re-check if/when a TR appears."

## Summary

total: 8
passed: 7
issues: 0
pending: 0
skipped: 1
blocked: 0

## Gaps

- truth: "Clicking a PO Ref in Finance Payables opens the correct PO detail modal without 'Failed to load PO details'"
  status: resolved
  reason: "User reported FirebaseError 'pos has 1 segment' (empty PO doc id). Fixed and re-tested pass."
  severity: blocker
  test: 6
  root_cause: "RFP docs store an empty po_doc_id on some creation paths (procurement.js:1720); the Ref onclick passed '' to viewPODetailsFromRFP -> doc(db,'pos','') -> 1-segment FirebaseError."
  artifacts:
    - path: "app/views/finance.js"
      issue: "Ref call sites passed the unreliable/empty *_doc_id; loader fetched by that empty id"
  missing: []
  fix_commit: "9960d99"
  debug_session: ""

- truth: "Notification history rows are vertically centered — type-label, message, time, and ✓ action share a common middle alignment"
  status: resolved
  reason: "User reported the ✓ action looked off-middle. Caused by an oversized ✓ (dropped inline font-size). Fixed and re-tested pass."
  severity: cosmetic
  test: 4
  root_cause: "renderRows() rewrite dropped the ✓ button's inline font-size:0.75rem; .notif-row-mark-read had no font-size, so ✓ inherited ~1rem and rendered oversized."
  artifacts:
    - path: "styles/components.css"
      issue: ".notif-row-mark-read missing font-size after inline style removed"
  missing: []
  fix_commit: "9d7d845"
  debug_session: ""
