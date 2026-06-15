# Phase 13: Finance Dashboard & Audit Trails - Research

**Researched:** 2026-02-05
**Domain:** Financial dashboards, data aggregation, audit trails, charting
**Confidence:** HIGH

## Summary

Phase 13 adds financial overview capabilities to the finance view by implementing project expense tracking, supplier purchase history, and procurement timeline visualization. The key technical challenge is efficiently aggregating financial data from the `pos` (Purchase Orders) collection without loading all documents client-side.

**Research shows:**
- Firestore's `getAggregateFromServer()` API (v10.6.0+) enables server-side sum/count aggregation without reading all documents, addressing v2.1's identified "financial aggregation cost concerns"
- Chart.js 4.5+ is the standard lightweight charting library for dashboards, requiring proper lifecycle management (destroy before recreating charts)
- Timeline visualization already exists in the codebase (`createTimeline` component) and follows established modal patterns
- Real-time updates are NOT supported by aggregation queries - must use manual refresh or periodic polling

**Primary recommendation:** Use `getAggregateFromServer()` for all financial totals, group POs client-side only when displaying details in modals (filtered subsets), and leverage existing modal/timeline patterns from components.js.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Firestore Aggregation | v10.7.1 (CDN) | Server-side sum/count | Official Firebase API, reduces read costs by ~99% for large datasets |
| Chart.js | 4.5.1 | Data visualization | Industry standard, 48KB minified, HTML5 Canvas rendering for performance |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Existing components.js | current | Modal, timeline UI | Already provides `createModal`, `createTimeline` - no new dependencies |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Chart.js | ECharts | Better for high-volume real-time data (400KB), overkill for static dashboards |
| Chart.js | Google Charts | Free but requires external CDN, less customizable |
| Server aggregation | Client-side reduce() | Simple but costs 1 read per document (expensive at scale) |

**Installation:**

Firestore aggregation (add to firebase.js imports):
```javascript
import {
    getAggregateFromServer,
    sum,
    count,
    average
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
```

Chart.js (add to index.html):
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"></script>
```

## Architecture Patterns

### Recommended Project Structure
```
app/views/
├── finance.js           # Add new tab: "projects"
└── ...

styles/
├── components.css       # Already has .modal, .timeline styles
└── ...
```

### Pattern 1: Server-Side Aggregation for Financial Totals
**What:** Use `getAggregateFromServer()` to calculate project totals without loading all PO documents

**When to use:** Dashboard summary cards, project expense totals, supplier total purchases

**Example:**
```javascript
// Source: Firebase Firestore v10 Aggregation Queries
import { collection, query, where, sum, count, getAggregateFromServer } from '../firebase.js';

// Get total expenses for a project
async function getProjectExpenses(projectName) {
    const q = query(
        collection(db, 'pos'),
        where('project_name', '==', projectName)
    );

    const snapshot = await getAggregateFromServer(q, {
        totalAmount: sum('total_amount'),
        poCount: count()
    });

    return {
        total: snapshot.data().totalAmount,
        count: snapshot.data().poCount
    };
}

// Get total purchases from a supplier
async function getSupplierTotal(supplierName) {
    const q = query(
        collection(db, 'pos'),
        where('supplier_name', '==', supplierName)
    );

    const snapshot = await getAggregateFromServer(q, {
        totalPurchases: sum('total_amount'),
        orderCount: count()
    });

    return snapshot.data();
}
```

**Key characteristics:**
- Charged 1 read per 1000 index entries (vs 1 read per document)
- NO real-time updates - requires manual refresh
- Can combine multiple aggregations (sum, count, average) in single query
- Respects query filters (where, orderBy, limit)

### Pattern 2: Client-Side Grouping for Detail Views
**What:** Load filtered document subsets for modal displays, group in memory

**When to use:** Modal showing PO breakdown by category, supplier purchase history details

**Example:**
```javascript
// Load POs for modal display (filtered subset)
async function showProjectBreakdown(projectName) {
    const q = query(
        collection(db, 'pos'),
        where('project_name', '==', projectName)
    );

    const snapshot = await getDocs(q);
    const pos = [];
    snapshot.forEach(doc => pos.push(doc.data()));

    // Group by category client-side
    const byCategory = {};
    pos.forEach(po => {
        const items = JSON.parse(po.items_json || '[]');
        items.forEach(item => {
            const cat = item.category || 'Uncategorized';
            if (!byCategory[cat]) byCategory[cat] = 0;
            byCategory[cat] += parseFloat(item.subtotal || 0);
        });
    });

    // Display in modal
    displayCategoryBreakdown(byCategory);
}
```

**When this is acceptable:**
- Modal limits scope (single project, single supplier)
- Typical projects have 10-50 POs, not thousands
- One-time load for user interaction, not continuous polling

### Pattern 3: Modal-Based Drill-Down Navigation
**What:** Dashboard shows aggregated totals, clicking opens modal with detailed breakdown

**When to use:** Project expense breakdown, supplier purchase history, timeline view

**Example:**
```javascript
// Following existing finance.js modal pattern
function showProjectExpenseModal(projectName, projectTotal) {
    const modalContent = `
        <div class="modal-details-grid">
            <div class="modal-detail-item full-width">
                <div class="modal-detail-label">Project:</div>
                <div class="modal-detail-value"><strong>${projectName}</strong></div>
            </div>
            <div class="modal-detail-item full-width">
                <div class="modal-detail-label">Total Expenses:</div>
                <div class="modal-detail-value">
                    <strong style="color: #059669; font-size: 1.5rem;">₱${formatCurrency(projectTotal)}</strong>
                </div>
            </div>
        </div>

        <h4>Expense Breakdown by Category</h4>
        <table class="modal-items-table">
            <thead>
                <tr>
                    <th>Category</th>
                    <th>Amount</th>
                    <th>% of Total</th>
                </tr>
            </thead>
            <tbody id="categoryBreakdownBody">
                <!-- Populated dynamically -->
            </tbody>
        </table>
    `;

    document.getElementById('expenseModalBody').innerHTML = modalContent;
    document.getElementById('expenseModal').classList.add('active');
}

// Follows existing patterns:
// - Modal HTML structure matches finance.js PR details modal
// - Uses .modal-details-grid, .modal-items-table classes (already styled)
// - classList.add('active') to show modal
```

### Pattern 4: Timeline Component for Audit Trail
**What:** Use existing `createTimeline()` from components.js to show MRF → PR → PO → Delivered flow

**When to use:** "Timeline" button in PR-PO Records tab

**Example:**
```javascript
// Source: components.js createTimeline()
import { createTimeline } from '../components.js';

async function showProcurementTimeline(mrfId) {
    // Fetch related documents
    const mrf = await getMRF(mrfId);
    const prs = await getPRsByMRF(mrfId);
    const pos = await getPOsByMRF(mrfId);

    const timelineItems = [
        {
            title: `MRF Created: ${mrf.mrf_id}`,
            date: formatDate(mrf.created_at),
            description: `Requestor: ${mrf.requestor_name}`,
            status: 'completed'
        },
        ...prs.map(pr => ({
            title: `PR Generated: ${pr.pr_id}`,
            date: formatDate(pr.date_generated),
            description: `Supplier: ${pr.supplier_name}`,
            status: pr.finance_status === 'Approved' ? 'completed' : 'pending'
        })),
        ...pos.map(po => ({
            title: `PO Issued: ${po.po_id}`,
            date: formatDate(po.date_issued),
            description: `Status: ${po.procurement_status}`,
            status: po.procurement_status === 'Delivered' ? 'completed' : 'active'
        }))
    ];

    const timelineHtml = createTimeline(timelineItems);
    document.getElementById('timelineModalBody').innerHTML = timelineHtml;
}
```

**Existing timeline CSS (from components.css):**
- `.timeline` - container
- `.timeline-item` - each event
- `.timeline-item-title`, `.timeline-item-date`, `.timeline-item-description`
- Status classes: `completed`, `pending`, `active`

### Anti-Patterns to Avoid
- **Real-time aggregation listeners:** `getAggregateFromServer()` does NOT support `onSnapshot()` - attempting will fail
- **Loading all POs for dashboard totals:** Use aggregation, not `getDocs()` + `reduce()`
- **Recreating charts without destroying:** Chart.js requires `chart.destroy()` before creating new chart on same canvas
- **Deep nesting modals:** Keep 1 modal level (dashboard → detail modal), don't open modals from modals

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Calculating financial totals | Loop through all POs client-side | `getAggregateFromServer(sum())` | Server-side aggregation costs 1/1000th of client-side (1 read per 1000 entries vs 1 per doc) |
| Timeline visualization | Custom CSS vertical line layout | `createTimeline()` from components.js | Already implemented, styled, tested - DRY principle |
| Modal dialogs | New modal implementation | Existing `.modal` classes + `classList.add('active')` | Consistent with finance.js pattern, already styled |
| Chart rendering | Canvas drawing | Chart.js library | Handles cross-browser canvas rendering, responsive sizing, tooltips, legends |
| Grouping by category | Manual object manipulation | `Array.reduce()` with proper key handling | Edge cases: null categories, JSON parsing, numeric conversions |

**Key insight:** The codebase already handles most UI patterns (modals, timelines). The only new technical challenge is efficient aggregation, which Firestore v10.7.1 solves natively with `getAggregateFromServer()`.

## Common Pitfalls

### Pitfall 1: Assuming Aggregation Queries Support Real-Time Updates
**What goes wrong:** Developer expects `onSnapshot()` to work with aggregation queries for live-updating totals

**Why it happens:** Other Firestore queries support `onSnapshot()`, so it's natural to assume aggregation does too

**How to avoid:**
- Use manual refresh buttons for aggregated totals
- Document clearly: "Aggregation queries do NOT support real-time listeners" (from Firebase docs)
- For real-time needs, use write-time aggregation pattern (maintain totals in separate doc, update via transactions)

**Warning signs:**
```javascript
// ❌ This will NOT work - aggregation doesn't support onSnapshot
onSnapshot(aggregateQuery, (snapshot) => { ... });

// ✅ This works - manual refresh
async function refreshProjectTotals() {
    const snapshot = await getAggregateFromServer(query, { total: sum('amount') });
    updateUI(snapshot.data().total);
}
```

### Pitfall 2: Chart.js Memory Leaks from Not Destroying Charts
**What goes wrong:** Re-rendering charts without calling `destroy()` causes memory leaks and stale references

**Why it happens:** Chart.js stores references to canvas context - creating new chart on same canvas without cleanup leaves old chart in memory

**How to avoid:**
```javascript
// Store chart instance
let expenseChart = null;

function renderChart(data) {
    // Destroy existing chart before creating new one
    if (expenseChart) {
        expenseChart.destroy();
        expenseChart = null;
    }

    const ctx = document.getElementById('expenseChart').getContext('2d');
    expenseChart = new Chart(ctx, {
        type: 'bar',
        data: data
    });
}

// Clean up in destroy() lifecycle
export async function destroy() {
    if (expenseChart) {
        expenseChart.destroy();
        expenseChart = null;
    }
}
```

**Warning signs:**
- Multiple chart updates causing browser slowdown
- DevTools heap snapshots showing Chart instances not being garbage collected
- Canvas renders overlapping/duplicate charts

### Pitfall 3: Items JSON Parsing Errors in Category Grouping
**What goes wrong:** `JSON.parse(po.items_json)` throws error when items_json is null, undefined, or invalid JSON

**Why it happens:** Older POs might not have items_json field, or field could be malformed

**How to avoid:**
```javascript
// ❌ Unsafe parsing
const items = JSON.parse(po.items_json);

// ✅ Safe parsing with fallback
const items = JSON.parse(po.items_json || '[]');

// ✅ Even safer with try-catch
function safeParseItems(po) {
    try {
        return JSON.parse(po.items_json || '[]');
    } catch (error) {
        console.error('Failed to parse items for PO:', po.po_id, error);
        return [];
    }
}
```

**Warning signs:**
- Random "Unexpected token" errors when opening expense breakdown
- Some projects load fine, others crash modal
- Error only occurs with older historical data

### Pitfall 4: Aggregating Before Checking Empty Results
**What goes wrong:** Displaying "₱undefined" or "₱NaN" when no POs exist for a project

**Why it happens:** `getAggregateFromServer()` returns `null` for sum when no documents match query

**How to avoid:**
```javascript
async function getProjectTotal(projectName) {
    const snapshot = await getAggregateFromServer(query, {
        total: sum('total_amount')
    });

    // Handle null result (no documents matched)
    const total = snapshot.data().total;
    return total !== null ? total : 0;
}

// Alternative: use count to check if results exist
const snapshot = await getAggregateFromServer(query, {
    total: sum('total_amount'),
    count: count()
});

if (snapshot.data().count === 0) {
    // Display "No expenses yet" message
} else {
    // Display total
}
```

**Warning signs:**
- Dashboard shows "₱NaN" for projects without POs
- Test projects with zero expenses crash rendering
- Type errors on null/undefined arithmetic

### Pitfall 5: Client-Side Filtering After Loading All Documents
**What goes wrong:** Loading all 500 POs then filtering by project in JavaScript instead of using Firestore `where()` clause

**Why it happens:** Developer familiar with SQL thinks "get all data, filter later" is fine

**How to avoid:**
```javascript
// ❌ Loads all 500 POs, filters client-side
const allPOs = await getDocs(collection(db, 'pos'));
const projectPOs = allPOs.filter(po => po.project_name === selectedProject);

// ✅ Firestore filters server-side, returns only matching docs
const q = query(
    collection(db, 'pos'),
    where('project_name', '==', selectedProject)
);
const snapshot = await getDocs(q);
```

**Impact:**
- Costs: 500 reads vs 10 reads (50x more expensive)
- Performance: Transferring 500 docs over network vs 10
- Scales poorly: Works fine with 100 POs, breaks with 10,000

**Warning signs:**
- Firebase bill shows high read counts despite low user activity
- Network tab shows large Firestore responses
- Dashboard loads slowly despite only showing one project

## Code Examples

Verified patterns from official sources:

### Aggregating Project Expenses
```javascript
// Source: Firebase Firestore Aggregation Queries Documentation
// https://firebase.google.com/docs/firestore/query-data/aggregation-queries

import { collection, query, where, sum, count, getAggregateFromServer } from '../firebase.js';

/**
 * Get total expenses for all projects
 * Returns array of { project_name, total_amount, po_count }
 */
async function getAllProjectExpenses() {
    // Get unique project names first (no GROUP BY in Firestore)
    const projectsSnapshot = await getDocs(collection(db, 'projects'));
    const projects = [];

    projectsSnapshot.forEach(doc => {
        projects.push(doc.data().project_name);
    });

    // Aggregate expenses for each project
    const projectExpenses = await Promise.all(
        projects.map(async (projectName) => {
            const q = query(
                collection(db, 'pos'),
                where('project_name', '==', projectName)
            );

            const snapshot = await getAggregateFromServer(q, {
                totalAmount: sum('total_amount'),
                poCount: count()
            });

            return {
                project_name: projectName,
                total_amount: snapshot.data().totalAmount || 0,
                po_count: snapshot.data().poCount || 0
            };
        })
    );

    return projectExpenses;
}
```

### Modal with Expense Breakdown by Category
```javascript
// Source: Existing finance.js modal pattern + Chart.js 4.5 documentation
// Follows modal-details-grid and modal-items-table patterns

async function showProjectExpenseModal(projectCode, projectName) {
    showLoading(true);

    try {
        // Get aggregated total
        const q = query(
            collection(db, 'pos'),
            where('project_code', '==', projectCode)
        );

        const aggSnapshot = await getAggregateFromServer(q, {
            total: sum('total_amount'),
            count: count()
        });

        const projectTotal = aggSnapshot.data().total || 0;
        const poCount = aggSnapshot.data().count || 0;

        // Load POs for category breakdown (filtered subset)
        const posSnapshot = await getDocs(q);
        const pos = [];
        posSnapshot.forEach(doc => pos.push(doc.data()));

        // Group by category
        const categoryTotals = {};
        pos.forEach(po => {
            const items = JSON.parse(po.items_json || '[]');
            items.forEach(item => {
                const cat = item.category || 'Uncategorized';
                categoryTotals[cat] = (categoryTotals[cat] || 0) + parseFloat(item.subtotal || 0);
            });
        });

        // Render modal
        const modalContent = `
            <div class="modal-details-grid">
                <div class="modal-detail-item">
                    <div class="modal-detail-label">Project:</div>
                    <div class="modal-detail-value"><strong>${projectCode} - ${projectName}</strong></div>
                </div>
                <div class="modal-detail-item">
                    <div class="modal-detail-label">Total Purchase Orders:</div>
                    <div class="modal-detail-value">${poCount}</div>
                </div>
                <div class="modal-detail-item full-width">
                    <div class="modal-detail-label">Total Expenses:</div>
                    <div class="modal-detail-value">
                        <strong style="color: #059669; font-size: 1.5rem;">₱${formatCurrency(projectTotal)}</strong>
                    </div>
                </div>
            </div>

            <h4 style="margin: 1.5rem 0 1rem; font-size: 1rem; font-weight: 600;">Expense Breakdown by Category</h4>
            <table class="modal-items-table">
                <thead>
                    <tr>
                        <th>Category</th>
                        <th>Amount</th>
                        <th>% of Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${Object.entries(categoryTotals).map(([category, amount]) => `
                        <tr>
                            <td>${category}</td>
                            <td><strong>₱${formatCurrency(amount)}</strong></td>
                            <td>${((amount / projectTotal) * 100).toFixed(1)}%</td>
                        </tr>
                    `).join('')}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="2" style="text-align: right; font-weight: 600;">TOTAL:</td>
                        <td><strong>₱${formatCurrency(projectTotal)}</strong></td>
                    </tr>
                </tfoot>
            </table>
        `;

        document.getElementById('projectExpenseModalBody').innerHTML = modalContent;
        document.getElementById('projectExpenseModal').classList.add('active');

    } catch (error) {
        console.error('Error loading project expenses:', error);
        showToast('Failed to load project expenses', 'error');
    } finally {
        showLoading(false);
    }
}
```

### Supplier Purchase History Modal
```javascript
// Show all purchases from a supplier with clickable PO links

async function showSupplierPurchaseHistory(supplierName) {
    showLoading(true);

    try {
        const q = query(
            collection(db, 'pos'),
            where('supplier_name', '==', supplierName),
            orderBy('date_issued', 'desc')
        );

        // Get aggregated total
        const aggSnapshot = await getAggregateFromServer(q, {
            totalPurchases: sum('total_amount'),
            orderCount: count()
        });

        // Load PO details
        const posSnapshot = await getDocs(q);
        const pos = [];
        posSnapshot.forEach(doc => pos.push({ id: doc.id, ...doc.data() }));

        const modalContent = `
            <div class="modal-details-grid">
                <div class="modal-detail-item">
                    <div class="modal-detail-label">Supplier:</div>
                    <div class="modal-detail-value"><strong>${supplierName}</strong></div>
                </div>
                <div class="modal-detail-item">
                    <div class="modal-detail-label">Total Purchase Orders:</div>
                    <div class="modal-detail-value">${aggSnapshot.data().orderCount || 0}</div>
                </div>
                <div class="modal-detail-item full-width">
                    <div class="modal-detail-label">Total Purchases:</div>
                    <div class="modal-detail-value">
                        <strong style="color: #059669; font-size: 1.5rem;">₱${formatCurrency(aggSnapshot.data().totalPurchases || 0)}</strong>
                    </div>
                </div>
            </div>

            <h4 style="margin: 1.5rem 0 1rem; font-size: 1rem; font-weight: 600;">Purchase History</h4>
            <table class="modal-items-table">
                <thead>
                    <tr>
                        <th>PO ID</th>
                        <th>Project</th>
                        <th>Date Issued</th>
                        <th>Amount</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${pos.map(po => `
                        <tr>
                            <td><strong>${po.po_id}</strong></td>
                            <td>${po.project_code ? po.project_code + ' - ' : ''}${po.project_name}</td>
                            <td>${formatDate(po.date_issued)}</td>
                            <td><strong>₱${formatCurrency(po.total_amount)}</strong></td>
                            <td><span style="background: #fef3c7; color: #f59e0b; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem;">${po.procurement_status}</span></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        document.getElementById('supplierHistoryModalBody').innerHTML = modalContent;
        document.getElementById('supplierHistoryModal').classList.add('active');

    } catch (error) {
        console.error('Error loading supplier history:', error);
        showToast('Failed to load supplier history', 'error');
    } finally {
        showLoading(false);
    }
}
```

### Timeline View for Procurement Audit Trail
```javascript
// Source: components.js createTimeline() + existing procurement.js patterns

import { createTimeline } from '../components.js';

async function showProcurementTimeline(mrfId) {
    showLoading(true);

    try {
        // Fetch MRF
        const mrfQuery = query(
            collection(db, 'mrfs'),
            where('mrf_id', '==', mrfId)
        );
        const mrfSnapshot = await getDocs(mrfQuery);

        if (mrfSnapshot.empty) {
            showToast('MRF not found', 'error');
            return;
        }

        const mrf = { id: mrfSnapshot.docs[0].id, ...mrfSnapshot.docs[0].data() };

        // Fetch PRs
        const prsQuery = query(
            collection(db, 'prs'),
            where('mrf_id', '==', mrfId)
        );
        const prsSnapshot = await getDocs(prsQuery);
        const prs = [];
        prsSnapshot.forEach(doc => prs.push(doc.data()));

        // Fetch TRs
        const trsQuery = query(
            collection(db, 'transport_requests'),
            where('mrf_id', '==', mrfId)
        );
        const trsSnapshot = await getDocs(trsQuery);
        const trs = [];
        trsSnapshot.forEach(doc => trs.push(doc.data()));

        // Fetch POs
        const posQuery = query(
            collection(db, 'pos'),
            where('mrf_id', '==', mrfId),
            orderBy('date_issued', 'asc')
        );
        const posSnapshot = await getDocs(posQuery);
        const pos = [];
        posSnapshot.forEach(doc => pos.push(doc.data()));

        // Build timeline
        const timelineItems = [
            {
                title: `📝 MRF Created: ${mrf.mrf_id}`,
                date: formatDate(mrf.created_at),
                description: `Requestor: ${mrf.requestor_name} | Project: ${mrf.project_name}`,
                status: 'completed'
            }
        ];

        // Add PRs
        prs.forEach(pr => {
            timelineItems.push({
                title: `🛒 Purchase Request: ${pr.pr_id}`,
                date: formatDate(pr.date_generated),
                description: `Supplier: ${pr.supplier_name} | Amount: ₱${formatCurrency(pr.total_amount)}`,
                status: pr.finance_status === 'Approved' ? 'completed' :
                        pr.finance_status === 'Rejected' ? 'rejected' : 'pending'
            });
        });

        // Add TRs
        trs.forEach(tr => {
            timelineItems.push({
                title: `🚚 Transport Request: ${tr.tr_id}`,
                date: formatDate(tr.date_submitted),
                description: `Amount: ₱${formatCurrency(tr.total_amount)}`,
                status: tr.finance_status === 'Approved' ? 'completed' :
                        tr.finance_status === 'Rejected' ? 'rejected' : 'pending'
            });
        });

        // Add POs
        pos.forEach(po => {
            timelineItems.push({
                title: `📄 Purchase Order: ${po.po_id}`,
                date: formatDate(po.date_issued),
                description: `Supplier: ${po.supplier_name} | Status: ${po.procurement_status}`,
                status: po.procurement_status === 'Delivered' ? 'completed' : 'active'
            });
        });

        // Render timeline in modal
        const timelineHtml = createTimeline(timelineItems);

        document.getElementById('timelineModalTitle').textContent = `Procurement Timeline - ${mrfId}`;
        document.getElementById('timelineModalBody').innerHTML = timelineHtml;
        document.getElementById('timelineModal').classList.add('active');

    } catch (error) {
        console.error('Error loading timeline:', error);
        showToast('Failed to load timeline', 'error');
    } finally {
        showLoading(false);
    }
}

// Add to window functions
window.showProcurementTimeline = showProcurementTimeline;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Load all docs + reduce() | `getAggregateFromServer()` | Nov 2023 (Firebase v10.6.0) | 99% cost reduction for aggregations |
| Custom timeline HTML/CSS | Component library patterns | 2025-2026 (modern SPAs) | DRY, maintainable, consistent UX |
| D3.js for charts | Chart.js 4+ with Canvas | 2024+ (performance focus) | Faster rendering, smaller bundle |
| Real-time everything | Selective real-time + manual refresh | 2025+ (cost optimization) | Balance UX with Firebase read costs |

**Deprecated/outdated:**
- **Client-side aggregation for dashboards:** Use server-side `getAggregateFromServer()` instead (available since Firebase v10.6.0, Nov 2023)
- **Chart.js 2.x:** Replaced by v4.x with breaking changes (new Tree-shaking, performance improvements)
- **onSnapshot for aggregation:** Never supported, but developers try it - use manual refresh pattern

## Open Questions

Things that couldn't be fully resolved:

1. **Real-time dashboard updates vs cost tradeoff**
   - What we know: `getAggregateFromServer()` doesn't support real-time listeners
   - What's unclear: Whether Finance users prefer auto-refresh (higher cost) or manual refresh button (lower cost)
   - Recommendation: Start with manual refresh button, add polling if users request (e.g., refresh every 60 seconds)

2. **Chart.js necessity for Phase 13**
   - What we know: Success criteria mention "expense breakdown modal" but not charts
   - What's unclear: Whether FIN-03 requires visual charts or just tables
   - Recommendation: Implement tables first (matches success criteria), add Chart.js in future phase if requested

3. **Historical data retention policy**
   - What we know: POs accumulate forever, old projects still in `projects` collection
   - What's unclear: Whether to archive old projects, filter dashboard to active only
   - Recommendation: Show all projects initially, add "Active Projects Only" filter if list becomes unwieldy

## Sources

### Primary (HIGH confidence)
- [Firebase Firestore Aggregation Queries](https://firebase.google.com/docs/firestore/query-data/aggregation-queries) - Official documentation for `getAggregateFromServer()`, sum(), count(), average()
- [Firestore v10.7.1 CDN](https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js) - Current project version, confirmed aggregation API availability
- Codebase: `app/components.js` - Existing `createTimeline()`, `createModal()` implementations
- Codebase: `app/views/finance.js` - Modal pattern precedent (PR details modal, rejection modal)

### Secondary (MEDIUM confidence)
- [Chart.js Official Documentation](https://www.chartjs.org/docs/latest/) - API reference, performance guidelines
- [Chart.js npm Package](https://www.npmjs.com/package/chart.js) - Version 4.5.1, installation instructions
- [Chart.js Performance Best Practices](https://www.chartjs.org/docs/latest/general/performance.html) - Destroy, update, decimation patterns
- [JavaScript Chart Libraries 2026 Comparison](https://www.luzmo.com/blog/javascript-chart-libraries) - Chart.js vs alternatives
- [Medium: Sum and Average in Firestore](https://nithinkvarrier.medium.com/sum-and-average-in-firestore-leverage-getaggregatefromserver-in-the-latest-update-november-2023-06fd10f92347) - Code examples (paywalled, but summary available)

### Secondary - Aggregation Query Patterns
- [Google Cloud: Aggregate with SUM and AVG](https://cloud.google.com/blog/products/databases/aggregate-with-sum-and-avg-in-firestore) - Official blog post
- [DEV.to: Firestore Counter Problem Solution](https://dev.to/jdgamble555/firestore-finally-solved-the-counter-problem-almost-4mb7) - Write-time vs read-time aggregation tradeoffs

### Secondary - Performance & Best Practices
- [Firestore Real-Time Queries at Scale](https://firebase.google.com/docs/firestore/real-time_queries_at_scale) - Listener performance guidelines
- [GitHub: Chart.js Performance Issues](https://github.com/chartjs/Chart.js/issues/11814) - Update performance with multiple datasets
- [Estuary: Firestore Query Best Practices 2026](https://estuary.dev/blog/firestore-query-best-practices/) - Where clause filtering, indexing

### Tertiary (LOW confidence - WebSearch only)
- [Timeline Components JavaScript 2026](https://www.cssscript.com/best-timeline/) - General timeline libraries (not needed - codebase has solution)
- [Financial Dashboard CSS Patterns](https://dev.to/tobidelly/personal-finance-dashboard-interface-5602) - UI patterns (general guidance)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Firebase aggregation is official API (v10.6.0+), Chart.js is industry standard
- Architecture: HIGH - Patterns verified against codebase (finance.js, components.js), official Firebase docs
- Pitfalls: HIGH - Based on official documentation limitations (no real-time aggregation), Chart.js GitHub issues (memory leaks), project codebase patterns (JSON parsing)

**Research date:** 2026-02-05
**Valid until:** 60 days (Firestore API stable, Chart.js mature library)

**Key technical constraint:** Firebase v10.7.1 aggregation API available via CDN import (verified in firebase.js). No new dependencies needed except Chart.js CDN if visual charts required.
