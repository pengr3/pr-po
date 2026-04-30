---
status: resolved
trigger: "Fix broken Add Item row in Edit MRF modal in My Requests tab"
created: 2026-04-08T00:00:00Z
updated: 2026-04-08T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED. The add-item click handler uses `document.createElement('div')` as a temp container for the `<tr>` HTML string. Browsers do not allow `<tr>` as a child of `<div>` — they strip the `<tr>` wrapper via foster parenting, so `tempDiv.firstElementChild` is null or broken. The fix is to use `document.createElement('tbody')` as the temp container instead.
test: Read code confirmed — lines 718-725 in editRequestorMRF. Browser HTML parser strips `<tr>` when injected into a `<div>`, leaving no valid firstElementChild to append.
expecting: Fix by changing temp container from `div` to `tbody`
next_action: Apply fix at line 721-725

## Symptoms

expected: Clicking "Add Item" in the Edit MRF modal adds a new row with ALL columns: Item Name, Category, Qty, Unit, Unit Cost, Supplier, and a Remove button
actual: New rows added by the Add Item button are missing QTY, UNIT, CATEGORY columns and the Remove button. Only some columns appear.
errors: No JS errors — just missing columns in the rendered row HTML
reproduction: My Requests tab → right-click a Pending MRF → Edit MRF → click "Add Item"
started: Introduced in the editRequestorMRF implementation in app/views/mrf-form.js

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-04-08
  checked: editRequestorMRF add-item click handler (lines 718-726 in mrf-form.js)
  found: Handler used `document.createElement('div')` as a temp container for the `<tr>` HTML string from buildEditItemRow. Browser HTML parsers apply foster-parenting rules: `<tr>` is not a valid child of `<div>`, so the `<tr>` is stripped and `tempDiv.firstElementChild` is null. `tbody.appendChild(null)` silently does nothing, so no row is added.
  implication: Every "Add Item" click was effectively a no-op — nothing was appended to the table body.

- timestamp: 2026-04-08
  checked: buildEditItemRow function (lines 545-568)
  found: Function generates correct full HTML with all 5 columns (item-name, item-qty, unit, category, remove). It works correctly for initial rows because those are injected directly into the modal HTML string (not via DOM manipulation).
  implication: The row template itself is correct. Only the click handler's DOM insertion method was broken.

- timestamp: 2026-04-08
  checked: Table header (lines 674-678)
  found: 5 columns — Item Description, Qty, Unit, Category, (action). Matches buildEditItemRow output exactly.
  implication: No header mismatch. Bug was purely in how new rows were inserted.

## Resolution

root_cause: The add-item click handler used `document.createElement('div')` as a temporary container to parse the `<tr>` HTML string from buildEditItemRow. Browsers strip `<tr>` elements when injected into a `<div>` via innerHTML (foster-parenting), making `tempDiv.firstElementChild` null. As a result, `tbody.appendChild(null)` was a no-op — no rows were ever added.
fix: Changed the temp container from `document.createElement('div')` to `document.createElement('tbody')`. A `<tbody>` is a valid parent for `<tr>`, so innerHTML parsing correctly produces a `<tr>` as firstElementChild.
verification: confirmed by user UAT — Add Item now correctly appends full rows in the Edit MRF modal
files_changed: [app/views/mrf-form.js]
