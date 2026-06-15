---
quick_id: 260408-ikv
type: execute
wave: 1
depends_on: []
files_modified:
  - app/views/procurement.js
autonomous: false
requirements:
  - QUICK-260408-IKV
must_haves:
  truths:
    - "When a PO has at least one active non-Delivery-Fee RFP, opening the PO Details modal shows Document Details as read-only (no inputs, no Save button)."
    - "When a PO has zero RFPs, or only Delivery Fee RFPs, opening the PO Details modal shows Document Details as the existing editable form (tranche builder + Condition input + Delivery Date input + Save button)."
    - "When all RFPs for a PO are cancelled (deleted), reopening the PO Details modal shows Document Details as editable again."
    - "A clear locked-state notice is rendered above/within the read-only Document Details section explaining why it is locked."
    - "savePODocumentFields and renderTrancheBuilder are NOT modified."
  artifacts:
    - path: "app/views/procurement.js"
      provides: "viewPODetails Document Details section conditionally rendered as locked or editable based on rfpsByPO[po.po_id]"
      contains: "hasActiveRFP"
  key_links:
    - from: "viewPODetails (app/views/procurement.js ~line 6948)"
      to: "rfpsByPO module-level object (~line 61-62, 6240-6257)"
      via: "rfpsByPO[po.po_id].some(r => r.tranche_label !== 'Delivery Fee')"
      pattern: "rfpsByPO\\[po\\.po_id\\]"
---

<objective>
Lock the "Document Details" section of the PO Details modal (`viewPODetails` in `app/views/procurement.js`) when the PO has at least one active non-Delivery-Fee RFP. Unlock (current editable behavior) when no active RFPs exist or only Delivery Fee RFPs exist. Cancellation of RFPs (delete via Phase 65.10) naturally restores the editable state on next modal open because cancelled RFPs are removed from `rfpsByPO`.

Purpose: Prevent users from editing tranches, condition, and delivery date after RFPs have been generated against a PO — those fields drive RFP tranche structure and must remain stable while RFPs are in progress.

Output: Modified `viewPODetails` function that conditionally renders the Document Details section in either locked (read-only) or unlocked (editable, current) mode based on `rfpsByPO`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@app/views/procurement.js

<interfaces>
<!-- Module-level state already live-updated by onSnapshot in loadPOTracking -->

`rfpsByPO` (declared ~line 61-62, populated in onSnapshot ~6240-6257):
```js
// Keyed by rfp.po_id (human-readable PO ID like "PO-2026-001")
// Each value: array of RFP documents
// rfp shape (relevant fields):
//   { id, po_id, tranche_label, tranche_percentage, amount_requested, payment_records, ... }
// Cancelled RFPs are deleteDoc'd (Phase 65.10) and naturally drop out of rfpsByPO.
```

`viewPODetails(poId)` (~line 6948):
- `poId` = Firestore doc ID
- Fetches PO, sets `po = { id: poDoc.id, ...poDoc.data() }`
- `po.po_id` = human-readable PO ID (the key into `rfpsByPO`)
- Document Details section: lines 7036-7060
  - `renderTrancheBuilder(poTranches, po.id)` — produces editable tranche UI
  - `<input id="editCondition_${po.id}">`
  - `<input type="date" id="editDeliveryDate_${po.id}">`
  - `<button onclick="savePODocumentFields('${po.id}')">Save Document Details</button>`

Lock predicate:
```js
const hasActiveRFP = (rfpsByPO[po.po_id] || [])
  .some(r => r.tranche_label !== 'Delivery Fee');
```

Locked-state rendering requirements:
- Replace `renderTrancheBuilder(...)` with a plain read-only list of tranches: each shows `${escapeHTML(t.label)} — ${t.percentage}%`
- Replace Condition input with `<span>${escapeHTML(po.condition || '—')}</span>`
- Replace Delivery Date input with `<span>${escapeHTML(po.delivery_date || '—')}</span>`
- Remove the Save Document Details button entirely
- Add a notice above the fields:
  `<div style="padding: 0.5rem 0.75rem; background: #fef3c7; color: #92400e; border-radius: 6px; font-size: 0.8125rem; margin-bottom: 0.75rem;">🔒 Document Details are locked while an active RFP is in progress. Cancel all RFPs to edit.</div>`
  (No emoji per project conventions — use plain text "Locked:" prefix instead.)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Conditionally render Document Details as locked when active RFP exists</name>
  <files>app/views/procurement.js</files>
  <behavior>
    - When `rfpsByPO[po.po_id]` contains at least one entry with `tranche_label !== 'Delivery Fee'`, the Document Details section renders read-only (no inputs, no Save button, with a lock notice).
    - When `rfpsByPO[po.po_id]` is undefined, empty, or contains only entries with `tranche_label === 'Delivery Fee'`, the Document Details section renders the existing editable form unchanged.
    - The rest of `viewPODetails` (header grid, Items table, modal chrome) is untouched.
    - `savePODocumentFields` and `renderTrancheBuilder` source is NOT modified.
  </behavior>
  <action>
    In `app/views/procurement.js`, inside `viewPODetails(poId)` after `const poTranches = ...` (~line 6995) and before the `let modalBodyContent = \`...\`` template:

    1. Compute the lock flag:
       ```js
       const hasActiveRFP = (rfpsByPO[po.po_id] || [])
         .some(r => r.tranche_label !== 'Delivery Fee');
       ```

    2. Build a `documentDetailsHTML` string with two branches:

       **Locked branch** (`hasActiveRFP === true`):
       ```html
       <div style="margin-top: 1.5rem; padding: 1rem; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
         <h4 style="margin-bottom: 1rem; color: #1e293b;">Document Details</h4>
         <div style="padding: 0.5rem 0.75rem; background: #fef3c7; color: #92400e; border-radius: 6px; font-size: 0.8125rem; margin-bottom: 0.75rem; font-weight: 600;">
           Locked: Document Details cannot be edited while an active RFP is in progress. Cancel all RFPs for this PO to edit again.
         </div>
         <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;">
           <div style="grid-column: span 2;">
             <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #475569; font-size: 0.875rem;">Payment Tranches</label>
             <ul style="margin: 0; padding-left: 1.25rem; font-size: 0.875rem; color: #1e293b;">
               ${poTranches.map(t => `<li>${escapeHTML(t.label || '')} — ${Number(t.percentage || 0)}%</li>`).join('')}
             </ul>
           </div>
           <div>
             <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #475569; font-size: 0.875rem;">Condition</label>
             <span style="display: block; font-size: 0.875rem; color: #1e293b;">${escapeHTML(po.condition || '—')}</span>
           </div>
           <div style="grid-column: span 2;">
             <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #475569; font-size: 0.875rem;">Delivery Date</label>
             <span style="display: block; font-size: 0.875rem; color: #1e293b;">${escapeHTML(po.delivery_date || '—')}</span>
           </div>
         </div>
       </div>
       ```

       **Unlocked branch** (`hasActiveRFP === false`): the existing literal HTML from lines 7036-7060 unchanged.

    3. Replace the literal Document Details block (lines 7036-7060) inside the existing `modalBodyContent` template with `${documentDetailsHTML}`.

    Notes:
    - Use `escapeHTML` (already imported in this file) for all PO-derived strings.
    - Do NOT touch any other section of `viewPODetails`.
    - Do NOT modify `savePODocumentFields` or `renderTrancheBuilder`.
    - `rfpsByPO` is already in module scope and live-updated by the existing `onSnapshot` in `loadPOTracking`; no new listener required.
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');const s=fs.readFileSync('app/views/procurement.js','utf8');if(!s.includes('hasActiveRFP'))throw new Error('hasActiveRFP missing');if(!s.includes(\"rfpsByPO[po.po_id]\"))throw new Error('rfpsByPO lookup missing');if(!s.includes('documentDetailsHTML'))throw new Error('documentDetailsHTML var missing');console.log('OK');"</automated>
  </verify>
  <done>
    - `hasActiveRFP` computed from `rfpsByPO[po.po_id]` excluding `tranche_label === 'Delivery Fee'`.
    - `documentDetailsHTML` variable holds either locked or editable HTML.
    - Editable branch HTML is byte-equivalent to the original lines 7036-7060.
    - File parses (no syntax errors when loaded by browser — verified at checkpoint).
    - `savePODocumentFields` and `renderTrancheBuilder` definitions untouched (grep diff shows zero changes outside `viewPODetails`).
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Manually verify lock/unlock behavior in the browser</name>
  <what-built>
    `viewPODetails` now conditionally renders Document Details as read-only when an active non-Delivery-Fee RFP exists, and as the existing editable form otherwise.
  </what-built>
  <how-to-verify>
    1. Start dev server: `python -m http.server 8000`
    2. Open `http://localhost:8000` and navigate to Procurement → MRF Records.
    3. **Test unlocked state** — Find a PO that has zero RFPs (or only Delivery Fee RFPs):
       - Click the PO ID to open PO Details modal.
       - Confirm Document Details shows: editable tranche builder, Condition input, Delivery Date input, "Save Document Details" button. Confirm Save still works.
    4. **Test locked state** — Find (or create via right-click → Generate RFP) a PO with at least one regular tranche RFP:
       - Click the PO ID to open PO Details modal.
       - Confirm Document Details shows: amber "Locked" notice, plain-text tranche list, plain-text Condition value, plain-text Delivery Date value, NO Save button.
    5. **Test unlock-after-cancel** — On the locked PO from step 4:
       - Cancel all its non-Delivery-Fee RFPs (Phase 65.10 cancel flow).
       - Reopen PO Details modal.
       - Confirm Document Details is editable again.
    6. **Test Delivery Fee only** — On a PO whose only RFP is a Delivery Fee RFP:
       - Confirm Document Details is editable (Delivery Fee RFPs do NOT lock).
    7. Confirm no console errors in DevTools.
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues found.</resume-signal>
</task>

</tasks>

<verification>
- `hasActiveRFP` predicate matches the spec exactly (uses `po.po_id` not `po.id`, excludes `'Delivery Fee'`).
- Locked HTML uses `escapeHTML` for all PO-derived values.
- Editable branch is byte-identical to original (no accidental edits).
- `savePODocumentFields` and `renderTrancheBuilder` unchanged.
- Manual UAT (Task 2) confirms all 4 states: no RFPs (editable), regular RFP (locked), all RFPs cancelled (editable again), Delivery Fee only (editable).
</verification>

<success_criteria>
- Opening PO Details for a PO with an active regular RFP shows read-only Document Details with lock notice.
- Opening PO Details for a PO with no RFPs or only Delivery Fee RFPs shows the existing editable Document Details unchanged.
- Cancelling all regular RFPs and reopening the modal restores editability.
- No regressions to other PO Details modal sections, no console errors.
- Single file modified: `app/views/procurement.js`.
</success_criteria>

<output>
After completion, create `.planning/quick/260408-ikv-lock-po-document-details-when-active-rfp/260408-ikv-SUMMARY.md` capturing:
- Final lock predicate
- Line range modified in `viewPODetails`
- UAT results from Task 2
</output>
