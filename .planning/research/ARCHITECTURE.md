# Architecture Research

**Domain:** Zero-build static SPA — procurement management (vanilla JS + Firebase Firestore)
**Researched:** 2026-03-13
**Confidence:** HIGH (based on direct codebase inspection + official Google Drive API docs)

---

## Feature Integration Analysis

### Feature 1: Supplier Search Bar

**Question:** Client-side filter on loaded data, or new Firestore query?

**Answer: Client-side filter on `suppliersData[]` — zero new Firestore queries needed.**

Rationale from code inspection:

- `loadSuppliers()` (procurement.js:2509) already uses `onSnapshot` to load the entire `suppliers` collection into `suppliersData[]`
- The collection is small (dozens to low hundreds of suppliers) and fully resident in memory
- `renderSuppliersTable()` already slices `suppliersData` for pagination
- A new Firestore query for search would be wasteful: Firestore has no `contains` operator, so partial-name matching requires either client-side filtering or a third-party search index

**Integration point: `renderSuppliersTable()` function (procurement.js:2537)**

The search filter sits between `suppliersData[]` (source of truth) and the pagination slice. A module-level `let supplierSearchTerm = ''` variable gates the slice. The render pipeline becomes:

```
suppliersData[]
    ↓ filter by supplierSearchTerm (name + contact_person, case-insensitive)
filteredSuppliersData (local const)
    ↓ slice for current page
pageItems[]
    ↓ render rows
```

**Where it lives in procurement.js:**

1. HTML: add a search `<input>` above the suppliers table in the `render()` string (line ~238 in the suppliers-section)
2. State: add `let supplierSearchTerm = '';` alongside existing supplier state variables (line ~19 area)
3. New function: `filterSuppliers(term)` — sets `supplierSearchTerm`, resets `suppliersCurrentPage = 1`, calls `renderSuppliersTable()`
4. Expose on window: `window.filterSuppliers = filterSuppliers` in `attachWindowFunctions()` (line ~115 area)
5. Modify `renderSuppliersTable()`: apply filter before pagination slice

**Search scope:** `supplier_name` and `contact_person` fields — the two columns users would naturally search by. The filter in `renderSuppliersTable` is the same pattern already used for client-side filtering in `filterPRPORecords()` in the same file. No new Firestore Security Rules required — suppliers collection is already readable by all active users.

**Style match:** The existing Projects filter bar (search input + sort dropdowns) in `projects.js` is the reference. The v3.1 client search bar (ce0561b commit) also provides a styled pattern.

---

### Feature 2: Proof of Procurement Document Upload

**Question:** Which approach fits a zero-build static SPA?

**Architecture verdict: Manual link paste — recommended. Google Drive Picker — viable but adds OAuth complexity with no clear benefit given the workflow.**

**Option A: Google Drive Picker API (OAuth popup)**

What it actually does (verified against official docs): The Google Picker is a *file selector* — it opens a "File Open" dialog for files already in Drive. It does NOT upload files. To upload a new proof document, the user would need to upload it to Drive separately, then use the Picker to select it and get a shareable URL. The app would then need to call the Drive API to construct a shareable link — an additional API call with the same OAuth token.

Scope required: `https://www.googleapis.com/auth/drive.file` or `drive.readonly`.

Setup overhead: Google Cloud Console project, OAuth 2.0 Client ID, API key, Authorized JavaScript Origins for the Netlify domain. The OAuth popup uses Google Identity Services (tokenClient pattern, replacing deprecated gapi.auth2). CORS constraint: the Netlify deployment must not set `Cross-Origin-Opener-Policy: same-origin` on the HTML page — this would silently break the OAuth popup.

**Verdict on Option A:** Over-engineered for the workflow. The Picker does not upload — the user still manually uploads to Drive first. Net benefit over Option B is an auto-populated link vs. manual copy-paste, which does not justify the Google Cloud Console setup, OAuth scope, and CORS risk at this application's scale.

**Option B: Manual paste of Google Drive share link — recommended**

The workflow:
1. Procurement user uploads proof document to a shared Google Drive folder (outside the app)
2. They copy the shareable link from Drive
3. They paste the link into a text field on the PO detail in the app
4. App stores the link on the PO document in Firestore

This is the correct choice because:
- Zero new dependencies
- No OAuth setup, no Google Cloud Console changes, no CORS risk
- Drive is already the team's document storage — this workflow is familiar
- The "upload to Drive, get link" step takes 10 seconds and is within the existing workflow
- The stored link opens in a new browser tab when clicked — no additional integration needed

**Option C: Service account** — requires a backend server. Not applicable to this architecture.

**Integration point: `pos` collection document**

Add a `proof_url` field (string, nullable) to PO documents. No schema migration needed — Firestore is schemaless, and legacy POs simply have no `proof_url` field.

**UI integration: Procurement > MRF Records tab (PO Tracking section)**

The "Upload Proof" action appears on a PO row. The implementation path:

1. A button on each PO row: "Add Proof" (if no proof_url) or "View Proof" (if proof_url exists), plus an edit icon
2. Clicking "Add Proof" opens a small modal or inline edit: a text input for the Drive URL + Save button
3. On save: `updateDoc(doc(db, 'pos', poId), { proof_url: url.trim(), proof_uploaded_at: serverTimestamp(), proof_uploaded_by: currentUser.uid })`
4. "View Proof": `window.open(proofUrl, '_blank')`

**Security Rules change required:** None. The `pos` collection update rule already allows `super_admin`, `finance`, and `procurement`. Adding `proof_url` to an update doc does not require a new rule — it is the same updateDoc permission already in use.

**Firestore field addition on PO document:**

```
pos/{poId}
  + proof_url: string | null          // Google Drive shareable link
  + proof_uploaded_at: timestamp | null
  + proof_uploaded_by: string | null  // uid of uploader
```

---

### Feature 3: Request for Payment (RFP) + Payables Tracking

**Question:** New collection? How does it relate to POs? Finance view shape? Security Rules?

**Architecture verdict: New `rfps` collection linked to POs by `po_id` FK. Finance gets a new "Payables" tab.**

#### Data Model

RFP is the bridge between a delivered PO and actual payment. One PO maps to one RFP (one-to-one at current scope).

```
rfps/{rfpId}
  rfp_id: string           // RFP-YYYY-### (sequential, same pattern as PO/PR IDs)
  po_id: string            // FK to pos collection
  pr_id: string            // denormalized from PO for display
  mrf_id: string           // denormalized from PO for display
  supplier_name: string    // denormalized from PO
  total_amount: number     // matches PO total_amount
  payment_terms: string    // "Net 30" | "Net 60" | "Upon Delivery" | freetext
  due_date: string         // ISO date string
  status: string           // "Pending" | "Approved" | "Paid" | "Rejected"
  submitted_by: string     // uid of submitting user
  submitted_at: timestamp
  approved_by: string | null
  approved_at: timestamp | null
  paid_at: timestamp | null
  notes: string | null
  project_code: string     // denormalized for role-scoped filtering
  service_code: string     // denormalized for role-scoped filtering
  department: string       // 'projects' | 'services' — for dept filter dropdown
```

**Why denormalize project/service codes:** Every collection that needs role-scoped list queries must carry `project_code` or `service_code`. The existing pattern (prs, pos, transport_requests) consistently denormalizes these fields. Firestore Security Rules use `resource.data.project_code` directly for operations_user scoping.

**Document hierarchy:**

```
mrfs/{mrfId}
    └── prs/{prId}
            └── pos/{poId}  ← proof_url field added here
                    └── rfps/{rfpId}  ← new collection, po_id FK
```

The RFP is created *after* a PO exists and has been delivered (`procurement_status = 'Delivered'`). Finance surfaces RFPs for approval and payment tracking.

#### UI Integration — Procurement Side

In the PO Tracking table (Procurement > MRF Records tab), a "Submit RFP" button appears on PO rows where:
- `procurement_status === 'Delivered'`
- No RFP document exists for that PO yet (check by po_id)

Clicking opens a modal to fill in payment terms and due date, then creates the RFP document.

The Procurement view also needs to track which POs already have RFPs. This is done by loading rfp po_id values alongside PO data in `loadPOTracking()`, building a `Set` of `po_id` values with existing RFPs, and using that set to conditionally render the "Submit RFP" button.

#### UI Integration — Finance Side

Finance currently has three tabs: Pending Approvals, Purchase Orders, Historical Data. A fourth tab "Payables" is added, following the exact same tab pattern in `finance.js`.

The Payables tab contains:
- Scoreboard row: Total outstanding amount, # pending RFPs, # approved (awaiting payment), # paid this month
- RFP table columns: RFP ID, PO ID, Supplier, Amount, Payment Terms, Due Date, Status, Actions
- Row actions: "Approve" (Pending → Approved), "Mark Paid" (Approved → Paid), "Reject" (Pending → Rejected)
- Filter by status (All / Pending / Approved / Paid), department filter (All / Projects / Services), supplier search

The Payables tab follows the same `onSnapshot` listener pattern as Pending Approvals.

#### Security Rules

```javascript
// Add after the pos block in firestore.rules

// =============================================
// rfps collection (Request for Payment)
// =============================================
match /rfps/{rfpId} {
  // All active users can read
  allow read: if isActiveUser();

  // Create: procurement submits RFPs; finance and super_admin can also create
  allow create: if hasRole(['super_admin', 'finance', 'procurement']);

  // Update: finance approves/marks paid; procurement can resubmit; super_admin unrestricted
  allow update: if hasRole(['super_admin', 'finance', 'procurement']);

  // Delete: super_admin only
  allow delete: if hasRole(['super_admin']);
}
```

**Deployment timing:** Security Rules for `rfps` must be deployed *before* any UI code attempts to read or write the collection. This is the same requirement documented in CLAUDE.md for all new collections.

---

## System Overview

```
Browser (Vanilla JS ES6 Modules)
┌──────────────────────────────────────────────────────────┐
│  router.js  ──hash routing──>  view modules              │
│                                                          │
│  procurement.js (3,761 lines)                            │
│  ├── Tab: MRF Processing          (unchanged)            │
│  ├── Tab: Supplier Management  <── SEARCH BAR ADDED      │
│  └── Tab: MRF Records          <── PROOF URL + RFP ADDED │
│            └── PO Tracking section                       │
│                ├── proof_url column + "Add Proof" button  │
│                └── "Submit RFP" button on Delivered POs  │
│                                                          │
│  finance.js (1,077 lines)                                │
│  ├── Tab: Pending Approvals       (unchanged)            │
│  ├── Tab: Purchase Orders         (unchanged)            │
│  ├── Tab: Historical Data         (unchanged)            │
│  └── Tab: Payables  [NEW TAB]                            │
│            ├── RFP table (onSnapshot on rfps)            │
│            └── Approve / Mark Paid / Reject actions      │
└──────────────────────────────────────────────────────────┘
         │
         │ Firestore SDK v10.7.1 (CDN)
         ▼
Firebase Firestore (clmc-procurement)
┌──────────────────────────────────────────────────────────┐
│  suppliers    unchanged — filter is purely client-side   │
│  pos          + proof_url, proof_uploaded_at, _by fields │
│  rfps         [NEW COLLECTION]                           │
│  mrfs / prs / transport_requests  unchanged              │
└──────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

| Component | Responsibility | Change in v3.2 |
|-----------|----------------|----------------|
| `procurement.js` Supplier tab | CRUD + pagination for suppliers | Add search `<input>`, `supplierSearchTerm` state, `filterSuppliers()` window fn, filter in `renderSuppliersTable()` |
| `procurement.js` MRF Records tab | PO tracking + PR-PO records | Add proof_url column/button on PO rows; "Submit RFP" button on Delivered POs; RFP po_id tracking Set |
| `finance.js` | Finance approval + PO view + expense lists | Add Payables tab with `rfps` onSnapshot listener, render function, approval/payment actions |
| `firestore.rules` | Security enforcement for all collections | Add `rfps` collection block |
| `pos` Firestore documents | PO lifecycle | Add `proof_url`, `proof_uploaded_at`, `proof_uploaded_by` optional fields |
| `rfps` Firestore collection | RFP/payables lifecycle | New collection — auto-created on first `addDoc` |

---

## Architectural Patterns

### Pattern 1: Client-Side Filter on Resident Data

**What:** Load entire collection into module-level array via `onSnapshot`, filter in-memory before rendering/paginating.

**When to use:** Collection is small, already loaded for other purposes, Firestore has no partial-string-match operator.

**Already used in this codebase:** `filterPRPORecords()` filters `allPRPORecords[]` by project code, date, status. `applyPODeptFilter()` filters `poData[]` by department.

**Trade-offs:** Works at current scale. If suppliers grow to thousands, a dedicated search service (Algolia, Typesense) would be needed. For v3.2 scale, client-side is correct.

```javascript
// Follow this exact pattern — mirrors filterPRPORecords()
let supplierSearchTerm = '';

function filterSuppliers(term) {
    supplierSearchTerm = term.toLowerCase().trim();
    suppliersCurrentPage = 1;  // Reset to page 1 on new search
    renderSuppliersTable();
}

// Inside renderSuppliersTable(), before pagination:
const filtered = supplierSearchTerm
    ? suppliersData.filter(s =>
        s.supplier_name.toLowerCase().includes(supplierSearchTerm) ||
        s.contact_person.toLowerCase().includes(supplierSearchTerm)
      )
    : suppliersData;

const totalPages = Math.ceil(filtered.length / suppliersItemsPerPage);
const startIndex = (suppliersCurrentPage - 1) * suppliersItemsPerPage;
const pageItems = filtered.slice(startIndex, startIndex + suppliersItemsPerPage);
```

### Pattern 2: New Tab in Existing View File

**What:** Add a fourth tab to `finance.js` by (a) adding a tab button to the `render()` HTML string, (b) adding a new `<section>`, (c) adding module-level state, (d) registering an `onSnapshot` listener in `init()` lazily, (e) adding a render function.

**When to use:** The new feature belongs to the same role (Finance), shares the same view lifecycle, and doesn't warrant a new route.

**Already used:** `finance.js` has three tabs with this exact pattern. Payables is a fourth instance.

**Lazy loading guard (matches existing TTL cache pattern):**

```javascript
let rfpsData = [];
let _rfpsCachedAt = 0;
const RFP_TTL_MS = 5 * 60 * 1000;
let _rfpListenerActive = false;  // mirrors _mrfListenerActive in procurement.js

async function loadRFPs() {
    if (rfpsData.length > 0 && (Date.now() - _rfpsCachedAt) < RFP_TTL_MS) {
        renderRFPsTable();
        return;
    }
    if (_rfpListenerActive) return;
    _rfpListenerActive = true;
    const listener = onSnapshot(collection(db, 'rfps'), (snapshot) => {
        rfpsData = [];
        snapshot.forEach(doc => rfpsData.push({ id: doc.id, ...doc.data() }));
        _rfpsCachedAt = Date.now();
        renderRFPsTable();
    });
    listeners.push(listener);
}
```

### Pattern 3: External Link Storage on Firestore Document

**What:** Store a URL string on an existing document. Display as a clickable link or "View" button. Edit via a small modal with a text input.

**When to use:** Document storage is external (Google Drive, SharePoint), app only needs to reference it.

**XSS note:** URLs stored in Firestore and rendered via template literals must pass through `escapeHTML()` before injection into `innerHTML`. The existing `escapeHTML()` utility in `utils.js` handles this.

```javascript
// Save
await updateDoc(doc(db, 'pos', poId), {
    proof_url: url.trim(),
    proof_uploaded_at: serverTimestamp(),
    proof_uploaded_by: auth.currentUser?.uid || null
});

// Render in table row (escapeHTML on the URL prevents XSS)
const proofCell = po.proof_url
    ? `<a href="${escapeHTML(po.proof_url)}" target="_blank" rel="noopener noreferrer">View Proof</a>`
    : `<button onclick="window.showAddProofModal('${po.id}')">Add Proof</button>`;
```

---

## Data Flow

### Supplier Search Flow

```
User types in search input
    ↓ oninput → window.filterSuppliers(this.value)
filterSuppliers()
    ↓ sets supplierSearchTerm, resets suppliersCurrentPage = 1
renderSuppliersTable()
    ↓ filters suppliersData[] in memory (no network call)
    ↓ slices for current page
    ↓ updates tbody innerHTML + pagination controls
DOM update complete
```

### Proof of Procurement Flow

```
Procurement user: Procurement > MRF Records > PO Tracking
    ↓ PO row shows "Add Proof" button (no proof_url field)
User clicks "Add Proof"
    ↓ Modal opens with URL text input
User pastes Google Drive shareable link, clicks Save
    ↓ window.saveProofUrl(poId, url)
    ↓ updateDoc(pos/poId, { proof_url, proof_uploaded_at, proof_uploaded_by })
onSnapshot fires → poData[] updates → renderPOTrackingTable()
    ↓ Row now shows "View Proof" link (opens Drive URL in new tab)
```

### RFP Submission and Approval Flow

```
Procurement: Procurement > MRF Records > PO Tracking
    ↓ PO with procurement_status='Delivered' and no existing RFP shows "Submit RFP"
User fills payment terms + due date in modal
    ↓ window.submitRFP(poId)
    ↓ addDoc(rfps, { rfp_id, po_id, pr_id, mrf_id, supplier_name, total_amount,
                     payment_terms, due_date, status: 'Pending', submitted_by, submitted_at,
                     project_code, service_code, department })
Finance: Finance > Payables tab
    ↓ onSnapshot on rfps → rfpsData[] updates → renderRFPsTable()
    ↓ New RFP appears with status badge 'Pending'
Finance approves: window.approveRFP(rfpId)
    ↓ updateDoc(rfps/rfpId, { status: 'Approved', approved_by, approved_at })
Finance marks paid: window.markRFPPaid(rfpId)
    ↓ updateDoc(rfps/rfpId, { status: 'Paid', paid_at: serverTimestamp() })
```

---

## New vs Modified Components

### New

| Component | Type | Location |
|-----------|------|----------|
| `rfps` Firestore collection | Database | Auto-created on first `addDoc` call |
| `rfps` Security Rules block | Rules | `firestore.rules` — after `pos` block |
| Payables tab HTML | View | `finance.js` `render()` string |
| `loadRFPs()` / `renderRFPsTable()` | Functions | `finance.js` |
| `approveRFP()` / `markRFPPaid()` / `rejectRFP()` | Functions | `finance.js` |
| `submitRFP()` | Function | `procurement.js` |
| `showAddProofModal()` / `saveProofUrl()` | Functions | `procurement.js` |

### Modified

| Component | Change | Location |
|-----------|--------|----------|
| `procurement.js` `render()` | Add search `<input>` above suppliers table | ~line 238 |
| `procurement.js` global state | Add `let supplierSearchTerm = ''` | ~line 19 |
| `procurement.js` `attachWindowFunctions()` | Add `filterSuppliers`, `saveProofUrl`, `showAddProofModal`, `submitRFP` | ~line 96 |
| `procurement.js` `renderSuppliersTable()` | Apply filter before pagination slice | line 2537 |
| `procurement.js` PO Tracking table render | Add proof_url column; add "Submit RFP" on Delivered POs | PO row template |
| `procurement.js` `loadPOTracking()` | Load existing RFP po_ids to build a Set for button gating | loadPOTracking function |
| `finance.js` tab nav HTML | Add "Payables" tab button | `render()` string |
| `finance.js` global state | Add `rfpsData`, `_rfpsCachedAt`, `_rfpListenerActive`, filter state | ~line 47 area |
| `finance.js` `init()` | Register Payables tab activation (lazy load on first tab visit) | `init()` function |
| `finance.js` `attachWindowFunctions()` | Add `approveRFP`, `markRFPPaid`, `rejectRFP`, `loadRFPs` | ~line 153 |
| `firestore.rules` | Add `rfps` collection block | After `pos` block |

---

## Build Order (Dependency-Aware)

The three features have no hard dependencies on each other. This order minimizes risk:

**Phase 1: Supplier Search** (lowest risk, zero new infrastructure)
- Scope: `procurement.js` only, no Firestore changes, no Security Rules changes
- Self-contained: add state var, new function, modify one existing function, update render HTML
- Risk: none — worst case the filter doesn't work, existing table is unaffected

**Phase 2: Proof of Procurement Link** (low risk, minimal Firestore change)
- Scope: `procurement.js` PO Tracking table, optional fields on `pos` documents
- No new collection, no Security Rules change
- Single `updateDoc` call; backward compatible (legacy POs have no `proof_url`, code checks for its existence)
- Can be implemented and tested before RFP exists

**Phase 3: RFP + Payables Tracking** (medium complexity, new collection + new tab)
- Scope: new `rfps` collection, new Security Rules block, new tab in `finance.js`, new window functions in both view files
- Security Rules must be deployed first (before any UI code runs)
- Build last because it launches from the PO Tracking UI (needs proof_url work to be stable first, and shares the PO row)
- The sequential ID generator (`generateSequentialId` or inline pattern) for `RFP-YYYY-###` follows the exact same approach as `PR-YYYY-###` and `PO-YYYY-###`

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Google Drive | Shareable URL paste — no API integration | User uploads to Drive manually, copies the share link, pastes into the app's text input. URL stored as a plain string in Firestore. No OAuth, no API key, no Cloud Console setup required. Clicking "View Proof" opens the URL in a new tab via `window.open`. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `procurement.js` ↔ `rfps` collection | `addDoc` on RFP submit; `getDocs` to build existing-RFP Set | Procurement creates RFPs |
| `finance.js` ↔ `rfps` collection | `onSnapshot` for list; `updateDoc` on approve/mark paid/reject | Finance manages RFP lifecycle |
| `procurement.js` ↔ `pos` collection | `updateDoc` to add `proof_url` fields | Existing update permission covers this; no rule change |
| Supplier search ↔ `suppliers` collection | Read-only; filter is in-memory only | No Firestore interaction during search |

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Firestore Query for Supplier Search

**What people do:** Add a Firestore query with `where('supplier_name', '>=', searchTerm)` for partial name matching.

**Why it's wrong:** Firestore range queries only match prefixes (starts-with), not substrings. "ABC Corp" would not match a search for "corp". The `suppliers` collection is already fully loaded via `onSnapshot` — a second query is wasteful and returns worse results.

**Do this instead:** Filter `suppliersData[]` in memory inside `renderSuppliersTable()`.

### Anti-Pattern 2: Google Drive Picker API for Document Upload

**What people do:** Integrate the Google Drive Picker for a "professional" file picker experience.

**Why it's wrong:** The Picker is a file *selector* for files already in Drive — it does not upload. Users still must upload to Drive first. The OAuth setup (Google Cloud Console, Client ID, Authorized Origins) adds maintenance overhead, and the CORS constraint (`Cross-Origin-Opener-Policy`) could silently break the OAuth popup after a Netlify headers change. Net result is identical to Option B (a Drive link stored in Firestore) with significantly more complexity.

**Do this instead:** URL paste input. Same end result with zero infrastructure overhead.

### Anti-Pattern 3: Standalone View File for RFPs

**What people do:** Create `app/views/rfps.js` as a standalone view with its own hash route.

**Why it's wrong:** RFP submission is a Procurement action launched from the PO row. RFP approval/tracking is a Finance action. Neither warrants a standalone page — both are modal or tab-level interactions that belong within their existing host views.

**Do this instead:** RFP submission logic in `procurement.js`. RFP list and approval in `finance.js` as a new Payables tab.

### Anti-Pattern 4: Not Resetting Page Number on Filter Change

**What people do:** Apply the supplier search filter but leave `suppliersCurrentPage` at its current value.

**Why it's wrong:** If the user is on page 3 and types a search term that returns 5 total results, page 3 is empty — no results appear and there is no visible feedback.

**Do this instead:** Always set `suppliersCurrentPage = 1` before calling `renderSuppliersTable()` in `filterSuppliers()`.

### Anti-Pattern 5: Deploying RFP UI Before Security Rules

**What people do:** Add the Payables tab UI and window functions before updating `firestore.rules`.

**Why it's wrong:** Firestore denies all access by default. Every read/write to `rfps` will throw "Missing or insufficient permissions" — even for Super Admin. This is a known footgun documented in CLAUDE.md.

**Do this instead:** Add the `rfps` Security Rules block to `firestore.rules` and deploy as the first step of Phase 3, before writing any UI code that touches the collection.

---

## Sources

- Direct code inspection: `app/views/procurement.js` (loadSuppliers at line 2509, renderSuppliersTable at line 2537, attachWindowFunctions at line 96, filterPRPORecords pattern)
- Direct code inspection: `app/views/finance.js` (tab structure, onSnapshot listener pattern, TTL cache guard pattern)
- Direct code inspection: `firestore.rules` (role structure, list scoping pattern, new-collection template block at lines 1-39)
- Direct code inspection: `.planning/PROJECT.md` (v3.2 milestone requirements, current codebase state)
- [Google Drive Picker API Overview](https://developers.google.com/workspace/drive/picker/guides/overview) — confirmed Picker is file-selector only (not uploader); OAuth required; fully client-side capable
- [Google Drive Picker Code Sample](https://developers.google.com/drive/picker/guides/sample) — confirmed no backend required; tokenClient (Google Identity Services) pattern
- [OAuth 2.0 for Client-side Web Applications](https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow) — confirmed client-side token acquisition mechanics and scope requirements

---
*Architecture research for: CLMC Procurement System v3.2 — Supplier Search, Proof of Procurement, RFP + Payables*
*Researched: 2026-03-13*
