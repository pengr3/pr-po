# Phase 98: UI/UX Fixes — Client Contact Split, Notifications Alignment, Payables PO Ref, Home Widget Fit - Context

**Gathered:** 2026-06-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Close four **independent, operator-reported** UI/UX gaps surfaced during v4.0 use. Each is a fix within an existing surface — no new capabilities. The four slices share nothing structurally and can be planned as parallel waves:

1. **Client contact split** — replace the single `contact_details` string on clients with separate **Phone** and **Email** fields, across form / list / detail modal / CSV (`clients.js` + client detail surfaces).
2. **Notifications alignment** — align the rows on the `#/notifications` history page so message text starts at a consistent x-position and time + ✓ are consistently right-aligned (`notifications.js` + `components.css`).
3. **Payables Ref link** — fix the "Failed to load PO details" error when clicking the Ref link in the Finance Payables tables, and route the link correctly per row type (`finance.js`).
4. **Home fit** — make the 5 department tiles on the Home hero fit above the fold on load (`home.js` + `styles/hero.css`).

**Explicitly NOT in scope:** any new client/notification/payables/home capability; data-model changes beyond the two new client fields; reworking the notification *dropdown* (this phase only touches the full-page `#/notifications` history view).
</domain>

<decisions>
## Implementation Decisions

### Slice 1 — Client Contact Split
- **D-01:** Replace the single `contact_details` field with two distinct fields: **Phone** and **Email**. Keep the existing separate `contact_person` field unchanged.
- **D-02:** **No data migration.** Existing clients keep their `contact_details` value untouched in Firestore. Wherever the new Phone/Email are blank on a legacy client, display the old `contact_details` as a **read-only fallback** so no contact info is hidden. New and edited clients populate Phone/Email going forward. (Rejected: best-effort regex parsing of `contact_details`, and blank-and-re-enter — both lose or mangle data.)
- **D-03:** **At least one** of Phone / Email is required in the create and edit forms (mirrors today's "contact is required" rule — a client must stay reachable). Not both-required, not both-optional.
- **D-04:** **Strict email-format validation:** if the Email field is non-empty it must be a well-formed address or the save is **blocked**. Phone alone satisfies D-03 (a phone-only client with empty Email saves fine). Phone has no format validation.
- **D-05:** Apply the split to **all** client surfaces: create/edit form inputs, the clients list table column, and the client detail modal. **[Resolved 2026-06-03, plan-phase]:** A client CSV export does **NOT** exist anywhere (confirmed by grep of `clients.js` + `utils.js`). Per the "no new capabilities" phase boundary, **CSV is dropped from scope** — Slice 1 covers form + list + detail modal only. (User confirmed: drop CSV rather than build a net-new export.)
- **D-06:** Continue escaping all displayed values with `escapeHTML()` (Phase 49 pattern) — applies to the new Phone/Email display points.

### Slice 2 — Notifications Alignment
- **D-07:** **Target = single-line INLINE rows** (matching the approved `notifications-alignment-screenshot.png`). **[Resolved 2026-06-03, plan-phase]:** The v3.3 working-tree `renderRows()` actually builds a **STACKED** body (label → message → time on separate lines), which diverges from the inline screenshot the user approved. The "messages start at different x-positions" complaint only makes sense for an inline layout, so the fix **restructures the stacked working-tree markup back to inline** + applies the fixed-width label column (D-08). This is the one structural change in Slice 2; everything else stays minimal (no dropdown/TYPE_META/truncation changes). User confirmed "current format is okay, just align the items" while looking at the inline screenshot.
- **D-08:** Make the **type-label + icon a fixed-width left column** (sized to the longest label, e.g. "PROPOSAL SUBMITTED") so every row's message text begins at the same x-position regardless of notification type. Shorter labels leave whitespace before the message — that's the intended table look.
- **D-09:** Keep the relative time + ✓ (mark-read) button **consistently right-aligned** across all rows and all notification types.
- **D-10:** This is a CSS/markup alignment change scoped to the `#/notifications` history page rows (`notifications.js` `renderRows()` + the `.notif-row*` rules). Do not change `TYPE_META`, the dropdown, truncation, or wrap behavior beyond what the fixed-column alignment requires.

### Slice 3 — Payables Ref Link
- **D-11:** Fix the doc-fetch bug so clicking the Ref opens the correct detail for **every** payable row in both Payables tables (RFP Processing + PO Payment Summary). Diagnose the exact cause in research/plan — strong candidate is an **ID-type mismatch**: `viewPODetailsFromRFP(poDocId)` does `getDoc(doc(db,'pos',poDocId))` (expects a Firestore **doc ID**), but PO Payment Summary call sites pass `po.poId` and RFP Processing passes `rfp.po_doc_id || ''`. Confirm whether `poId` is the doc ID or the human-readable `po_id`, and whether `po_doc_id` is reliably populated. (See code_context for line anchors.)
- **D-12:** **Route the Ref link by row type** (full parity): PO-linked rows → PO detail modal (the bug fix); TR-linked rows → the **TR detail modal**; standalone delivery-fee rows (no PO, no TR behind them) → **plain text, no link** (nothing to open). Rejected: PO-rows-only (leaves TR detail unreachable) and open-RFP-detail-for-all.

### Slice 4 — Home Fit
- **D-13:** The real problem is **vertical, not horizontal** — on a wide monitor the top 3 tiles (Clients/Projects/Services) fit on load but the bottom 2 (Procurement/Finance) are cut off below the fold. Goal: all 5 tiles + the hero title visible on load without scrolling.
- **D-14:** **Keep the existing 3 + 2 tile grouping** (`.dept-cards-row--top` repeat(3,1fr) / `.dept-cards-row--bottom` repeat(2,1fr)). Do NOT switch to a single row of 5. (User chose "Keep 3 + 2, compress" over "One row of 5".)
- **D-15:** Fit is achieved by **vertical compression**: reduce card padding, icon size, title/text sizes, and the hero title (`.hero-section` / `.hero-title` / `.hero-subtitle`) + inter-row spacing so both tile rows fit above the fold on load. This is a height fix.
- **D-16:** The container **width cap (`max-width:1200px`) stays** — widening was the wrong axis and is explicitly not the fix. Existing smaller-screen reflow (≤1024px / ≤768px / ≤480px media blocks) must be preserved.

### Claude's Discretion
- Exact fixed-column width value for the notification label column (size to longest label).
- Exact reduced padding / font-size / icon-size values for the Home tile compression — tune to fit common wide-viewport heights (≥1080px tall) on load while staying legible.
- Whether the Home hero title (`🏗️ CLMC` / `Management System Portal`) is shrunk, given vertical space pressure.

### Folded Todos
None — `list-todos` returned 0 pending todos; nothing to fold.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

This is a code-fix phase with no external specs/ADRs. The "canonical refs" are the source files and the roadmap entry that define each slice.

### Phase definition
- `.planning/ROADMAP.md` (Phase 98 section, ~lines 963–980) — goal, 4 success criteria, open questions.
- `.planning/phases/98-ui-fixes-client-contact-notifications-payables-home/notifications-alignment-screenshot.png` — **Slice 2 reference**: shows the current misaligned inline rows; the fix aligns message start-x and right-aligns time + ✓.

### Slice 1 — clients
- `app/views/clients.js` — single source for the client form, list, detail modal, and Firestore writes (see code_context for anchors).
- `app/utils.js` — `downloadCSV` shared utility (Phase 41) if a client CSV export is added/exists.

### Slice 2 — notifications
- `app/views/notifications.js` — `renderRows()` (~line 237) builds the history-page rows; `TYPE_META` provides per-type `label`/`icon`/`color`.
- `styles/components.css` — `.notif-row`, `.notif-type-badge`, `.notif-row-body`, `.notif-row-label`, `.notif-row-message`, `.notif-row-time`, `.notif-row-mark-read` rules.

### Slice 3 — payables
- `app/views/finance.js` — `viewPODetailsFromRFP()` (~line 2836); Ref call sites at ~707 & ~819 (RFP Processing, `rfp.po_doc_id`) and ~996 & ~1162 (PO Payment Summary, `po.poId`); window registration ~262, cleanup ~4265.
- `app/views/mrf-records.js` — has a self-contained `viewTRDetails` modal (~line 800) that can model/serve the TR-detail path; `app/views/procurement.js` also has TR + PO detail modals for reference.

### Slice 4 — home
- `app/views/home.js` — `render()` hero block: `.hero-section` (~130), `.hero-title`/`.hero-subtitle` (131–132), `.dept-cards` (134) with `--top` (135) / `--bottom` (155) rows.
- `styles/hero.css` — `.dept-cards` (~87), `.dept-cards-row--top` (~101), `.dept-cards-row--bottom` (~105), `.quick-stats` (~112), and responsive blocks at ≤1024px (~329), ≤768px (~353), ≤480px (~422). `.quick-stats` is separate overview content, NOT the hero tiles — do not confuse.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`escapeHTML()` (utils)** — already applied across views; use for new client Phone/Email display (D-06).
- **`downloadCSV` (`app/utils.js`)** — shared CSV exporter; reuse if client export is in/added to scope.
- **TR detail modal** — `viewTRDetails` exists in `mrf-records.js` (~line 800) and procurement.js; Slice 3's TR-route (D-12) should reuse this rather than build a new one. Confirm a finance.js-reachable path.
- **`createModal` / `openModal` / `showToast` / `showLoading`** — already used by `viewPODetailsFromRFP`; the TR-route should follow the same modal plumbing.
- **CSS dual-mode + media-query reflow pattern** (Phase 73.1) — Home already has ≤1024/≤768/≤480 breakpoints; compression (D-15) layers onto these, not replaces them.

### Established Patterns
- **Clients form/validation:** create handler reads `newContactPerson` + `newContactDetails` and validates required (~lines 507–510); edit handler reads `edit-contact` + `edit-details` (~lines 567–570); Firestore writes at ~527–528 (create) and ~588–589 (edit). The split replaces the `*Details` input with two inputs (Phone + Email) and rewrites the required check to "at least one + email-format-if-present" (D-03/D-04).
- **Clients display points:** form label/input (~78–79: "Contact Details *"), list table header (~112) + cell (~444–445), detail modal label/value (~256–260). Each needs Phone/Email with legacy `contact_details` fallback (D-02).
- **Notification rows** are built as inline-styled flex rows in `renderRows()`; `.notif-row` already carries a `border-left:3px solid transparent` alignment anchor (Phase 83.1-03). The fixed label column (D-08) is the new piece.
- **Payables Ref links** are inline `onclick="window.viewPODetailsFromRFP('...')"` anchors in four template strings; routing-by-type (D-12) means branching the anchor target on the RFP's linkage (PO vs TR vs delivery-fee) at render time.

### Integration Points
- **Slice 1:** Firestore `clients` docs gain `phone` + `email` fields (schemaless add, no migration); legacy `contact_details` remains readable. No security-rule change expected (existing client write rules cover new fields) — planner to confirm `firestore.rules` doesn't field-whitelist clients.
- **Slice 3:** depends on the RFP doc's linkage fields to decide PO vs TR vs delivery-fee — the diagnosis must identify which field reliably distinguishes them (e.g. presence of `po_doc_id` / `po_id` vs a TR id pattern `RFP-{TR-ID}-{n}` vs delivery-fee flag).
- **Slice 4:** pure CSS/markup in `home.js` + `hero.css`; no JS logic or data change.

### ⚠ Verify-before-assuming (RESOLVED 2026-06-03 by pattern-mapper + user)
- **Client CSV export — RESOLVED:** Confirmed **no client CSV export exists** anywhere. CSV dropped from D-05 scope (see D-05).
- **Slice 3 root cause — RESOLVED (confirmed real ID-type mismatch):** `viewPODetailsFromRFP(poDocId)` does `getDoc(doc(db,'pos',poDocId))` expecting a Firestore **doc ID**. RFP Processing call sites (finance.js:707, 819) correctly pass `rfp.po_doc_id`; the **PO Payment Summary** sites (finance.js:996, 1162) pass `po.poId`, which `buildPOMap` (finance.js:862) sets to the **human-readable** `po_id` → `getDoc` miss → "Failed to load PO details". Fix: thread `po_doc_id`/`tr_doc_id` from `entry.rfps[0]` through `buildPOMap` so summary call sites pass the doc ID. (Full anchors in 98-PATTERNS.md Slice 3.)
- **Notifications baseline — RESOLVED:** Working tree is **stacked**; target is **inline** (see D-07). Also: **longest TYPE_META label is "Registration Pending" (20 chars)**, not "Proposal Submitted" — that drives the fixed-column width (supersedes the D-08 guess).
- **Slice 3 TR-route reachability:** `window.viewTRDetails` is NOT reliably present on the Finance view (registered only conditionally by mrf-records.js / procurement.js). Port a self-contained `viewTRDetailsFromRFP(trDocId)` into finance.js (model: `viewTRDetailsLocal` mrf-records.js:805-871 + existing `viewPODetailsFromRFP` modal plumbing). Do not depend on `window.viewTRDetails`.
</code_context>

<specifics>
## Specific Ideas

- **Slice 2:** user looked at `notifications-alignment-screenshot.png` and said *"current format is okay, just align the items as you can see they are not aligned."* → keep format, fix alignment only.
- **Slice 4:** user attached a Home screenshot showing the 3 top tiles fitting but Procurement + Finance clipped below the fold, and said *"the 'Hero' with the 5 widgets does not fit the screen on load, it would be perfect if it fit perfectly."* → vertical fit, keep 3+2.
</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within the four scoped slices. No scope creep raised.
</deferred>

---

*Phase: 98-ui-fixes-client-contact-notifications-payables-home*
*Context gathered: 2026-06-03*
