---
phase: 40-ui-ux-revisions
verified: 2026-02-26T16:00:00Z
status: human_needed
score: 29/29 must-haves verified
re_verification:
  previous_status: human_needed
  previous_score: 26/26
  gaps_closed:
    - "PR detail modal in My Requests now includes a blue 'View PR' button with document icon (generatePRDocumentLocal)"
    - "PO detail modal in My Requests now includes a blue 'View PO' button with document icon (generatePODocumentLocal)"
    - "Document generation (generatePRDocumentLocal, generatePODocumentLocal) works without procurement.js being loaded"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Open MRF form page and confirm radio label reads 'Material/Sub Contractor'"
    expected: "Radio button next to the material type option shows 'Material/Sub Contractor', not 'Material Request'"
    why_human: "Label is rendered HTML — requires browser to confirm visual display"
  - test: "Open Services tab (both Services and Recurring sub-tabs) and confirm Service Type column is absent"
    expected: "Each sub-tab shows 7 columns with no Service Type column visible (Code, Name, Client, Internal Status, Project Status, Active, Actions)"
    why_human: "Table column count requires visual inspection"
  - test: "In Procurement > MRF Records tab, type a requestor name in the search box"
    expected: "MRFs submitted by that requestor appear filtered in the table"
    why_human: "Real-time search filtering against live Firestore data"
  - test: "On Clients tab, click a client row (not Edit/Delete button). Confirm modal opens."
    expected: "Modal appears showing client info, linked projects with budget/contract_cost and clickable links, linked services with same"
    why_human: "Modal rendering and Firestore queries require live execution"
  - test: "On Clients tab, click Edit button then Delete button on a client row"
    expected: "Modal does NOT open in either case"
    why_human: "stopPropagation behavior requires interactive testing"
  - test: "Open Procurement > MRF Records > Timeline for an MRF with multiple PRs and POs"
    expected: "Timeline shows MRF first, then PRs with indented child POs below, each PO shows a procurement status badge, no emojis, all dates display validly"
    why_human: "Timeline rendering with nested PR->PO grouping requires live Firestore data"
  - test: "Navigate to #/mrf-form, click My Requests sub-tab. Verify 8-column table."
    expected: "Table shows 8 columns: MRF ID, Project, Date Needed, PRs, POs, MRF Status, Procurement Status, Actions"
    why_human: "Column count and async PR/PO sub-rows require authenticated session with live Firestore data"
  - test: "In My Requests, click a colored PR badge in the PRs column"
    expected: "A read-only PR detail modal opens with a blue 'View PR' button alongside Close. Clicking 'View PR' opens a print-preview popup matching procurement.js PR document output."
    why_human: "Modal requires live Firestore fetch; print window requires browser pop-up execution"
  - test: "In My Requests, click a green PO ID link in the POs column"
    expected: "A read-only PO detail modal opens with a blue 'View PO' button alongside Close. Clicking 'View PO' opens a print-preview popup matching procurement.js PO document output."
    why_human: "Modal requires live Firestore fetch; print window requires browser pop-up execution"
  - test: "In My Requests, click the Timeline button on any MRF row with PRs and POs"
    expected: "Procurement timeline modal opens showing MRF Created at top, then PRs with indented child POs below each PR, each child PO has a procurement status badge, no emojis, all dates are valid strings. Closing via the X button removes the modal from the DOM."
    why_human: "Timeline requires live Firestore queries across mrfs, prs, pos, transport_requests collections"
  - test: "Verify My Requests filter bar layout matches Procurement MRF Records"
    expected: "3-column grid with labeled filter groups: MRF Status dropdown, Urgency dropdown, Search input — all functioning. Refresh button in card header."
    why_human: "Visual layout and filter interaction require browser"
---

# Phase 40: UI/UX Revisions Verification Report (Re-verification after Plan 07)

**Phase Goal:** Six surgical UI/UX revisions: rename MRF request type label, add client detail modal with linked projects/services, remove redundant Services tab column, fix procurement timeline (emojis, Invalid Date, PR->PO grouping, procurement status), extend MRF search, and add "My Requests" sub-tab for requestor MRF tracking
**Verified:** 2026-02-26T16:00:00Z
**Status:** human_needed
**Re-verification:** Yes — after Plan 07 gap closure (View PR/PO document generation buttons in My Requests modals)

## Goal Achievement

### Observable Truths

| # | Truth | Plan | Status | Evidence |
|---|-------|------|--------|----------|
| 1 | MRF form radio button displays 'Material/Sub Contractor' instead of 'Material Request' | 01 | VERIFIED | `mrf-form.js:166` — `<label for="typeMaterial">Material/Sub Contractor</label>` |
| 2 | MRF Records search matches on requestor_name and service_name in addition to mrf_id and project_name | 01 | VERIFIED | `procurement.js:2343-2344` — null-safe `&&` guards on both new fields |
| 3 | Services and Recurring sub-tab tables no longer show a Service Type column | 01 | VERIFIED | `services.js` headers: Code, Name, Client, Internal Status, Project Status, Active, Actions — 7 columns; `colspan="7"` at lines 273 and 911 |
| 4 | Clicking a client row opens a read-only modal showing client info, linked projects, and linked services | 02 | VERIFIED | `clients.js:420` — tr onclick; `showClientDetail()` at line 218; window registration at line 32 |
| 5 | Linked projects and services in the modal include budget and contract cost financials | 02 | VERIFIED | `clients.js:271-272, 301-302` — `formatCurrency(p.budget)`, `formatCurrency(p.contract_cost)` |
| 6 | Project and service names in the modal are clickable links to their detail pages | 02 | VERIFIED | `clients.js:269-270, 299-300` — anchors to `#/projects/detail/CODE` and `#/services/detail/CODE` |
| 7 | Edit and Delete buttons on table rows do NOT trigger the modal | 02 | VERIFIED | `clients.js:426, 431` — `onclick="event.stopPropagation()"` on actions `<td>` elements |
| 8 | Inline table editing continues to work unchanged | 02 | VERIFIED | `clients.js:220` — `editingClient` guard returns early; row edit mode bypasses `showClientDetail()` |
| 9 | Timeline items show simple dot indicators — no emojis in timeline modal | 03 | VERIFIED | Emoji grep in `procurement.js` returns 0 hits in the timeline rendering function (lines 4405-4510) |
| 10 | PO entries in the timeline display valid dates (no 'Invalid Date') | 03 | VERIFIED | `procurement.js:4453` — `formatTimestamp(po.date_issued) \|\| 'N/A'`; all Firestore date fields use `formatTimestamp()` |
| 11 | PRs are visually grouped with their child POs as PR->PO pairs | 03 | VERIFIED | `procurement.js:4410-4468` — `posByPR` map grouping + `.timeline-children` wrapper with `.timeline-child-item` entries per child PO |
| 12 | Each PO in the timeline shows its current procurement status | 03 | VERIFIED | `procurement.js:4455-4459` — `status-badge ${getStatusClass(po.procurement_status)}` per child PO |
| 13 | Timeline CSS handles rejected (red dot), pending (gray/orange), active (blue), completed (green) states | 03 | VERIFIED | `views.css` lines 634-698 — `.timeline-item.active/.pending/.rejected` and full `.timeline-child-item` suite |
| 14 | Material Request tab has 2 sub-tabs: 'Material Request Form' and 'My Requests' | 04 | VERIFIED | `mrf-form.js:26-37` — two tab buttons; `render()` dispatches on `activeTab` parameter; `router.js:51` — `defaultTab: 'form'` |
| 15 | 'My Requests' shows all MRFs submitted by the current user (filtered by requestor_name) | 04/05 | VERIFIED | `mrf-form.js:440-441` — `filterFn: (mrf) => mrf.requestor_name === userName`; `statusFilter: null` fetches all statuses |
| 16 | My Requests table shows 8 columns: MRF ID, Project, Date Needed, PRs, POs, MRF Status, Procurement Status, Actions | 05/06 | VERIFIED | `mrf-records.js:669-677` — thead with 8 `<th>` elements including "Actions" at line 676 |
| 17 | Each MRF row fetches its PRs and POs from Firestore as async sub-rows | 05 | VERIFIED | `mrf-records.js:519-663` — `Promise.all(pageItems.map(async (mrf) => { ... }))` with `getDocs` on `prs` at line 530 and `pos` at line 575 |
| 18 | MRF Status column shows computed calculateMRFStatus badge (Awaiting PR / X/Y PO Issued) | 05 | VERIFIED | `mrf-records.js:23-52` — `calculateMRFStatus()` function; called at line 633; `renderMRFStatusBadge()` at line 634 |
| 19 | Procurement Status column shows read-only colored spans per PO (not editable selects) | 05 | VERIFIED | `mrf-records.js:603-604` — `statusColors` map + inline `<span style="...">` badge, no `<select>` element |
| 20 | Transport type MRFs show em dash for MRF Status and dashes for PR/PO columns | 05 | VERIFIED | `mrf-records.js:520` — `type = mrf.request_type === 'service' ? 'Transport' : 'Material'`; lines 523, 568 — dash HTML for Transport; line 631 — em dash for MRF Status |
| 21 | Search, status filter, urgency filter, and pagination all work in My Requests | 05 | VERIFIED | `mrf-form.js:55-83` — 3-column grid filter bar with all 3 inputs; `mrf-records.js:444-466` — all three filters applied in `applyFilters()`; pagination at lines 692-738 |
| 22 | My Requests filter bar uses 3-column grid layout with labeled filter groups | 05 | VERIFIED | `mrf-form.js:55` — `display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem;` with three `filter-group` divs |
| 23 | Navigating between sub-tabs within mrf-form does not break state or listeners | 04/05 | VERIFIED | `mrf-form.js:332-352` — form → my-requests cleans projectsListener/servicesListener; my-requests → form destroys controller and deletes window functions |
| 24 | PR badges in My Requests are clickable and open a read-only PR detail modal | 06 | VERIFIED | `mrf-records.js:629` — `viewPRDetailsLocal(prDocId)`; line 1314 — registered as `window[_mrfRecordsViewPR_${containerId}]`; line 1122 — PR badge rendered as `<a>` with onclick; destroy() cleans up at line 1332 |
| 25 | PO IDs in My Requests are clickable and open a read-only PO detail modal | 06 | VERIFIED | `mrf-records.js:714` — `viewPODetailsLocal(poDocId)`; line 1315 — registered as `window[_mrfRecordsViewPO_${containerId}]`; line 1180 — PO ID rendered as `<a>` with onclick; destroy() cleans up at line 1333 |
| 26 | Each MRF row in My Requests has a Timeline button that opens a procurement timeline modal | 06 | VERIFIED | `mrf-records.js:808` — `showTimelineLocal(mrfId)`; line 1316 — registered as `window[_mrfRecordsTimeline_${containerId}]`; line 1222 — "Timeline" button with onclick; destroy() cleans up at line 1334 |
| 27 | PR detail modal in My Requests has a 'View PR' button that opens a print-preview document popup | 07 | VERIFIED | `mrf-records.js:687-696` — footer includes blue "View PR" button with SVG icon; `onclick="generatePRDocumentLocal('${pr.id}')"` |
| 28 | PO detail modal in My Requests has a 'View PO' button that opens a print-preview document popup | 07 | VERIFIED | `mrf-records.js:781-790` — footer includes blue "View PO" button with SVG icon; `onclick="generatePODocumentLocal('${po.id}')"` |
| 29 | Document generation works without procurement.js being loaded (My Requests context) | 07 | VERIFIED | `mrf-records.js:81-512` — DOCUMENT_CONFIG_LOCAL, formatDocumentDateLocal, generateItemsTableHTMLLocal, generatePRHTMLLocal, generatePOHTMLLocal, openPrintWindowLocal all self-contained; `window.generatePRDocumentLocal` and `window.generatePODocumentLocal` registered at lines 1320-1321; cleaned in destroy() at lines 1335-1336; commit `1b5bc4e` shows 0 changes to procurement.js |

**Score:** 29/29 truths verified

### Required Artifacts

| Artifact | Plan | Expected | Status | Details |
|----------|------|----------|--------|---------|
| `app/views/mrf-form.js` | 01, 04, 05 | Updated radio label; sub-tab routing; 3-column filter bar | VERIFIED | Line 166: `Material/Sub Contractor`; render dispatches on activeTab; lines 55-83: 3-column filter grid |
| `app/views/procurement.js` | 01, 03 | Extended search filter; formatTimestamp; posByPR grouping | VERIFIED | Lines 2343-2344: requestor/service search; formatTimestamp imported; lines 4410-4500: full timeline with PR->PO nesting |
| `app/views/services.js` | 01 | Table without Service Type column; 7 columns | VERIFIED | Headers: Code, Name, Client, Internal Status, Project Status, Active, Actions — no Service Type `<th>`; `colspan="7"` at lines 273 and 911 |
| `app/views/clients.js` | 02 | `showClientDetail()` with modal rendering and Firestore queries | VERIFIED | Function at line 218; `Promise.all` at lines 229-231; window registration at line 32; cleanup in `destroy()` at line 160 |
| `styles/views.css` | 03 | Timeline CSS classes for all states | VERIFIED | Lines 634-698 — `.timeline-item.active/.pending/.rejected` and full `.timeline-child-item` suite |
| `app/views/mrf-records.js` | 04, 05, 06, 07 | Full MRF Records table with async PR/PO sub-rows, calculateMRFStatus, statusColors, clickable PR/PO modals, Timeline button, View PR/PO document generation, self-contained local functions | VERIFIED | 1,344 lines; `createMRFRecordsController` exported; DOCUMENT_CONFIG_LOCAL at line 81; generatePRDocumentLocal at line 533; generatePODocumentLocal at line 580; View PR button at line 689; View PO button at line 783; window registrations at lines 1314-1321; all cleaned in destroy() at lines 1330-1337 |
| `app/router.js` | 04 | `defaultTab: 'form'` for mrf-form route | VERIFIED | Line 51: `defaultTab: 'form'` in `/mrf-form` route |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `mrf-form.js` | Firestore `mrfs` collection | `createMRFRecordsController` + `getDocs` in `mrf-records.js` | WIRED | `mrf-records.js:406` — `getDocs(q)` on `collection(db, 'mrfs')`; filterFn scopes to requestor |
| `mrf-form.js` | `mrf-records.js` | `import('./mrf-records.js')` in `initMyRequests()` | WIRED | `mrf-form.js:431` — dynamic import confirmed |
| `mrf-records.js` | Firestore `prs` collection | `getDocs(query(prsRef, where('mrf_id', '==', mrf.mrf_id)))` | WIRED | `mrf-records.js:530` — confirmed |
| `mrf-records.js` | Firestore `pos` collection | `getDocs(query(posRef, where('mrf_id', '==', mrf.mrf_id)))` | WIRED | `mrf-records.js:575` — confirmed |
| `mrf-records.js` PR onclick | `viewPRDetailsLocal` | `window[_mrfRecordsViewPR_${containerId}](pr.docId)` | WIRED | Line 1314 registers function; line 1122 uses `pr.docId` |
| `mrf-records.js` PO onclick | `viewPODetailsLocal` | `window[_mrfRecordsViewPO_${containerId}](po.docId)` | WIRED | Line 1315 registers function; line 1180 uses `po.docId` |
| `mrf-records.js` Timeline button | `showTimelineLocal` | `window[_mrfRecordsTimeline_${containerId}](mrf.mrf_id)` | WIRED | Line 1316 registers function; line 1222 embeds `mrf.mrf_id` |
| `viewPRDetailsLocal` footer | `generatePRDocumentLocal` | `onclick="generatePRDocumentLocal('${pr.id}')"` in modal HTML | WIRED | `mrf-records.js:689` — onclick attribute; `window.generatePRDocumentLocal` registered at line 1320 |
| `viewPODetailsLocal` footer | `generatePODocumentLocal` | `onclick="generatePODocumentLocal('${po.id}')"` in modal HTML | WIRED | `mrf-records.js:783` — onclick attribute; `window.generatePODocumentLocal` registered at line 1321 |
| `generatePRDocumentLocal` | Firestore `prs` document | `getDoc(doc(db, 'prs', prDocId))` | WIRED | `mrf-records.js:538-539` — single-document fetch by Firestore doc ID |
| `generatePRDocumentLocal` | `generatePRHTMLLocal` + `openPrintWindowLocal` | `generatePRHTMLLocal(documentData)` → `openPrintWindowLocal(html, ...)` | WIRED | `mrf-records.js:562-563` — both calls confirmed |
| `generatePODocumentLocal` | Firestore `pos` document | `getDoc(doc(db, 'pos', poDocId))` | WIRED | `mrf-records.js:585-586` — single-document fetch by Firestore doc ID |
| `generatePODocumentLocal` | `generatePOHTMLLocal` + `openPrintWindowLocal` | `generatePOHTMLLocal(documentData)` → `openPrintWindowLocal(html, ...)` | WIRED | `mrf-records.js:611-612` — both calls confirmed |
| `viewPRDetailsLocal` | Firestore `prs` document | `getDoc(doc(db, 'prs', prDocId))` | WIRED | `mrf-records.js:629` — single-document fetch by Firestore doc ID |
| `viewPODetailsLocal` | Firestore `pos` document | `getDoc(doc(db, 'pos', poDocId))` | WIRED | `mrf-records.js:717` — single-document fetch by Firestore doc ID |
| `showTimelineLocal` | Firestore `mrfs`, `prs`, `transport_requests`, `pos` | `getDocs` queries by `mrf_id`, `pos` ordered by `date_issued` | WIRED | `mrf-records.js:811-824` — four sequential Firestore fetches |
| `clients.js` | Firestore `projects`/`services` collections | `getDocs(query(..., where('client_code', '==', code)))` | WIRED | `clients.js:229-231` — parallel `Promise.all` for both collections |
| `procurement.js` | `utils.js` | `formatTimestamp` import | WIRED | `procurement.js:8` — `formatTimestamp` in import line |
| `mrf-records.js` | `utils.js` | `formatDate, formatTimestamp, getStatusClass, formatCurrency, showLoading, showToast` imports | WIRED | `mrf-records.js:15` — all six in import line |
| `mrf-records.js` | `components.js` | `getMRFLabel, createModal, openModal, closeModal` imports | WIRED | `mrf-records.js:16` — all four in import line |

### Requirements Coverage

**Note:** The plan frontmatter for 40-07 lists `requirements: ["UX-05"]`. UX-05 is NOT a formal requirement in `.planning/REQUIREMENTS.md` (which covers v2.3 requirements with SERV-, ROLE-, UI-, SEC- prefixes). UX-01 through UX-06 are phase-local labels used across Phase 40 plans.

**Formal REQUIREMENTS.md cross-check:** The only formally defined requirement that touches Phase 40 scope is `UI-05` ("Services list view displays: Code, Name, Client, Service Type, Internal Status, Project Status"), which was completed in Phase 28 and is tracked at `REQUIREMENTS.md:170`. Phase 40 Plan 01 removed the Service Type column from the Services sub-tab tables — this is a UX refinement applied after UI-05 was satisfied. The removal does not contradict UI-05 (the data still exists; the column was eliminated from the list view as a redundant display). No orphaned v2.3 requirements are mapped to Phase 40.

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| UX-01 | 40-01 | Rename MRF request type radio label to 'Material/Sub Contractor' | SATISFIED | `mrf-form.js:166` |
| UX-02 | 40-01 | Extend MRF Records search to match requestor_name and service_name | SATISFIED | `procurement.js:2343-2344` |
| UX-03 | 40-01 | Remove redundant Service Type column from Services sub-tab tables | SATISFIED | `services.js` 7-column header, colspan="7" at lines 273 and 911 |
| UX-04 | 40-02 | Client detail modal with linked projects/services and clickable detail links | SATISFIED | `clients.js` — `showClientDetail()`, Firestore queries, stopPropagation |
| UX-05 | 40-03, 40-06, 40-07 | Fix procurement timeline (emojis, Invalid Date, PR->PO grouping, procurement status); View PR/PO document buttons in My Requests modals | SATISFIED | `procurement.js:4405-4510`, `views.css:634-698`, `mrf-records.js:533-612` — generatePRDocumentLocal/generatePODocumentLocal with full self-contained document generation |
| UX-06 | 40-04, 40-05, 40-06 | My Requests sub-tab for requestor MRF tracking with full procurement layout including clickable PR/PO modals and Timeline button | SATISFIED | `mrf-records.js` (1,344 lines, full rewrite), `mrf-form.js` sub-tab routing, `router.js` defaultTab |

**Orphaned requirements:** None. All six UX- requirements are accounted for by plans 01-07.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `app/views/mrf-records.js` | 449, 498 | `.sig-placeholder` CSS class name match on anti-pattern scan | Info | False positive — this is a CSS class for signature line layout in printed PR/PO documents, not a stub implementation |
| `app/views/mrf-records.js` | 546-548, 591-593 | PR/PO sort regex `/-(\d+)-/` extracts YEAR (e.g. `2026`) not sequence number — all records in same year sort as equal | Warning | Sort is functionally inert within a year; Firestore result order preserved. Pre-existing pattern copied from `procurement.js` |
| `app/views/mrf-records.js` | 413-416 | `new Date(a.created_at \|\| a.date_submitted \|\| 0)` — `created_at` may be a Firestore Timestamp object | Warning | Sort order may be incorrect when `created_at` is a Timestamp. `date_submitted` (plain string) is the fallback, so typically resolves correctly in practice |

No blocker anti-patterns. Both warnings are pre-existing or low-impact and do not prevent any user-facing functionality. The `.sig-placeholder` hit is a CSS class, not a code stub.

### Human Verification Required

#### 1. MRF Form Radio Label

**Test:** Open browser to `#/mrf-form`, look at the "Request Type" radio buttons
**Expected:** Radio button for material type reads "Material/Sub Contractor" (not "Material Request")
**Why human:** HTML label rendering requires browser display
**UAT result (40-UAT.md):** PASS

#### 2. Services Tab Column Count

**Test:** Open Services tab, view both the "Services" and "Recurring" sub-tabs
**Expected:** Both tables show 7 columns — Code, Name, Client, Internal Status, Project Status, Active, Actions (no "Service Type" column)
**Why human:** Visual column inspection
**UAT result (40-UAT.md):** PASS

#### 3. MRF Records Search Extension

**Test:** In Procurement > MRF Records tab, search by a requestor's first name
**Expected:** MRFs submitted by that requestor appear in results
**Why human:** Requires live Firestore data and search interaction
**UAT result (40-UAT.md):** PASS

#### 4. Client Detail Modal

**Test:** Open Clients tab, click directly on a client row (not Edit or Delete)
**Expected:** Modal opens showing three sections — Client Information, Linked Projects (with budget/contract cost and clickable links), Linked Services (same)
**Why human:** Modal, Firestore queries, and navigation require live interaction
**UAT result (40-UAT.md):** PASS

#### 5. Edit/Delete Button Isolation

**Test:** On Clients tab, click the Edit button on any row; then click the Delete button on any row
**Expected:** Modal does NOT open in either case
**Why human:** stopPropagation behavior requires interactive testing
**UAT result (40-UAT.md):** PASS

#### 6. Procurement Timeline (procurement.js)

**Test:** Open Procurement > MRF Records, click "Timeline" button for an MRF that has PRs and POs
**Expected:** Timeline modal shows: (1) MRF Created entry at top, (2) PRs with indented child POs below each PR, (3) each child PO has a procurement status badge, (4) no emojis in the timeline content, (5) all dates display as readable date strings (not "Invalid Date"), (6) TRs appear as standalone items
**Why human:** Requires live Firestore data with PR/PO relationships; visual inspection of nesting
**UAT result (40-UAT.md):** PASS

#### 7. My Requests Table Layout (8 Columns)

**Test:** Navigate to `#/mrf-form`. Click "My Requests" sub-tab. Wait for data to load.
**Expected:**
- Table shows 8 columns: MRF ID, Project, Date Needed, PRs, POs, MRF Status, Procurement Status, Actions
- PRs column shows colored status-badge `<a>` elements (clickable)
- POs column shows green-styled PO ID `<a>` links with SUBCON badges where applicable (clickable)
- MRF Status shows computed "Awaiting PR" / "X/Y PO Issued" badges
- Procurement Status shows read-only colored badges per PO (not dropdowns)
- Actions column shows a "Timeline" button per row
- Only this user's MRFs are shown (requestor_name filter)
**Why human:** Requires authenticated session; async PR/PO sub-rows require live Firestore data
**UAT result (40-06-UAT.md):** PASS (Timeline button confirmed; PR/PO modals confirmed open)

#### 8. PR Detail Modal with View PR Button

**Test:** In My Requests, click a colored PR badge in the PRs column
**Expected:** Read-only PR detail modal opens showing PR ID, MRF Reference, Supplier, Prepared By, Project, Date Generated, Status badge, Total Amount, Requestor, Delivery Address, and Items table. Footer shows "Close" button AND a blue "View PR" button with document icon. Clicking "View PR" opens a browser print-preview popup with the full PR document (matching procurement.js output).
**Why human:** Requires live Firestore fetch; print window requires browser pop-up execution
**UAT note:** 40-06-UAT confirmed modal opens but flagged missing View PR button (now added in Plan 07). Requires re-test.

#### 9. PO Detail Modal with View PO Button

**Test:** In My Requests, click a green PO ID link in the POs column
**Expected:** Read-only PO detail modal opens showing PO ID (with SUBCON badge if applicable), MRF Reference, Supplier, Project, Date Issued, Status, Total Amount, and Items table. Footer shows "Close" button AND a blue "View PO" button with document icon. Clicking "View PO" opens a browser print-preview popup with the full PO document.
**Why human:** Requires live Firestore fetch; print window requires browser pop-up execution
**UAT note:** 40-06-UAT confirmed modal opens but flagged missing View PO button (now added in Plan 07). Requires re-test.

#### 10. Timeline Modal in My Requests

**Test:** In My Requests, click the "Timeline" button on any MRF row that has PRs and POs
**Expected:** Procurement timeline modal opens (injected into document.body) showing: MRF Created entry at top, PRs with indented child POs below each PR, each child PO has a procurement status badge, no emojis, all dates are readable strings. Clicking the X button removes the modal from the DOM entirely (not just hidden).
**Why human:** Requires live Firestore queries; DOM injection and cleanup requires browser verification
**UAT result (40-06-UAT.md):** PASS

#### 11. My Requests Filter Bar Layout

**Test:** On the My Requests sub-tab, inspect the filter bar above the table
**Expected:** 3-column grid with labeled filter groups — "MRF Status" dropdown, "Urgency" dropdown, "Search" text input; all three filters update the table; Refresh button in card header
**Why human:** Visual layout requires browser; filter interaction requires live data
**UAT result (40-UAT.md):** PASS (filters confirmed working)

## Gaps Summary

No blocking gaps. All 29 must-have truths are implemented, wired, and verified at the code level.

**Plan 07 successfully closed 2 UAT gaps from 40-06-UAT.md:**

1. PR detail modal footer updated — blue "View PR" button with document SVG icon added alongside Close button (`mrf-records.js:687-696`). `generatePRDocumentLocal` fetches the PR from Firestore, builds full documentData, and calls `generatePRHTMLLocal` + `openPrintWindowLocal` to open the print document in a new browser tab.
2. PO detail modal footer updated — blue "View PO" button with document SVG icon added alongside Close button (`mrf-records.js:781-790`). `generatePODocumentLocal` mirrors the same pattern for POs.

**Key design decisions (Plan 07):**

1. All document generation helpers use "Local" suffix (DOCUMENT_CONFIG_LOCAL, generatePRHTMLLocal, etc.) to avoid any namespace collision with procurement.js equivalents if both modules are loaded
2. `window.generatePRDocumentLocal` and `window.generatePODocumentLocal` registered in `createMRFRecordsController` factory — consistent with the other instance-scoped registrations; cleaned up in `destroy()`
3. procurement.js is confirmed unchanged — commit `1b5bc4e` shows exactly 575 insertions and 2 deletions in `mrf-records.js`, zero other files modified

**UAT history summary:**
- 40-UAT.md: 10/11 passed; 1 gap (My Requests layout) — closed in Plan 05
- 40-05-UAT.md: gaps for clickable PR/PO badges and Timeline button — closed in Plan 06
- 40-06-UAT.md: gaps for View PR/PO document buttons — closed in Plan 07
- Items 8 and 9 (View PR/View PO print buttons) require one final human re-test to confirm the print window opens correctly

**Traceability note:** UX-01 through UX-06 are phase-local labels not present in `.planning/REQUIREMENTS.md`. The only formally defined requirement in scope is UI-05 (Phase 28, complete). No v2.3 requirements (SERV-, ROLE-, UI-, SEC-, etc.) are mapped to Phase 40. No orphaned requirements.

---

_Verified: 2026-02-26T16:00:00Z_
_Verifier: Claude (gsd-verifier)_
_Re-verification: after Plan 07 gap closure (View PR/PO document generation buttons in My Requests modals)_
