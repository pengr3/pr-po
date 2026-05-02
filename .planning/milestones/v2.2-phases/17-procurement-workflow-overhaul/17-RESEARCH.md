# Phase 17: Procurement Workflow Overhaul - Research

**Researched:** 2026-02-07
**Domain:** JavaScript SPA state management, Firestore schema evolution, visual status tracking, user action attribution
**Confidence:** HIGH

## Summary

Phase 17 involves four distinct technical domains: (1) **User attribution** - capturing who performs PR generation actions, (2) **Tab renaming** - simple UI label changes without routing changes, (3) **Supplier modal consistency** - ensuring clickable supplier names always trigger purchase history modal, and (4) **MRF status tracking** - implementing comprehensive visual status indicators with color-coded badges showing PR/PO progress.

The research confirms that the existing codebase has established patterns for all these requirements. The authentication system (auth.js) provides `getCurrentUser()` which returns user data including `full_name` and `uid`. The Firebase schema already supports denormalized user data storage (personnel_user_id, personnel_name pattern from Phase 15). Visual status badges exist using inline styles with color coding. Timeline tracking currently uses ISO date strings, but Firestore `serverTimestamp()` should be used for precise efficiency measurement.

**Primary recommendation:** Use denormalized user attribution (store both user_id and full_name on PR documents), migrate timeline fields to serverTimestamp() on write while maintaining backward compatibility on read, implement status calculation logic that queries PRs/POs per MRF and renders color-coded badges (red/yellow/green pattern).

## Standard Stack

The phase works entirely within the existing technology stack - no new libraries required.

### Core (Already in Use)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Firebase Firestore | 10.7.1 | Database with real-time listeners | Project standard, supports serverTimestamp() |
| Vanilla JavaScript ES6 | - | DOM manipulation, state management | Zero-build SPA architecture |
| Hash-based routing | - | Client-side navigation | Existing router.js pattern |

### Supporting (Already Available)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Firebase Auth | 10.7.1 | User identity/authentication | Already used for getCurrentUser() |
| onSnapshot listeners | 10.7.1 | Real-time data sync | Existing pattern for live updates |
| serverTimestamp() | 10.7.1 | Server-side timestamp generation | NEW - for accurate timeline tracking |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| serverTimestamp() | ISO date strings | Current approach uses `new Date().toISOString()` which is client-side and date-only. serverTimestamp() provides millisecond precision from server, preventing clock skew issues. |
| Denormalized user data | User ID with lookup | Storing both user_id and full_name avoids extra reads, maintains historical accuracy if user is later deleted/renamed (Phase 15 pattern). |
| Color-coded badges | Text-only status | Visual indicators (red/yellow/green) provide at-a-glance status recognition, following Carbon Design System patterns. |

**Installation:**
No new packages required - all functionality exists in current stack.

## Architecture Patterns

### Recommended Data Structure for User Attribution

**PR Document Schema (Enhanced):**
```javascript
// When creating PR in generatePR()
const currentUser = window.getCurrentUser(); // Returns { uid, email, full_name, role, ... }

const prDoc = {
    pr_id: prId,
    mrf_id: mrfData.mrf_id,
    supplier_name: supplier,
    // ... existing fields ...

    // NEW: User attribution (denormalized pattern from Phase 15)
    pr_creator_user_id: currentUser?.uid || null,
    pr_creator_name: currentUser?.full_name || 'Unknown User',

    // Enhanced timestamps for efficiency tracking
    created_at: serverTimestamp(), // NEW - replaces new Date().toISOString()
    date_generated: new Date().toISOString().split('T')[0], // Keep for backward compat

    finance_status: 'Pending',
    // ... rest of fields ...
};
```

**PO Document Schema (Enhanced for Timeline):**
```javascript
// When creating PO
const poDoc = {
    po_id: poId,
    pr_id: prData.pr_id,
    // ... existing fields ...

    // Enhanced timestamps (millisecond precision)
    date_issued: serverTimestamp(), // Server timestamp for accuracy
    procurement_started_at: null, // Will be serverTimestamp() when status changes
    procured_at: null,
    delivered_at: null,

    // Keep date fields for backward compatibility
    procured_date: null,
    delivered_date: null,

    procurement_status: 'Pending Procurement'
};
```

### Pattern 1: User Attribution on Actions
**What:** Capture authenticated user identity when performing workflow actions (PR generation, PO creation, status updates)
**When to use:** Any action that modifies workflow state (generate PR, update status, approve/reject)
**Example:**
```javascript
// Source: Existing pattern in Phase 15 (personnel_user_id/personnel_name)
async function generatePR() {
    // Get current authenticated user
    const currentUser = window.getCurrentUser();

    if (!currentUser) {
        showToast('User session expired. Please log in again.', 'error');
        return;
    }

    // ... validation logic ...

    const prDoc = {
        pr_id: prId,
        mrf_id: mrfData.mrf_id,
        pr_creator_user_id: currentUser.uid,
        pr_creator_name: currentUser.full_name || currentUser.email,
        created_at: serverTimestamp(),
        // ... rest of fields ...
    };

    await addDoc(collection(db, 'prs'), prDoc);
}
```

### Pattern 2: MRF Status Calculation from Child Documents
**What:** Calculate aggregate MRF status by querying related PRs and POs, then render visual indicators
**When to use:** In PR-PO Records table rendering, MRF detail views
**Example:**
```javascript
// Calculate MRF status based on PR/PO state
async function calculateMRFStatus(mrfId) {
    // Query all PRs for this MRF
    const prsQuery = query(collection(db, 'prs'), where('mrf_id', '==', mrfId));
    const prsSnapshot = await getDocs(prsQuery);

    if (prsSnapshot.empty) {
        return {
            status: 'Awaiting PR',
            color: '#ef4444', // Red
            description: 'No PRs generated yet'
        };
    }

    const totalPRs = prsSnapshot.size;
    const approvedPRs = prsSnapshot.docs.filter(doc =>
        doc.data().finance_status === 'Approved'
    ).length;

    // Query all POs for this MRF
    const posQuery = query(collection(db, 'pos'), where('mrf_id', '==', mrfId));
    const posSnapshot = await getDocs(posQuery);
    const totalPOs = posSnapshot.size;

    if (totalPOs === 0) {
        return {
            status: '0/' + totalPRs + ' PO Issued',
            color: '#f59e0b', // Yellow
            description: 'PRs approved, awaiting PO generation'
        };
    }

    if (totalPOs === totalPRs) {
        return {
            status: totalPOs + '/' + totalPRs + ' PO Issued',
            color: '#22c55e', // Green
            description: 'All POs issued'
        };
    }

    return {
        status: totalPOs + '/' + totalPRs + ' PO Issued',
        color: '#f59e0b', // Yellow
        description: 'Partial PO issuance'
    };
}

// Render status badge
function renderMRFStatusBadge(statusObj) {
    return `<span style="
        background: ${statusObj.color};
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 600;
        white-space: nowrap;
    ">${statusObj.status}</span>`;
}
```

### Pattern 3: Server Timestamp Migration Strategy
**What:** Migrate from client-side ISO strings to serverTimestamp() while maintaining backward compatibility
**When to use:** Timeline tracking fields that need precise efficiency measurement
**Example:**
```javascript
// WRITE: Use serverTimestamp() for new records
import { serverTimestamp } from '../firebase.js';

await updateDoc(poRef, {
    procurement_started_at: serverTimestamp(), // Server time, millisecond precision
    procurement_started_date: new Date().toISOString().split('T')[0] // Backward compat
});

// READ: Handle both old and new format
function formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';

    // Handle Firestore Timestamp object (new format)
    if (timestamp && typeof timestamp.toDate === 'function') {
        return timestamp.toDate().toLocaleString(); // Shows date + time
    }

    // Handle ISO string (old format)
    if (typeof timestamp === 'string') {
        return new Date(timestamp).toLocaleString();
    }

    return 'N/A';
}

// Calculate time difference for efficiency metrics
function calculateDurationMs(startTimestamp, endTimestamp) {
    const start = typeof startTimestamp.toDate === 'function'
        ? startTimestamp.toDate()
        : new Date(startTimestamp);
    const end = typeof endTimestamp.toDate === 'function'
        ? endTimestamp.toDate()
        : new Date(endTimestamp);

    return end - start; // Milliseconds difference
}
```

### Pattern 4: Supplier Name Click Consistency
**What:** Ensure all clickable supplier names trigger the same purchase history modal
**When to use:** Supplier Management table, PR-PO Records table (PR and PO columns)
**Example:**
```javascript
// CORRECT: Supplier Management table (already working)
function renderSupplierRow(supplier) {
    return `
        <tr>
            <td class="clickable-supplier"
                onclick="window.showSupplierPurchaseHistory('${supplier.supplier_name}')">
                ${supplier.supplier_name}
            </td>
            <!-- other fields -->
        </tr>
    `;
}

// INCORRECT: PR-PO Records currently has inline supplier links
// Need to ensure consistency by using same onclick pattern
function renderPRCell(pr) {
    return `<div>
        <a href="javascript:void(0)"
           onclick="window.viewPRDetails('${pr.docId}')">${pr.pr_id}</a>

        <!-- Remove this per success criteria #4 -->
        ${pr.supplier_name ? `
            <a href="javascript:void(0)"
               onclick="window.showSupplierPurchaseHistory('${pr.supplier_name}')"
               style="color: #1a73e8;">
                ${pr.supplier_name}
            </a>
        ` : ''}
    </div>`;
}
```

### Anti-Patterns to Avoid
- **Client-side timestamps for efficiency tracking:** Using `new Date()` on client results in clock skew issues and only date precision (not time). Use `serverTimestamp()` for accurate timeline tracking.
- **User ID without name storage:** Storing only user_id requires lookup which may fail if user is deleted. Denormalize with both ID and name.
- **Hardcoded status strings without color mapping:** Status calculation should return both text and color for consistent visual presentation.
- **Breaking backward compatibility:** When migrating to serverTimestamp(), keep reading old ISO string format to avoid breaking existing data.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Server timestamp generation | `new Date().toISOString()` | `serverTimestamp()` from Firebase | Prevents client clock skew, provides millisecond precision, server-authoritative |
| User identity retrieval | Parse auth.currentUser manually | `window.getCurrentUser()` | Already implemented in auth.js with Firestore document sync, returns full user object with role/permissions |
| Status badge styling | Custom CSS classes | Inline styles with color variables | Existing pattern in procurement.js, avoids CSS conflicts, self-contained |
| Timeline component | Custom HTML | `createTimeline()` from components.js | Already used in Phase 13 for audit trails, reusable, consistent styling |
| Modal management | Manual DOM manipulation | `openModal()/closeModal()` from components.js | Handles body scroll lock, backdrop, cleanup |

**Key insight:** Firebase serverTimestamp() is critical for timeline accuracy. The function generates timestamps on the server, ensuring consistency across all clients regardless of their local clock settings. This is essential for measuring procurement efficiency (time from PR generation to PO issuance to delivery). The current implementation uses ISO date strings which only capture date (not time) and rely on client clocks.

## Common Pitfalls

### Pitfall 1: Tab Renaming Breaking Routes
**What goes wrong:** Changing tab display name without understanding router.js can break navigation if route paths are also changed
**Why it happens:** Developer confuses display label with routing path
**How to avoid:**
- Tab display name is in `render()` HTML: `<a href="#/procurement/records">MRF Records</a>`
- Tab routing key is in router.js and render() activeTab check: `activeTab === 'records'`
- Only change the display text, NOT the href path or activeTab comparison
**Warning signs:**
- Clicking tab results in 404 or wrong view
- Browser URL changes but content doesn't update
**Example:**
```javascript
// CORRECT: Change display text only
render(activeTab) {
    return `
        <a href="#/procurement/records" class="tab-btn ${activeTab === 'records' ? 'active' : ''}">
            MRF Records  <!-- Changed from "PR-PO Records" -->
        </a>
    `;
}

// WRONG: Changing route path breaks navigation
render(activeTab) {
    return `
        <a href="#/procurement/mrf-records" class="tab-btn ${activeTab === 'mrf-records' ? 'active' : ''}">
            MRF Records
        </a>
    `;
}
// This breaks because router.js still expects 'records', not 'mrf-records'
```

### Pitfall 2: Timestamp Field Migration Without Backward Compatibility
**What goes wrong:** Switching all code to read serverTimestamp() format breaks rendering of existing documents that use ISO strings
**Why it happens:** Not handling both old and new formats during migration
**How to avoid:**
- Write with serverTimestamp() for new/updated documents
- Read function must handle BOTH Timestamp objects and ISO strings
- Keep old field names for backward compat, add new _at suffix fields
**Warning signs:**
- Timeline shows "Invalid Date" or "N/A" for old records
- Console errors about `.toDate() is not a function`
**Example:**
```javascript
// WRONG: Only handles new format
function formatDate(timestamp) {
    return timestamp.toDate().toLocaleString(); // Breaks on ISO strings
}

// CORRECT: Handles both formats
function formatDate(timestamp) {
    if (!timestamp) return 'N/A';

    // Firestore Timestamp object (new)
    if (timestamp && typeof timestamp.toDate === 'function') {
        return timestamp.toDate().toLocaleString();
    }

    // ISO string (old)
    if (typeof timestamp === 'string') {
        return new Date(timestamp).toLocaleString();
    }

    return 'N/A';
}
```

### Pitfall 3: Missing User Attribution Check
**What goes wrong:** PR generation succeeds but pr_creator fields are null/undefined because getCurrentUser() wasn't checked
**Why it happens:** User session can expire or getCurrentUser() returns null in edge cases
**How to avoid:**
- Always check `getCurrentUser()` result before proceeding with action
- Show user-friendly error if session expired
- Include fallback values ('Unknown User') to prevent null fields
**Warning signs:**
- PRs created with null pr_creator_name
- Console warnings about accessing properties of null
**Example:**
```javascript
// WRONG: No user check
async function generatePR() {
    const user = window.getCurrentUser();
    const prDoc = {
        pr_creator_name: user.full_name, // Crashes if user is null
        // ...
    };
}

// CORRECT: Check and handle missing user
async function generatePR() {
    const user = window.getCurrentUser();

    if (!user) {
        showToast('Session expired. Please log in again.', 'error');
        return;
    }

    const prDoc = {
        pr_creator_user_id: user.uid,
        pr_creator_name: user.full_name || user.email || 'Unknown User',
        // ...
    };
}
```

### Pitfall 4: MRF Status Calculation Performance
**What goes wrong:** Calculating status for every MRF in table causes N+1 query problem (one query per MRF to fetch PRs/POs)
**Why it happens:** Status calculation logic queries PRs/POs individually for each MRF row
**How to avoid:**
- Batch fetch all PRs and POs once
- Group by mrf_id in JavaScript
- Calculate status from grouped data
**Warning signs:**
- Slow table rendering (>2 seconds for 50 MRFs)
- Firebase console shows hundreds of small queries
- Network waterfall shows sequential queries
**Example:**
```javascript
// WRONG: N+1 query problem
async function renderMRFTable(mrfs) {
    for (const mrf of mrfs) {
        const status = await calculateMRFStatus(mrf.mrf_id); // Queries DB each time
        // render row...
    }
}

// CORRECT: Batch fetch and group
async function renderMRFTable(mrfs) {
    // Fetch all PRs and POs once
    const allPRs = await getDocs(collection(db, 'prs'));
    const allPOs = await getDocs(collection(db, 'pos'));

    // Group by mrf_id
    const prsByMRF = {};
    const posByMRF = {};
    allPRs.forEach(doc => {
        const data = doc.data();
        if (!prsByMRF[data.mrf_id]) prsByMRF[data.mrf_id] = [];
        prsByMRF[data.mrf_id].push(data);
    });
    allPOs.forEach(doc => {
        const data = doc.data();
        if (!posByMRF[data.mrf_id]) posByMRF[data.mrf_id] = [];
        posByMRF[data.mrf_id].push(data);
    });

    // Calculate status from cached data
    for (const mrf of mrfs) {
        const prs = prsByMRF[mrf.mrf_id] || [];
        const pos = posByMRF[mrf.mrf_id] || [];
        const status = calculateStatusFromData(prs, pos);
        // render row...
    }
}
```

### Pitfall 5: Column Reordering Breaking Existing CSS
**What goes wrong:** Changing table column order in HTML breaks column-specific styles (e.g., `td:nth-child(3)`)
**Why it happens:** CSS selectors rely on column position, not semantic classes
**How to avoid:**
- Use class-based selectors for column styling, not nth-child
- Test table rendering after reordering columns
**Warning signs:**
- Column alignment broken after reordering
- Wrong columns get colored/styled
**Example:**
```javascript
// WRONG: CSS relies on column position
// CSS: td:nth-child(5) { text-align: center; }
// HTML: <th>MRF ID</th><th>Project</th><th>Date</th><th>PRs</th><th>Actions</th>
// Reordering breaks alignment

// CORRECT: Use semantic classes
// CSS: td.actions-cell { text-align: center; }
// HTML: <td class="actions-cell">...</td>
```

## Code Examples

Verified patterns from codebase and Firebase documentation:

### User Attribution in PR Generation
```javascript
// Source: auth.js getCurrentUser() + Phase 15 denormalization pattern
import { serverTimestamp } from '../firebase.js';

async function generatePR() {
    const currentUser = window.getCurrentUser();

    if (!currentUser) {
        showToast('Session expired. Please log in again.', 'error');
        return;
    }

    // ... validation and item collection logic ...

    // Create PR with user attribution
    const prDoc = {
        pr_id: prId,
        mrf_id: mrfData.mrf_id,
        mrf_doc_id: mrfData.id,
        supplier_name: supplier,

        // User attribution (NEW)
        pr_creator_user_id: currentUser.uid,
        pr_creator_name: currentUser.full_name || currentUser.email,

        // Enhanced timestamps
        created_at: serverTimestamp(), // Server timestamp for precision
        date_generated: new Date().toISOString().split('T')[0], // Backward compat

        project_code: mrfData.project_code || '',
        project_name: mrfData.project_name,
        requestor_name: mrfData.requestor_name,
        delivery_address: deliveryAddress,
        items_json: JSON.stringify(supplierItems),
        total_amount: supplierTotal,
        finance_status: 'Pending'
    };

    await addDoc(collection(db, 'prs'), prDoc);
    console.log(`PR ${prId} created by ${currentUser.full_name}`);
}
```

### MRF Status Calculation with Visual Badges
```javascript
// Source: Existing status badge pattern in procurement.js + new logic
function calculateAndRenderMRFStatus(mrf, prsForMRF, posForMRF) {
    let statusText = '';
    let statusColor = '';

    const prCount = prsForMRF.length;
    const poCount = posForMRF.length;

    if (prCount === 0) {
        // No PRs generated yet
        statusText = 'Awaiting PR';
        statusColor = '#ef4444'; // Red
    } else if (poCount === 0) {
        // PRs exist but no POs
        statusText = '0/' + prCount + ' PO Issued';
        statusColor = '#f59e0b'; // Yellow
    } else if (poCount === prCount) {
        // All POs issued
        statusText = prCount + '/' + prCount + ' PO Issued';
        statusColor = '#22c55e'; // Green
    } else {
        // Partial PO issuance
        statusText = poCount + '/' + prCount + ' PO Issued';
        statusColor = '#f59e0b'; // Yellow
    }

    // Render badge with inline styles (existing pattern)
    return `<span style="
        background: ${statusColor};
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 600;
        white-space: nowrap;
        display: inline-block;
    ">${statusText}</span>`;
}
```

### Timeline Timestamp Migration
```javascript
// Source: Firebase serverTimestamp() best practices
import { serverTimestamp, updateDoc, doc } from '../firebase.js';

// WRITE: Update PO status with server timestamp
async function updatePOStatus(poId, newStatus, oldStatus, isSubcon) {
    const updates = {
        procurement_status: newStatus
    };

    // Add timestamp field based on status
    if (newStatus === 'Procuring' && !isSubcon) {
        updates.procurement_started_at = serverTimestamp(); // NEW field
    } else if (newStatus === 'Procured' && !isSubcon) {
        updates.procured_at = serverTimestamp(); // NEW field
        updates.procured_date = new Date().toISOString().split('T')[0]; // Keep old field
    } else if (newStatus === 'Delivered') {
        updates.delivered_at = serverTimestamp(); // NEW field
        updates.delivered_date = new Date().toISOString().split('T')[0]; // Keep old field
    }

    await updateDoc(doc(db, 'pos', poId), updates);
}

// READ: Handle both timestamp formats
function formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';

    // Firestore Timestamp object (new format)
    if (timestamp && typeof timestamp.toDate === 'function') {
        const date = timestamp.toDate();
        return date.toLocaleString('en-PH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }); // "Feb 7, 2026, 10:30 AM"
    }

    // ISO string (old format - backward compat)
    if (typeof timestamp === 'string') {
        const date = new Date(timestamp);
        return date.toLocaleString('en-PH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    return 'N/A';
}

// Calculate efficiency metrics
function calculateDurationHours(startTimestamp, endTimestamp) {
    if (!startTimestamp || !endTimestamp) return null;

    const start = typeof startTimestamp.toDate === 'function'
        ? startTimestamp.toDate()
        : new Date(startTimestamp);
    const end = typeof endTimestamp.toDate === 'function'
        ? endTimestamp.toDate()
        : new Date(endTimestamp);

    const diffMs = end - start;
    const diffHours = diffMs / (1000 * 60 * 60);

    return diffHours.toFixed(1) + ' hours';
}
```

### PR-PO Records Table Column Reordering
```javascript
// Source: Existing renderPRPORecords() function with modifications
async function renderPRPORecords() {
    // ... data fetching logic ...

    const html = `
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="background: #f8f9fa;">
                    <th style="padding: 0.75rem 1rem; text-align: center; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">MRF ID</th>
                    <th style="padding: 0.75rem 1rem; text-align: left; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">Project</th>
                    <th style="padding: 0.75rem 1rem; text-align: center; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">Date Needed</th> <!-- RENAMED from "Date" -->
                    <th style="padding: 0.75rem 1rem; text-align: left; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">PRs</th>
                    <th style="padding: 0.75rem 1rem; text-align: left; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">POs</th>
                    <th style="padding: 0.75rem 1rem; text-align: left; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">MRF Status</th> <!-- NEW column -->
                    <th style="padding: 0.75rem 1rem; text-align: left; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">Procurement Status</th> <!-- RENAMED from "PO Status" -->
                    <!-- REMOVED: PO Timeline column -->
                    <th style="padding: 0.75rem 1rem; text-align: center; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">Actions</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(mrf => `
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                        <td style="padding: 0.75rem 1rem; text-align: center;">${mrf.mrf_id}</td>
                        <td style="padding: 0.75rem 1rem;">${mrf.project_name}</td>
                        <td style="padding: 0.75rem 1rem; text-align: center;">${formatDate(mrf.date_needed)}</td>
                        <td style="padding: 0.75rem 1rem;">
                            ${renderPRsColumn(mrf)} <!-- NO clickable supplier names -->
                        </td>
                        <td style="padding: 0.75rem 1rem;">
                            ${renderPOsColumn(mrf)} <!-- Side-by-side with PRs, NO clickable supplier names -->
                        </td>
                        <td style="padding: 0.75rem 1rem;">
                            ${calculateAndRenderMRFStatus(mrf, prsForMRF, posForMRF)} <!-- NEW -->
                        </td>
                        <td style="padding: 0.75rem 1rem;">
                            ${renderProcurementStatus(mrf)}
                        </td>
                        <td style="padding: 0.75rem 1rem; text-align: center;">
                            <button onclick="window.showProcurementTimeline('${mrf.mrf_id}')">Timeline</button>
                            <!-- Timeline button remains in Actions -->
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    container.innerHTML = html;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ISO date strings (date only) | serverTimestamp() with millisecond precision | Firebase v9+ (2021) | Enables accurate efficiency measurement, prevents client clock skew, server-authoritative |
| Text-only status indicators | Color-coded visual badges | Design system evolution (2020+) | Improves at-a-glance status recognition, follows Carbon/Material design patterns |
| User ID only | Denormalized user data (ID + name) | Phase 15 (v2.2) | Avoids extra lookups, maintains historical accuracy |
| Client-side date generation | Server-side serverTimestamp() | Firestore best practice | Prevents timestamp manipulation, consistent across clients |
| nth-child CSS selectors | Class-based selectors | Modern CSS best practice | Resilient to column reordering, semantic naming |

**Deprecated/outdated:**
- `new Date().toISOString()` for timeline tracking: Replaced by serverTimestamp() for precision and server authority
- Storing only user_id: Replaced by denormalized pattern (user_id + full_name) to avoid lookup overhead
- Text status without color: Replaced by inline-styled badges with standardized color coding (red/yellow/green)

## Open Questions

Things that couldn't be fully resolved:

1. **Should existing PR documents be backfilled with pr_creator fields?**
   - What we know: Phase 15 uses "migrate-on-edit" strategy for personnel fields
   - What's unclear: Whether historical PRs need pr_creator attribution or only new PRs going forward
   - Recommendation: Follow Phase 15 pattern - add fields only to new/updated PRs. Display "Unknown User" for old PRs without pr_creator_name field. Avoids expensive batch migration.

2. **Should MRF status be stored in mrfs collection or calculated on-the-fly?**
   - What we know: Current implementation stores status as text field ('PR Generated', 'PO Issued', etc.)
   - What's unclear: Whether the new visual status (n/n PO Issued) should be calculated from PRs/POs or stored
   - Recommendation: Calculate on-the-fly during table rendering. Status is derived state (can be calculated from PRs/POs), storing it creates sync issues. Use batch fetch pattern to avoid N+1 queries.

3. **Should procurement timeline timestamps be backfilled for existing POs?**
   - What we know: Existing POs use date-only fields (procured_date, delivered_date)
   - What's unclear: Whether to backfill serverTimestamp() equivalents or only use for new status updates
   - Recommendation: No backfill. Add serverTimestamp() fields only when status changes going forward. Reading logic handles both old (string) and new (Timestamp) formats. Backfilling would require estimating times, reducing accuracy.

4. **Should "PR Creator" be displayed in PR Details modal or only stored for audit?**
   - What we know: Success criteria only mentions "Generated PRs bear the name of user who clicked Generate PR button"
   - What's unclear: Whether this should be visible in UI (PR Details modal, PR-PO Records table) or only for backend audit
   - Recommendation: Display in PR Details modal as informational field (non-editable). Helps operations team understand workflow history. Add field to PR document generation template for traceability.

## Sources

### Primary (HIGH confidence)
- [Firebase JavaScript SDK 10.7.1](https://firebase.google.com/docs/reference/js/v8/firebase.firestore.Timestamp) - Timestamp API reference
- [Firestore serverTimestamp() documentation](https://firebase.google.com/docs/reference/node/firebase.firestore.FieldValue#servertimestamp) - Server timestamp function
- Project codebase: `app/auth.js` - getCurrentUser() implementation
- Project codebase: `app/views/procurement.js` - Existing status badge patterns, PR generation logic
- Project codebase: `app/components.js` - createTimeline() component for reuse

### Secondary (MEDIUM confidence)
- [Firestore Timestamp: A Simple Guide To Deal With Date and Time (2022)](https://www.rowy.io/blog/firestore-timestamp) - Best practices for timestamps vs date strings
- [Firebase Timestamps Done Right: Why Your App's Time Logic Might Be Broken](https://medium.com/@shuhan.chan08/firebase-timestamps-done-right-why-your-apps-time-logic-might-be-broken-25188c3b5b24) - Common timestamp pitfalls
- [The secrets of Firestore's FieldValue.serverTimestamp() — REVEALED!](https://medium.com/firebase-developers/the-secrets-of-firestore-fieldvalue-servertimestamp-revealed-29dd7a38a82b) - Deep dive on serverTimestamp() behavior
- [Carbon Design System - Status indicators](https://carbondesignsystem.com/patterns/status-indicator-pattern/) - Status badge color patterns and best practices
- [Status System - Astro UX Design](https://www.astrouxds.com/patterns/status-system/) - Red/yellow/green status indicator conventions

### Tertiary (LOW confidence)
- General web search results on JavaScript badge implementations - Not specific to Firebase/Firestore context

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All required functionality exists in current stack (Firebase 10.7.1, auth.js, components.js)
- Architecture: HIGH - Patterns verified in existing codebase (Phase 15 denormalization, existing status badges, getCurrentUser())
- Pitfalls: MEDIUM - Timestamp migration and N+1 query patterns are documented Firebase best practices, but specific application to this codebase is extrapolated

**Research date:** 2026-02-07
**Valid until:** 30 days (stable technology - Firestore API unchanged since v10 release)
