---
status: partial
phase: 98-ui-fixes-client-contact-notifications-payables-home
source: [98-01-SUMMARY.md, 98-02-SUMMARY.md, 98-03-SUMMARY.md, 98-04-SUMMARY.md]
started: 2026-06-03T07:28:33Z
updated: 2026-06-03T07:45:00Z
---

## Current Test

[testing paused — 2 items outstanding: Test 4 (needs user to localize the misalignment), Test 6 (fix applied — needs re-test)]

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
result: issue
reported: "the action and the Details is not MIDDLE Aligned (see screenshot)"
severity: cosmetic

### 5. Notifications — bell dropdown unchanged + unread styling
expected: Bell dropdown visually unchanged; unread rows keep left blue border + bold.
result: pass

### 6. Finance Payables — PO Ref opens (the reported bug)
expected: PO Ref opens correct PO modal, no "Failed to load PO details".
result: issue
reported: "error - finance.js:2937 viewPODetailsFromRFP error: FirebaseError: Invalid document reference. Document references must have an even number of segments, but pos has 1. (Payables)"
severity: blocker

### 7. Finance Payables — TR link + unlinked + direct nav
expected: TR-linked Ref opens a TR modal; unlinked shows plain "-"; works on direct #/finance nav.
result: skipped
reason: "User had no TR-linked row to test ('what is this?'). All visible Payables rows are PO-linked. TR path is fixed by the same Test-6 commit (resolve by tr_id query) but cannot be exercised without a transport-request row in the data."

## Summary

total: 8
passed: 5
issues: 2
pending: 0
skipped: 1
blocked: 0

## Gaps

- truth: "Clicking a PO Ref in Finance Payables opens the correct PO detail modal without 'Failed to load PO details'"
  status: fixed_pending_retest
  reason: "User reported: FirebaseError 'pos has 1 segment' — empty doc id passed to getDoc(doc(db,'pos',''))"
  severity: blocker
  test: 6
  root_cause: "RFP docs store an empty po_doc_id on some creation paths (procurement.js:1720). The plan threaded that field, so the Ref onclick passed '' to viewPODetailsFromRFP -> doc(db,'pos','') -> 1-segment FirebaseError."
  artifacts:
    - path: "app/views/finance.js"
      issue: "Ref call sites passed the unreliable rfp.po_doc_id/po.po_doc_id; loader fetched by that empty id"
  missing:
    - "Resolve PO doc id from the live pos collection by po_id (posDocIdMap) with a where('po_id','==') query fallback; call sites pass the human-readable po_id; TR side resolves by where('tr_id','==')."
  fix_commit: "9960d99"
  debug_session: ""

- truth: "Notification history rows are vertically centered — the type-label, message, time, and ✓ action share a common middle alignment"
  status: fixed_pending_retest
  reason: "User reported: 'the action and the Details is not MIDDLE Aligned' (screenshot). The row container WAS center-aligned, but the ✓ action button rendered over-sized."
  severity: cosmetic
  test: 4
  root_cause: "The renderRows() markup rewrite (commit dafac92) dropped the ✓ button's inline font-size:0.75rem, and the .notif-row-mark-read CSS rule had no font-size — so ✓ inherited ~1rem and rendered larger than the surrounding 0.75rem text, looking vertically misaligned next to the message/time."
  artifacts:
    - path: "styles/components.css"
      issue: ".notif-row-mark-read missing font-size after inline style was removed"
  missing:
    - "Add font-size:0.75rem + line-height:1 to .notif-row-mark-read (history-only class; dropdown uses .notif-row-read-btn)"
  fix_commit: "9d7d845"
  debug_session: ""
