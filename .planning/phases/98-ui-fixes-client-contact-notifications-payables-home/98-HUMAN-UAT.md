---
status: partial
phase: 98-ui-fixes-client-contact-notifications-payables-home
source: [98-VERIFICATION.md]
started: 2026-06-03T06:50:20Z
updated: 2026-06-03T06:50:20Z
---

## Current Test

[awaiting human testing — serve with `python -m http.server 8000`]

## Tests

### 1. Clients — Phone/Email form + validation (98-01)
expected: On `#/clients` → Add Client, the form shows two inputs **Phone** and **Email** (no "Contact Details"). Submit with both blank → blocked toast "Provide at least one of Phone or Email". Submit phone-only → saves. Submit Email="abc" → blocked "Email is not a valid address". Submit Email="a@b.com" → saves.
result: [pending]

### 2. Clients — list + legacy fallback (98-01)
expected: List table shows separate **Phone** and **Email** columns. A legacy client (only `contact_details` in Firestore) still shows that value in the Phone column with no console error. Editing it inline shows Phone/Email inputs; saving a phone replaces the legacy blob.
result: [pending]

### 3. Clients — detail modal (98-01)
expected: Client detail modal shows separate **Phone** and **Email** rows; for a legacy-only client a **Contact (legacy)** row appears.
result: [pending]

### 4. Notifications — inline alignment (98-02)
expected: On `#/notifications` each row is a single line: icon, uppercase type label, message, then time + ✓ on the right. Message text starts at the **same x-position** on every row regardless of label length. The longest label "REGISTRATION PENDING" is **not clipped** (if clipped, bump `.notif-row-label` flex-basis 160px → 170px). Time + ✓ are flush-right across all rows/types. Compare to `notifications-alignment-screenshot.png`.
result: [pending]

### 5. Notifications — dropdown unchanged + unread (98-02, D-10)
expected: The bell **dropdown** (notification menu) is visually unchanged (3-line `.na-*` anatomy, badge top-aligned as before). Unread history rows still show the left blue border + bold message.
result: [pending]

### 6. Finance Payables — PO Ref fixed (98-03)
expected: On `#/finance` → Payables, click a PO **Ref** link in the PO Payment Summary table → the correct PO detail modal opens with **no** "Failed to load PO details" toast (this previously errored). Repeat in the mobile card view (narrow window) and in the RFP Processing table.
result: [pending]

### 7. Finance Payables — TR link + unlinked + direct nav (98-03)
expected: A TR-linked row's Ref opens a **Transport Request** detail modal (TR ID / MRF Ref / Supplier / Finance Status / Total / items). A truly-unlinked row shows plain `-` (not a link). Navigating directly to `#/finance` (without first visiting MRF Records/Procurement) and clicking a TR Ref still opens the TR modal (proves no `window.viewTRDetails` dependency).
result: [pending]

### 8. Home — 5 tiles fit above the fold (98-04)
expected: On `#/` on a wide monitor (≥1080px-tall viewport, maximized), on load with no scrolling: the hero title, subtitle, AND all 5 tiles (Clients/Projects/Services top row, Procurement/Finance bottom row) are fully visible above the fold; the bottom 2 tiles are **not** clipped; tiles remain legible. Layout is still 3-on-top / 2-on-bottom. Resize <1024px → 2-up reflow; <768px → single column. (If still clipped on a specific display, reduce `.nav-card` padding / `.dept-cards` gap further.)
result: [pending]

## Summary

total: 8
passed: 0
issues: 0
pending: 8
skipped: 0
blocked: 0

## Gaps
