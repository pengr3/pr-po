---
status: resolved
trigger: "Investigate this UAT issue: The PO document dynamic fields prompt (Payment Terms, Condition, Delivery Date) currently shows EVERY time the user clicks 'View PO'. User wants it to be one-time: show prompt only if fields are empty/missing, otherwise go directly to document generation."
created: 2026-02-08T00:00:00Z
updated: 2026-02-08T00:20:00Z
---

## Current Focus

hypothesis: Investigation complete - understand flow and solution
test: Documentation complete
expecting: Findings documented for gap closure plan
next_action: Complete - findings ready for implementation

## Symptoms

expected: PO document prompt should only show if payment_terms, condition, or delivery_date are missing; otherwise go directly to document generation
actual: Prompt shows EVERY time user clicks "View PO"
errors: None - this is a UX enhancement request
reproduction: Click "View PO" button on any PO multiple times - prompt appears each time
started: Always been this way - feature enhancement request

## Eliminated

## Evidence

- timestamp: 2026-02-08T00:10:00Z
  checked: promptPODocument function (lines 4962-5012)
  found: Function ALWAYS shows modal prompt when called, no skip logic exists
  implication: Every "View PO" click triggers the prompt, regardless of whether fields already exist

- timestamp: 2026-02-08T00:12:00Z
  checked: generatePOWithFields function (lines 5024-5051)
  found: Saves payment_terms, condition, delivery_date to Firestore PO document via updateDoc()
  implication: Fields are persisted and can be checked to determine if prompt should be skipped

- timestamp: 2026-02-08T00:15:00Z
  checked: "View PO" button locations
  found: Two locations - (1) PO table row line 3722: onclick="promptPODocument('${po.id}')", (2) viewPODetails modal footer line 4168: onclick="window.promptPODocument('${po.id}')"
  implication: Both buttons call promptPODocument directly, need to add conditional logic

- timestamp: 2026-02-08T00:18:00Z
  checked: viewPODetails modal structure (lines 4041-4189)
  found: Modal shows PO info in 2-column grid (lines 4088-4123) with fields like PO ID, MRF Reference, Supplier, Project, Date Issued, Status, Total Amount, Delivery Fee
  implication: Can add payment_terms, condition, delivery_date as display/editable fields in this grid

## Resolution

root_cause: promptPODocument always shows modal without checking if payment_terms, condition, or delivery_date already exist on the PO document

fix: Add conditional check in promptPODocument - if all three fields exist, call generatePODocument directly; otherwise show prompt modal. Add editable fields to viewPODetails modal for later editing.

verification: Test by (1) viewing new PO - prompt should appear, (2) filling fields and generating document, (3) viewing same PO again - should skip prompt and go directly to document generation, (4) editing fields from PO Details modal

files_changed:
- app/views/procurement.js

---

## DETAILED FINDINGS

### 1. Current promptPODocument Flow (Lines 4962-5012)

**Location:** `app/views/procurement.js`, function `promptPODocument(poDocId)`

**Current Behavior:**
1. Fetches PO data from Firestore: `const poDoc = await getDoc(doc(db, 'pos', poDocId))`
2. Pre-fills modal inputs with existing values if they exist:
   - `po.payment_terms || ''`
   - `po.condition || ''`
   - `po.delivery_date || ''`
3. **ALWAYS** displays modal using `createModal()` and `openModal('poDocFieldsModal')`
4. Modal has "Generate PO Document" button that calls `generatePOWithFields('${poDocId}')`

**Problem:** No conditional logic - prompt shows EVERY time, even if fields already exist.

### 2. generatePOWithFields Flow (Lines 5024-5051)

**Location:** `app/views/procurement.js`, function `generatePOWithFields(poDocId)`

**Current Behavior:**
1. Reads form values from modal inputs:
   ```javascript
   const paymentTerms = document.getElementById('poDocPaymentTerms')?.value?.trim() || '';
   const condition = document.getElementById('poDocCondition')?.value?.trim() || '';
   const deliveryDate = document.getElementById('poDocDeliveryDate')?.value || '';
   ```
2. Saves to Firestore (only non-empty fields):
   ```javascript
   const updateData = {};
   if (paymentTerms) updateData.payment_terms = paymentTerms;
   if (condition) updateData.condition = condition;
   if (deliveryDate) updateData.delivery_date = deliveryDate;
   await updateDoc(doc(db, 'pos', poDocId), updateData);
   ```
3. Closes modal: `closeModal('poDocFieldsModal')`
4. Calls `generatePODocument(poDocId)` to create the actual document

**Key Insight:** Fields ARE saved to Firestore and persist, so they can be checked.

### 3. "View PO" Button Locations

**Location 1:** PO table row (Line 3722)
```javascript
<button class="btn btn-sm btn-secondary" onclick="promptPODocument('${po.id}')">View PO</button>
```

**Location 2:** PO Details Modal footer (Line 4168)
```javascript
<button class="btn btn-primary" onclick="window.promptPODocument('${po.id}')">
    View PO
</button>
```

**Note:** Both buttons call `promptPODocument()` directly.

### 4. Proposed Skip Condition

**Logic to add at start of `promptPODocument()`:**

```javascript
async function promptPODocument(poDocId) {
    // Fetch current PO data
    try {
        const poRef = doc(db, 'pos', poDocId);
        const poDoc = await getDoc(poRef);
        if (!poDoc.exists()) {
            showToast('PO not found', 'error');
            return;
        }
        const po = poDoc.data();

        // CHECK: If all three fields exist, skip prompt and go directly to document
        if (po.payment_terms && po.condition && po.delivery_date) {
            console.log('All fields present - skipping prompt, generating document directly');
            await generatePODocument(poDocId);
            return;
        }

        // OTHERWISE: Show prompt modal (existing code continues)
        // ... rest of function
    } catch (error) {
        // error handling
    }
}
```

**Condition:** Skip prompt if `payment_terms AND condition AND delivery_date` all have truthy values.

### 5. PO Details Modal - Where to Add Editable Fields

**Location:** `app/views/procurement.js`, function `viewPODetails(poId)`, lines 4041-4189

**Current Structure:**
- Lines 4088-4123: 2-column grid with PO metadata
- Existing fields: PO ID, MRF Reference, Supplier, Project, Date Issued, Status, Total Amount, Delivery Fee (conditional)

**Proposed Addition (after existing grid, before Items table):**

Insert after line 4123, before the "Items" section at line 4125:

```javascript
                </div>

                <!-- NEW SECTION: Document Fields (Editable) -->
                <div style="margin-top: 1.5rem; padding: 1rem; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                    <h4 style="margin-bottom: 1rem; color: #1e293b;">Document Details</h4>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;">
                        <div>
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #475569; font-size: 0.875rem;">Payment Terms</label>
                            <input type="text" id="editPaymentTerms_${po.id}" value="${po.payment_terms || ''}"
                                   placeholder="e.g., 50% down payment, 50% upon delivery"
                                   style="width: 100%; padding: 0.5rem; border: 1.5px solid #cbd5e1; border-radius: 6px; font-size: 0.875rem;">
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #475569; font-size: 0.875rem;">Condition</label>
                            <input type="text" id="editCondition_${po.id}" value="${po.condition || ''}"
                                   placeholder="e.g., Items must meet quality standards"
                                   style="width: 100%; padding: 0.5rem; border: 1.5px solid #cbd5e1; border-radius: 6px; font-size: 0.875rem;">
                        </div>
                        <div style="grid-column: span 2;">
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #475569; font-size: 0.875rem;">Delivery Date</label>
                            <input type="date" id="editDeliveryDate_${po.id}" value="${po.delivery_date || ''}"
                                   style="width: 100%; padding: 0.5rem; border: 1.5px solid #cbd5e1; border-radius: 6px; font-size: 0.875rem;">
                        </div>
                    </div>
                    <button class="btn btn-sm btn-primary" onclick="savePODocumentFields('${po.id}')"
                            style="margin-top: 1rem;">
                        Save Document Details
                    </button>
                </div>

                <div style="margin-top: 1.5rem;">
                    <h4 style="margin-bottom: 0.75rem;">Items (${items.length})</h4>
                    <!-- existing items table -->
```

**New Function Needed:**

```javascript
async function savePODocumentFields(poId) {
    const paymentTerms = document.getElementById(`editPaymentTerms_${poId}`)?.value?.trim() || '';
    const condition = document.getElementById(`editCondition_${poId}`)?.value?.trim() || '';
    const deliveryDate = document.getElementById(`editDeliveryDate_${poId}`)?.value || '';

    try {
        const updateData = {};
        if (paymentTerms) updateData.payment_terms = paymentTerms;
        if (condition) updateData.condition = condition;
        if (deliveryDate) updateData.delivery_date = deliveryDate;

        if (Object.keys(updateData).length > 0) {
            await updateDoc(doc(db, 'pos', poId), updateData);
            showToast('Document details updated successfully', 'success');
            // Refresh the modal to show updated values
            closeModal('poDetailsModal');
            viewPODetails(poId);
        } else {
            showToast('No changes to save', 'info');
        }
    } catch (error) {
        console.error('Error saving document fields:', error);
        showToast('Failed to save document details', 'error');
    }
}
window.savePODocumentFields = savePODocumentFields;
```

### Summary of Changes Required

**File:** `app/views/procurement.js`

**Change 1:** Modify `promptPODocument()` function (line 4962)
- Add conditional check at the start
- If all three fields exist: call `generatePODocument()` directly and return
- Otherwise: show prompt modal (existing behavior)

**Change 2:** Modify `viewPODetails()` function (line 4041)
- Add editable fields section after line 4123
- Create input fields for payment_terms, condition, delivery_date
- Add "Save Document Details" button

**Change 3:** Add new function `savePODocumentFields(poId)`
- Read values from editable inputs
- Update Firestore PO document
- Refresh modal to show updated values
- Expose to window for onclick access

**User Flow After Changes:**
1. **First time:** User clicks "View PO" → Prompt appears (fields empty) → User fills → Document generated
2. **Subsequent times:** User clicks "View PO" → Document generated directly (skip prompt)
3. **To edit fields:** User opens PO Details Modal → Edit fields in "Document Details" section → Save → Changes persist
