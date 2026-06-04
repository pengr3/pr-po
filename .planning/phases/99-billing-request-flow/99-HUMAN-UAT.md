---
status: partial
phase: 99-billing-request-flow
source: [99-VERIFICATION.md]
started: 2026-06-04T15:55:00Z
updated: 2026-06-04T15:55:00Z
---

## Current Test

[awaiting human testing — deploy rules to dev FIRST: `firebase deploy --only firestore:rules --project dev`]

## Tests

### 1. Submit a billing request (BILL-01)
expected: As operations_user on a project that HAS collection_tranches + a positive contract_cost, the "↑ Initiate Billing →" footer link appears at the bottom of the Collectibles group on Project Detail. Clicking it opens the modal (tranche picker → 3 type pills → doc-link field(s) → notes → Submit). Filling the required link(s) and submitting creates a `billing_requests` doc, shows a success toast, and the modal closes.
result: [pending]

### 2. Doc-requirement enforcement + auto-hint (BILL-02)
expected: Picking a tranche whose label contains "completion"/"final" auto-selects the Completion pill (2 fields: COC + Completion Report); "progress" auto-selects Progress (1 field). The hint is overrideable by clicking another pill. Submit stays DISABLED until every required URL field for the chosen type is non-empty (Progress=1, Completion=2, Other=1). Edge: opening the link on a project with no tranches or contract_cost ≤ 0 shows a toast and does NOT open a broken modal.
result: [pending]

### 3. Pending Billing Requests banner (BILL-03)
expected: As Finance, the Collectibles tab shows a collapsible blue "Pending Billing Requests" banner ABOVE the Collectibles table when ≥1 request is pending; it disappears when the queue is empty. Each row shows project, tranche (label + %) · amount, submitter name + date, and the doc link(s) opening in a new tab. The chevron collapses/expands the body.
result: [pending]

### 4. Approve → pre-filled Create-Collectible (BILL-04)
expected: As Finance, clicking Approve opens Create-Collectible with Department=Projects, the project, AND the requested tranche pre-selected; Finance still sets Due Date and clicks Create Collectible. The request is marked approved (row leaves the banner; the project-side own-requests list flips to "approved"). Edge (D-11): if the requested tranche already has a collectible, an inline red hint appears ("This tranche already has a collectible — it can't be re-billed…") instead of a silent empty selection.
result: [pending]

### 5. Reject with required reason (BILL-05)
expected: As Finance, clicking Reject prompts for a reason; an empty reason is blocked (toast, no write). With a reason, the request is marked rejected (row leaves the banner) and the reason is visible on the project-side own-requests list ("rejected" + "Reason: …").
result: [pending]

### 6. Notifications + Security Rules (BILL-06 / D-17 / T-99-04)
expected: After deploying the `billing_requests` rules to dev: submitting reaches Finance via a SUBMITTED notification (action-required, routes to #/finance/collectibles) OR is silently skipped without breaking the submit (T-99-04 — confirm in DevTools console: no unhandled error, addDoc still committed). Approve/Reject send the submitter a DECIDED notification. operations_user can create but CANNOT approve/reject (server-side rule).
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
