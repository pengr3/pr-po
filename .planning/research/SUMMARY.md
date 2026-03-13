# Project Research Summary

**Project:** CLMC Procurement System v3.2 — Supplier Search, Proof of Procurement & Payables Tracking
**Domain:** Zero-build static SPA — vanilla JS + Firebase Firestore, internal procurement management
**Researched:** 2026-03-13
**Confidence:** HIGH

## Executive Summary

This milestone adds three distinct capabilities to an existing zero-build SPA: a supplier search bar, a proof-of-procurement document link on POs, and a new Request for Payment (RFP) / payables tracking system bridging procurement delivery to Finance payment. All three features extend an established codebase and follow patterns already in use — no new framework, no new build tooling, and no Firebase products beyond Firestore are required. The supplier search and proof link features are small field-level additions; the RFP/payables system is a new subsystem that warrants its own Firestore collection, Security Rules block, and Finance tab.

The recommended approach is to ship in dependency order: supplier search first (pure client-side display logic, zero Firestore changes), proof-of-procurement link second (optional string field on `pos` documents, no new collection), and RFP + payables last (new `rfps` collection, Security Rules, Finance tab). The single most important architectural decision is already resolved by research: do not embed RFP/payment data on PO documents. A dedicated `rfps` collection is mandatory for partial payment tracking, Finance filtering, and audit trail. The proof link uses paste-a-URL rather than Google Drive Picker API — a decision that eliminates OAuth complexity, CSP changes, and Google Cloud Console setup for a feature whose functional value is identical either way.

The primary risk across all three features is the well-documented Firestore Security Rules deployment order: the `rfps` collection rules must be deployed before any UI code reads or writes the collection, or Finance and Procurement roles will receive silent permission denials. A secondary risk is the supplier search pagination interaction — filtering must operate on the full in-memory array, not the already-paginated page slice. Both risks have clear, low-cost mitigations documented in the research.

## Key Findings

### Recommended Stack

The core stack is entirely unchanged: vanilla JavaScript ES6 modules, Firebase Firestore v10.7.1 (CDN), no build step. Two of three features require zero stack additions. Only if a future decision reverses the paste-a-link approach for proof documents would any new library (Google API Client + GIS) be needed — and that is explicitly deferred to v4.0+ pending user feedback on the simpler approach.

**Core technologies:**
- Vanilla JavaScript ES6 Modules: SPA logic, view lifecycle — no framework overhead, matches existing codebase
- Firebase Firestore v10.7.1 (CDN): `rfps` new collection + `proof_url` field on `pos` — zero schema migration, schemaless
- `Date.setUTCDate()` for payment due date arithmetic — 4 lines, no date library required
- `Array.prototype.filter()` + `String.prototype.includes()` for supplier search — 3 lines, no library

**Not added (confirmed decisions):**
- Firebase Storage: user explicitly rejected; Google Drive share links cover the use case at zero cost
- `date-fns` / `dayjs`: payment term arithmetic is not complex enough to justify a dependency
- Google Drive Picker API / OAuth: over-engineered for paste-a-link workflow; deferred to v4.0+
- Netlify Functions / backend: not required; no server-side processing needed

See `.planning/research/STACK.md` for full rationale and alternatives considered.

### Expected Features

**Must have (table stakes — launch with v3.2):**
- Supplier search by name and contact person — any list with 15+ entries requires a search box; filter operates on the already-loaded `suppliersData[]` array in memory
- Proof-of-procurement link on PO — auditors and Finance need a reference document; `proof_url` string field on `pos` document, paste-a-link UX
- RFP creation (Procurement) — formal request to Finance to process payment after PO delivery; linked to `po_id` in new `rfps` collection
- Finance payables list — open RFPs with balance, due date, and status badge; default filter excludes fully paid
- Record payment / partial tracking — Finance enters amount, date, method, reference; system derives `payment_status` automatically from running total vs. amount requested
- Payment due date display — client-side `Date` arithmetic from invoice date + payment terms, no Firestore query

**Should have (add once v3.2 core is stable):**
- Overdue badge — color-coded indicator when `due_date < today` and not fully paid; pure client-side date comparison
- RFP event on procurement timeline — extend existing `showTimeline()` modal
- CSV export of payables — use existing `downloadCSV()` utility

**Defer (v4.0+):**
- Google Drive Picker API — only if paste-a-link proves too friction-heavy in practice
- Payables dashboard scoreboard — total outstanding across all open RFPs
- Per-supplier payables aggregation
- RFP approval workflow with second sign-off

**Anti-features (researched and rejected):**
- Firebase Storage for proof documents — explicitly rejected by user due to storage cost concern
- Automated payment reminders / email notifications — out of scope per PROJECT.md
- Full AP automation / invoice auto-match — over-engineering for current scale and team

See `.planning/research/FEATURES.md` for prioritization matrix and detailed behaviour analysis.

### Architecture Approach

All three features integrate into existing view files following established patterns. Supplier search adds a module-level filter variable and modifies `renderSuppliersTable()` in `procurement.js`. Proof link adds optional fields to `pos` documents and two window functions in `procurement.js`. The RFP system introduces a new `rfps` Firestore collection, a Security Rules block in `firestore.rules`, RFP submission logic in `procurement.js`, and a new "Payables" fourth tab in `finance.js`. The RFP system must not be placed as a standalone view with its own route — Finance and Procurement already have the right permission context and listener lifecycle.

**Major components:**
1. `procurement.js` Supplier tab — add `supplierSearchTerm` state, `filterSuppliers()` window fn, filter before pagination slice in `renderSuppliersTable()`
2. `procurement.js` PO Tracking section — add `proof_url` column/button on PO rows; "Submit RFP" button on Delivered POs with no existing RFP
3. `finance.js` Payables tab (new fourth tab) — `onSnapshot` on `rfps`, render table, `approveRFP()` / `markRFPPaid()` / `rejectRFP()` window functions
4. `rfps` Firestore collection — new, auto-created on first `addDoc`; FK to `pos` by `po_id`; denormalized `supplier_name`, `pr_id`, `mrf_id` for display without joins
5. `firestore.rules` `rfps` block — must deploy before any UI code touches the collection

See `.planning/research/ARCHITECTURE.md` for data flow diagrams, exact line numbers, and anti-patterns to avoid.

### Critical Pitfalls

1. **Search filters paginated page slice, not full array** — maintain `suppliersData` (raw) and `filteredSuppliersData` (post-filter) as separate arrays; pagination must operate on the filtered array, not the source. Phase 1 design-time risk.

2. **Page number not reset on search term change** — any function modifying the filtered dataset must set `suppliersCurrentPage = 1` before calling `renderSuppliersTable()`, including typing, clearing, and adding/deleting a supplier while a filter is active. Phase 1 implementation risk.

3. **RFP Security Rules missing at collection creation** — deploy `rfps` rules block in the same commit as the first `addDoc` to `rfps`; Firestore denies all access by default. This pitfall has caused production regressions in prior milestones. Phase 3 deployment risk.

4. **RFP data embedded on PO document instead of separate collection** — storing payment fields on `pos` blocks partial payments, inflates PO listeners, and prevents Finance-independent filtering. The `rfps` collection is non-negotiable. Phase 3 design risk.

5. **Overcomplicated RFP state machine** — start with exactly four states: `Pending | Approved | Rejected | Paid`. Do not model partial payment as a status; derive it from `total_paid` vs `amount_requested` arithmetic. Phase 3 scoping risk.

6. **XSS via unsanitized proof URL in `href` attribute** — apply `escapeHTML()` from `utils.js` to `proof_url` before injecting into template literals; use `rel="noopener noreferrer"` on all `target="_blank"` proof links. Phase 2 security risk.

See `.planning/research/PITFALLS.md` for the full 10-pitfall catalogue, integration gotchas, and "Looks Done But Isn't" checklist.

## Implications for Roadmap

Based on combined research, three phases in dependency order:

### Phase 1: Supplier Search Bar
**Rationale:** Zero Firestore changes, zero new collections, zero Security Rules impact. Entirely within `procurement.js`. Lowest risk in the milestone. Ships a visible UX improvement that validates the filter pattern before it is referenced by Phase 3 (RFP filter in the Finance payables tab follows the same approach).
**Delivers:** Search input above suppliers table; filters `suppliersData[]` by `supplier_name` and `contact_person` with case-insensitive substring matching; pagination operates on filtered subset; page resets to 1 on each search keystroke (debounced 200ms).
**Addresses:** Table stakes supplier search (FEATURES.md P1); style parity with existing client/projects search bars.
**Avoids:** Pitfall 1 (two-array split design), Pitfall 2 (debounce), Pitfall 3 (page reset).
**Research flag:** None needed — standard client-side filter pattern, identical to `filterPRPORecords()` already in `procurement.js`.

### Phase 2: Proof of Procurement Link
**Rationale:** Adds one optional string field to `pos` documents — backward compatible, no new collection, no Security Rules change. Should ship before Phase 3 because both features modify the same PO Tracking table rows in `procurement.js`. Having the proof_url column stable before adding the RFP submission button to those same rows avoids merge complexity and keeps each phase reviewable in isolation.
**Delivers:** "Add Proof" / "View Proof" on PO rows in Procurement PO Tracking; `proof_url`, `proof_uploaded_at`, `proof_uploaded_by` stored on `pos` doc; "View Document" link surfaced in Finance PO tab and Timeline modal; accepts any valid `https://` URL (Google Drive, OneDrive, SharePoint, Dropbox).
**Addresses:** Table stakes proof-of-procurement attachment (FEATURES.md P1).
**Avoids:** Pitfall 4 (no URL normalization or fetch-validation — store as entered), Pitfall 6 (XSS — `escapeHTML()` on all href injections).
**Research flag:** Requires one product decision before coding begins: can the proof URL be updated after a PO reaches `Delivered` status? Research recommends yes (Procurement role only at any status). Decision must be reflected in both the UI conditional and the `firestore.rules` `pos` update permission.

### Phase 3: RFP + Payables Tracking
**Rationale:** Depends on stable PO Tracking UI from Phase 2 (both touch PO rows). Introduces the only new Firestore collection and the only new Finance tab in this milestone. Must be built in sub-steps to manage risk: Security Rules first, then RFP submission UI in `procurement.js`, then Finance Payables tab.
**Delivers:** `rfps` Firestore collection with `RFP-YYYY-###` sequential IDs; RFP creation modal on Delivered POs with no existing RFP; Finance Payables tab (fourth tab) with real-time `onSnapshot` listener; approve/reject/mark-paid actions for Finance; partial payment via `payment_records` array with `total_paid` running sum; auto-derived `payment_status` (`Pending` / `Partially Paid` / `Fully Paid`) — Finance never manually sets status; default payables view excludes fully paid RFPs.
**Addresses:** RFP creation (P1), Finance payables list (P1), record payment (P1), due date display (P1).
**Uses:** `generateSequentialId()` from `utils.js` (or inline equivalent) for `RFP-YYYY-###`; `onSnapshot` + TTL cache guard pattern from existing `finance.js` tabs; `addDoc` / `updateDoc` Firestore write pattern.
**Avoids:** Pitfall 7 (Security Rules in same commit as first collection write), Pitfall 8 (4-state model — no "Partially Paid" status field, only derived display), Pitfall 9 (Payables as Finance sub-tab, not standalone route), Pitfall 10 (`procurement.js` stays under 7,000 lines — RFP list/approval logic lives in `finance.js`, not `procurement.js`).
**Research flag:** Moderate complexity warrants deeper phase research before implementation. Specific items to resolve: (a) confirm `generateSequentialId()` in `utils.js` accepts a custom prefix for `RFP-` IDs or document the inline alternative; (b) lock in the `payment_records` array vs. subcollection decision — research currently splits on this (STACK.md recommends subcollection for lifecycle independence; FEATURES.md recommends array for simplicity at 1–5 records per RFP); (c) confirm Finance `destroy()` correctly cleans up the fourth tab's `onSnapshot` listener without breaking the existing three tabs.

### Phase Ordering Rationale

- Phase 1 has no shared code surface with Phases 2 or 3. It can be shipped and deployed independently with no integration risk.
- Phase 2 must precede Phase 3 because both modify PO Tracking table rows in `procurement.js`. Completing Phase 2 first ensures each phase diff is reviewable in isolation and reduces the chance of conflicting edits in the same function.
- Phase 3 must come last because it depends on PO documents existing with stable `proof_url` handling (Phase 2), introduces the only new Firestore collection in this milestone, and represents the largest scope change.
- All three phases avoid Google Drive API / OAuth integration. Research confirmed the paste-a-link approach delivers identical functional value with zero infrastructure overhead, and the API path is explicitly deferred pending user feedback.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3:** Three unresolved decisions require confirmation before implementation begins: `generateSequentialId` prefix support, `payment_records` array vs. subcollection, and Finance `destroy()` listener cleanup for the fourth tab. These are low-risk gaps but must be resolved in the phase spec, not during coding.

Phases with standard patterns (skip research-phase):
- **Phase 1:** Client-side filter pattern is identical to existing `filterPRPORecords()` in `procurement.js` and the projects/clients search bars. No research needed.
- **Phase 2:** Optional string field on an existing document. `updateDoc` pattern is in heavy use throughout `procurement.js`. No research needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core stack unchanged; zero new libraries; Google Drive API deferred with explicit rationale. Official Firestore and vanilla JS patterns confirmed in multiple official sources. |
| Features | HIGH | MVP scope is well-defined with clear P1/P2/P3 prioritization. Deferral decisions are explicit and rationale-backed. AP domain research from NetSuite, Medius, and Pipefy validates RFP field requirements. |
| Architecture | HIGH | Based on direct codebase inspection with specific file line numbers. Integration points identified at `renderSuppliersTable()` (line 2537), `attachWindowFunctions()` (line 96), `finance.js` tab structure. Anti-patterns documented with concrete reasoning. |
| Pitfalls | HIGH | Majority sourced from direct inspection of existing code patterns. Firestore Security Rules pitfall has a documented prior incident in this codebase. All 10 pitfalls have prevention steps and recovery strategies. |

**Overall confidence:** HIGH

### Gaps to Address

- **Proof link editability post-Delivered (Phase 2 blocker):** Research recommends allowing Procurement to update `proof_url` at any PO status. This is a product decision. Must be confirmed before Phase 2 implementation begins. The Security Rules `pos` update permission must reflect whatever is decided.

- **`generateSequentialId` prefix support (Phase 3 kickoff):** Confirm whether the existing `utils.js` utility accepts `RFP` as a custom prefix, or whether a small inline generator for `RFP-YYYY-###` is needed alongside the existing PR/PO generators. Low-risk but should be verified before writing any Phase 3 code that depends on it.

- **`payment_records` array vs. subcollection (Phase 3 design):** STACK.md recommends a subcollection with independent lifecycle per installment; FEATURES.md recommends a `payment_records` array for simplicity given 1–5 records per RFP. Both are technically valid. The array approach is simpler and consistent with `items_json` patterns; the subcollection is more correct if Finance needs per-installment status updates. Decision must be locked in the Phase 3 spec — migrating between these structures after documents exist is costly.

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `app/views/procurement.js` — `loadSuppliers()` line 2509, `renderSuppliersTable()` line 2537, `attachWindowFunctions()` line 96, `filterPRPORecords()` pattern
- Direct code inspection: `app/views/finance.js` — tab structure, `onSnapshot` listener pattern, TTL cache guard pattern
- Direct code inspection: `firestore.rules` — role structure, new-collection template block, `isActiveUser()` and `hasRole()` helpers
- [Google Drive API v3 — Manage Uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads) — multipart upload spec, 5 MB limit, fetch-compatible
- [Google Drive API Scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) — `drive.file` is non-sensitive, no verification required
- [Google Drive Picker API Overview](https://developers.google.com/workspace/drive/picker/guides/overview) — Picker is file-selector only, not uploader; confirmed why Picker does not simplify the upload workflow
- [Firestore Data Modeling — Subcollections](https://firebase.google.com/docs/firestore/manage-data/structure-data) — subcollection vs. array trade-off for independent lifecycle documents
- [Firestore Security Rules — Get Started](https://firebase.google.com/docs/firestore/security/get-started) — default-deny model, confirmed Security Rules deployment requirement

### Secondary (MEDIUM confidence)
- [Google Identity Services — Migration Guide](https://developers.google.com/identity/oauth2/web/guides/migration-to-gis) — token model remains valid for browser-only SPAs; auth-code flow preferred for backend apps
- [Unverified Apps — Google Cloud](https://support.google.com/cloud/answer/7454865) — internal tools with fewer than 100 users do not require OAuth consent screen verification
- [Accounts Payable Full Cycle Process (Medius)](https://www.medius.com/blog/full-process-accounts-payable-cycle/) — RFP field requirements and payment tracking conventions
- [AP Terms and Payment Tracking (NetSuite)](https://www.netsuite.com/portal/resource/articles/accounting/accounts-payable-terms.shtml) — payment terms vocabulary (Net 30, Net 60, etc.)
- [Procure-to-Pay Process (Pipefy)](https://www.pipefy.com/blog/procure-to-pay/) — MRF → PR → PO → RFP chain validation

### Tertiary (LOW confidence)
- Google Drive sharing URL instability — known operational issue in document management systems; no single canonical source, consistent with documented Drive API permission revocation behavior and community operational experience

---
*Research completed: 2026-03-13*
*Ready for roadmap: yes*
