# Feature Research

**Domain:** Procurement management SPA — v3.2 milestone features
**Researched:** 2026-03-13
**Confidence:** HIGH (supplier search, RFP/payables data model), MEDIUM (Google Drive integration path)

---

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Supplier search by name | Any list with 15+ items needs a search box | LOW | Filter on already-loaded `suppliersData` array; no Firestore query needed |
| Supplier search by contact person | Users look up suppliers by who they know, not just company name | LOW | Same filter pass — extend substring match to `contact_person` field |
| Proof-of-procurement attachment link on PO | POs need evidence; auditors and Finance need a reference document | LOW | Store a URL string as `proof_url` on `pos` doc; uploading to Drive happens outside the app |
| RFP linked to a specific PO | Payment requests must trace back to a procurement document | MEDIUM | New `rfps` collection; `po_id` and `supplier_name` as foreign keys |
| Outstanding payables list for Finance | Finance cannot manage cash flow without a view of what is owed and when | MEDIUM | Query `rfps` where `payment_status != 'Fully Paid'`; new Finance sub-section |
| Payable closed automatically when fully paid | "Paid" state is the resolution event; users should not have to manually toggle it | LOW | Computed from `total_paid >= amount_requested`; system updates status on payment record |

### Differentiators (Valuable but Not Expected)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Staggered / partial payment tracking | Engineering procurement commonly uses split payments (50% down, 50% on delivery) — most simple AP tools force one payment per invoice | MEDIUM | `payment_records` array on `rfps` doc; each entry captures amount, date paid, method, reference |
| Payment due date display | Shows urgency without Finance doing mental math on payment terms | LOW | Client-side: `dueDate = invoiceDate + netDays`; stored as ISO string on `rfps` doc |
| Proof-of-procurement link on Timeline | Clicking a PO timeline surfaces the document link alongside procurement history | LOW | Extend existing `showTimeline()` to render `proof_url` if present |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Firebase Storage for proof documents | Familiar; already in the stack | User explicitly rejected due to data cost concern; Storage charges per GB and per operation at scale | Store Google Drive share link as a plain string field on the PO; zero storage cost |
| Google Drive Picker API (in-app file picker) | Polished UX; user never leaves the app to copy a link | Requires Google Cloud Console setup (OAuth 2.0 Client ID, Picker API enabled). Requires a second OAuth flow in-browser separate from Firebase Auth. Requires CSP expansion: `frame-src docs.google.com drive.google.com accounts.google.com` and `script-src apis.google.com accounts.google.com`. Drive.file scope only grants access to files the user explicitly opens through the Picker — not a shared company folder. HIGH setup complexity for marginal UX gain over paste-a-link. | Simple text input — Procurement copies the Drive share URL and pastes it. Zero OAuth, zero CSP changes, zero Google Cloud setup |
| Automated payment reminders / due-date notifications | Finance wants alerts when a payable is due | Email notifications are explicitly out of scope per PROJECT.md | Color-coded "Due Soon" and "Overdue" badges in the payables list using client-side date comparison |
| Full AP automation (auto-match invoices to POs) | Reduces manual data entry | Over-engineering for current scale and team; manual verification is intentional in this workflow | Structured RFP form fields capture the same data manually with a clear audit trail |
| RFP creation by Finance | Finance may want to initiate payment requests | Violates separation of duties: Finance approves payment, Procurement requests it | Finance role records payments against existing RFPs; only Procurement creates RFPs |

---

## Feature Behaviour: Detailed Analysis

### Feature 1: Supplier Search Bar

**Approach: client-side filter on loaded data, not a server-side Firestore query.**

The `suppliersData` array is already fully loaded and TTL-cached at session start (see `loadSuppliers()` in `procurement.js`). Applying a search means filtering that in-memory array before slicing for pagination. This is the same pattern already used in `projects.js` and `services.js`.

**Fields searched:** `supplier_name` (primary) and `contact_person` (secondary). Both are free-text string fields already in the Firestore `suppliers` schema. A single text input searches across both simultaneously via a case-insensitive `includes()` check.

**UX:** One text input above the suppliers table (and above the "Add Supplier" button). On `input` event: filter `suppliersData` → reset `suppliersCurrentPage` to 1 → call `renderSuppliersTable()`. No debounce needed at this data scale. Clearing the input restores the full list.

**Pagination interaction:** The filtered subset drives pagination totals — filtered count shown in `pagination-info`, pages calculated from filtered length. The `renderSuppliersTable()` function already accepts the slice bounds; change the source array from raw `suppliersData` to `getFilteredSuppliers()` (or inline `.filter()`) to keep the rest of the function unchanged.

**What does NOT change:** Sorting (alphabetical by supplier_name), add/edit/delete flows, the purchase history modal, or any Firestore query. This is purely a display-layer filter.

---

### Feature 2: Proof of Procurement (Google Drive Link)

**Approach: paste-a-link (recommended over Google Picker API).**

Procurement manually copies a share link from Google Drive (or any cloud storage: OneDrive, Dropbox, a direct URL) and pastes it into a text field in the PO status update modal. The URL is stored as `proof_url` (string) on the `pos` Firestore document.

**UX flow:**
1. Procurement opens a PO in Procurement > PO Tracking.
2. The existing "Edit PO" or status-update modal gains an optional "Proof of Procurement" field: a text input with a placeholder ("Paste Google Drive share link...") and an adjacent "Open" button that calls `window.open(url)`.
3. The field is shown regardless of PO status but is most relevant when status is "Procured" or "Delivered".
4. On save, `proof_url` is written to the `pos` doc alongside any other updated fields.
5. Wherever a PO is displayed (Finance PO tab, Procurement PO Tracking table row, Timeline modal), a "View Document" link appears if `proof_url` is set.

**Why not Google Picker API (detailed):**
- Requires a second OAuth flow. The user is already signed in with Firebase Auth (email/password). Google Picker requires Google Identity Services, meaning the user must also authenticate their Google account in the same browser session. Two separate auth states to manage.
- Requires Google Cloud Console configuration: enable Picker API, create an OAuth 2.0 Client ID, register `https://yourapp.netlify.app` under Authorized JavaScript Origins.
- Requires CSP header expansion in Netlify config: add `frame-src https://docs.google.com https://drive.google.com https://accounts.google.com` and `script-src https://apis.google.com https://accounts.google.com`. This modifies the hardened CSP from v2.5 Security Audit.
- The `drive.file` scope means the Picker only shows files the user has opened via the app before — a shared company Procurement folder would require `drive.readonly` scope, which triggers Google's sensitive scope verification process.
- All of this for a feature whose core value is "attach a URL to a PO." The paste-link approach achieves 100% of the functional value.

**Firestore change:** Add `proof_url` (string, optional) to `pos` documents. Backward compatible — existing POs without the field simply show no link. No migration, no new collection, no Security Rules change beyond ensuring the `pos` write rules already allow Procurement to update this field (they do).

---

### Feature 3: Request for Payment (RFP) and Payables Tracking

**How an RFP fits the existing workflow:**

After a PO moves to "Procured" or "Delivered", the supplier presents an invoice. Procurement creates an RFP in the system to formally request that Finance process payment. Finance uses the payables view to track what is owed, when it is due, and how much has been paid. This extends the existing P2P chain: MRF → PR → PO → **RFP → Payment**.

**Standard RFP fields (informed by AP domain research):**

| Field | Type | Notes |
|-------|------|-------|
| `rfp_id` | string | Sequential: `RFP-YYYY-###` |
| `po_id` | string | Foreign key to `pos` collection |
| `pr_id` | string | Denormalized from PO for display without a join |
| `mrf_id` | string | Denormalized from PO for full traceability |
| `supplier_name` | string | Denormalized from PO |
| `total_po_amount` | number | Snapshot of PO total at RFP creation |
| `invoice_number` | string | Supplier's invoice reference number |
| `invoice_date` | string (ISO date) | Date on the supplier's invoice |
| `amount_requested` | number | Amount being requested (may differ from PO total for partial deliveries) |
| `payment_terms` | string | e.g., "Net 30", "50% down 50% on delivery", free text |
| `due_date` | string (ISO date) | Calculated or manually entered |
| `payment_status` | string | `Pending` / `Partially Paid` / `Fully Paid` |
| `total_paid` | number | Running sum across all payment records |
| `payment_records` | array | Each entry: amount, date_paid, method, reference, recorded_by |
| `notes` | string | Optional; special terms, split payment reason |
| `submitted_by` | string | Display name of Procurement user who created the RFP |
| `date_submitted` | Firestore Timestamp | Auto-set on creation |

**Staggered / partial payment tracking:**

Each `rfps` document stores a `payment_records` array field. Each element:
```json
{
  "amount": 50000,
  "date_paid": "2026-03-15",
  "method": "Bank Transfer",
  "reference": "TXN-20260315-001",
  "recorded_by": "finance_user_name",
  "recorded_at": "2026-03-15T10:30:00.000Z"
}
```

**Why array, not sub-collection:** Payment records per RFP will be small in practice (1–5 entries). An array avoids an extra Firestore listener per RFP, is simpler to write and read in one document fetch, and is consistent with the existing `items_json` pattern on MRFs/PRs. The full RFP document including all payment history loads in a single read.

**Payment status computation:**
- `Pending`: no payment records yet (or `total_paid == 0`)
- `Partially Paid`: `total_paid > 0 AND total_paid < amount_requested`
- `Fully Paid`: `total_paid >= amount_requested`

Finance does NOT manually set this status. When Finance records a payment via the "Record Payment" form, the system recalculates `total_paid` and updates `payment_status` atomically using Firestore `updateDoc`. This prevents status/balance inconsistency.

**What triggers a payable to be "closed":** A payable is closed when `total_paid >= amount_requested`. The system auto-sets `payment_status = 'Fully Paid'` at that point. Closed RFPs move out of the default Finance payables view (they can still be found via a "Show Paid" toggle or historical view).

**Who does what:**
- Procurement role: creates RFP linked to a PO (PO must be `Procured` or `Delivered`)
- Finance role: views payables list, opens RFP detail, records payments
- Operations Admin / Super Admin: view-only on payables; no payment recording

**Finance payables view:** New section in Finance tab (new sub-tab or within the existing PO section). Columns: RFP ID, PO ID, Supplier, Invoice #, Amount Requested, Total Paid, Balance, Due Date, Status badge. Default filter: `payment_status != 'Fully Paid'`. Clicking a row opens a detail modal: full RFP fields + payment history table + "Record Payment" form (Finance only).

---

## Feature Dependencies

```
[Supplier Search]
    reads──> suppliersData (already in memory, no new dependency)

[Proof of Procurement]
    writes──> pos document (po_id must already exist)
    visible in──> Finance PO tab, Procurement PO Tracking, Timeline modal

[Request for Payment (RFP)]
    requires──> pos document (po_id must exist, status Procured or Delivered)
    requires──> rfps collection + Firestore Security Rules
    enables──> Finance payables view

[Payment Records (partial payments)]
    requires──> rfps document (embedded as array, no sub-collection needed)
    updates──> rfps.total_paid and rfps.payment_status
```

### Dependency Notes

- **Supplier search has no new dependencies.** It operates on cached in-memory data. Implement first — lowest risk, highest confidence.
- **Proof of procurement has no new collections.** It is a field addition to `pos`. No Security Rules change. Implement second — low risk, high value.
- **RFP requires a new `rfps` collection and Security Rules.** Per the established pattern in CLAUDE.md: add Security Rules FIRST before writing any code that creates documents. Finance will get permission errors otherwise even as Super Admin.
- **RFP creation must be gated on PO status.** The "Create RFP" action should only appear for POs with `procurement_status` of `Procured` or `Delivered`. Enforce in UI (conditional button render) and optionally in Security Rules (allow `rfps` create only when the referenced `pos` doc has the right status — but client-side gating is sufficient for this app's threat model).
- **Payables view depends on the `rfps` collection existing.** No Finance UI can be built before the collection and rules are in place.

---

## MVP Definition

### Launch With (v3.2 — this milestone)

- [ ] Supplier search bar — client-side filter by name and contact person, resets pagination on each keystroke
- [ ] Proof of procurement link — `proof_url` field on `pos` doc, paste-a-link input in PO modal, "View Document" link shown in Finance and Procurement views
- [ ] RFP creation form — Procurement creates RFP from an eligible PO; captures invoice number, invoice date, amount requested, payment terms, due date, notes
- [ ] RFP list view for Finance — shows open payables with balance, due date, status badge
- [ ] Record payment flow — Finance enters amount + date + method + reference; system updates `total_paid` and derives `payment_status`
- [ ] Partial vs full payment — system derives `Partially Paid` / `Fully Paid` from payment records; no manual status toggle

### Add After Validation (v3.x)

- [ ] Overdue badge — color-coded indicator when `due_date < today` AND `payment_status != 'Fully Paid'`; client-side date comparison, no Firestore query
- [ ] RFP event on procurement timeline — show RFP creation and payment events in the existing `showTimeline()` modal
- [ ] CSV export of payables — Finance exports outstanding RFPs list via existing `downloadCSV()` utility

### Future Consideration (v4.0+)

- [ ] Google Drive Picker API — only if paste-a-link proves too friction-heavy in practice for Procurement users
- [ ] Payables summary on Finance dashboard scoreboard — total outstanding amount across all open RFPs
- [ ] Per-supplier payables aggregation — how much is owed to each supplier across all open RFPs
- [ ] RFP approval workflow — if Finance needs a second sign-off before payment is recorded

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Supplier search (name + contact person) | HIGH | LOW | P1 |
| Proof of procurement — paste link + store URL | HIGH | LOW | P1 |
| RFP creation form | HIGH | MEDIUM | P1 |
| Finance payables list (open RFPs) | HIGH | MEDIUM | P1 |
| Record payment / partial tracking | HIGH | MEDIUM | P1 |
| Payment due date display and calculation | MEDIUM | LOW | P1 |
| Overdue badge (client-side date check) | MEDIUM | LOW | P2 |
| RFP event on procurement timeline | LOW | LOW | P2 |
| CSV export of payables | MEDIUM | LOW | P2 |
| Google Picker API | LOW | HIGH | P3 |
| Payables dashboard scoreboard | MEDIUM | LOW | P3 |
| Per-supplier payables aggregation | MEDIUM | MEDIUM | P3 |

**Priority key:**
- P1: Must have for v3.2 launch
- P2: Add once v3.2 core is stable
- P3: Future consideration only

---

## Complexity Notes for Roadmap Phasing

**Supplier search — 1 phase:**
Pure client-side display logic. Add one `<input>` element, one `input` event listener, one filter function. Touches `procurement.js` only. No Firestore, no Security Rules, no new collection. Ideal as the first phase of v3.2.

**Proof of procurement — 1 phase:**
One optional string field on an existing document. Add one input to the PO edit modal, one "View Document" link in 2–3 display locations (Procurement PO Tracking, Finance PO tab, Timeline). Touches `procurement.js` and `finance.js`. No new collection, no Security Rules change.

**RFP + payables system — 3–4 phases:**
New collection (`rfps`), new Security Rules, new Firestore sequential ID generation (`RFP-YYYY-###`), RFP creation form (Procurement), Finance payables view, record-payment modal, `total_paid` / `payment_status` computation. Self-contained but the largest feature in this milestone. Should be split into: (a) Security Rules + collection design, (b) RFP creation in Procurement, (c) Finance payables view + record payment.

**Google Drive Picker — out of scope for v3.2:**
OAuth setup, CSP changes, second auth state, Picker library loading, user Google account requirement. Complexity does not justify the marginal UX improvement over paste-a-link for the current team size and usage volume.

---

## Sources

- Google Drive Picker API official overview: https://developers.google.com/workspace/drive/picker/guides/overview
- Google Drive Picker web app integration guide (DEV Community): https://dev.to/googleworkspace/easily-integrate-google-drive-picker-into-your-web-apps-2304
- Google Drive API scopes reference: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- Google Drive Picker CSP requirements (WebSearch finding, MEDIUM confidence): includes `frame-src docs.google.com drive.google.com accounts.google.com` and `script-src apis.google.com accounts.google.com`
- Accounts payable full cycle process (Medius): https://www.medius.com/blog/full-process-accounts-payable-cycle/
- AP terms and payment tracking glossary (NetSuite): https://www.netsuite.com/portal/resource/articles/accounting/accounts-payable-terms.shtml
- Procure-to-pay process overview (Pipefy): https://www.pipefy.com/blog/procure-to-pay/
- Client-side table search pattern (DEV Community): https://dev.to/michelc/search-and-filter-a-table-with-javascript-28mi

---
*Feature research for: CLMC Procurement System v3.2 — Supplier Search, Proof of Procurement, Payables Tracking*
*Researched: 2026-03-13*
