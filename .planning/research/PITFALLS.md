# Pitfalls Research

**Domain:** Adding supplier search, external document links, and RFP/payables tracking to an existing vanilla JS + Firestore SPA
**Researched:** 2026-03-13
**Confidence:** HIGH

---

## Critical Pitfalls

### Pitfall 1: Search Operating Only on the Visible Page Instead of All Suppliers

**What goes wrong:**
The search input filters `suppliersData.slice(startIndex, endIndex)` — the already-paginated subset — instead of the full `suppliersData` array. A supplier named "ABC Metals" on page 3 is invisible when the user types "abc" while on page 1. The table appears to have no results, yet the record exists.

**Why it happens:**
`renderSuppliersTable()` already slices for pagination. When a search filter is bolted on, the easiest path is to add a second `.filter()` call inside the same function that still operates on the already-sliced `pageItems` array. The pagination logic and the filter logic both read from the same array, and whichever runs first limits what the second one sees.

**How to avoid:**
Maintain two separate arrays:
- `suppliersData` — raw, unfiltered, always the full collection snapshot
- `filteredSuppliersData` — result of applying current search term to `suppliersData`

Pagination must operate on `filteredSuppliersData`, not `suppliersData`. When the user types:
1. Filter `suppliersData` against the search term → write result into `filteredSuppliersData`
2. Reset `suppliersCurrentPage = 1`
3. Call `renderSuppliersTable()` which paginates from `filteredSuppliersData`

Clearing the search input must restore `filteredSuppliersData = [...suppliersData]` before re-rendering.

**Warning signs:**
- Search returns zero results for known suppliers when on any page other than 1
- Result count shows "15 of 15" instead of "2 of 47" when a filter term is active
- Pagination controls disappear when search is active (because page count drops to 1 on the visible-page subset)

**Phase to address:**
Phase 1 (Supplier Search) — Design the two-array split before writing any search code.

---

### Pitfall 2: Search Firing on Every Keypress Without Debouncing, Causing Render Thrash

**What goes wrong:**
With `onkeyup="window.filterSuppliers()"` on the input, typing "ABC Metals" fires `filterSuppliers()` 9 times in rapid succession. Each call rebuilds the entire table DOM. On a 200-supplier list this is imperceptibly fast today, but the pattern is wrong and will degrade noticeably if supplier count grows or if the filter is also used to drive a Firestore query (not the case here, but a future risk).

**Why it happens:**
The existing `histSearchInput` in the Records tab uses `onkeyup` directly. Copying the same pattern for supplier search is the natural move.

**How to avoid:**
Wrap the filter call in a debounce:
```javascript
let _supplierSearchTimeout = null;
function onSupplierSearchInput(value) {
    clearTimeout(_supplierSearchTimeout);
    _supplierSearchTimeout = setTimeout(() => filterSuppliers(value), 200);
}
```
200ms is imperceptible to the user and eliminates mid-word renders. The input value must be read from the event argument or from the input element inside the debounced callback — not captured in closure at call time — otherwise the final value is always the last character typed.

**Warning signs:**
- Console shows `[Procurement] renderSuppliersTable` firing many times per typed word
- Edit row loses focus when in-place editing a supplier and a keypress elsewhere triggers re-render

**Phase to address:**
Phase 1 (Supplier Search) — Write debounce helper once; reuse for contact person search.

---

### Pitfall 3: Page Number Not Reset to 1 When Search Term Changes

**What goes wrong:**
User is on page 3 of suppliers (items 31-45). They type "zenith" in the search bar. The filter reduces results to 2 suppliers, but `suppliersCurrentPage` is still 3. `filteredSuppliersData.slice((3-1)*15, 3*15)` = `filteredSuppliersData.slice(30, 45)` → empty array. The table shows "No suppliers found" even though 2 matches exist on what would be page 1.

**Why it happens:**
Pagination page state is module-level. The search handler updates the filter but does not reset the page counter because it was added independently from the pagination code.

**How to avoid:**
Any function that changes `filteredSuppliersData` must set `suppliersCurrentPage = 1` before calling `renderSuppliersTable()`. This includes: typing in search, clearing search, and adding/deleting a supplier while a search term is active.

**Warning signs:**
- Searching while on page 2+ shows empty table for valid queries
- "Showing 0 – 0 of 2" in pagination info text

**Phase to address:**
Phase 1 (Supplier Search) — Add page reset to every path that modifies the filtered dataset.

---

### Pitfall 4: Storing Raw Google Drive Sharing URLs That Expire or Lose Permissions

**What goes wrong:**
Procurement saves a direct "anyone with link" Google Drive share URL to the `pos` collection. Later:
- The document owner revokes sharing
- The Google account changes ownership
- Google detects the file as sensitive and restricts it
- The shared-link format changes (`drive.google.com/open?id=` vs `drive.google.com/file/d/`)

Finance opens the PO later and the link returns a 403 or a Google login wall — with no indication in the UI that the document is unavailable.

**Why it happens:**
Drive sharing URLs feel permanent because they work immediately after pasting. Developers treat them as immutable references.

**How to avoid:**
- Store the URL as-entered — no transformation or "normalize to preview format" logic. Attempting to rewrite Drive URLs programmatically is fragile and breaks frequently.
- Display proof links with explicit "opens in new tab" behaviour and a disclaimer that the link depends on Google Drive permissions.
- Do not validate link reachability at save time (no `fetch(url)` pre-check). CORS blocks this from the browser, and a live check at save time doesn't guarantee future access.
- Accept any URL that passes basic URL format validation (`/^https?:\/\//`). Do not restrict to `drive.google.com` domain — users may upload to OneDrive, Dropbox, or a project SharePoint, all of which are equivalent for this use case.

**Warning signs:**
- Code that calls `URL()` constructor to normalize the Drive link before storing
- Code that attempts to convert a `/file/d/ID/view?usp=sharing` URL to a `/uc?export=download` URL
- `fetch()` or `XMLHttpRequest` calls used to pre-validate a link

**Phase to address:**
Phase 2 (Proof of Procurement) — Define the storage and display contract before implementation.

---

### Pitfall 5: Blocking Proof-of-Procurement Edits on Delivered POs Without a Requirements Decision

**What goes wrong:**
The developer assumes that once a PO is `Delivered`, the proof link is immutable. The UI disables the edit control. A procurement officer then needs to replace a corrupted Drive link or add a second document. They cannot do so without a developer intervention to manually edit Firestore.

Alternatively, the developer assumes edits are always allowed. Finance then has no assurance that a proof document cannot be quietly swapped after they review it.

**Why it happens:**
The requirement "can they still upload after Delivered?" was not answered before coding started. The developer picks one behaviour by default.

**How to avoid:**
Decide explicitly before Phase 2 implementation:
- **Recommended:** Allow proof link updates at any `procurement_status` but only for Procurement role. Finance (read-only on this field) sees whatever link Procurement saved last. This matches real-world workflows where a "final invoice scan" replaces a "purchase order scan" after delivery.
- If immutability after Delivered is genuinely required, add a locked field indicator and an override pathway (e.g., Super Admin only) rather than a hard block with no escape.

The decision must be reflected in both the UI logic and in Firestore Security Rules (who can `update` the `proof_link` field on a PO doc).

**Warning signs:**
- Code that checks `po.procurement_status === 'Delivered'` to conditionally disable the proof link input, without a corresponding escalation path
- Security Rules `allow update: if ...` block that does not account for proof link updates independently of procurement status updates

**Phase to address:**
Phase 2 (Proof of Procurement) — Resolve with product owner before writing any UI code.

---

### Pitfall 6: Putting RFP Data on the PO Document Instead of a Separate Collection

**What goes wrong:**
The simplest implementation stores payment data on the PO document itself: `pos/{poId}` gains fields `rfp_status`, `rfp_amount`, `payment_date`, etc. This seems fine until:
- A PO requires multiple partial payments (paid 50% in March, 50% in April)
- Finance needs an RFP approval audit trail (who requested, who approved, when)
- The payables list needs to be sorted/filtered independently of PO list
- The RFP is submitted before the PO exists (edge case, but happens in practice)

Adding more fields to an already large document also triggers a re-download of the entire PO document on every payment update, which re-runs all PO listeners.

**Why it happens:**
Putting fields on an existing document requires no new collection, no new Security Rules, and no new schema thinking. It is the path of least resistance in a Firestore schemaless system.

**How to avoid:**
Create a dedicated `rfps` collection (or `payables` — name to be decided in planning):
```
rfps/{rfpId}
  rfp_id: "RFP-2026-###"
  po_id: string           -- references pos collection
  pr_id: string           -- for display context
  mrf_id: string          -- for display context
  supplier_name: string   -- denormalized for list display
  amount_requested: number
  payment_terms: string
  due_date: timestamp
  status: "Pending" | "Approved" | "Paid" | "Rejected"
  submitted_by: string    -- uid
  approved_by: string     -- uid, null until approved
  date_submitted: timestamp
  date_approved: timestamp
  date_paid: timestamp
```

This allows multiple RFPs per PO, independent filtering, and a clean Finance approval workflow without touching the PO document.

**Warning signs:**
- `pos` document gains more than 3 new fields related to payment
- Any field named `rfp_*` or `payment_*` appearing directly on the PO document schema
- No new Firestore collection created as part of the RFP feature

**Phase to address:**
Phase 3 (RFP + Payables) — Define the `rfps` schema before writing any code.

---

### Pitfall 7: Forgetting Security Rules for the New `rfps` Collection

**What goes wrong:**
Developer creates `rfps` collection in code. It works in development with relaxed rules or because the developer is a Super Admin. When tested with a Finance role, all `rfps` reads return "Missing or insufficient permissions." The Finance payables view is blank. This is the same issue that caused the Phase 11 "Clients tab permission denied for Super Admin" regression.

**Why it happens:**
Firestore denies all access by default. The developer adds the collection, verifies it works for their account (Super Admin), and ships. The firestore.rules file is on a different mental track from the application code.

**How to avoid:**
Add the `rfps` collection rules to `firestore.rules` in the same commit that creates the first `addDoc` to `rfps` in application code. Never create a collection without simultaneous rules.

Template (from existing `firestore.rules` header):
```
match /rfps/{rfpId} {
  allow read: if isActiveUser();
  allow create: if hasRole(['super_admin', 'procurement', 'finance']);
  allow update: if hasRole(['super_admin', 'finance']);  // Finance approves
  allow delete: if hasRole(['super_admin']);
}
```

Run `firebase deploy --only firestore:rules` before testing the UI.

**Warning signs:**
- `rfps` collection has any documents in Firestore but Finance user's payables view is empty
- Console shows "permission-denied" errors in Network tab for `rfps` queries
- Security Rules file was last modified before the `rfps` collection code was written

**Phase to address:**
Phase 3 (RFP + Payables) — Rules must land in the same PR as the collection creation code.

---

### Pitfall 8: Overcomplicated RFP State Machine That Doesn't Match Real Workflow

**What goes wrong:**
Developer models RFP as a multi-step state machine: `Draft → Submitted → Under Review → Approved → Payment Processing → Partially Paid → Paid`. Each state requires a different UI and transition logic. Implementation bloats to 600+ lines. Users encounter states that don't correspond to anything they do in practice. Finance rejects the feature because the workflow doesn't match how the company actually approves payments.

**Why it happens:**
Payment systems in enterprise software are genuinely complex. Developers pattern-match to enterprise AR/AP systems and over-engineer the MVP.

**How to avoid:**
Start with three states: `Pending` (submitted by Procurement) → `Approved` (by Finance) → `Paid` (Finance marks as paid). That covers 95% of use cases. Add `Rejected` for Finance to push back with a reason. Do not add partial payment tracking until a real user request arises — Firestore is schemaless so adding it later has zero migration cost.

The four-state model: `Pending | Approved | Rejected | Paid`

**Warning signs:**
- State names include "Processing", "Partial", "Under Review", "Queued", or "Pending Payment"
- More than 4 distinct `rfp_status` values defined before any user feedback
- State transition logic requires knowing the previous state (e.g., `if (rfp.status === 'Under Review' && prevStatus === 'Submitted')`)

**Phase to address:**
Phase 3 (RFP + Payables) — Lock in the 4-state model in the schema design; defer complexity.

---

### Pitfall 9: Finance Workflow Integration Assumption — RFP Appearing in Wrong Tab

**What goes wrong:**
RFPs are built as a standalone "Payables" tab in the Finance view. But Finance users already have a workflow in the existing "Pending Approvals" tab. They now have two separate approval queues to check. Pending RFPs get missed because Finance thinks "Pending Approvals" is all they need to act on. Procurement follows up manually.

**Why it happens:**
The developer builds the RFP system as a new feature in isolation, choosing a new tab as the cleanest separation. The integration point with existing Finance workflows is not considered.

**How to avoid:**
Two options — decide before building:

**Option A (Integrated):** Add a "Payables" sub-tab to the existing Finance view alongside "Pending Approvals" and "Purchase Orders". Finance sees all outstanding items in one view. The tab badge count includes pending RFPs.

**Option B (Separate View):** Create a standalone Payables view with its own route (`#/payables`), accessible only to Finance and Super Admin. Finance navigates there deliberately for payment processing rather than routine approvals.

Option A is recommended. The Finance view already has the right permission context, the right listener patterns, and the right users. Adding a sub-tab avoids nav proliferation and keeps the Finance workflow consolidated.

Either way, document the decision before Phase 3 begins.

**Warning signs:**
- RFP feature starts development without a decision on where it lives in the navigation
- A fourth top-level nav item is added for a feature primarily used by Finance

**Phase to address:**
Phase 3 (RFP + Payables) — Navigation placement decision belongs in requirements, not mid-implementation.

---

### Pitfall 10: procurement.js Already at 6,354 Lines — Adding More Without Extraction

**What goes wrong:**
Supplier search adds ~80 lines. Proof-of-procurement UI adds ~150 lines. If the RFP submission UI is also placed in `procurement.js`, the file grows beyond 7,000 lines. Cognitive load increases, scrolling-to-find-function becomes the primary navigation method, and merge conflicts become frequent because every feature touches the same file.

**Why it happens:**
Existing patterns are already in `procurement.js`. Adding adjacent functionality to the same file follows the path of least resistance and avoids decisions about where new code belongs.

**How to avoid:**
- Supplier search: stays in `procurement.js` — it is directly modifying the existing suppliers sub-tab, not a new feature surface. Estimated addition: ~100 lines.
- Proof-of-procurement link: stays on `procurement.js` in the PO Tracking tab — it is a field addition to existing PO rows, not a new sub-system. Estimated addition: ~60 lines.
- RFP + Payables: **extract to a new view file** (`app/views/payables.js` or handled entirely in `finance.js` as a new sub-tab). RFP has its own collection, its own state machine, and its own Finance workflow. It does not belong in `procurement.js`.

This keeps each addition proportionate. The two procurement-side features are field additions; the payables tracking feature is a new system.

**Warning signs:**
- `procurement.js` line count exceeds 7,000 lines after v3.2
- RFP-related functions appear in `procurement.js` rather than a Finance-context file
- `app/views/` directory gains no new files despite a new collection being created

**Phase to address:**
Phase 3 (RFP + Payables) — Decide file structure before writing any code.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Storing proof link directly on PO doc | No new collection, no new rules | Cannot support multiple docs per PO, triggers PO listeners on every link update | Acceptable only if single-link-per-PO is a hard requirement forever |
| Adding RFP fields to `pos` doc | No schema work | Blocks partial payment, pollutes PO queries with payment data, inflates PO listener payload | Never |
| Search filtering paginated slice only | Ships faster | Search silently misses records not on current page — user trust damage | Never |
| Skipping Security Rules for `rfps` at launch | Faster iteration in dev | Permission errors for all non-admin roles in production | Never |
| Accepting any pasted text as a proof link | Simpler validation | Broken links stored silently; no user feedback on malformed input | Acceptable only with a minimal `https://` prefix check at save time |
| 6+ state RFP machine from day one | Feels "complete" | Workflow mismatch with real users, implementation cost before feedback | Never for MVP |

---

## Integration Gotchas

Common mistakes when connecting features to the existing system.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Supplier search + existing pagination | Filter the paginated slice, not the source array | Always filter `suppliersData` → write to `filteredSuppliersData` → paginate from that |
| Proof link + PO listener | Adding a new field to a PO doc causes the existing `onSnapshot` for POs to re-fire and re-render the entire PO tracking table | Acceptable cost; the existing listener already handles updates. No extra action needed, but don't add a second `onSnapshot` for proof link changes. |
| RFP collection + Finance view | Finance sub-tabs use the same `listeners[]` array but `finance.js` has its own `destroy()` lifecycle | RFP listener must be pushed to `finance.js`'s `listeners` array if RFP lives in the Finance view, or to `payables.js`'s own array if extracted |
| RFP `rfp_id` sequential generation | Sequential ID utils (`generateSequentialId`) already exist in utils.js but are keyed to known collection names | Verify `generateSequentialId` accepts a custom prefix argument or add a new `generateRFPId()` following the same year-padded pattern |
| Google Drive links + CSP headers | If `connect-src` in `_headers` or Netlify config is restricted, linking to external Drive URLs for display still works (they open in new tab), but any `fetch()` call to validate them will be blocked | Do not attempt server-side or client-side link validation via `fetch()` |
| New `rfps` Security Rules + existing rules test suite | Adding a new collection without adding emulator test cases leaves a gap | Add at minimum 3 tests: Finance can read, Procurement can create, unauthenticated user is denied |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Client-side supplier search on full `suppliersData` array per keypress | Imperceptible now, noticeable sluggish render at scale | Debounce 200ms; acceptable at current scale (100s of suppliers), no Firestore query needed | 1,000+ suppliers (not expected, but debounce is free) |
| `onSnapshot` for `rfps` collection with no query filter | All RFPs downloaded to every client session | Query by `status == 'Pending'` for Finance approval queue; query by `po_id` for PO-specific view | 500+ RFP documents |
| Recomputing payables total on every `rfps` snapshot update | Re-aggregates all RFPs on every status change | For the MVP payables list, client-side aggregation is fine; if a "total outstanding payables" scoreboard is needed, use `getAggregateFromServer(sum(...))` as a one-time read | 1,000+ RFPs |
| Proof link field added to PO rows in existing table re-renders the full PO table on every PO update | Already the case today — not a new problem introduced by the feature | Existing behavior; acceptable at current PO volumes | 500+ concurrent POs in `Procuring` state |

---

## Security Mistakes

Domain-specific security issues for v3.2 features.

| Mistake | Risk | Prevention |
|---------|------|------------|
| `rfps` collection with no Security Rules | All Finance/Procurement read access denied in production; RFP submissions silently fail | Deploy rules in same commit as first collection write |
| Proof link field writable by any role | A requester could overwrite a Finance-reviewed proof document | Restrict `proof_link` update to `procurement` role in Security Rules; Finance reads, not writes |
| Displaying raw proof URLs without `escapeHTML` | XSS if a malicious URL is stored (e.g., `javascript:...` prefix) | Apply `escapeHTML()` to proof URL before inserting into `href` attribute; use `rel="noopener noreferrer"` on `<a target="_blank">` |
| RFP `amount_requested` stored as string | Finance sees "100" + "200" = "100200" in payables total | Always `parseFloat()` or `Number()` at read time; validate numeric at write time |
| Finance approving RFP without permission check | Any active user who can reach the Finance view could POST an approval | Security Rules must restrict `rfps` update to `finance` and `super_admin` roles; client-side `canEditTab('finance')` check alone is not sufficient |

---

## UX Pitfalls

Common user experience mistakes for v3.2 features.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Search bar that resets to page 1 mid-typing (visible jump) | Jarring if user is scanning results while typing | Reset page only after debounce fires, not on every keypress |
| Proof link field always visible even when no link exists | Row looks broken with empty `<a>` tag or "undefined" text | Render a "-" dash when `proof_link` is absent; render a "View Document" link only when set |
| Proof link opens in same tab | User loses their place in the PO tracking view | Always `target="_blank"` with `rel="noopener noreferrer"` |
| RFP submission on a PO that already has an approved RFP | Duplicate payment risk; Finance approves two RFPs for the same PO | At RFP submission time, warn if an `Approved` or `Pending` RFP already exists for the same `po_id` |
| No visual indicator that a PO has an attached proof document | Finance cannot tell at a glance which POs have documentation | Add a small icon or badge in the PO row when `proof_link` is set |
| Payables list showing all historical paid RFPs by default | Finance scans a long list of already-paid items looking for pending actions | Default filter to `status != 'Paid'`; provide a "Show All" toggle |
| Empty state for "no pending RFPs" looks like an error | Finance thinks the feature is broken on first visit | Explicit empty-state copy: "No pending payment requests." |

---

## "Looks Done But Isn't" Checklist

- [ ] **Supplier search:** Test on page 2+ — results exist but page doesn't reset to show them
- [ ] **Supplier search:** Clear the search field — confirm all suppliers reappear (not just the filtered subset)
- [ ] **Supplier search:** Add a supplier while search is active — new supplier appears in filtered results if it matches
- [ ] **Proof link:** Test saving an empty string — confirm it clears the field, not stores `""`
- [ ] **Proof link:** Test with a non-Drive URL (Dropbox, SharePoint) — link should work the same
- [ ] **Proof link:** Test with a long URL containing special characters — `escapeHTML()` applied to href
- [ ] **Proof link:** Verify Finance users can see but not edit the link
- [ ] **RFP Security Rules:** Deploy rules before testing with Finance or Procurement role accounts (not Super Admin)
- [ ] **RFP:** Submit a second RFP for the same PO — system warns or blocks duplicate
- [ ] **RFP:** Finance approves RFP — status updates in real-time in Procurement's view (if cross-view listener exists)
- [ ] **RFP sequential ID:** Verify `RFP-2026-001` format matches existing ID patterns in the system
- [ ] **Payables total:** Verify amounts are `parseFloat`-ed before summing — not string-concatenated
- [ ] **Finance view:** Pending RFPs are visible to Finance without navigating to a new top-level page

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Search only works on current page | LOW | Split `suppliersData` / `filteredSuppliersData` arrays; no database changes needed |
| Proof links stored with normalized format that breaks | LOW | Update the display code to handle old and new formats; Firestore docs are schemaless so field values are whatever was stored |
| RFP fields on PO documents instead of separate collection | HIGH | Schema migration: read each PO, write corresponding `rfps` doc, clear PO fields; requires downtime window or dual-read shim period |
| `rfps` collection blocked by missing Security Rules | LOW | Deploy rules immediately; no data loss; users just need to refresh |
| RFP state machine too complex to ship | MEDIUM | Collapse to 4 states in the data model; repaint UI; no data migration if no documents exist yet |
| Proof link XSS via `javascript:` URL stored | MEDIUM | Audit all `href` attributes using proof_link; add `escapeHTML` and `^https?://` validation; no data loss but requires immediate deploy |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Search filters only current page | Phase 1: Supplier Search | Manual test: with 20+ suppliers, navigate to page 2, search for supplier on page 1 — must appear |
| Page not reset on search | Phase 1: Supplier Search | Manual test: navigate to last page, type search term — page jumps to 1 |
| Debounce missing | Phase 1: Supplier Search | Console test: typing 5 chars produces 1 render call, not 5 |
| Drive URLs expire/break | Phase 2: Proof of Procurement | Design decision documented before coding; no validation code added |
| Proof link editable post-Delivered | Phase 2: Proof of Procurement | Requirements decision recorded; Security Rules reflect the decision |
| RFP on PO document | Phase 3: RFP + Payables | Schema review: `rfps` collection exists in Firestore before any UI code ships |
| Missing `rfps` Security Rules | Phase 3: RFP + Payables | Test with Finance role account before marking phase complete |
| Overcomplicated state machine | Phase 3: RFP + Payables | Requirements doc shows exactly 4 RFP statuses, no more |
| RFP in wrong nav location | Phase 3: RFP + Payables | Product decision in phase spec; Finance user can find pending RFPs without navigating away from Finance view |
| `procurement.js` bloat | Phase 3: RFP + Payables | File count check: `app/views/` should have at least one new file for RFP/payables feature |

---

## Sources

### Project Codebase (HIGH confidence)
- `app/views/procurement.js` lines 2537–2591 — Existing `renderSuppliersTable()` implementation showing pagination pattern
- `app/views/procurement.js` lines 16–20 — `suppliersData`, `suppliersCurrentPage`, `suppliersItemsPerPage` globals
- `firestore.rules` lines 1–39 — Security Rules template and "ADDING NEW COLLECTIONS" warning header
- `CLAUDE.md` — DOM selection patterns, listener management, sequential ID generation patterns
- `.planning/PROJECT.md` — Known issues: "Firestore 'in' query limited to 10 items", IndexedDB performance notes

### Prior Research (HIGH confidence — same codebase)
- `.planning/research/PITFALLS.md` (v2.1 era) — Window function lifecycle, listener cleanup, Security Rules patterns; all still applicable to new features

### Domain Knowledge (MEDIUM confidence)
- Google Drive sharing URL instability is a known operational issue in document management systems; no single source, but consistent with documented Drive API behavior re: permission revocation
- Firestore default-deny security model: https://firebase.google.com/docs/firestore/security/get-started
- Client-side search on in-memory array is the standard approach for < 10,000 records with Firestore; Firestore full-text search requires Algolia/Typesense at larger scale (not needed here)

---
*Pitfalls research for: CLMC Procurement System v3.2 — Supplier Search, Proof of Procurement, RFP + Payables*
*Researched: 2026-03-13*
