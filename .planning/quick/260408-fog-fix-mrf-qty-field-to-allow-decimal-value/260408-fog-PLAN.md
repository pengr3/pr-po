---
phase: 260408-fog
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/views/mrf-form.js
  - app/views/procurement.js
autonomous: false
requirements:
  - QTY-DECIMAL-01
must_haves:
  truths:
    - "User can enter a decimal value less than 1 (e.g. 0.5) in the MRF QTY field on the standalone Create MRF form"
    - "User can enter a decimal value less than 1 (e.g. 0.5) in the MRF QTY field on the Procurement > Create MRF form"
    - "User can enter a decimal value less than 1 (e.g. 0.5) in the MRF QTY field on the Procurement > MRF Details edit table"
    - "Submitted decimal QTY values persist to Firestore items_json without being truncated to integers"
    - "Subtotal calculations use the decimal qty (e.g. 0.5 * 100 = 50)"
  artifacts:
    - path: "app/views/mrf-form.js"
      provides: "Template <input class='item-qty'> allows decimals; collectItems() preserves decimal precision"
      contains: "step=\"any\""
    - path: "app/views/procurement.js"
      provides: "All three <input class='item-qty'> render sites allow decimals (renderMRFItemsTable, MRF Details table, addItemRow)"
      contains: "step=\"any\""
  key_links:
    - from: "app/views/mrf-form.js line 277 (template row)"
      to: "window.addItem clone + collectItems()"
      via: "tbody.rows[0].cloneNode copies the step attribute to every new row"
      pattern: "step=\"any\""
    - from: "app/views/mrf-form.js collectItems()"
      to: "Firestore items_json"
      via: "parseFloat preserves decimals end-to-end"
      pattern: "parseFloat\\(row.querySelector\\('\\.item-qty'\\)"
    - from: "app/views/procurement.js item-qty inputs (lines ~2601, ~3109, ~3339)"
      to: "calculateSubtotal + saveProgress/generatePR/submitTransportRequest"
      via: "existing parseFloat reads already handle decimals"
      pattern: "parseFloat\\(row.querySelector\\('input.item-qty'\\)"
---

<objective>
Allow decimal quantities (e.g. 0.5, 1.25, 2.75) in the MRF QTY field across all three entry points so users can request fractional units like "0.5 liters" or "1.5 meters".

Purpose: Current min="1" with no step attribute blocks decimals at the HTML5 validation layer, and mrf-form.js collectItems() uses parseInt which truncates any decimal value even if entered. Users requesting fractional quantities cannot submit MRFs.

Output: Four HTML inputs updated with step="any" min="0.01" and one parseInt -> parseFloat change.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@app/views/mrf-form.js
@app/views/procurement.js

<interfaces>
<!-- Existing item-qty input sites. All four HTML renders currently use min="1" with no step. -->

app/views/mrf-form.js:277 (standalone Create MRF — template row cloned by window.addItem):
```html
<td><input type="number" class="item-qty" min="1" required></td>
```

app/views/mrf-form.js:727 (collectItems — the ONLY parseInt in the qty path):
```javascript
const qty = parseInt(row.querySelector('.item-qty').value);
```

app/views/procurement.js:2601-2607 (renderMRFItemsTable — MRF Details edit mode):
```html
<input type="number"
       class="item-qty table-input table-input-sm"
       data-index="${index}"
       value="${item.qty || ''}"
       min="1"
       placeholder="0"
       oninput="window.calculateSubtotal(${index})">
```

app/views/procurement.js:3109-3115 (Create MRF form inside Procurement view — initial render):
```html
<input type="number"
       class="item-qty table-input table-input-sm"
       data-index="${index}"
       value="${item.qty || item.quantity || ''}"
       min="1"
       placeholder="0"
       oninput="window.calculateSubtotal(${index})">
```

app/views/procurement.js:3339-3345 (addItemRow — new row added via "Add Item" button in Procurement Create MRF):
```html
<input type="number"
       class="item-qty table-input table-input-sm"
       data-index="${newIndex}"
       value=""
       min="1"
       placeholder="0"
       oninput="window.calculateSubtotal(${newIndex})">
```

All downstream reads in procurement.js already use parseFloat (verified at lines 2759, 3220, 3241, 3553, 3683, 5405, 5590, 5887) so no JS changes needed there. Only mrf-form.js line 727 uses parseInt.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Allow decimals in mrf-form.js (HTML + parseInt fix)</name>
  <files>app/views/mrf-form.js</files>
  <action>
    Make two surgical edits in app/views/mrf-form.js:

    1. Line 277 — template row for itemsTableBody (cloned by window.addItem):
       Change `<input type="number" class="item-qty" min="1" required>` to
       `<input type="number" class="item-qty" min="0.01" step="any" required>`

       Rationale: min="0.01" still blocks zero/negative values while allowing any fractional quantity; step="any" disables HTML5's implicit step=1 that rejects decimals. Since window.addItem at line 691 clones tbody.rows[0], this single template edit propagates to all dynamically added rows — no addItem() change needed.

    2. Line 727 — collectItems():
       Change `const qty = parseInt(row.querySelector('.item-qty').value);` to
       `const qty = parseFloat(row.querySelector('.item-qty').value);`

       Rationale: parseInt('0.5') returns 0, causing the `if (itemName && qty && unit && category)` validation at line 733 to reject the row silently. parseFloat preserves decimal precision end-to-end into Firestore items_json. The truthy check at line 733 still correctly rejects 0 and NaN.

    Do NOT touch any other line. Do NOT change display formatting. Do NOT alter the required attribute or unit/category selectors.
  </action>
  <verify>
    <automated>MISSING — static site has no test harness; manual UAT via checkpoint task 3 below</automated>
    Static verification: grep for the changed lines should show step="any" and parseFloat on the .item-qty lines.
  </verify>
  <done>
    Line 277 contains `min="0.01" step="any"` (no more `min="1"`). Line 727 uses parseFloat (no more parseInt on .item-qty). No other lines modified.
  </done>
</task>

<task type="auto">
  <name>Task 2: Allow decimals in all three procurement.js item-qty inputs</name>
  <files>app/views/procurement.js</files>
  <action>
    Make three surgical HTML attribute edits in app/views/procurement.js. Each edit replaces `min="1"` with `min="0.01" step="any"` on the <input class="item-qty"> element. The surrounding attributes (data-index, value, placeholder, oninput) must remain unchanged.

    1. Line ~2605 (inside renderMRFItemsTable for MRF Details edit mode):
       Change `min="1"` to `min="0.01" step="any"` on the item-qty input starting at line 2601.

    2. Line ~3113 (inside the Procurement > Create MRF initial table render):
       Change `min="1"` to `min="0.01" step="any"` on the item-qty input starting at line 3109.

    3. Line ~3343 (inside addItemRow — template string for new dynamically added row):
       Change `min="1"` to `min="0.01" step="any"` on the item-qty input starting at line 3339.

    No JavaScript changes needed in this file — every downstream reader (calculateSubtotal at 3218-3222, recalculateGrandTotal at 3239-3243, saveProgress at 2759, generatePR at 3553, submitTransportRequest at 3683, saveNewMRF at 5405 and 5590, generatePRandTR at 5887) already uses parseFloat. Verified via grep before planning.

    Do NOT touch any other input element. Do NOT modify calculation logic. Do NOT change validation messages.
  </action>
  <verify>
    <automated>MISSING — static site has no test harness; manual UAT via checkpoint task 3 below</automated>
    Static verification: `grep -n 'item-qty' app/views/procurement.js` should show all three render-site inputs now contain `step="any"` and `min="0.01"`.
  </verify>
  <done>
    All three item-qty <input> elements in procurement.js (lines ~2601, ~3109, ~3339) have `min="0.01" step="any"`. Grep finds zero remaining `min="1"` on item-qty inputs. No JavaScript logic changed.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Manual UAT — verify decimal QTY works in all three entry points</name>
  <what-built>
    HTML5 number inputs for MRF line-item QTY now accept decimal values (min 0.01, step any) in all four code locations: mrf-form.js template row, procurement.js renderMRFItemsTable, procurement.js Create MRF initial render, and procurement.js addItemRow. mrf-form.js collectItems now uses parseFloat to preserve decimal precision into Firestore.
  </what-built>
  <how-to-verify>
    Run `python -m http.server 8000` and open http://localhost:8000 in the browser.

    Test 1 — Standalone Create MRF (mrf-form.js):
    1. Navigate to the standalone Create MRF page (wherever the mrf-form view is routed)
    2. In the first item row, type `0.5` in the QTY field — input should accept it without the browser's "please enter valid value" tooltip
    3. Fill required fields (item name, unit, category)
    4. Click "Add Item" to add a new row
    5. In the new row, type `1.25` in the QTY field — should also accept
    6. Submit the MRF
    7. Open Firebase console > mrfs collection > the new doc > items_json — confirm qty values are 0.5 and 1.25 (not 0 or 1)

    Test 2 — Procurement > Create MRF (procurement.js line 3109/3339):
    1. Navigate to #/procurement/mrfs
    2. Click the Create MRF button/tab
    3. In the first line item, enter QTY `0.5` and unit cost `100`
    4. Confirm the subtotal shows 50.00 (not 0.00 or 100.00)
    5. Click "Add Item" to trigger addItemRow
    6. In the new row, enter QTY `2.75` — should accept
    7. Save the MRF and verify Firestore items_json has the decimal values intact

    Test 3 — Procurement > MRF Details edit (procurement.js line 2601):
    1. From #/procurement/mrfs, select an existing MRF to open MRF Details
    2. In the line items table, change an existing qty to `0.5`
    3. Confirm subtotal recalculates correctly
    4. Save and verify persistence in Firestore

    Test 4 — Regression check:
    1. Confirm entering `0` or negative values still fails validation (min="0.01" should block)
    2. Confirm entering whole numbers like `5` still works as before
    3. Confirm "Please enter quantity" toast still fires when qty is blank or zero

    Expected: All four tests pass. Decimal values persist as numbers (e.g. 0.5) in items_json, not strings or integers.
  </how-to-verify>
  <resume-signal>Type "approved" if all four tests pass, or describe any failure (which test, what happened vs expected, browser console errors).</resume-signal>
</task>

</tasks>

<verification>
- grep `min="1"` against both files shows zero matches on item-qty inputs
- grep `step="any"` shows 4 matches across mrf-form.js (1) and procurement.js (3)
- grep `parseInt.*item-qty` in mrf-form.js returns zero matches
- Manual UAT in task 3 confirms all three entry points accept decimals and persist them to Firestore
</verification>

<success_criteria>
1. User can enter 0.5 in MRF QTY across all three entry points (standalone form, procurement create, procurement edit) without browser rejection
2. Decimal values persist to Firestore items_json as numeric decimals, not truncated integers
3. Subtotal calculations reflect decimal quantities correctly (0.5 * 100 = 50)
4. Existing validation (zero/negative/blank rejection) still works
5. No regression in whole-number qty entry
</success_criteria>

<output>
After completion, create `.planning/quick/260408-fog-fix-mrf-qty-field-to-allow-decimal-value/260408-fog-SUMMARY.md`
</output>
