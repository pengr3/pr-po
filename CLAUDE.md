# CLAUDE.md

## Project Overview
CLMC Engineering procurement management system - static SPA for managing MRFs, PRs, and POs through complete procurement workflow.

## Tech Stack
- **Frontend**: Pure JavaScript ES6 modules, no framework/build system
- **Database**: Firebase Firestore v10.7.1 (CDN), Project ID: `clmc-procurement`
- **Deployment**: Netlify (direct push deployment)

## Development
```bash
python -m http.server 8000  # OR npx http-server
```
**No build, test, or lint commands** - zero-build static website.

## Application Structure

### Core Files
- **index.html** - SPA entry point with navigation
- **app/firebase.js** - Firebase config, exports db instance
- **app/router.js** - Hash-based routing with lazy loading, sub-routes (`#/procurement/mrfs`)
- **app/utils.js** - Shared utilities (formatCurrency, generateSequentialId, etc.)
- **app/components.js** - Reusable UI components

### Views (`app/views/`)
- **home.js** (120 lines) - Real-time dashboard stats
- **mrf-form.js** (600 lines) - MRF submission with dynamic items
- **procurement.js** (3,761 lines, 44 functions) - 4 tabs:
  - MRF Management (8 functions) - CRUD operations
  - Supplier Management (7 functions) - CRUD with pagination
  - PR/TR Generation (3 functions) - Smart generation, mixed items
  - PO Tracking (8 functions) - Status updates, document generation
- **finance.js** (1,077 lines) - 3 tabs:
  - Pending Approvals - PR/TR review workflow
  - Purchase Orders - Real-time PO tracking
  - Historical Data - Analytics placeholder

### Styles (`styles/`)
- **main.css** - Base styles, CSS variables
- **components.css** - Buttons, cards, tables, modals
- **views.css** - View-specific layouts

### Archive (Reference Only)
- Original monolithic HTML files (5,785 + 4,965 + 799 lines)
- **DO NOT EDIT** - migration complete

## Firebase Firestore Schema

**`mrfs`** - Material Request Forms
- `mrf_id` (string): `MRF-YYYY-###`
- `project_name`, `requestor_name`, `date_needed` (strings)
- `status`: `Pending` | `Approved` | `Rejected`
- `urgency_level`: `Low` | `Medium` | `High` | `Critical`
- `items_json` (string): JSON array - **must parse with `JSON.parse()`**
- `delivery_address`, `justification` (strings)

**`prs`** - Purchase Requests
- `pr_id`: `PR-YYYY-###`, `mrf_id`, `supplier_name`
- `total_amount` (number), `finance_status`: `Pending` | `Approved` | `Rejected`
- `items_json` (string), `date_generated` (timestamp)

**`pos`** - Purchase Orders
- `po_id`: `PO-YYYY-###`, `pr_id`, `mrf_id`, `supplier_name`
- `total_amount` (number)
- `procurement_status`: `Pending Procurement` | `Procuring` | `Procured` | `Delivered`
- `is_subcon` (boolean), `date_issued` (timestamp)

**`transport_requests`** - TRs
- `tr_id`: `TR-YYYY-###`, `mrf_id`, `supplier_name`
- `total_amount`, `finance_status`

**`suppliers`** - Supplier database
- `supplier_name` (unique), `contact_person`, `email`, `phone`, `address`

**`projects`** - Active projects
- `project_name` (unique), `status`: `active` | `inactive`

**`deleted_mrfs`** - Soft-deleted MRFs with cascaded PRs/POs/TRs

## Procurement Workflow
1. MRF Submission → `Pending`
2. MRF Approval → `Approved` → Generates PRs
3. Finance Review → `finance_status: Approved`
4. PO Creation → `procurement_status: Pending Procurement`
5. Procurement → `Procuring` → `Procured` → `Delivered`

## SPA Development Patterns

### View Module Structure (REQUIRED)
```javascript
export function render(activeTab = null) {
    return `<div>HTML</div>`;
}

export async function init(activeTab = null) {
    // Set up Firebase listeners, store in array for cleanup
}

export async function destroy() {
    // Unsubscribe listeners, clean up window functions
}
```

### Firebase Listener Management
```javascript
let listeners = [];

export async function init() {
    const listener = onSnapshot(collection(db, 'mrfs'), (snapshot) => {
        // Handle updates
    });
    listeners.push(listener);
}

export async function destroy() {
    listeners.forEach(unsubscribe => unsubscribe?.());
    listeners = [];
}
```

### Window Functions for Event Handlers
Functions in `onclick` MUST be on `window`:
```javascript
export async function selectMRF(mrfId) { ... }
window.selectMRF = selectMRF; // Required for onclick handlers
```

### Hash-Based Routing
```javascript
<a href="#/">Home</a>
<a href="#/procurement/mrfs">MRF Processing</a> // Sub-route
```
Router parses `#/procurement/mrfs` → `path: /procurement`, `tab: mrfs`

**CRITICAL - Tab Navigation:**
- Router **DOES NOT** call `destroy()` when switching tabs within same view
- Only calls `destroy()` when navigating to different view
- Window functions persist during tab switches
- `render()` and `init()` called with new tab parameter

### Real-time Data Pattern
```javascript
onSnapshot(collection(db, 'mrfs'), (snapshot) => {
    mrfsData = [];
    snapshot.forEach(doc => mrfsData.push({ id: doc.id, ...doc.data() }));
    renderMRFsTable(); // Auto-updates UI
});
```

### Sequential ID Generation
```javascript
const mrfs = await getDocs(collection(db, 'mrfs'));
let maxNum = 0;
mrfs.forEach(doc => {
    const parts = doc.data().mrf_id.split('-'); // "MRF-2026-003"
    if (parts[1] === '2026') maxNum = Math.max(maxNum, parseInt(parts[2]));
});
const newId = `MRF-2026-${String(maxNum + 1).padStart(3, '0')}`;
```

### Items Data Structure
```javascript
// Reading
const items = JSON.parse(mrf.items_json);

// Writing
await setDoc(doc(db, 'mrfs', mrfId), {
    items_json: JSON.stringify(items),
    // ...
});
```

### Status Matching (Case-Sensitive)
```javascript
if (mrf.status === 'Pending') { ... }        // ✅ Correct
if (mrf.status === 'pending') { ... }        // ❌ Wrong - won't match
```

### DOM Selection in Procurement View
**CRITICAL**: Use CSS classes, NOT data attributes:
```javascript
// ✅ CORRECT
const itemRows = document.querySelectorAll('#lineItemsBody tr');
for (const row of itemRows) {
    const itemName = row.querySelector('input.item-name')?.value?.trim() || '';
    const category = row.querySelector('select.item-category')?.value || '';
    const qty = parseFloat(row.querySelector('input.item-qty')?.value) || 0;
    const unit = row.querySelector('select.item-unit')?.value || 'pcs';
    const unitCost = parseFloat(row.querySelector('input.unit-cost')?.value) || 0;
    const supplier = row.querySelector('select.supplier-select')?.value || '';
}

// ❌ WRONG
const itemRows = document.querySelectorAll('#mrfDetailsItemRows tr'); // Wrong ID
const itemName = row.querySelector('input[data-field="item_name"]'); // Wrong selector
```

**Key Points:**
- Table ID: `#lineItemsBody`
- Use classes: `.item-name`, `.item-category`, `.item-qty`, `.item-unit`, `.unit-cost`, `.supplier-select`
- Used in: `generatePR()`, `submitTransportRequest()`, `generatePRandTR()`, `saveNewMRF()`, `saveProgress()`

## Common Development Tasks

### Add New View
1. Create `app/views/viewname.js` with `render()`, `init()`, `destroy()`
2. Add route to `app/router.js`:
```javascript
'/viewname': {
    name: 'View Name',
    load: () => import('./views/viewname.js'),
    title: 'View Name | CLMC Operations'
}
```
3. Add nav link to `index.html`

### Add Field to MRFs
1. Update form in `app/views/mrf-form.js` or `app/views/procurement.js`
2. Update submission handler to capture field
3. Update Firestore `addDoc()`/`setDoc()` calls
4. Update display functions
5. No migration needed - Firestore is schemaless

### Modify Firebase Queries
```javascript
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';

const q = query(
    collection(db, 'mrfs'),
    where('status', '==', 'Pending'),
    where('urgency_level', '==', 'Critical'),
    orderBy('date_needed', 'asc')
);
const snapshot = await getDocs(q);
```

## Critical Bug Fixes (2026-01-16)

### Issue #1: Window Functions Lost During Tab Switching
**Problem**: `TypeError: window.loadMRFs is not a function` when switching tabs
**Fix**: Modified `app/router.js` to skip `destroy()` when navigating between tabs in same view

### Issue #2: PR Generation "At least one item required" Error
**Problem**: PR generation failed with items present
**Root Cause**: Wrong DOM selectors (`#mrfDetailsItemRows`, `[data-field="item_name"]`)
**Fix**: Updated to correct selectors (`#lineItemsBody`, `.item-name` classes)

## UI Design System (2026-01-16)

**Colors:**
- Primary: `#1a73e8`, Dark: `#1557b0`
- Success: `#059669`, Warning: `#f59e0b`, Danger: `#ef4444`
- Borders: `#e5e7eb`, `#e2e8f0`
- Text: `#1e293b`, `#475569`, `#64748b`

**Components:**
- **Pagination**: `.pagination-container`, `.pagination-btn`, `.pagination-info`
- **Modals**: Window-style (not banners), blur backdrop, centered
- **Tables**: Sticky headers, hover effects, modern input fields
- **Buttons**: Primary blue, proper spacing, no-wrap text

**Key Improvements:**
- Standardized pagination across all tabs (15/page suppliers, 10/page records)
- Window-style modals with lighter backdrop
- Modern table styling with enhanced inputs
- Consistent spacing (0.75rem, 1rem, 1.5rem, 2rem)

## Testing & Deployment

**Manual Testing:**
```bash
python -m http.server 8000
# Browser DevTools → Console for debugging
# Network tab for Firebase calls
```
**Important**: No staging - writes to production Firebase

**Deployment:**
```bash
git add . && git commit -m "description"
git push -u origin claude/branch-name-xxxxx
# Netlify auto-deploys
```

**Branch Naming**: `claude/feature-description-xxxxx` (from `main`)

## Important Notes

- **Firebase**: Config in `app/firebase.js` (client-safe, no .env)
- **Security**: CSP headers configured, see HEADERS-README.md
- **Archive**: Reference only - DO NOT EDIT
- **Pagination**: 15 items/page (suppliers), 10 items/page (records)
- **Console Logs**: `[Router]`, `[Procurement]` prefixes for debugging
