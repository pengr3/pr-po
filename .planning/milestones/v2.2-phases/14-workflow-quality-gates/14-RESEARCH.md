# Phase 14: Workflow Quality Gates - Research

**Researched:** 2026-02-06
**Domain:** Client-side form validation gates for PO workflow
**Confidence:** HIGH

## Summary

This phase implements a workflow quality gate that prevents Procurement users from viewing PO details until three required fields are filled: Payment Terms, Condition, and Delivery Date. The research examined the existing codebase patterns for modal displays, field validation, and edit interfaces to determine the best implementation approach.

The existing `viewPODetails()` function currently displays PO information unconditionally. The required fields (`payment_terms`, `condition`, `delivery_date`) exist in the PO schema but are optional - they have fallback defaults in the document generation code (`'As per agreement'`, `'Standard terms apply'`, `'TBD'`). The quality gate will intercept the view action and either:
1. Block viewing and prompt for required field entry if fields are missing
2. Allow viewing if all fields are populated

**Primary recommendation:** Add validation check in `viewPODetails()` before modal display, showing an inline edit form when required fields are missing. Use existing modal component patterns and follow established validation UX in the codebase.

## Standard Stack

This phase uses only existing codebase components - no new libraries needed.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Firebase Firestore | 10.7.1 | Database operations | Already in use, updateDoc for field updates |
| Vanilla JS | ES6+ | Form validation | Zero-build architecture requires no framework |

### Supporting
| Component | Location | Purpose | When to Use |
|-----------|----------|---------|-------------|
| `createModal()` | `app/components.js` | Modal dialogs | For displaying validation gate modal |
| `createFormGroup()` | `app/components.js` | Form inputs | For required field input forms |
| `showToast()` | `app/utils.js` | User feedback | For validation messages |
| `showLoading()` | `app/utils.js` | Loading states | During Firestore updates |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline edit in view modal | Separate edit modal | Single modal simpler, less navigation |
| Block view entirely | Show read-only with prompt | Better UX to show context while prompting |
| Native HTML5 validation | Custom JS validation | More control over UX and error messages |

**Installation:** None needed - use existing components.

## Architecture Patterns

### Recommended Implementation Structure
```
app/views/procurement.js
└── viewPODetails()        # Existing function to modify
    ├── Fetch PO data
    ├── Check required fields  # NEW: Quality gate check
    │   └── If missing:
    │       ├── Show edit form modal
    │       └── On save: Update Firestore, then show details
    └── Show details modal     # Existing behavior
```

### Pattern 1: Validation Gate Before Action
**What:** Check required fields before allowing the primary action
**When to use:** When specific fields must be populated before proceeding
**Example:**
```javascript
// Source: Existing codebase pattern (updatePOStatus line 3746-3761)
async function viewPODetails(poId) {
    // Fetch PO data first
    const poRef = doc(db, 'pos', poId);
    const poDoc = await getDoc(poRef);
    const po = { id: poDoc.id, ...poDoc.data() };

    // Quality gate check
    const missingFields = [];
    if (!po.payment_terms || po.payment_terms === 'As per agreement') {
        missingFields.push('Payment Terms');
    }
    if (!po.condition || po.condition === 'Standard terms apply') {
        missingFields.push('Condition');
    }
    if (!po.delivery_date || po.delivery_date === 'TBD') {
        missingFields.push('Delivery Date');
    }

    if (missingFields.length > 0) {
        // Show edit form instead of details
        showPORequiredFieldsForm(po, missingFields);
        return;
    }

    // Proceed with normal detail view
    // ... existing code ...
}
```

### Pattern 2: Inline Edit Form Modal
**What:** Modal with form inputs for required fields
**When to use:** When blocking an action until data is provided
**Example:**
```javascript
// Source: Existing createFormGroup pattern from components.js
function showPORequiredFieldsForm(po, missingFields) {
    const modalContent = `
        <div style="padding: 1rem;">
            <div class="alert alert-warning" style="margin-bottom: 1rem;">
                <strong>Required Information Missing</strong>
                <p>Please fill in the following fields before viewing PO details:</p>
            </div>
            <form id="poRequiredFieldsForm">
                ${createFormGroup({
                    label: 'Payment Terms',
                    type: 'text',
                    id: 'po-payment-terms',
                    name: 'payment_terms',
                    value: po.payment_terms !== 'As per agreement' ? po.payment_terms : '',
                    placeholder: 'e.g., Net 30, COD, 50% Downpayment',
                    required: true
                })}
                ${createFormGroup({
                    label: 'Condition',
                    type: 'text',
                    id: 'po-condition',
                    name: 'condition',
                    value: po.condition !== 'Standard terms apply' ? po.condition : '',
                    placeholder: 'e.g., FOB Shipping Point, CIF Manila',
                    required: true
                })}
                ${createFormGroup({
                    label: 'Delivery Date',
                    type: 'date',
                    id: 'po-delivery-date',
                    name: 'delivery_date',
                    value: po.delivery_date && po.delivery_date !== 'TBD' ? po.delivery_date : '',
                    required: true
                })}
            </form>
        </div>
    `;

    // Create and show modal using existing component pattern
    // ...
}
```

### Pattern 3: Save and Proceed
**What:** After saving required fields, automatically proceed to original action
**When to use:** For seamless workflow continuation
**Example:**
```javascript
// Source: Existing updateDoc pattern from updatePOStatus (line 3804-3805)
async function saveRequiredFieldsAndView(poId) {
    const paymentTerms = document.getElementById('po-payment-terms').value.trim();
    const condition = document.getElementById('po-condition').value.trim();
    const deliveryDate = document.getElementById('po-delivery-date').value;

    if (!paymentTerms || !condition || !deliveryDate) {
        showToast('Please fill in all required fields', 'error');
        return;
    }

    showLoading(true);
    try {
        await updateDoc(doc(db, 'pos', poId), {
            payment_terms: paymentTerms,
            condition: condition,
            delivery_date: deliveryDate,
            updated_at: new Date().toISOString()
        });

        closeModal('poRequiredFieldsModal');
        showToast('PO details updated', 'success');

        // Now proceed with original view action
        viewPODetailsAfterValidation(poId);
    } catch (error) {
        console.error('Error updating PO:', error);
        showToast('Failed to update PO', 'error');
    } finally {
        showLoading(false);
    }
}
```

### Anti-Patterns to Avoid
- **Silent blocking:** Don't just disable the view button - explain WHY it's disabled
- **Losing context:** Show the PO ID/reference in the edit modal so user knows what they're editing
- **No cancel option:** Always allow user to cancel out of the form
- **Inconsistent defaults:** The "As per agreement" and "Standard terms apply" ARE default values - treat them as empty for validation

## Don't Hand-Roll

This phase uses simple patterns - no complex solutions needed.

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Form validation | Custom validation library | Native HTML5 + JS check | Simple requirements, 3 fields only |
| Modal dialogs | Custom modal system | Existing `createModal()` | Already in codebase, consistent UX |
| Toast notifications | Custom notification system | Existing `showToast()` | Already in codebase |
| Date picker | Custom date widget | Native `<input type="date">` | Browser-native, good support |

**Key insight:** The existing component library (`app/components.js`) has everything needed. No new dependencies required.

## Common Pitfalls

### Pitfall 1: Treating Default Values as Valid
**What goes wrong:** Code checks `if (po.payment_terms)` but "As per agreement" is truthy
**Why it happens:** Existing code uses fallback defaults when generating documents
**How to avoid:** Check for BOTH empty/null AND the known default values
**Warning signs:** Users bypass gate because defaults are pre-populated
```javascript
// WRONG
if (!po.payment_terms) { ... }

// RIGHT
if (!po.payment_terms || po.payment_terms === 'As per agreement') { ... }
```

### Pitfall 2: Not Handling Existing POs
**What goes wrong:** Existing POs in database don't have these fields at all
**Why it happens:** Fields were optional before this gate was added
**How to avoid:** Treat undefined/null same as default values
**Warning signs:** `TypeError: Cannot read property of undefined`
```javascript
// Handle both missing and default
const needsPaymentTerms = !po.payment_terms || po.payment_terms === 'As per agreement';
```

### Pitfall 3: Race Condition on Real-time Updates
**What goes wrong:** User opens form, another user updates same PO, first user overwrites
**Why it happens:** Firestore real-time listeners in this view
**How to avoid:** Fetch fresh data before showing form, use optimistic locking pattern
**Warning signs:** Data loss when multiple users edit same PO
```javascript
// Always fetch fresh before showing edit form
const freshPO = await getDoc(doc(db, 'pos', poId));
```

### Pitfall 4: Breaking the View PO Button in Other Places
**What goes wrong:** Quality gate blocks viewing from PR-PO records tab but user is finance role
**Why it happens:** viewPODetails is called from multiple places
**How to avoid:** Gate should apply consistently OR only for procurement users (check requirement)
**Warning signs:** Confusion about when gate applies

### Pitfall 5: Window Function Lifecycle
**What goes wrong:** New window functions not cleaned up in destroy()
**Why it happens:** Adding new functions but forgetting cleanup
**How to avoid:** Add all new window functions to both attachWindowFunctions() and destroy()
**Warning signs:** Functions persist or disappear unexpectedly on tab switches

## Code Examples

### Example 1: Complete Validation Check
```javascript
// Source: Derived from existing updatePOStatus pattern (procurement.js:3725-3761)
function checkPORequiredFields(po) {
    const defaults = {
        payment_terms: 'As per agreement',
        condition: 'Standard terms apply',
        delivery_date: 'TBD'
    };

    const missing = [];

    if (!po.payment_terms || po.payment_terms === defaults.payment_terms) {
        missing.push({ field: 'payment_terms', label: 'Payment Terms' });
    }
    if (!po.condition || po.condition === defaults.condition) {
        missing.push({ field: 'condition', label: 'Condition' });
    }
    if (!po.delivery_date || po.delivery_date === defaults.delivery_date) {
        missing.push({ field: 'delivery_date', label: 'Delivery Date' });
    }

    return {
        isComplete: missing.length === 0,
        missingFields: missing
    };
}
```

### Example 2: Form Submission Handler
```javascript
// Source: Derived from existing modal patterns (procurement.js:4066-4095)
async function handleRequiredFieldsSubmit(poId) {
    const form = document.getElementById('poRequiredFieldsForm');

    // HTML5 validation
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const paymentTerms = document.getElementById('po-payment-terms').value.trim();
    const condition = document.getElementById('po-condition').value.trim();
    const deliveryDate = document.getElementById('po-delivery-date').value;

    showLoading(true);

    try {
        const poRef = doc(db, 'pos', poId);
        await updateDoc(poRef, {
            payment_terms: paymentTerms,
            condition: condition,
            delivery_date: deliveryDate,
            updated_at: new Date().toISOString()
        });

        closeModal('poRequiredFieldsModal');
        showToast('PO information updated successfully', 'success');

        // Proceed to view details
        viewPODetailsInternal(poId);

    } catch (error) {
        console.error('Error saving required fields:', error);
        showToast('Failed to save PO information', 'error');
    } finally {
        showLoading(false);
    }
}
```

### Example 3: Modal Footer with Cancel/Save
```javascript
// Source: Existing modal footer pattern (procurement.js:4079-4090)
const modalFooter = `
    <button class="btn btn-secondary" onclick="closeModal('poRequiredFieldsModal')">
        Cancel
    </button>
    <button class="btn btn-primary" onclick="window.handleRequiredFieldsSubmit('${poId}')">
        Save & View Details
    </button>
`;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Silently use default values | Require explicit entry | This phase | Better data quality |
| Edit fields after viewing | Edit fields before viewing | This phase | Workflow gate enforced |

**Deprecated/outdated:**
- None - this is a new feature

## Open Questions

1. **Should finance users be gated too?**
   - What we know: Requirement says "Procurement user cannot view"
   - What's unclear: Does this apply to finance users viewing the same PO?
   - Recommendation: Apply gate to all users for consistency (can be role-restricted later if needed)

2. **What about the "View PO" button in the details modal footer?**
   - What we know: After viewing details, user can click "View PO" to generate document
   - What's unclear: Should this also be gated, or is viewing details sufficient?
   - Recommendation: If user passed gate to see details, View PO should work (fields are now filled)

3. **Subcon POs - same requirements?**
   - What we know: Subcon POs have different status workflow
   - What's unclear: Do they need same payment_terms/condition/delivery_date?
   - Recommendation: Apply same gate (these fields make sense for all PO types)

## Sources

### Primary (HIGH confidence)
- `app/views/procurement.js` lines 3954-4103 - viewPODetails() implementation
- `app/views/procurement.js` lines 4816-4862 - generatePODocument() showing field usage
- `app/views/procurement.js` lines 3725-3820 - updatePOStatus() validation patterns
- `app/components.js` lines 69-116 - createModal(), openModal(), closeModal()
- `app/components.js` lines 263-300 - createFormGroup()

### Secondary (MEDIUM confidence)
- [MDN Client-side form validation](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Form_validation) - HTML5 validation patterns
- [UXPin Complex Approvals](https://www.uxpin.com/studio/blog/complex-approvals-app-design/) - Approval workflow UX patterns

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Uses only existing codebase components
- Architecture: HIGH - Follows established patterns in procurement.js
- Pitfalls: HIGH - Derived from codebase analysis and common JS patterns

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (30 days - stable feature)
