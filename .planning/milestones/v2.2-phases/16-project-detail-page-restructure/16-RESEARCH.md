# Phase 16: Project Detail Page Restructure - Research

**Researched:** 2026-02-07
**Domain:** Card-based UI restructure with inline editing patterns
**Confidence:** MEDIUM

## Summary

Phase 16 transforms a two-column form layout into a clearer card-based structure with three vertically-stacked cards, badge-style active toggle, and expense calculation modal. The research focused on proven patterns for vanilla JavaScript inline editing, card-based layouts, calculated fields, and modal expense breakdowns.

**Key findings:**
- Card-based layouts with vertical stacking reduce cognitive load and support responsive design naturally
- Inline editing with blur-event auto-save is the standard pattern, avoiding explicit "Save" buttons
- Locked fields should display as plain text with labels, NOT disabled inputs, for better UX and accessibility
- Badge-style toggles use `classList.toggle()` with confirmation modals for destructive actions
- Firestore aggregate queries (`sum()`, `count()`) are efficient for expense calculation, not real-time listeners

**Primary recommendation:** Use existing inline editing pattern from project-detail.js, extend to card-based layout. Plain text for locked fields (Project Code, Client). Badge toggle with confirmation modal for deactivation only. Manual expense refresh with Firestore aggregation.

## Standard Stack

The existing application stack provides all necessary capabilities:

### Core (Already in Use)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vanilla JavaScript | ES6 modules | DOM manipulation, event handling | Zero build system, native browser support |
| Firebase Firestore | v10.7.1 | Database with real-time listeners | Already integrated, supports aggregation |
| CSS Grid | Native | Card layout system | Responsive vertical stacking without framework |

### Supporting (Built-in Patterns)
| Pattern | Current Implementation | When to Use |
|---------|------------------------|-------------|
| `onblur` event handlers | `project-detail.js` line 271-283 | Auto-save on field exit |
| `classList.toggle()` | Native JavaScript | Badge-style toggle UI |
| `getAggregateFromServer()` | `finance.js` line 367-370 | Sum expense totals efficiently |
| Modal system | `components.css` line 512-680 | Expense breakdown display |

### No New Dependencies Required
This phase requires ZERO new libraries. All patterns exist in the current codebase:
- Inline editing: `app/views/project-detail.js`
- Card layouts: `styles/components.css` (`.card` class)
- Modals: `styles/components.css` (`.modal` class)
- Expense aggregation: `app/views/finance.js` (`refreshProjectExpenses()`)

## Architecture Patterns

### Pattern 1: Vertical Card Stack Layout
**What:** Three full-width cards stacked vertically with CSS Grid
**When to use:** Forms with logical field groupings, responsive requirements
**Example:**
```css
/* Vertical card stack container */
.project-detail-container {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    max-width: 1200px;
    margin: 0 auto;
}

.project-card {
    background: white;
    border-radius: 8px;
    padding: 1.5rem;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

/* Responsive two-column grid within cards */
.card-field-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
}

@media (max-width: 768px) {
    .card-field-grid {
        grid-template-columns: 1fr; /* Stack on mobile */
    }
}
```

**Why this works:**
- Cards naturally stack and reflow responsively
- Single-column on mobile, multi-column on desktop
- Clear visual separation between logical groups
- Reduces cognitive load per [Eleken: Card UI Best Practices](https://www.eleken.co/blog-posts/card-ui-examples-and-best-practices-for-product-owners)

### Pattern 2: Inline Auto-Save with Blur Event
**What:** Save field on blur (when user exits field), no explicit Save button
**When to use:** Single-field edits where each field is independent
**Example:**
```javascript
// Existing pattern from project-detail.js (line 271)
async function saveField(fieldName, newValue) {
    // Validation
    if (fieldName === 'project_name' && !newValue.trim()) {
        showFieldError(fieldName, 'Project name is required');
        return false;
    }

    // Save to Firestore
    try {
        await updateDoc(doc(db, 'projects', currentProject.id), {
            [fieldName]: newValue,
            updated_at: new Date().toISOString()
        });
        console.log('[ProjectDetail] Saved', fieldName);
        return true;
    } catch (error) {
        showFieldError(fieldName, 'Failed to save. Please try again.');
        return false;
    }
}

// HTML binding
<input type="text"
       data-field="project_name"
       value="${project.project_name}"
       onblur="window.saveField('project_name', this.value)">
```

**Best practices:**
- Silent success (no toast for every field save) per [Medium: Autosave Patterns](https://medium.com/@brooklyndippo/to-save-or-to-autosave-autosaving-patterns-in-modern-web-applications-39c26061aa6b)
- Show error toast only on failure
- Validate before save, show inline error on validation failure
- NO debouncing on blur (blur already signifies user finished editing)

### Pattern 3: Locked Fields as Plain Text
**What:** Display read-only fields as plain text with labels, not disabled inputs
**When to use:** Fields that never change (IDs, codes, linked references)
**Example:**
```html
<!-- ❌ BAD: Disabled input (poor UX, skipped by screen readers) -->
<div class="form-group">
    <label>Project Code</label>
    <input type="text" value="${project.project_code}" disabled
           style="background: #f5f5f5; cursor: not-allowed;">
</div>

<!-- ✅ GOOD: Plain text display (accessible, cleaner) -->
<div class="form-group">
    <label style="display: block; margin-bottom: 0.25rem; font-size: 0.875rem; color: #64748b;">
        Project Code
    </label>
    <div style="font-size: 1rem; font-weight: 500; color: #1e293b;">
        ${project.project_code}
    </div>
</div>
```

**Why this is better:**
- Disabled fields skipped by screen readers, plain text is read ([Cloudscape: Disabled vs Read-only](https://cloudscape.design/patterns/general/disabled-and-read-only-states/))
- Disabled inputs look "broken" or inactive
- Plain text can be selected/copied
- Cleaner visual hierarchy

### Pattern 4: Badge-Style Toggle with Confirmation
**What:** Click-to-toggle badge UI with confirmation modal for deactivation
**When to use:** Binary state changes with potential consequences
**Example:**
```javascript
// Badge toggle HTML
<div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1.5rem;">
    <span class="status-badge ${project.active ? 'approved' : 'rejected'}"
          onclick="window.toggleActive(${!project.active})"
          style="cursor: pointer; font-size: 0.875rem; padding: 0.5rem 1rem;">
        ${project.active ? 'Active' : 'Inactive'}
    </span>
    <span style="font-size: 0.75rem; color: #94a3b8;">
        Click to ${project.active ? 'deactivate' : 'activate'}
    </span>
</div>

// Toggle handler with confirmation for deactivation only
async function toggleActive(newValue) {
    // Confirm deactivation (Active → Inactive)
    if (!newValue) {
        const confirmed = confirm('Deactivate this project? Inactive projects cannot be selected for MRFs.');
        if (!confirmed) return;
    }

    // Activate instantly (no confirmation needed)
    try {
        await updateDoc(doc(db, 'projects', currentProject.id), {
            active: newValue,
            updated_at: new Date().toISOString()
        });
        showToast(`Project ${newValue ? 'activated' : 'deactivated'}`, 'success');
    } catch (error) {
        showToast('Failed to update status', 'error');
    }
}
```

**Best practices:**
- Confirm destructive actions only (deactivation), not constructive (activation)
- Use existing `.status-badge` classes from `components.css`
- Cursor pointer + helper text signals clickability
- Per [UX Movement: Confirmation Dialogs](https://uxmovement.medium.com/the-right-way-to-design-a-modal-confirmation-dialog-2457930895cd), be specific ("Deactivate this project?"), not generic ("Are you sure?")

### Pattern 5: Manual Expense Calculation with Firestore Aggregation
**What:** Calculate expense on page load + manual refresh button, NOT real-time listener
**When to use:** Aggregated calculations across multiple collections
**Example:**
```javascript
// Calculate expense for current project
async function calculateExpense() {
    try {
        // Sum all PO amounts for this project
        const posQuery = query(
            collection(db, 'pos'),
            where('project_name', '==', currentProject.project_name)
        );

        const aggregateSnapshot = await getAggregateFromServer(posQuery, {
            totalAmount: sum('total_amount'),
            poCount: count()
        });

        const expense = aggregateSnapshot.data().totalAmount || 0;
        const poCount = aggregateSnapshot.data().poCount || 0;

        // Also get TR totals
        const trsQuery = query(
            collection(db, 'transport_requests'),
            where('project_name', '==', currentProject.project_name)
        );

        const trAggregate = await getAggregateFromServer(trsQuery, {
            totalAmount: sum('total_amount')
        });

        const trTotal = trAggregate.data().totalAmount || 0;

        return {
            expense: expense + trTotal,
            poCount,
            trCount: trAggregate.data().count || 0
        };
    } catch (error) {
        console.error('[Expense] Calculation failed:', error);
        showToast('Failed to calculate expense', 'error');
        return { expense: 0, poCount: 0, trCount: 0 };
    }
}

// Refresh button
<button class="btn btn-sm btn-secondary" onclick="window.refreshExpense()">
    🔄 Refresh
</button>
```

**Why manual refresh:**
- Aggregation queries don't support real-time listeners ([Firebase: Aggregation Queries](https://firebase.google.com/docs/firestore/query-data/aggregation-queries))
- Expense calculation is expensive (multiple queries)
- User controls when to refresh (not constantly recalculating)
- Follows existing pattern from `finance.js` (line 343-393)

### Anti-Patterns to Avoid
- **DON'T use disabled inputs for locked fields:** Use plain text instead (Pattern 3)
- **DON'T debounce blur events:** Blur already signals completion ([JavaScript.info: Focus/Blur](https://javascript.info/focus-blur))
- **DON'T auto-refresh expense on every field change:** Manual refresh only (Pattern 5)
- **DON'T show success toast for every field save:** Silent success, error toast only
- **DON'T confirm activation:** Only confirm deactivation (Pattern 4)

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Card layout system | Custom flex/grid from scratch | Extend existing `.card` class from `components.css` | Already responsive, tested, consistent with app |
| Modal expense breakdown | New modal component | Reuse `.modal` from `components.css` + pattern from `finance.js` | Existing modal system with keyboard nav, Escape key |
| Expense aggregation | Loop through POs and sum in JS | Firestore `getAggregateFromServer()` with `sum()` | Saves on document reads, more efficient ([Google Cloud Blog: Aggregate with SUM](https://cloud.google.com/blog/products/databases/aggregate-with-sum-and-avg-in-firestore)) |
| Inline editing auto-save | Custom debounced onChange | Use `onblur` pattern from `project-detail.js` | Blur already signals completion, no race conditions |
| Toggle UI | Custom switch component | Style existing badge with `classList.toggle()` | Native JavaScript, no dependencies |

**Key insight:** The current codebase already has proven patterns for all required functionality. Don't reinvent. Reuse and adapt existing patterns from `project-detail.js`, `finance.js`, and `components.css`.

## Common Pitfalls

### Pitfall 1: Using Disabled Inputs for Locked Fields
**What goes wrong:** Disabled inputs are skipped by screen readers, look "broken", and cannot be selected/copied
**Why it happens:** Developers default to `disabled` attribute for read-only data
**How to avoid:** Display locked fields as plain text with labels (Pattern 3)
**Warning signs:** Gray background, `cursor: not-allowed`, user cannot copy Project Code

### Pitfall 2: Debouncing Blur Events
**What goes wrong:** Unnecessary complexity, potential race conditions if user navigates away before debounce fires
**Why it happens:** Developers think they need to debounce everything
**How to avoid:** Blur event already signals completion. Save immediately on blur.
**Warning signs:** `setTimeout()` in blur handler, "unsaved changes" state after blur

### Pitfall 3: Real-time Listeners for Aggregations
**What goes wrong:** Firestore aggregation queries don't support real-time listeners. You'll get no updates or errors.
**Why it happens:** Assuming all Firestore queries support `onSnapshot()`
**How to avoid:** Use manual refresh for aggregations. Only use listeners for single document queries.
**Warning signs:** `onSnapshot()` on `getAggregateFromServer()` results

### Pitfall 4: Confirming Every Toggle Action
**What goes wrong:** Confirmation fatigue. Users ignore confirmations if they appear too often ([Nielsen Norman: Confirmation Dialogs](https://www.nngroup.com/articles/confirmation-dialog/))
**Why it happens:** Over-caution about state changes
**How to avoid:** Only confirm destructive actions (deactivation), not constructive (activation)
**Warning signs:** Confirmation modal for both activate AND deactivate

### Pitfall 5: Success Toast for Every Field Save
**What goes wrong:** Toast notification overload. Distracting when editing multiple fields.
**Why it happens:** Wanting to confirm to user that save happened
**How to avoid:** Silent success (console.log only). Show error toast only on failure.
**Warning signs:** Green toast appears after every blur event

### Pitfall 6: Over-Engineering Card Layouts
**What goes wrong:** Complex grid systems with too many breakpoints, over-specified column counts
**Why it happens:** Trying to create pixel-perfect layouts
**How to avoid:** Use simple two-column grid with `grid-template-columns: repeat(2, 1fr)`, stack to single column on mobile. Let CSS Grid handle the rest.
**Warning signs:** Media queries for every screen size, hardcoded pixel widths

## Code Examples

Verified patterns for this phase:

### Card Structure with No Headers
```html
<!-- Card 1: Project Info -->
<div class="card" style="padding: 1.5rem;">
    <!-- Created/Updated metadata at top -->
    <div style="margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid #e5e7eb;">
        <p style="color: #94a3b8; font-size: 0.875rem; margin: 0;">
            Created: ${formatDate(project.created_at)}
            ${project.updated_at ? ' | Updated: ' + formatDate(project.updated_at) : ''}
        </p>
    </div>

    <!-- Two-column grid for fields -->
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;">
        <div class="form-group">
            <label>Project Code</label>
            <div style="font-weight: 500; color: #1e293b;">
                ${project.project_code}
            </div>
        </div>

        <div class="form-group">
            <label>Project Name *</label>
            <input type="text"
                   data-field="project_name"
                   value="${project.project_name}"
                   onblur="window.saveField('project_name', this.value)">
        </div>

        <!-- ... more fields ... -->
    </div>
</div>
```

### Badge-Style Active Toggle (Above Cards)
```html
<!-- Active toggle row - separate from cards -->
<div style="margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.75rem;">
    <span class="status-badge ${project.active ? 'approved' : 'rejected'}"
          onclick="window.toggleActive(${!project.active})"
          style="cursor: pointer; font-size: 0.875rem; padding: 0.5rem 1rem; transition: all 0.2s;">
        ${project.active ? '✓ Active' : '✗ Inactive'}
    </span>
    <span style="font-size: 0.75rem; color: #94a3b8;">
        ${project.active ? 'Click to deactivate (requires confirmation)' : 'Click to activate'}
    </span>
</div>

<!-- Then cards below -->
```

### Calculated Field with Refresh Button
```html
<!-- Card 2: Financial Summary -->
<div class="card" style="padding: 1.5rem;">
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;">
        <!-- Editable -->
        <div class="form-group">
            <label>Budget</label>
            <input type="number"
                   data-field="budget"
                   value="${project.budget || ''}"
                   onblur="window.saveField('budget', this.value)">
        </div>

        <!-- Calculated (display-only) -->
        <div class="form-group">
            <label style="display: flex; justify-content: space-between; align-items: center;">
                <span>Expense</span>
                <button class="btn btn-sm btn-secondary"
                        onclick="window.refreshExpense()"
                        style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">
                    🔄 Refresh
                </button>
            </label>
            <div style="font-weight: 600; color: #1e293b; font-size: 1.125rem; cursor: pointer;"
                 onclick="window.showExpenseModal()">
                ${expense ? formatCurrency(expense) : '—'}
            </div>
            <small style="color: #64748b; font-size: 0.75rem;">
                Click to view breakdown
            </small>
        </div>

        <!-- Calculated (Remaining Budget) -->
        <div class="form-group">
            <label>Remaining Budget</label>
            <div style="font-weight: 600; color: ${remainingBudget >= 0 ? '#059669' : '#ef4444'}; font-size: 1.125rem;">
                ${budget ? formatCurrency(remainingBudget) : '—'}
            </div>
        </div>
    </div>
</div>
```

### Expense Modal (Reuse Finance Pattern)
```javascript
// Source: Adapted from finance.js line 442-520
async function showExpenseModal() {
    showLoading(true);

    try {
        // Aggregate by category
        const posQuery = query(
            collection(db, 'pos'),
            where('project_name', '==', currentProject.project_name)
        );

        const posSnapshot = await getDocs(posQuery);
        const categoryTotals = {};
        let grandTotal = 0;

        posSnapshot.forEach(poDoc => {
            const po = poDoc.data();
            const items = JSON.parse(po.items_json || '[]');

            items.forEach(item => {
                const category = item.category || 'Uncategorized';
                const subtotal = parseFloat(item.subtotal || 0);

                if (!categoryTotals[category]) {
                    categoryTotals[category] = { amount: 0, items: [] };
                }
                categoryTotals[category].amount += subtotal;
                categoryTotals[category].items.push({
                    po_id: po.po_id,
                    item_name: item.item_name,
                    subtotal
                });
                grandTotal += subtotal;
            });
        });

        // Render scorecard + breakdown
        const modalBody = document.getElementById('expenseModalBody');
        modalBody.innerHTML = `
            <!-- Scorecards -->
            <div class="expense-summary-grid">
                ${Object.entries(categoryTotals).map(([category, data]) => `
                    <div class="expense-summary-card">
                        <div class="expense-summary-label">${category}</div>
                        <div class="expense-summary-value">${formatCurrency(data.amount)}</div>
                    </div>
                `).join('')}
                <div class="expense-summary-card total">
                    <div class="expense-summary-label">Total Expense</div>
                    <div class="expense-summary-value">${formatCurrency(grandTotal)}</div>
                </div>
            </div>

            <!-- Detailed Tables by Category -->
            ${Object.entries(categoryTotals).map(([category, data]) => `
                <div class="category-card">
                    <div class="category-header">
                        <span class="category-name">${category}</span>
                        <span class="category-amount">${formatCurrency(data.amount)}</span>
                    </div>
                    <div class="category-items">
                        <table class="modal-items-table">
                            <thead>
                                <tr>
                                    <th>PO ID</th>
                                    <th>Item</th>
                                    <th style="text-align: right;">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${data.items.map(item => `
                                    <tr>
                                        <td>${item.po_id}</td>
                                        <td>${item.item_name}</td>
                                        <td style="text-align: right;">${formatCurrency(item.subtotal)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `).join('')}
        `;

        document.getElementById('expenseModal').classList.add('active');
    } catch (error) {
        console.error('[Expense] Modal failed:', error);
        showToast('Failed to load expense breakdown', 'error');
    } finally {
        showLoading(false);
    }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Form layouts with explicit "Save" buttons | Inline editing with blur auto-save | ~2020 | Users expect instant saves in modern web apps |
| Disabled inputs for read-only fields | Plain text display with labels | 2024+ | Better accessibility (screen readers), UX clarity |
| Real-time listeners for everything | Manual refresh for expensive aggregations | 2023 (Firestore aggregation release) | Reduced query costs, controlled updates |
| Generic "Are you sure?" confirmations | Specific action descriptions | Ongoing | Reduces confirmation fatigue, clearer intent |
| Framework-heavy card systems | Native CSS Grid | 2020+ | Zero dependencies, native browser support |

**Deprecated/outdated:**
- Disabled inputs for locked fields: Use plain text instead (accessibility)
- jQuery toggle plugins: Use native `classList.toggle()` (zero dependencies)
- Client-side sum loops: Use Firestore `getAggregateFromServer()` (efficiency)

## Open Questions

Things that couldn't be fully resolved:

1. **Expense calculation scope: Should it include delivery fees?**
   - What we know: Current `finance.js` pattern sums PO `total_amount` only
   - What's unclear: If delivery fees are stored separately in PO documents or included in `total_amount`
   - Recommendation: Follow existing `finance.js` pattern (line 367-370). Inspect PO schema to verify if delivery fees are part of `total_amount` or need separate query.

2. **Personnel field: Should it still allow freetext fallback?**
   - What we know: `project-detail.js` supports both user ID matching and freetext fallback (line 365-401)
   - What's unclear: If Phase 16 should remove freetext or keep backward compatibility
   - Recommendation: Keep existing pattern for backward compatibility unless CONTEXT.md specifies otherwise. User chose datalist for Card 1, which suggests user validation is preferred.

3. **Remaining Budget styling: Positive vs negative?**
   - What we know: Remaining Budget = Budget - Expense (calculated field)
   - What's unclear: Exact color coding (green for positive, red for negative? Neutral always?)
   - Recommendation: Color code: green (#059669) if positive, red (#ef4444) if negative, gray (#64748b) if budget not set.

## Sources

### Primary (HIGH confidence)
- Firebase Firestore Aggregation Queries: https://firebase.google.com/docs/firestore/query-data/aggregation-queries
- Google Cloud Blog: Aggregate with SUM and AVG in Firestore: https://cloud.google.com/blog/products/databases/aggregate-with-sum-and-avg-in-firestore
- Existing codebase patterns:
  - `app/views/project-detail.js` (inline editing, line 271-436)
  - `app/views/finance.js` (expense aggregation, line 343-520)
  - `styles/components.css` (card/modal systems, line 198-680)

### Secondary (MEDIUM confidence)
- Medium: Autosave Patterns in Modern Web Applications: https://medium.com/@brooklyndippo/to-save-or-to-autosave-autosaving-patterns-in-modern-web-applications-39c26061aa6b
- JavaScript.info: Focus and Blur Events: https://javascript.info/focus-blur
- Cloudscape Design System: Disabled and Read-only States: https://cloudscape.design/patterns/general/disabled-and-read-only-states/
- Nielsen Norman Group: Confirmation Dialogs Can Prevent User Errors: https://www.nngroup.com/articles/confirmation-dialog/
- UX Movement: The Right Way to Design a Modal Confirmation Dialog: https://uxmovement.medium.com/the-right-way-to-design-a-modal-confirmation-dialog-2457930895cd

### Tertiary (LOW confidence - general guidance)
- Eleken: Card UI Design Examples and Best Practices: https://www.eleken.co/blog-posts/card-ui-examples-and-best-practices-for-product-owners
- Medium: Vertical vs. Horizontal Cards (2026): https://medium.com/@WebdesignerDepot/vertical-vs-horizontal-cards-the-ux-tradeoffs-that-shape-modern-interfaces-21fc354cbde0
- Web Designer Depot: How Card-Based Layouts Shape Modern UX: https://designshack.net/articles/ux-design/card-layouts-modern-ux/

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All patterns already exist in codebase
- Architecture: MEDIUM - Patterns verified via WebSearch + existing code, not official Firestore docs for all
- Pitfalls: MEDIUM - Based on general UX best practices + existing code patterns

**Research date:** 2026-02-07
**Valid until:** 60 days (stable vanilla JavaScript patterns, Firestore API stable)
