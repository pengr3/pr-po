# Tab Permission System - Complete Guide

## Overview

The CLMC Procurement System uses a **role-based permission system** to control which tabs users can access. This document explains how the system works and provides a **checklist for adding new tabs**.

---

## How The System Works

### Architecture

```
┌─────────────────┐
│   index.html    │  1. Navigation links with data-route
│  <a data-route> │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  app/router.js  │  2. Route → Permission mapping
│ routePermissionMap│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│app/permissions.js│  3. hasTabAccess() checks permission
│  hasTabAccess()  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Firestore     │  4. role_templates collection
│ role_templates  │     (Source of Truth)
└─────────────────┘
```

### Permission Check Flow

1. **Navigation Visibility** (`app/auth.js:updateNavForAuth()`)
   - Hides/shows nav links based on `permissions.tabs[route].access`
   - Triggered on login and permission changes

2. **Route Protection** (`app/router.js`)
   - Before loading a view, checks `hasTabAccess(permissionKey)`
   - Shows "Access Denied" page if `access === false`

3. **Edit Controls** (Individual views)
   - Views check `canEditTab(tabId)` to show/hide edit buttons
   - Returns `permissions.tabs[tabId].edit`

---

## Tab Types

### 1. Top-Level Tabs

Top-level tabs appear in the main navigation bar and have dedicated permission entries.

**Examples:** Home, Clients, Projects, MRF Form, Procurement, Finance, Settings

**Permission Structure:**
```javascript
permissions: {
    tabs: {
        finance: {
            access: true,  // Can see the tab
            edit: true     // Can modify data
        }
    }
}
```

### 2. Sub-Tabs (Internal Navigation)

Sub-tabs are navigation within a top-level tab (e.g., Finance → Project List, Approvals, POs).

**Key Point:** Sub-tabs **inherit** permission from their parent tab. If a user has `finance.access === true`, they see **ALL** Finance sub-tabs.

**Examples:**
- Finance sub-tabs: Pending Approvals, Purchase Orders, Historical Data, Project List
- Procurement sub-tabs: MRF Management, Supplier Management, PR/TR Generation, PO Tracking

**No separate permissions needed** - they're controlled by the parent tab permission.

---

## Source of Truth: Firestore `role_templates` Collection

### Why Firestore is the Source of Truth

1. **Real-time updates**: Permission changes take effect immediately without redeployment
2. **Admin UI**: Super Admins can modify permissions via Settings → Role Configuration
3. **Per-user overrides**: Individual user permissions can override role template defaults

### Structure

**Collection:** `role_templates`
**Documents:** One per role (e.g., `super_admin`, `operations_admin`, `finance_user`)

**Document Structure:**
```javascript
{
    role_id: "super_admin",
    role_name: "Super Admin",
    permissions: {
        tabs: {
            dashboard: { access: true, edit: true },
            clients: { access: true, edit: true },
            projects: { access: true, edit: true },
            mrf_form: { access: true, edit: true },
            procurement: { access: true, edit: true },
            finance: { access: true, edit: true },
            role_config: { access: true, edit: true }
        }
    },
    created_at: Timestamp,
    updated_at: Timestamp
}
```

### The Sync Problem

**Code vs Database Mismatch:**
- `app/seed-roles.js` defines default role templates in code
- Firestore `role_templates` collection contains the active permissions
- **These are NOT automatically synced!**

**When adding new tabs:**
1. Update `seed-roles.js` ✅
2. **Manually sync to Firestore** ❌ (often forgotten!)

**Result:** New tabs defined in code but not in Firestore = users can't see them.

---

## Complete Checklist: Adding a New Top-Level Tab

Use this checklist when adding a new top-level tab to ensure it's visible to users.

### Step 1: Code Updates (6 files)

| # | File | What to Add | Line Reference |
|---|------|-------------|----------------|
| 1 | `index.html` | Add nav link with `data-route` attribute | ~Lines 25-34 |
| 2 | `app/router.js` | Add route→permission mapping in `routePermissionMap` | ~Lines 8-20 |
| 3 | `app/router.js` | Add route definition in `routes` object | ~Lines 31-99 |
| 4 | `app/views/role-config.js` | Add tab to `TABS` array | ~Lines 20-29 |
| 5 | `app/seed-roles.js` | Add tab permission to ALL role templates | ~Lines 17-93 |
| 6 | Create `app/views/your-tab.js` | Implement `render()`, `init()`, `destroy()` | New file |

#### Example: Adding "Reports" Tab

**1. index.html** (add nav link):
```html
<a href="#/reports" class="nav-link" data-route="reports">Reports</a>
```

**2. app/router.js** (`routePermissionMap`):
```javascript
const routePermissionMap = {
    // ... existing routes
    '/reports': 'reports'  // ADD THIS
};
```

**3. app/router.js** (`routes` object):
```javascript
const routes = {
    // ... existing routes
    '/reports': {
        name: 'Reports',
        load: () => import('./views/reports.js'),
        title: 'Reports | CLMC Operations'
    }
};
```

**4. app/views/role-config.js** (`TABS` array):
```javascript
const TABS = [
    // ... existing tabs
    { id: 'reports', label: 'Reports' }  // ADD THIS
];
```

**5. app/seed-roles.js** (add to **EVERY** role):
```javascript
const defaultRoleTemplates = [
    {
        role_id: 'super_admin',
        permissions: {
            tabs: {
                // ... existing tabs
                reports: { access: true, edit: true }  // ADD THIS
            }
        }
    },
    {
        role_id: 'operations_admin',
        permissions: {
            tabs: {
                // ... existing tabs
                reports: { access: true, edit: false }  // ADD THIS
            }
        }
    },
    // ... repeat for ALL roles
];
```

**6. app/views/reports.js** (new file):
```javascript
export function render() {
    return `<div>Reports Content</div>`;
}

export async function init() {
    console.log('[Reports] Initialized');
}

export async function destroy() {
    console.log('[Reports] Destroyed');
}
```

### Step 2: Sync to Firestore ⚠️ CRITICAL

After updating code, **you MUST sync permissions to Firestore**:

**Option A: Use Sync Utility** (Recommended)
```bash
# In browser console (while logged in as Super Admin)
node scripts/sync-role-permissions.js
```

**Option B: Manual Update via Firebase Console**
1. Go to Firebase Console → Firestore Database
2. Open `role_templates` collection
3. Edit each role document
4. Add the new tab permission:
   ```
   permissions.tabs.reports = { access: true, edit: true }
   ```

**Option C: Use Role Configuration UI**
1. Log in as Super Admin
2. Go to Settings → Role Configuration
3. Click "Edit" on each role
4. Check the appropriate access/edit boxes for the new tab
5. Save each role

### Step 3: Verification

1. **Clear browser cache** (Ctrl+Shift+R)
2. Log in as different roles
3. Verify new tab appears in navigation for roles with `access: true`
4. Verify new tab is hidden for roles with `access: false`
5. Verify edit controls work based on `edit: true/false`

---

## Adding Sub-Tabs (Internal Navigation)

Sub-tabs **do NOT** require permission system updates. They inherit from the parent tab.

### Example: Adding "Expense Breakdown" sub-tab to Finance

**Only 1 file needs updating:**

**app/views/finance.js** (add sub-tab link):
```javascript
export function render(activeTab = 'approvals') {
    return `
        <div class="tabs-nav">
            <a href="#/finance/approvals" class="tab-btn">Pending Approvals</a>
            <a href="#/finance/pos" class="tab-btn">Purchase Orders</a>
            <a href="#/finance/history" class="tab-btn">Historical Data</a>
            <a href="#/finance/projects" class="tab-btn">Project List</a>
            <a href="#/finance/expenses" class="tab-btn">Expense Breakdown</a> <!-- NEW -->
        </div>

        <!-- Add content section -->
        <section id="expenses-section" class="section ${activeTab === 'expenses' ? 'active' : ''}">
            <!-- Your expense breakdown content -->
        </section>
    `;
}
```

**That's it!** If a user can access Finance, they can access all Finance sub-tabs.

---

## Common Issues & Solutions

### Issue 1: "New tab not appearing for Super Admin"

**Symptoms:**
- Code updated with new tab
- Super Admin can't see it in navigation

**Root Cause:** Firestore `role_templates` not updated

**Fix:**
```bash
# Run sync utility or manually update Firestore
# See "Step 2: Sync to Firestore" above
```

### Issue 2: "Tab appears but shows Access Denied"

**Symptoms:**
- Tab visible in navigation
- Clicking shows "Access Denied" page

**Root Cause:** Mismatch between `data-route` and `routePermissionMap`

**Fix:**
1. Check `index.html` - what's the `data-route` attribute?
2. Check `app/router.js` `routePermissionMap` - does it map the route to that permission key?
3. Check Firestore `role_templates` - does the user's role have that permission?

**Example:**
```html
<!-- index.html -->
<a href="#/reports" data-route="reports_tab">...</a>

<!-- app/router.js -->
const routePermissionMap = {
    '/reports': 'reports'  // ❌ MISMATCH! Should be 'reports_tab'
};
```

### Issue 3: "Permission changes not taking effect"

**Symptoms:**
- Updated Firestore role_templates
- User still can't access tab

**Root Cause:** Browser cache or no permission refresh

**Fix:**
1. Hard refresh browser (Ctrl+Shift+R)
2. Log out and log back in
3. Check browser console for permission load errors

### Issue 4: "Sub-tab not showing"

**Symptoms:**
- Can access parent tab (e.g., Finance)
- Specific sub-tab (e.g., Project List) not visible

**Root Cause:** Sub-tab link missing from view HTML

**Fix:**
1. Check `app/views/[parent].js` - is the sub-tab link in the `render()` function?
2. Check router parsing - does it handle the sub-tab route (`#/finance/projects`)?

**In router.js:**
```javascript
let [path, tabParam] = parsedPath.split('/').slice(1);
if (tabParam) {
    path = '/' + path;  // e.g., '/finance'
    // tabParam = 'projects'
}
```

---

## Role Template Hierarchy

### Default Roles

| Role | Dashboard | Clients | Projects | MRF | Procurement | Finance | Settings |
|------|-----------|---------|----------|-----|-------------|---------|----------|
| **Super Admin** | ✅✏️ | ✅✏️ | ✅✏️ | ✅✏️ | ✅✏️ | ✅✏️ | ✅✏️ |
| **Operations Admin** | ✅ | ✅✏️ | ✅✏️ | ✅✏️ | ✅✏️ | ✅ | ❌ |
| **Operations User** | ✅ | ✅ | ✅ | ✅✏️ | ✅✏️ | ✅ | ❌ |
| **Finance User** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅✏️ | ❌ |
| **Viewer** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |

Legend:
- ✅ = access: true (can view)
- ✏️ = edit: true (can modify)
- ❌ = access: false (hidden)

### Adding New Roles

When adding a new role, you MUST define permissions for ALL tabs:

```javascript
{
    role_id: 'procurement_specialist',
    role_name: 'Procurement Specialist',
    permissions: {
        tabs: {
            dashboard: { access: true, edit: false },
            clients: { access: true, edit: false },
            projects: { access: true, edit: false },
            mrf_form: { access: true, edit: true },
            procurement: { access: true, edit: true },  // Main focus
            finance: { access: true, edit: false },      // View only
            role_config: { access: false, edit: false }
        }
    }
}
```

---

## Best Practices

### 1. Always Update Firestore After Code Changes

```bash
# After updating seed-roles.js
npm run sync-permissions  # Or manual update via Firebase Console
```

### 2. Test with Multiple Roles

Before deploying:
1. Create test users for each role
2. Log in as each role
3. Verify tab visibility and edit permissions

### 3. Use Descriptive Permission Keys

**Good:** `reports`, `analytics`, `audit_logs`
**Bad:** `tab1`, `page2`, `feature_x`

### 4. Document Tab Purpose in Comments

```javascript
// seed-roles.js
const TABS = [
    { id: 'dashboard', label: 'Dashboard (Home)' },
    { id: 'reports', label: 'Reports' },  // Financial and operational reports
    { id: 'analytics', label: 'Analytics' }  // Real-time data analysis
];
```

### 5. Super Admin Gets Everything

When adding a new tab, **always** grant Super Admin full access:

```javascript
super_admin: {
    permissions: {
        tabs: {
            new_tab: { access: true, edit: true }  // Always true for Super Admin
        }
    }
}
```

---

## Debugging Tools

### Check User Permissions (Browser Console)

```javascript
// Get current user's permissions
const permissions = window.getCurrentPermissions();
console.log(permissions);

// Check specific tab access
const canAccessFinance = window.hasTabAccess('finance');
console.log('Can access Finance:', canAccessFinance);

// Check edit permission
const canEditFinance = window.canEditTab('finance');
console.log('Can edit Finance:', canEditFinance);
```

### Inspect Role Templates (Firestore)

```javascript
// In browser console (requires Firestore SDK loaded)
import { db } from './app/firebase.js';
import { collection, getDocs } from './app/firebase.js';

const snapshot = await getDocs(collection(db, 'role_templates'));
snapshot.forEach(doc => {
    console.log(doc.id, doc.data().permissions.tabs);
});
```

### Verify Route→Permission Mapping

```javascript
// app/router.js
console.log(routePermissionMap);
// Should log:
// {
//   '/': 'dashboard',
//   '/clients': 'clients',
//   '/projects': 'projects',
//   ...
// }
```

---

## Future Improvements

### 1. Automatic Firestore Sync

Create a deploy hook that automatically syncs `seed-roles.js` to Firestore:

```bash
# .github/workflows/deploy.yml
- name: Sync role permissions
  run: node scripts/sync-role-permissions.js
```

### 2. Permission Validation CI Check

Add a CI check that ensures:
- All tabs in `routePermissionMap` exist in `seed-roles.js`
- All roles have the same set of tab keys (no missing permissions)

### 3. Admin UI for Tab Management

Build a UI that:
- Shows all registered tabs
- Highlights tabs missing from role templates
- Allows one-click sync from seed to Firestore

### 4. Sub-Tab Permissions (Optional)

If fine-grained control is needed:

```javascript
permissions: {
    tabs: {
        finance: {
            access: true,
            edit: true,
            sub_tabs: {
                approvals: { access: true, edit: true },
                projects: { access: true, edit: false }  // View-only
            }
        }
    }
}
```

---

## Summary

### When Adding a Top-Level Tab:

✅ Update 6 code files
✅ Sync to Firestore (CRITICAL!)
✅ Test with multiple roles
✅ Clear browser cache
✅ Commit and deploy

### When Adding a Sub-Tab:

✅ Update 1 file (parent view)
✅ Test immediately (no permission updates needed)

### The Golden Rule:

**Code defines the structure, Firestore defines who can see it.**

Always keep them in sync!
