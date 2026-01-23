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
- **procurement.js** (3,761 lines) - **FULLY FUNCTIONAL** Procurement dashboard
  - **✅ Complete:** 44 functions across 4 tabs (93% coverage)
  - MRF Management (8 functions) - Create, edit, save, delete MRFs
  - Line Items (3 functions) - Dynamic item management
  - Supplier Management (7 functions) - CRUD operations with pagination
  - Historical MRFs (6 functions) - Filtering and viewing past MRFs
  - PR/TR Generation (3 functions) - Smart PR generation, TR submission, mixed items
  - PO Tracking (8 functions) - Status updates, timeline, pagination, scoreboards
  - Document Generation (9 functions) - PDF export for PR/PO documents
  - Sub-routes: `/mrfs`, `/suppliers`, `/tracking`, `/records`
- **finance.js** (1,077 lines) - **FULLY FUNCTIONAL** Finance dashboard
  - **✅ Complete:** PR/TR approval workflow with automatic PO generation
  - Three tabs: Pending Approvals, Purchase Orders, Historical Data
  - Real-time Firebase listeners for PRs, TRs, and POs
  - Statistics scorecards (pending counts, total amounts)
  - PR/TR details modals with complete item breakdowns
  - Approval workflow with automatic PO generation (grouped by supplier)
  - Rejection workflow with reason capture
  - MRF status cascading (updates originating MRF)
  - Sub-routes: `/approvals`, `/pos`, `/history`

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

**✅ MIGRATION COMPLETE (100%):**

All views have been successfully migrated from monolithic HTML files to the modular SPA architecture:

- ✅ **Infrastructure:** Router, Firebase service, utilities, components (100%)
- ✅ **Home view** (120 lines): Fully functional with live Firebase stats
- ✅ **MRF Form** (600 lines): Fully functional submission form
- ✅ **Procurement view** (3,761 lines, 44 functions): Complete dashboard
  - MRF Management (8 functions)
  - Line Items (3 functions)
  - Supplier Management (7 functions)
  - Historical MRFs (6 functions)
  - PR/TR Generation (3 functions)
  - PO Tracking (8 functions)
  - Document Generation (9 functions - PR/PO PDFs)
- ✅ **Finance view** (1,077 lines): Complete approval workflow
  - PR/TR approval with automatic PO generation
  - Rejection workflow with reason capture
  - Real-time data synchronization
  - Three-tab interface (Approvals, POs, History)

**Total Lines Migrated:** ~5,600 lines of production code
**Original Archive Size:** ~11,500 lines (before modularization)

## Application Features

### 🏠 Home Dashboard
**Location:** `app/views/home.js` (165 lines)

**Features:**
- **Real-time Statistics Dashboard**
  - Active MRFs count (Pending status)
  - Pending PRs count (Finance approval pending)
  - Active POs count (Not yet delivered)
  - Auto-updates via Firebase listeners
- **Navigation Cards**
  - Material Request Form entry point
  - Procurement Dashboard entry point
  - Finance Dashboard entry point
- **Live Data Sync**
  - Statistics update in real-time without refresh
  - Automatic listener cleanup on view exit

---

### 📝 MRF Submission Form
**Location:** `app/views/mrf-form.js` (537 lines)

**Features:**
- **Request Type Selection**
  - Material Request option
  - Delivery/Hauling/Transportation option
- **Urgency Level System** (4 levels)
  - Low: Standard processing (5-7 business days)
  - Medium: Priority processing (3-5 business days)
  - High: Urgent processing (1-2 business days)
  - Critical: Immediate attention (same day if possible)
- **Basic Information Capture**
  - Project name dropdown (loaded from Firebase)
  - Requestor name
  - Date needed (with calendar picker, minimum today)
  - Delivery address (multi-line text)
- **Dynamic Items Table**
  - Add/remove item rows
  - Item description field
  - Quantity and unit selection
  - Category dropdown (CIVIL, ELECTRICAL, HVAC, PLUMBING, etc.)
  - Custom unit support (specify other units)
  - Unlimited items support
- **Form Validation**
  - All required fields validated
  - Minimum one item required
  - Date cannot be in the past
- **Automatic MRF ID Generation**
  - Format: `MRF-YYYY-###` (e.g., `MRF-2026-001`)
  - Sequential numbering per year
  - Auto-increments from highest number
- **Form Actions**
  - Submit request (saves to Firebase)
  - Reset form (with confirmation)
  - Success feedback with generated MRF ID
  - Auto-reset after successful submission

---

### 🏭 Procurement Dashboard
**Location:** `app/views/procurement.js` (4,500+ lines, 47 functions)

The procurement dashboard is the most comprehensive view with 4 major tabs:

#### Tab 1: MRF Processing (13 functions)

**MRF Management (8 functions)**
- `loadMRFs()` - Load all pending MRFs from Firebase
- `createNewMRF()` - Initialize new blank MRF form
- `selectMRF()` - Load selected MRF details into form
- `saveNewMRF()` - Save new MRF with validation
- `saveProgress()` - Save in-progress MRF edits
- `deleteMRF()` - Soft delete MRF with cascade to PRs/POs/TRs
- `renderMRFDetails()` - Dynamic form rendering
- `renderMRFList()` - Separate material/transport MRF lists

**Line Items Management (5 functions)**
- `addLineItem()` - Add new item row with supplier dropdown
- `deleteLineItem()` - Remove item row (minimum 1 required)
- `calculateSubtotal()` - Calculate per-item total (qty × unit cost)
- `calculateGrandTotal()` - Sum all item subtotals
- `updateItemCount()` - Track number of items in table

**Smart PR/TR Generation (3 functions)**
- `generatePR()` - Generate Material Purchase Requests
  - Groups items by supplier automatically
  - Creates separate PR per supplier
  - Validates all items have suppliers assigned
  - Validates all items have unit costs
  - Updates MRF status to 'Approved'
- `submitTransportRequest()` - Generate Transportation Requests
  - For hauling/delivery services
  - Creates TR with single supplier
  - Validates transport items and costs
- `generatePRandTR()` - Mixed Material + Transport
  - Handles MRFs with both material and transport items
  - Separates items by category automatically
  - Generates PRs for materials, TR for transport
  - Single-click generation for complex requests

**Document Generation (2 functions)**
- `generatePRDocument()` - Generate PR PDF for printing
- `generatePODocument()` - Generate PO PDF for printing

#### Tab 2: Supplier Management (7 functions)

**Supplier CRUD Operations**
- `loadSuppliers()` - Load all suppliers from Firebase
- `renderSuppliersTable()` - Display suppliers with pagination
- `toggleAddForm()` - Show/hide add supplier form
- `addSupplier()` - Create new supplier record
- `editSupplier()` - Enable inline editing mode
- `saveEdit()` - Save supplier changes
- `deleteSupplier()` - Remove supplier (with confirmation)

**Supplier Pagination**
- 15 suppliers per page
- Previous/Next navigation
- Page number display
- "Showing X-Y of Z Items" counter
- Ellipsis support for large page counts

**Supplier Data Fields**
- Supplier name (unique identifier)
- Contact person
- Email address
- Phone number
- Business address (optional)

#### Tab 3: PR-PO Records (8 functions)

**PR-PO Records Display**
- `loadPRPORecords()` - Load all PRs and POs with MRF data
- `renderPRPORecords()` - Display unified PR/PO table
- `filterPRPORecords()` - Filter by status/type/search term
- `viewPRDetails()` - Show complete PR details modal
- `viewPODetails()` - Show complete PO details modal
- `viewPOTimeline()` - Show PO status timeline
- `updatePOStatus()` - Change PO procurement status
- `goToPRPOPage()` - Navigate pagination

**Records Table Features**
- Unified view of PRs and POs
- Type badge (PR vs PO)
- Status badges with colors
- Finance status display
- Procurement status display
- Total amount display
- Timeline button for POs
- Status update dropdown
- Pagination (10 items per page)

**Status Management**
- PO Status Updates:
  - Pending Procurement → Procuring → Procured → Delivered
  - Direct status change from dropdown
  - Confirmation dialogs for critical changes
- Filter Options:
  - All Records / PRs Only / POs Only
  - By Finance Status: All / Pending / Approved / Rejected
  - By Procurement Status: All / Pending / Procuring / Procured / Delivered
  - Search by ID, project, or supplier

**Scoreboards (4 metrics)**
- Pending Procurement (yellow badge)
- Procuring (blue badge)
- Procured (purple badge)
- Delivered (green badge)

#### Document Generation System (9 functions)

**PR Document Generation**
- `generatePRDocument()` - Generate formatted PR for print
- Company header with logo
- PR details (ID, MRF reference, date, supplier)
- Items table with quantities and costs
- Grand total calculation
- Signature blocks for approval workflow
- Print-optimized CSS

**PO Document Generation**
- `generatePODocument()` - Generate formatted PO for print
- Company header with CLMC Engineering branding
- PO details (ID, date issued, supplier info)
- Billing and shipping addresses
- Items table with line totals
- Terms and conditions
- Signature blocks
- Print-optimized layout

**Batch Document Generation**
- `generateAllPODocuments()` - Generate multiple POs at once
- Opens each PO in new tab for printing
- Useful for bulk PO processing

**Document Actions**
- `viewPODocument()` - Preview PO in modal
- `downloadPODocument()` - Download PO as file
- `openPrintWindow()` - Open in print-ready window

---

### 💰 Finance Dashboard
**Location:** `app/views/finance.js` (1,077 lines)

The finance dashboard handles PR/TR approvals and PO tracking with 3 main tabs:

#### Tab 1: Pending Approvals (9 functions)

**Real-time Statistics (4 scoreboards)**
- Material PRs Pending (yellow badge)
- Transport Requests Pending (red badge)
- Approved This Month (green badge)
- Total Pending Amount (currency display)

**Material Purchase Requests**
- Display all PRs with `finance_status: Pending`
- Show PR ID, MRF reference, project, date
- Display urgency level badges
- Show total cost and supplier
- Action buttons: View Details, Approve, Reject

**Transport Requests**
- Display all TRs with `finance_status: Pending`
- Show TR ID, MRF reference, project, date
- Display service type (hauling/delivery)
- Show total cost
- Action buttons: View Details, Approve, Reject

**Approval Workflow**
- `viewPRTRDetails()` - Show complete PR/TR details in modal
  - All item details with quantities and costs
  - Project information
  - Urgency level and justification
  - Supplier information
- `approvePRTR()` - Approve PR/TR with automatic PO generation
  - Updates `finance_status` to 'Approved'
  - Automatically generates PO record in `pos` collection
  - Groups items by supplier (for multi-supplier PRs)
  - Sets initial PO status to 'Pending Procurement'
  - Updates originating MRF status if applicable
  - Shows success notification
- `openRejectionModal()` - Opens rejection reason dialog
- `submitRejection()` - Reject with reason
  - Updates `finance_status` to 'Rejected'
  - Stores rejection reason
  - Updates MRF status to 'Rejected'
  - Notifies user of rejection

**PR/TR Details Modal**
- Window-style modal design
- 2-column metadata grid
- Complete items table with categories
- Grand total display
- Action buttons (Approve/Reject)

#### Tab 2: Purchase Orders (2 functions)

**PO Display**
- `loadPOs()` - Load all POs from Firebase
- `renderPOsList()` - Display POs in cards layout
- Real-time updates via Firebase listeners

**PO Information Cards**
- PO ID and date issued
- Supplier name
- Originating PR and MRF references
- Total amount (formatted currency)
- Procurement status badge
- Subcontractor indicator (if applicable)
- Last updated timestamp

**PO Actions**
- View PO details button
- Status displayed with color-coded badges
- Grouped by recent activity (last 30 days)

#### Tab 3: Historical Data

**Features:**
- Placeholder for analytics dashboard
- Future: Supplier performance metrics
- Future: Price trend analysis
- Future: Procurement cycle analytics
- Future: Budget vs. actual reports

---

### 🎨 UI/UX Features

**Modern Design System**
- **Color Scheme:**
  - Primary Blue: `#1a73e8`
  - Success Green: `#059669`
  - Warning Yellow: `#f59e0b`
  - Danger Red: `#ef4444`
  - Consistent border colors and backgrounds
- **Typography:**
  - System font stack for performance
  - Clear hierarchy with size and weight
  - Letter-spacing on labels
- **Components:**
  - Window-style modals (not banner-style)
  - Standardized pagination controls
  - Consistent status badges
  - Responsive tables with hover effects
  - Modern form inputs with focus states
  - Action buttons with icons
- **Interactions:**
  - Smooth transitions (200ms)
  - Hover effects with scale transforms
  - Focus states with colored rings
  - Loading states with spinners
  - Toast notifications for feedback
  - Confirmation dialogs for destructive actions

**Accessibility**
- Proper ARIA labels
- Keyboard navigation support
- Focus visible states
- High contrast text
- Large touch targets (minimum 40px height)
- Semantic HTML structure

---

### 🔄 Real-time Features

**Firebase Listeners (All Views)**
- MRFs collection - Auto-updates pending MRFs
- PRs collection - Auto-updates pending PRs
- POs collection - Auto-updates PO status
- TRs collection - Auto-updates transport requests
- Suppliers collection - Auto-updates supplier list
- Projects collection - Auto-updates project dropdown

**Auto-refresh Capabilities**
- Statistics update without page reload
- New submissions appear immediately
- Status changes reflect instantly
- Multi-user collaboration support
- No manual refresh required

---

### 📊 Data Management

**Soft Delete System**
- `deleted_mrfs` collection stores removed MRFs
- Cascading delete captures related PRs, POs, TRs
- Complete audit trail preserved
- Recovery possible from deleted collection

**Sequential ID Generation**
- MRF IDs: `MRF-YYYY-###`
- PR IDs: `PR-YYYY-###`
- PO IDs: `PO-YYYY-###`
- TR IDs: `TR-YYYY-###`
- Auto-increments per year
- Finds max number and adds 1

**Data Validation**
- Required field enforcement
- Type validation (numbers, dates, emails)
- Minimum/maximum constraints
- Custom validation rules
- Client-side validation before Firebase save
- Error messages displayed inline

---

### 🔒 Security & Performance

**Security Features**
- HTTP security headers configured
- CSP (Content Security Policy) enabled
- X-Content-Type-Options: nosniff
- Frame-ancestors: 'self' (prevents clickjacking)
- No sensitive data in client code
- Firebase security rules (server-side)

**Performance Optimizations**
- Lazy loading of views (dynamic imports)
- Pagination (15 items/page for suppliers, 10 for records)
- Efficient Firebase queries with indexes
- CSS/JS minification via Netlify
- CDN delivery of Firebase SDK
- Real-time listeners prevent unnecessary queries
- Proper listener cleanup prevents memory leaks

**Browser Compatibility**
- Modern ES6 modules (Chrome, Firefox, Safari, Edge)
- Native fetch API
- CSS Grid and Flexbox
- No polyfills required
- Graceful degradation for older browsers

---

## Feature Summary Matrix

| Feature Category | Home | MRF Form | Procurement | Finance |
|-----------------|------|----------|-------------|---------|
| **Real-time Stats** | ✅ | - | ✅ | ✅ |
| **Form Submission** | - | ✅ | ✅ | - |
| **CRUD Operations** | - | - | ✅ | - |
| **Document Generation** | - | - | ✅ | - |
| **Approval Workflow** | - | - | - | ✅ |
| **Status Management** | - | - | ✅ | ✅ |
| **Pagination** | - | - | ✅ | - |
| **Modal Dialogs** | - | - | ✅ | ✅ |
| **PDF Export** | - | - | ✅ | ✅ |
| **Firebase Listeners** | ✅ | ✅ | ✅ | ✅ |
| **Search/Filter** | - | - | ✅ | ✅ |

**Total Functions Across All Views: 47+**
**Total Lines of Production Code: ~6,300 lines**

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

**IMPORTANT - Tab Navigation Behavior:**
- When switching tabs within the same view (e.g., `/procurement/mrfs` → `/procurement/suppliers`), the router DOES NOT call `destroy()` on the view
- This prevents window functions from being deleted during tab switches
- The router only calls `destroy()` when navigating to a completely different view
- Each tab switch triggers `render()` and `init()` with the new tab parameter
- Window functions are re-attached in `init()` via `attachWindowFunctions()` to ensure availability

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

### DOM Element Selection in Procurement View
**CRITICAL**: The procurement view uses **CSS classes**, NOT data attributes for item rows.

When collecting items from the line items table, use these correct selectors:

```javascript
// ✅ CORRECT - Use CSS classes
const itemRows = document.querySelectorAll('#lineItemsBody tr');
for (const row of itemRows) {
    const itemName = row.querySelector('input.item-name')?.value?.trim() || '';
    const category = row.querySelector('select.item-category')?.value || '';
    const qty = parseFloat(row.querySelector('input.item-qty')?.value) || 0;
    const unit = row.querySelector('select.item-unit')?.value || 'pcs';
    const unitCost = parseFloat(row.querySelector('input.unit-cost')?.value) || 0;
    const supplier = row.querySelector('select.supplier-select')?.value || '';
}

// ❌ WRONG - Do NOT use these selectors
const itemRows = document.querySelectorAll('#mrfDetailsItemRows tr'); // Wrong ID
const itemName = row.querySelector('input[data-field="item_name"]'); // Wrong selector
```

**Key Points:**
- Table body ID: `#lineItemsBody` (not `#mrfDetailsItemRows`)
- Use CSS class selectors: `.item-name`, `.item-category`, etc.
- Do NOT use data-field attribute selectors like `[data-field="item_name"]`
- This pattern is used in: `generatePR()`, `submitTransportRequest()`, `generatePRandTR()`, `saveNewMRF()`, `saveProgress()`

### Debugging with Console Logs
The application includes comprehensive console logging for debugging:

**Router Logs:**
- `[Router]` prefix indicates router activity
- Navigation events show: path, tab, and whether it's the same view
- Module loading and view lifecycle events are logged

**Procurement View Logs:**
- `[Procurement]` prefix for all procurement-related logs
- 🔵 Blue circle: Init started
- ✅ Green checkmark: Success/completion
- 🔴 Red circle: Destroy started
- 🗑️ Trash icon: Window functions deleted
- Function attachment logs show when window functions are attached/available

**Debugging Tab Navigation Issues:**
1. Open browser DevTools Console
2. Navigate to procurement view
3. Switch between tabs and watch for:
   - `[Router] Same view - skipping destroy` (should appear for tab switches)
   - `[Procurement] Attaching window functions...` (confirms functions are re-attached)
   - `[Procurement] Testing window.loadMRFs availability: function` (confirms availability)
4. If you see errors about undefined window functions, check that `attachWindowFunctions()` was called

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

## Recent Critical Bug Fixes (2026-01-16)

### Issue #1 & #3: Window Functions Not Available During Tab Switching
**Problem:** When switching between tabs within procurement view (e.g., MRF Processing → Suppliers), errors appeared:
- `TypeError: window.loadMRFs is not a function`
- `TypeError: window.refreshPOTracking is not a function`

**Root Cause:** The router was calling `destroy()` on every navigation, even when just switching tabs within the same view. This deleted all window functions, causing onclick handlers to fail before `init()` could re-attach them.

**Fix:** Modified `app/router.js` to:
- Check if navigation is to the same view (just different tab)
- Skip `destroy()` call when switching tabs within the same view
- Only call `destroy()` when navigating to a completely different view
- Reuse the current module instead of reloading it

**Result:** Tab switching now works smoothly without destroying/recreating the entire view.

### Issue #2: "At least one item is required" Error in PR Generation
**Problem:** When clicking "Generate PR" with items in the table, the error "At least one item is required" appeared, blocking PR generation.

**Root Cause:** The PR generation functions (`generatePR()`, `submitTransportRequest()`, `generatePRandTR()`) were using incorrect DOM selectors:
- Wrong table ID: `#mrfDetailsItemRows` (should be `#lineItemsBody`)
- Wrong selectors: `input[data-field="item_name"]` (should be `input.item-name`)
- This caused the query to find zero items, triggering the validation error

**Fix:** Updated all three functions to use correct selectors:
- Changed table selector from `#mrfDetailsItemRows tr` to `#lineItemsBody tr`
- Changed all element selectors to use CSS classes (`.item-name`, `.item-category`, etc.)
- Made consistent with working `saveNewMRF()` function pattern

**Result:** PR generation now correctly reads items from the table and processes them.

### Debugging Enhancements
Added comprehensive console logging to track:
- Router navigation and view lifecycle events
- Window function attachment/deletion
- Tab navigation behavior (same view vs. different view)
- Function availability checks

Use browser DevTools Console to monitor application behavior and debug issues.

## Recent UI Improvements (2026-01-16)

### Comprehensive UI Modernization
**Objective:** Standardize UI components, improve visual consistency, and create modern, sleek interfaces across all views.

### Changes Implemented:

#### 1. Pagination Standardization
**Problem:** Pagination controls had inconsistent styling with inline styles, poor spacing, and different implementations across tabs.

**Solution:** Created reusable CSS component system
- **New CSS Classes:** `.pagination-container`, `.pagination-btn`, `.pagination-info`, `.pagination-controls`, `.pagination-ellipsis`
- **Location:** `styles/components.css` (lines 923-997)
- **Features:**
  - Consistent white background with subtle shadow
  - 1.5rem margin-top for proper spacing from tables
  - "Showing **X-Y** of **Z** Items" info display with strong emphasis
  - Previous/Next buttons with arrow indicators (← →)
  - Active page highlighted with blue gradient (#1a73e8)
  - Ellipsis (...) support for large page counts
  - Disabled state for boundary buttons
  - Fully responsive on mobile devices

**Refactored Functions:**
- `updateSuppliersPaginationControls()` in `app/views/procurement.js` (lines 1860-1904)
- `updatePOPaginationControls()` in `app/views/procurement.js` (lines 3211-3260)
- `renderHistoricalPagination()` in `app/views/procurement.js` (lines 2224-2265)

**Impact:** All pagination controls now have identical styling and behavior across Suppliers, PO Tracking, and Historical MRFs tabs.

#### 2. Add Line Item Button Fix
**Problem:** Button text "Add Line Item" was stacking vertically, appearing broken and unprofessional.

**Solution:** Enhanced button styling with proper constraints
- **Location:** `styles/views.css` (lines 270-302)
- **Changes:**
  - Added `white-space: nowrap` to prevent text wrapping
  - Set explicit SVG icon size (18x18px) with `flex-shrink: 0`
  - Increased padding from `0.625rem 1.25rem` to `0.75rem 1.5rem`
  - Added `min-width: fit-content` to ensure button expands
  - Aligned with primary blue color scheme (#1a73e8)
  - Added active state for click feedback with `transform: translateY(0)`

**Result:** Button displays inline with proper icon-text alignment and improved touch targets.

#### 3. Items Table Modernization
**Problem:** Table styling was functional but lacked modern polish and visual hierarchy.

**Solution:** Comprehensive table redesign with attention to detail
- **Location:** `styles/views.css` (lines 103-273)
- **Improvements:**
  - **Header:** Updated gradient to blue theme matching primary colors (#1a73e8 → #1557b0)
  - **Spacing:** Increased padding (headers: 1.125rem, cells: 1rem)
  - **Sticky Header:** Added `position: sticky` with z-index for long tables
  - **Hover Effects:** Enhanced with subtle scale transform (1.005) and shadow
  - **Input Fields:**
    - Larger height (40px from 38px)
    - Thicker borders (1.5px from 1px)
    - Hover state with border color change (#cbd5e1)
    - Enhanced focus ring with blue accent (4px from 3px)
  - **Footer:** Green gradient background (#f0fdf4 → #dcfce7) with #86efac border
  - **Wrapper:** Added 0.75rem padding with #fafbfc background

**Result:** Modern, sleek table design with improved readability and smooth interactions.

#### 4. Modal Redesign to Window-Style
**Problem:** Modals used dark overlay and felt like "annoying banners" rather than integrated UI elements.

**Solution:** Redesigned modals to look like application windows
- **Location:** `styles/components.css` (lines 491-672)
- **Design:**
  - Centered layout (no side-sliding, no grand animations)
  - Lighter backdrop with blur effect (`rgba(15, 23, 42, 0.4)` + `blur(4px)`)
  - Window-style appearance:
    - Clean white title bar with subtle gradient (white → #f8fafc)
    - Defined 1px border around entire window
    - Dramatic shadow for depth (0 20px 60px)
    - Close button styled like OS window controls
  - Flexbox layout with sticky header and footer
  - Maximum height 85vh with overflow-y auto

**New CSS Components:**
- `.modal-details-grid` - 2-column responsive grid for metadata
- `.modal-detail-item` - Label/value pairs with proper hierarchy
- `.modal-detail-label` - Uppercase labels with letter-spacing
- `.modal-detail-value` - Value display with larger font
- `.modal-items-table` - Consistent table styling within modals

**Applied to:**
- PR Details modal in Finance view
- Rejection modal in Finance view
- All future modals automatically benefit from new styles

#### 5. Finance View Header Removal
**Problem:** Green gradient header felt inconsistent with minimal design approach.

**Solution:** Removed header completely
- **Location:** `app/views/finance.js` (lines 22-31 removed)
- **Result:** Cleaner, more minimal design consistent with other views

### Code Quality Improvements:

**Before:**
- Inline styles scattered throughout JavaScript
- Inconsistent spacing and colors
- Hard to maintain and modify

**After:**
- Centralized CSS component system
- Consistent design tokens and spacing
- Easy to maintain and extend

### Files Modified:

| File | Lines Changed | Type |
|------|---------------|------|
| `styles/components.css` | +200 | CSS additions for pagination, modals, grids |
| `styles/views.css` | +80 | CSS updates for button, table styling |
| `app/views/procurement.js` | ~100 | Refactored 3 pagination functions |
| `app/views/finance.js` | ~50 | Removed header, updated modal content |

### Design System:

**Color Scheme:**
- Primary Blue: `#1a73e8` (maintained for consistency)
- Primary Dark: `#1557b0`
- Success Green: `#059669`
- Borders: `#e5e7eb`, `#e2e8f0`
- Text: `#1e293b` (headings), `#475569` (labels), `#64748b` (muted)
- Backgrounds: `#ffffff`, `#fafbfc`, `#f8fafc`

**Spacing Scale:**
- Padding: 0.75rem, 1rem, 1.125rem, 1.5rem, 1.75rem, 2rem
- Margins: 1.5rem (standard component spacing)
- Border Radius: 6px (small), 8px (medium), 12px (large)

**Typography:**
- Labels: 0.75rem, uppercase, letter-spacing 0.1em
- Body: 0.875rem
- Values: 1rem
- Totals: 1.25rem-1.5rem

### Testing Checklist:

✅ Pagination displays consistently across all tabs
✅ Add Line Item button displays inline (no text stacking)
✅ Items table has modern styling with smooth hover effects
✅ Input fields show proper focus states
✅ PR/PO details open as centered window-style modals
✅ Modal detail grid displays information clearly
✅ Modal items table matches main table styling
✅ Finance view header removed successfully
✅ All components responsive on mobile devices

### Deployment:

- **Branch:** `claude/plan-pagination-ui-x3v5F`
- **Commit:** `2954357` - "Implement comprehensive UI improvements across all views"
- **Status:** ✅ Pushed and ready for PR
- **PR URL:** https://github.com/pengr3/pr-po/pull/new/claude/plan-pagination-ui-x3v5F
