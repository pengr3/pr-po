---
status: human_needed
phase: 99-billing-request-flow
verified: 2026-06-04
plans_verified: [99-01, 99-02, 99-03]
requirements: [BILL-01, BILL-02, BILL-03, BILL-04, BILL-05, BILL-06]
must_haves_total: 6
must_haves_code_verified: 6
human_verification_count: 6
---

# Phase 99: Billing Request Flow — Verification

**Verdict: `human_needed`.** All code-level and automated checks pass (node --check on all 3
modified JS modules, firestore.rules brace-balance + block shape, cross-plan contract, and every
task's acceptance criteria). This is a zero-build static SPA with **no automated UI/integration
test harness** — the 6 success criteria describe runtime browser behavior that can only be
confirmed TRUE by a human exercising the flow in a browser, **after the new Security Rules are
deployed** (`firebase deploy --only firestore:rules --project dev`, then prod). Same posture as
Phase 91.3 / Phase 98.

## Goal

Let a project-assigned user (operations_user, lacking collectible write authority) submit a billing
request with supporting docs from Project Detail; Finance reviews it inline in the Collectibles tab
and approves (pre-fills Create-Collectible) or rejects (with a reason) — Finance stays in control of
actual billing while the manual hand-off is removed.

## Goal-Backward: Success Criteria → Evidence

| # (Req) | Success Criterion | Code Evidence | Automated | Browser-UAT |
|---------|-------------------|---------------|-----------|-------------|
| 1 (BILL-01) | Footer link → modal (tranche → auto-hinted pills → doc links → notes → submit) → creates `billing_requests` doc | 99-02: footer link (unconditional) `52483ad`; modal `2fc481b`; `submitBillingRequest` addDoc frozen D-04 `9efc6f5` | ✓ PASS | ⏳ pending |
| 2 (BILL-02) | Doc requirements enforced (progress=1; completion=COC+CR=2; other=1) | 99-02: `BILLING_DOCS` map + `_validateBillingForm` Submit-gate + defensive re-check `2fc481b`/`9efc6f5` | ✓ PASS | ⏳ pending |
| 3 (BILL-03) | Collapsible blue "Pending Billing Requests" banner above Collectibles; auto-appear/disappear; rows show project/tranche/amount/docs/submitter+date | 99-03: `renderPendingBillingBanner` + pending listener `2fe9bea` | ✓ PASS | ⏳ pending |
| 4 (BILL-04) | Approve opens `openCreateCollectibleModal('projects:CODE:TRANCHE_INDEX')` (tranche pre-filled, 3-seg key), Finance still sets due date+submits, request marked approved both sides | 99-03: 3-segment parser + tranche preselect + D-11 edge + `approveBillingRequest` `1a9800d`; project-side own-list reflects 'approved' `52483ad` | ✓ PASS | ⏳ pending |
| 5 (BILL-05) | Reject requires reason; marked rejected; reason visible both sides | 99-03: `rejectBillingRequest` required reason + `rejection_reason` write `9d54e17`; project-side `renderOwnBillingRequests` shows reason `52483ad` | ✓ PASS | ⏳ pending |
| 6 (BILL-06) | Security Rules allow project users to create + Finance read/update; rules added BEFORE code | 99-01: `match /billing_requests/{id}` (create=isActiveUser, update/delete=finance) committed Wave 1 before Wave 2 writes `0064849` | ✓ PASS (rules text) | ⏳ deploy + emulator |

**Requirement traceability:** BILL-01..BILL-06 are phase-local IDs (ROADMAP §Phase 99 — "map 1:1 to the 6 Success Criteria"); they are NOT tracked in REQUIREMENTS.md, so no REQUIREMENTS.md update is required. All 6 are accounted for by the 3 plans' frontmatter (`99-01: [BILL-06]`, `99-02: [BILL-01,02,05]`, `99-03: [BILL-03,04,05]`).

## Automated Checks (all PASS)

- `node --check` on `app/notifications.js`, `app/views/project-detail.js`, `app/views/finance.js` — all exit 0.
- `firestore.rules` brace balance 61/61; `billing_requests` block shape valid (create=isActiveUser, update/delete=hasRole(finance set)).
- Cross-plan contract intact: notification enum/TYPE_META defined in 01 and consumed in 02/03; 02 writes `status:'pending'` + `project_code` and 03 queries the same lowercase-exact values; 02 writes `requested_by_uid` and 03 notifies it; 03 builds the 3-segment key the same parser consumes; rules collection name matches the JS collection.
- All per-task `<acceptance_criteria>` verified during execution.

## Honored Decisions (CONTEXT D-01..D-21)

- D-01 Option-C footer link only (no per-tranche rows). D-05/D-21 lowercase-exact statuses. D-06 advisory amount = `(pct/100)*contract_cost` frozen. D-08 doc-requirements-by-type. D-09 URL/link only. D-10/D-11 3-segment preselectKey + disabled-tranche hint. D-12 approve ≠ auto-create. D-13 reject reason required. D-14 collapsible auto-appear/disappear banner. D-16 rules-first (Wave 1). D-17 fire-and-forget notifications. D-18 window attach/delete. D-19 escapeHTML + `rel="noopener noreferrer"`. D-20 listener teardown.

## Human Verification Required (→ 99-HUMAN-UAT.md)

The flow needs a browser pass **after deploying the rules to dev** (`firebase deploy --only firestore:rules --project dev`). See `99-HUMAN-UAT.md` for the 6 items. Notable thing to confirm (T-99-04): an operations_user firing the SUBMITTED Finance fan-out queries `users` — confirm it reaches Finance OR is silently skipped without breaking the submit.

## Threats (carried from plan threat models)

T-99-01/05/09 (advisory amount) — accepted: `submitCollectible()` re-derives the authoritative amount at approval. T-99-02/08 (privilege) — mitigated server-side by the rules `update` gate. T-99-06/07 (XSS) — mitigated via `escapeHTML` + safe doc anchors. T-99-04 (notify fan-out by operations_user) — flagged for UAT (non-fatal).

## Conclusion

Implementation is complete and internally consistent across all 3 plans. Phase is **NOT** marked
complete until the 6 browser-UAT items pass (post rules-deploy). Recommended: deploy rules to dev →
run `99-HUMAN-UAT.md` → if all pass, mark phase complete; if any fail → `/gsd-plan-phase 99 --gaps`.
