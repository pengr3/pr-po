# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CLMC Engineering procurement management system - a static HTML application for managing Material Request Forms (MRFs), Purchase Requests (PRs), and Purchase Orders (POs). The system handles the complete procurement workflow from initial material requests through supplier selection, finance approval, and delivery tracking.

## Tech Stack

- **Frontend**: Single Page Application (SPA) - Pure JavaScript ES6 modules
  - **Architecture**: Modular SPA with hash-based routing
  - **No framework, no build system** - Uses native ES6 modules
  - **Separate CSS files** for organization (main.css, components.css, views.css)
  - **Separate JS modules** in `app/` directory
  - No package.json or dependencies (Firebase loaded via CDN)
- **Database**: Firebase Firestore v10.7.1 (loaded via CDN)
  - Real-time listeners for live data updates
  - Project ID: `clmc-procurement`
- **Deployment**: Netlify (static file hosting)
  - Direct deployment - commit and push triggers build

## Development Commands

**Run locally**:
```bash
python -m http.server 8000
# OR
npx http-server
```

**No build, test, or lint commands** - this is a zero-build static website. Changes to HTML files are deployed directly.

## Application Structure

### SPA Architecture

**Entry Point:**
- **index.html** (80 lines) - Single page entry point
  - Top navigation bar
  - App container for dynamic views
  - Loads ES6 modules (Firebase, router, utils, components)

**Core Modules (`app/`):**
- **firebase.js** (80 lines) - Centralized Firebase configuration
  - Exports db instance and all Firestore functions
  - Single initialization, imported by all views
- **router.js** (230 lines) - Hash-based router with lazy loading
  - Supports sub-routes (e.g., `#/procurement/mrfs`)
  - View lifecycle management (init/destroy)
  - Dynamic imports for code splitting
- **utils.js** (250 lines) - Shared utility functions
  - formatCurrency, formatDate, showLoading, showToast
  - generateSequentialId, Firebase helpers
- **components.js** (350 lines) - Reusable UI components
  - createStatusBadge, createModal, createPagination

**Views (`app/views/`):**
- **home.js** (120 lines) - Landing page with live Firebase stats
  - Real-time dashboard statistics
  - Navigation cards to main sections
- **mrf-form.js** (600 lines) - **FULLY FUNCTIONAL** MRF submission form
  - Dynamic item rows with add/delete
  - Project dropdown from Firebase
  - Complete form validation
- **procurement.js** (1,915 lines) - **PARTIALLY FUNCTIONAL** Procurement dashboard
  - **✅ Complete:** MRF CRUD, Supplier CRUD, Historical MRFs (24 functions)
  - **⏳ Pending:** PR generation (3 functions with placeholders)
  - Sub-routes: `/mrfs`, `/suppliers`, `/records`
- **finance.js** (250 lines) - **PLACEHOLDER** Finance dashboard
  - Structure in place, functions not yet migrated

**Styles (`styles/`):**
- **main.css** (400 lines) - Base styles, CSS variables, utilities
- **components.css** (650 lines) - Button, card, table, modal styles
- **views.css** (600 lines) - View-specific layouts
- **hero.css** (100 lines) - Landing page styles

**Archive (`archive/`):**
- **index.html** (5,785 lines) - Original procurement dashboard (archived)
- **finance.html** (4,965 lines) - Original finance dashboard (archived)
- **mrf-submission-form.html** (799 lines) - Original form (archived)

### Migration Status

**Completed (35%):**
- ✅ Infrastructure: Router, Firebase service, utilities, components
- ✅ Home view: Fully functional with live stats
- ✅ MRF Form: Fully functional submission form
- ✅ Procurement: 24/47 functions (MRF CRUD, Suppliers, Historical data)

**Pending (65%):**
- ⏳ Procurement: PR generation functions (3 functions)
- ⏳ Finance: All functions (46 functions, ~3,500 lines)

## Firebase Firestore Schema

### Collections

**`mrfs`** - Material Request Forms
- `mrf_id` (string): Format `MRF-YYYY-###` (e.g., `MRF-2026-001`)
- `project_name` (string): Associated project
- `requestor_name` (string): Person requesting materials
- `date_needed` (string): Required delivery date
- `status` (string): `Pending`, `Approved`, or `Rejected`
- `urgency_level` (string): `Low`, `Medium`, `High`, or `Critical`
- `items_json` (string): JSON array of items - must parse with `JSON.parse()`
- `delivery_address` (string): Delivery location
- `justification` (string): Reason for request

**`prs`** - Purchase Requests (generated from approved MRFs)
- `pr_id` (string): Format `PR-YYYY-###`
- `mrf_id` (string): Reference to originating MRF
- `supplier_name` (string): Selected supplier
- `total_amount` (number): Total cost
- `finance_status` (string): `Pending`, `Approved`, or `Rejected`
- `items_json` (string): JSON array - same structure as MRF items
- `date_generated` (timestamp): When PR was created

**`pos`** - Purchase Orders (generated from approved PRs)
- `po_id` (string): Format `PO-YYYY-###`
- `pr_id` (string): Reference to originating PR
- `mrf_id` (string): Reference to originating MRF
- `supplier_name` (string): Vendor name
- `total_amount` (number): Order total
- `procurement_status` (string): `Pending Procurement`, `Procuring`, `Procured`, or `Delivered`
- `is_subcon` (boolean): True for subcontractor POs
- `date_issued` (timestamp): When PO was created

**`transport_requests`** - Transportation/Hauling requests
- `tr_id` (string): Format `TR-YYYY-###`
- `mrf_id` (string): Associated MRF
- `supplier_name` (string): Hauling provider
- `total_amount` (number): Transportation cost
- `finance_status` (string): `Pending`, `Approved`, or `Rejected`

**`suppliers`** - Supplier database
- `supplier_name` (string): Company name (unique)
- `contact_person` (string): Primary contact
- `email` (string): Contact email
- `phone` (string): Contact number
- `address` (string): Business address

**`projects`** - Active projects
- `project_name` (string): Project name (unique)
- `status` (string): `active` or `inactive`

**`deleted_mrfs`** - Soft-deleted MRFs with cascaded documents
- Stores complete MRF with all related PRs, POs, and TRs

## Procurement Workflow

1. **MRF Submission** → Status: `Pending`
2. **MRF Approval** → Status: `Approved` → Generates PR documents
3. **PR Review** → Finance approves/rejects → `finance_status: Approved`
4. **PO Creation** → Generated from approved PR → `procurement_status: Pending Procurement`
5. **Procurement** → Status updates: `Procuring` → `Procured` → `Delivered`

### Urgency Levels
- **Low**: Standard processing (5-7 business days) - Green badge
- **Medium**: Priority (3-5 business days) - Yellow badge
- **High**: Urgent (1-2 business days) - Red badge
- **Critical**: Immediate (same day) - Dark red badge

## SPA Development Patterns

### View Module Structure
Every view module MUST export three functions:

```javascript
// app/views/example.js
export function render(activeTab = null) {
    return `<div>HTML content</div>`;
}

export async function init(activeTab = null) {
    // Set up Firebase listeners, event handlers
    // Store listeners in array for cleanup
}

export async function destroy() {
    // Unsubscribe from Firebase listeners
    // Clean up window functions
    // Clear state
}
```

### Firebase Listener Management
Track all listeners for proper cleanup:

```javascript
let listeners = [];

export async function init() {
    const listener = onSnapshot(collection(db, 'mrfs'), (snapshot) => {
        // Handle data updates
    });
    listeners.push(listener);
}

export async function destroy() {
    listeners.forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') {
            unsubscribe();
        }
    });
    listeners = [];
}
```

### Global Functions for Event Handlers
Functions called by `onclick` handlers MUST be attached to `window`:

```javascript
// Export for module use
export async function selectMRF(mrfId) { ... }

// Expose to window for onclick handlers
window.selectMRF = selectMRF;
```

HTML buttons reference these directly:
```html
<button onclick="window.selectMRF('MRF-2026-001')">Select</button>
```

### Hash-Based Routing
Use hash links for navigation:

```javascript
// Top-level routes
<a href="#/">Home</a>
<a href="#/procurement">Procurement</a>

// Sub-routes (for tabbed views)
<a href="#/procurement/mrfs">MRF Processing</a>
<a href="#/procurement/suppliers">Suppliers</a>
```

Router automatically parses `#/procurement/mrfs` into:
- `path`: `/procurement`
- `tab`: `mrfs`

And passes `tab` to `render(tab)` and `init(tab)`

### Real-time Data with Firebase Listeners
Data updates automatically via `onSnapshot()` - never manually refresh:

```javascript
onSnapshot(collection(db, 'mrfs'), (snapshot) => {
    mrfsData = [];
    snapshot.forEach(doc => {
        mrfsData.push({ id: doc.id, ...doc.data() });
    });
    renderMRFsTable(); // UI updates automatically
});
```

### Sequential ID Generation
IDs are generated by finding the max number for the current year:

```javascript
// Find highest MRF number in 2026
const mrfs = await getDocs(collection(db, 'mrfs'));
let maxNum = 0;
mrfs.forEach(doc => {
    const id = doc.data().mrf_id; // e.g., "MRF-2026-003"
    const parts = id.split('-');
    if (parts[1] === '2026') {
        maxNum = Math.max(maxNum, parseInt(parts[2]));
    }
});
const newId = `MRF-2026-${String(maxNum + 1).padStart(3, '0')}`;
```

### Items Data Structure
Items are stored as JSON strings and must be parsed:

```javascript
// Reading items
const items = JSON.parse(mrf.items_json);
items.forEach(item => {
    console.log(item.item_name, item.quantity, item.unit, item.unit_cost);
});

// Writing items
const items = [
    { item_name: "Steel Bars", quantity: 100, unit: "pcs", unit_cost: 50 }
];
await setDoc(doc(db, 'mrfs', mrfId), {
    items_json: JSON.stringify(items),
    // ... other fields
});
```

### Status Value Matching
Status strings are case-sensitive and must match exactly:

```javascript
// Correct
if (mrf.status === 'Pending') { ... }
if (pr.finance_status === 'Approved') { ... }
if (po.procurement_status === 'Delivered') { ... }

// Incorrect - won't match
if (mrf.status === 'pending') { ... } // lowercase won't work
```

## Common Development Tasks

### Adding a New View

1. Create `app/views/viewname.js`
2. Export `render()`, `init()`, and `destroy()` functions
3. Add route to `app/router.js`:
```javascript
const routes = {
    '/viewname': {
        name: 'View Name',
        load: () => import('./views/viewname.js'),
        title: 'View Name | CLMC Operations'
    }
};
```
4. Add navigation link to `index.html`
5. Import any needed utilities from `app/utils.js` and `app/firebase.js`

### Adding a New Field to MRFs

1. Update the form in `app/views/mrf-form.js` or `app/views/procurement.js`
2. Modify the form submission handler to capture the new field
3. Update Firestore `addDoc()` or `setDoc()` calls to include the field
4. Update display functions to show the new field in tables/views
5. No database migration needed - Firestore is schemaless

### Modifying Firebase Queries

All queries use Firebase v10 modular syntax:

```javascript
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';

// Query with filters
const q = query(
    collection(db, 'mrfs'),
    where('status', '==', 'Pending'),
    where('urgency_level', '==', 'Critical'),
    orderBy('date_needed', 'asc')
);
const snapshot = await getDocs(q);
```

### Adding New Status Options

1. Update the status dropdown in the relevant HTML file
2. Update status badge rendering functions to handle new status colors
3. Update any conditional logic that checks status values
4. Consider updating status transition validation if needed

## Testing

**No automated test suite exists.** Manual testing workflow:

1. Run local server: `python -m http.server 8000`
2. Open browser to `http://localhost:8000`
3. Use browser DevTools Console for debugging
4. Check Network tab to verify Firebase calls
5. Test all status transitions in the workflow
6. Verify real-time updates work (open multiple browser tabs)

**Important**: Changes write to production Firebase database. There is no staging environment.

## Deployment

1. Commit changes: `git add . && git commit -m "description"`
2. Push to branch: `git push -u origin claude/branch-name-xxxxx`
3. Netlify automatically deploys on push
4. No build step - HTML files are served as-is

## HTTP Security Headers

The project has comprehensive security header configurations (see HEADERS-README.md for details):

- **CSP**: `frame-ancestors 'self'` prevents clickjacking
- **X-Content-Type-Options**: `nosniff` prevents MIME sniffing
- **Cache-Control**: Configured for optimal performance
- Platform-specific configs: `_headers` (Netlify/Cloudflare), `.htaccess` (Apache), `nginx-headers.conf` (Nginx)

When modifying headers, update ALL config files to maintain consistency across platforms.

## Important Notes

### SPA Architecture
- **No page reloads**: All navigation happens via hash routing
- **Modular code**: Each view is self-contained with proper lifecycle
- **Lazy loading**: Views are loaded on demand via dynamic imports
- **Cleanup required**: Always implement `destroy()` to prevent memory leaks
- **Window functions**: Functions used in `onclick` must be on `window`

### Archive Folder
Original monolithic HTML files are preserved in `archive/`:
- **archive/index.html** - Original procurement dashboard (reference only)
- **archive/finance.html** - Original finance dashboard (reference only)
- **archive/mrf-submission-form.html** - Original form (reference only)

**DO NOT EDIT ARCHIVE FILES**. Use them only as reference for migration.

### File Organization
- **Views**: `app/views/*.js` - One file per view/page
- **Utilities**: `app/utils.js` - Shared helper functions
- **Components**: `app/components.js` - Reusable UI elements
- **Firebase**: `app/firebase.js` - Single initialization point
- **Styles**: `styles/*.css` - Organized by purpose

### Firebase Configuration
Firebase config is centralized in `app/firebase.js` (safe for client-side apps). No `.env` files are used.

### Pagination
Tables implement pagination (15 items per page) for performance. Pagination is handled by individual view modules.

### Git Branch Naming
Follow the pattern: `claude/feature-description-xxxxx` where xxxxx is a session ID. All branches are created from `main`.
