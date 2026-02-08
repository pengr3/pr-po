# Phase 19: Navigation Consolidation - Research

**Researched:** 2026-02-08
**Domain:** SPA navigation, dropdown menus, route consolidation (pure JS, no framework)
**Confidence:** HIGH

## Summary

Phase 19 merges three admin navigation items (Settings, Assignments, Users) into a single "Admin" dropdown nav item. This is a pure codebase refactoring task -- no external libraries needed. All the patterns, files, and mechanisms involved are fully understood from direct code reading.

The current system has 3 separate nav links (`#/role-config`, `#/project-assignments`, `#/user-management`) each pointing to independent view modules. The plan is to: (1) create a new `#/admin` route with a new admin.js view, (2) consolidate the 3 views into tab-like sections within that single view, (3) replace the 3 nav links with one "Admin" dropdown, and (4) update the permission/auth system to gate the new route.

**Primary recommendation:** Create a new `admin.js` view that wraps the three existing views as internal sections (lazy-importing them), add a single `#/admin` route, and replace the 3 nav `<a>` tags with one `<div class="nav-dropdown">` containing a click-toggled menu. Reuse the existing `role_config` permission key for the Admin route.

## Standard Stack

No external libraries needed. This is a pure HTML/CSS/JS refactoring task.

### Core (all already in the project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Pure JavaScript ES6 modules | N/A | View system, event handling | Project standard |
| CSS (custom) | N/A | Styling nav dropdown | Project design system |
| Firebase Firestore CDN | v10.7.1 | Permission checks | Already in use |

### Supporting
None needed. The dropdown is simple enough to implement with plain CSS and a click event listener.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom dropdown | Web component | Overkill for one dropdown; project uses no web components |
| Click handler | CSS :focus-within | Accessibility is better with explicit JS; :focus-within has edge cases |

## Architecture Patterns

### Current Navigation Structure (index.html, lines 28-42)

The nav is a static `<nav class="top-nav">` with a `<div class="nav-links">` containing `<a>` tags. Each link has:
- `href="#/route"` for hash navigation
- `class="nav-link"` for styling
- `data-route="permission_key"` for permission-based show/hide

The three admin links are:
```html
<a href="#/role-config" class="nav-link" data-route="role_config">Settings</a>
<a href="#/project-assignments" class="nav-link" data-route="role_config">Assignments</a>
<a href="#/user-management" class="nav-link" data-route="role_config">Users</a>
```

All three share `data-route="role_config"` -- they are all gated by the same `role_config` permission.

### Current Router Structure (app/router.js)

Three separate routes with three separate view modules:
```javascript
'/role-config': {
    name: 'Role Configuration',
    load: () => import('./views/role-config.js'),
    title: 'Role Configuration | CLMC Procurement'
},
'/project-assignments': {
    name: 'Project Assignments',
    load: () => import('./views/project-assignments.js'),
    title: 'Project Assignments | CLMC Procurement'
},
'/user-management': {
    name: 'User Management',
    load: () => import('./views/user-management.js'),
    title: 'User Management | CLMC Procurement'
}
```

Permission map entries:
```javascript
'/role-config': 'role_config',
'/project-assignments': 'role_config',
'/user-management': 'role_config'
```

### Current Permission/Auth System

1. **permissions.js** (app/permissions.js): Loads role template from Firestore `role_templates` collection. Exposes `hasTabAccess(tabId)` and `canEditTab(tabId)` on `window`.
2. **auth.js** `updateNavForAuth()` (line 397-426): Iterates all `.nav-link[data-route]` elements, checks `permissions.tabs[route].access`, sets `display: none` if false.
3. **router.js** `navigate()` (line 236-249): Checks `routePermissionMap[path]` -> `window.hasTabAccess(permissionKey)`. Blocks with "Access Denied" if `false`.

**Key insight:** The permission system uses `data-route` attributes on nav links and `routePermissionMap` in the router. The new Admin dropdown must work with both.

### Current View Module Pattern

Each admin view exports `render()`, `init()`, `destroy()`:

| View | File | Lines | Window Functions | Listeners |
|------|------|-------|-----------------|-----------|
| role-config.js | Settings (role permissions matrix) | 431 | 3 (`handleRoleConfigCheckboxChange`, `handleRoleConfigSave`, `handleRoleConfigDiscard`) | 1 (role_templates collection) |
| project-assignments.js | Assignments (project access) | 259 | 2 (`handleAllProjectsChange`, `handleProjectCheckboxChange`) | 2 (users query, projects query) |
| user-management.js | Users (approval, codes, management) | 1759 | 12 (various user management functions) | 3 (codes, pending users, all users) + 1 document event listener |

### Recommended Architecture: Admin Wrapper View

Create `app/views/admin.js` that:
1. Contains the section-switching UI (3 section buttons)
2. Delegates render/init/destroy to the appropriate child view module
3. Uses lazy imports to load child view modules on demand

```
app/
  views/
    admin.js                    # NEW: wrapper view
    role-config.js              # UNCHANGED: settings section
    project-assignments.js      # UNCHANGED: assignments section
    user-management.js          # UNCHANGED: users section
```

### Recommended Project Structure Changes

```
index.html                      # MODIFY: replace 3 admin nav links with 1 dropdown
app/router.js                   # MODIFY: remove 3 old routes, add 1 new #/admin route
app/auth.js                     # MODIFY: updateNavForAuth() to handle dropdown visibility
app/views/admin.js              # NEW: wrapper view with section switching
styles/components.css           # MODIFY: add dropdown CSS
```

### Pattern: Admin Wrapper View

The admin wrapper view should follow the existing multi-tab view pattern (like procurement.js and finance.js) where `render(activeTab)` and `init(activeTab)` receive a tab/section parameter.

```javascript
// app/views/admin.js

let currentSection = null;
let currentModule = null;

const SECTIONS = {
    users: {
        label: 'User Management',
        load: () => import('./user-management.js')
    },
    assignments: {
        label: 'Assignments',
        load: () => import('./project-assignments.js')
    },
    settings: {
        label: 'Settings',
        load: () => import('./role-config.js')
    }
};

export function render(activeSection = 'users') {
    // Section nav + content container
    return `
        <div class="admin-section-nav">
            <!-- section buttons -->
        </div>
        <div id="adminContent">
            <!-- child view renders here -->
        </div>
    `;
}

export async function init(activeSection = 'users') {
    // Load and init the active section's module
    currentSection = activeSection;
    const section = SECTIONS[activeSection];
    currentModule = await section.load();

    const container = document.getElementById('adminContent');
    container.innerHTML = currentModule.render();
    await currentModule.init();

    // Attach section switch handler
    window.switchAdminSection = switchAdminSection;
}

export async function destroy() {
    if (currentModule?.destroy) await currentModule.destroy();
    currentModule = null;
    currentSection = null;
    delete window.switchAdminSection;
}

async function switchAdminSection(sectionId) {
    if (currentModule?.destroy) await currentModule.destroy();
    const section = SECTIONS[sectionId];
    currentModule = await section.load();
    currentSection = sectionId;

    const container = document.getElementById('adminContent');
    container.innerHTML = currentModule.render();
    await currentModule.init();

    // Update active state on section buttons
    document.querySelectorAll('.admin-section-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.section === sectionId);
    });
}
```

**CRITICAL:** Since the router calls `destroy()` only when navigating to a DIFFERENT view (not tab switches within same view), but `#/admin` is a single route with NO sub-routes (per CONTEXT.md decision), section switching must be handled entirely within admin.js -- NOT through hash changes. The wrapper view manages its own child lifecycle.

### Pattern: Dropdown Nav

```html
<!-- Replace 3 admin links with: -->
<div class="nav-dropdown" data-route="role_config">
    <button class="nav-link nav-dropdown-trigger" data-route="role_config">Admin</button>
    <div class="nav-dropdown-menu">
        <a href="#/admin" class="nav-dropdown-item" data-section="users">User Management</a>
        <a href="#/admin" class="nav-dropdown-item" data-section="assignments">Assignments</a>
        <a href="#/admin" class="nav-dropdown-item" data-section="settings">Settings</a>
    </div>
</div>
```

### Anti-Patterns to Avoid
- **Don't create sub-routes (#/admin/users, etc.):** CONTEXT.md explicitly says single route `#/admin`, no deep links.
- **Don't use hover for dropdown:** CONTEXT.md says click-to-toggle.
- **Don't add chevron/arrow to Admin link:** CONTEXT.md explicitly says no visual indicator.
- **Don't use hash-based tab switching:** Since there are no sub-routes, section switching must be handled internally via DOM manipulation, not hash changes.
- **Don't modify the 3 child view modules (role-config.js, project-assignments.js, user-management.js):** They should work unchanged, imported and delegated to by the admin wrapper.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Outside click detection | Custom event tracking | `document.addEventListener('click', ...)` with `event.target.closest()` | Already used in user-management.js (line 558-565) |
| Permission filtering | New permission key | Reuse existing `role_config` permission key | All 3 admin views already use the same gate |
| Section switching | Custom router | Internal state management in admin.js | Single route, no sub-routes per CONTEXT.md |

## Common Pitfalls

### Pitfall 1: Window Function Collision
**What goes wrong:** All 3 admin views attach window functions. If multiple sections' modules are loaded simultaneously, function names could collide (e.g., both user-management.js and finance.js have `confirmApproval`).
**Why it happens:** ES modules are cached after first import. If not properly destroyed before loading another, old window functions persist.
**How to avoid:** Always call `currentModule.destroy()` before loading a new section module. Each view's `destroy()` already cleans up its own window functions.
**Warning signs:** Functions from wrong section executing on button clicks.

### Pitfall 2: Nav Active State for Dropdown
**What goes wrong:** The router's `updateNavigation()` function (router.js line 146-161) matches `href` starting with `#/path`. The dropdown trigger is a `<button>`, not an `<a>`, so it won't match.
**Why it happens:** `updateNavigation()` only queries `.nav-link` elements and checks `href`.
**How to avoid:** After navigation to `#/admin`, manually add `.active` class to the dropdown trigger. Or modify `updateNavigation()` to handle the dropdown case (check for `data-route` or a custom class).
**Warning signs:** Admin button not highlighted when on admin page.

### Pitfall 3: Permission Filtering for Dropdown Container
**What goes wrong:** `updateNavForAuth()` in auth.js (line 408-413) iterates `document.querySelectorAll('.nav-link[data-route]')` and shows/hides based on permission. The dropdown's outer `<div>` is not a `.nav-link` so it won't be filtered.
**Why it happens:** The permission filtering targets `a.nav-link[data-route]` elements only.
**How to avoid:** Either: (a) make the dropdown trigger a `.nav-link[data-route="role_config"]` element so existing filtering works, or (b) extend `updateNavForAuth()` to also handle `.nav-dropdown[data-route]` containers.
**Warning signs:** Non-admin users seeing the Admin dropdown.

### Pitfall 4: Dropdown Z-index vs Modals
**What goes wrong:** Dropdown menu appears behind modals or other overlays.
**Why it happens:** Nav has `z-index: 100`, modals use `z-index: 1000` or `10000`.
**How to avoid:** Set dropdown menu z-index to 200 (above nav content but below modals). The dropdown is inside `.top-nav` which is `z-index: 100`, so the menu needs to be higher.
**Warning signs:** Menu appearing behind page content.

### Pitfall 5: Listener Cleanup on Section Switch
**What goes wrong:** Firebase listeners from one section continue firing after switching to another section, causing errors when DOM elements no longer exist.
**Why it happens:** Each child view sets up onSnapshot listeners. If destroy() is not called, listeners remain active.
**How to avoid:** admin.js MUST call `currentModule.destroy()` before loading a new section. All three child views already have proper destroy() implementations.
**Warning signs:** Console errors like "Cannot set innerHTML of null" after switching sections.

### Pitfall 6: User Management's document.addEventListener Cleanup
**What goes wrong:** user-management.js adds a document-level click listener (`closeAllActionMenus`) in init(). If this isn't removed on section switch, stale event handlers accumulate.
**Why it happens:** `document.addEventListener('click', closeAllActionMenus)` persists across section switches.
**How to avoid:** user-management.js's `destroy()` already removes this listener (line 1727). Just ensure destroy() is called on every section switch.
**Warning signs:** Multiple click handlers firing, performance degradation.

## Code Examples

### Example 1: Dropdown HTML Structure (for index.html)

```html
<!-- Replace lines 35-37 in index.html with: -->
<div class="nav-dropdown" data-route="role_config">
    <button class="nav-link nav-dropdown-trigger" data-route="role_config">Admin</button>
    <div class="nav-dropdown-menu" id="adminDropdownMenu">
        <a href="#/admin" class="nav-dropdown-item" onclick="setAdminSection('users')">User Management</a>
        <a href="#/admin" class="nav-dropdown-item" onclick="setAdminSection('assignments')">Assignments</a>
        <a href="#/admin" class="nav-dropdown-item" onclick="setAdminSection('settings')">Settings</a>
    </div>
</div>
```

### Example 2: Dropdown CSS (for components.css)

```css
/* Admin Dropdown */
.nav-dropdown {
    position: relative;
}

.nav-dropdown-trigger {
    background: none;
    cursor: pointer;
    /* Inherits .nav-link styles: padding, color, border-radius, font */
}

.nav-dropdown-menu {
    display: none;
    position: absolute;
    top: 100%;
    right: 0;
    background: white;
    border: 1px solid var(--gray-200);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    min-width: 180px;
    z-index: 200;
    padding: 0.25rem 0;
}

.nav-dropdown-menu.open {
    display: block;
}

.nav-dropdown-item {
    display: block;
    padding: 0.5rem 1rem;
    color: var(--gray-700);
    text-decoration: none;
    font-size: 0.9375rem;
    font-weight: 500;
    transition: background 0.15s;
}

.nav-dropdown-item:hover {
    background: var(--gray-50);
    color: var(--gray-900);
}
```

### Example 3: Router Changes (for router.js)

```javascript
// Remove from routes object:
// '/role-config': { ... }
// '/project-assignments': { ... }
// '/user-management': { ... }

// Add to routes object:
'/admin': {
    name: 'Admin',
    load: () => import('./views/admin.js'),
    title: 'Admin | CLMC Procurement',
    defaultTab: 'users'
}

// Remove from routePermissionMap:
// '/role-config': 'role_config',
// '/project-assignments': 'role_config',
// '/user-management': 'role_config'

// Add to routePermissionMap:
'/admin': 'role_config'
```

### Example 4: Dropdown Toggle Logic

```javascript
// In index.html or a small inline script / admin helper
function toggleAdminDropdown(event) {
    event.stopPropagation();
    const menu = document.getElementById('adminDropdownMenu');
    menu.classList.toggle('open');
}

// Close on outside click
document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-dropdown')) {
        const menu = document.getElementById('adminDropdownMenu');
        if (menu) menu.classList.remove('open');
    }
});

// Close on navigation (listen for hashchange)
window.addEventListener('hashchange', () => {
    const menu = document.getElementById('adminDropdownMenu');
    if (menu) menu.classList.remove('open');
});
```

### Example 5: updateNavigation() Fix for Dropdown Active State

```javascript
// In router.js updateNavigation(), add after existing nav-link handling:
// Handle admin dropdown active state
const adminDropdown = document.querySelector('.nav-dropdown-trigger');
if (adminDropdown) {
    if (path === '/admin') {
        adminDropdown.classList.add('active');
    } else {
        adminDropdown.classList.remove('active');
    }
}
```

### Example 6: updateNavForAuth() Fix for Dropdown Visibility

```javascript
// In auth.js updateNavForAuth(), add alongside existing nav-link filtering:
// Handle dropdown containers
const dropdowns = document.querySelectorAll('.nav-dropdown[data-route]');
dropdowns.forEach(dropdown => {
    const route = dropdown.getAttribute('data-route');
    const hasAccess = permissions?.tabs?.[route]?.access ?? true;
    dropdown.style.display = hasAccess ? '' : 'none';
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 3 separate nav links for admin | 1 dropdown with 3 items | Phase 19 (this phase) | Cleaner nav, less clutter |
| 3 separate routes (#/role-config, #/project-assignments, #/user-management) | 1 route (#/admin) | Phase 19 | Simpler routing |

**Deprecated/outdated after this phase:**
- Routes `#/role-config`, `#/project-assignments`, `#/user-management` -- removed entirely, no redirects (per CONTEXT.md)
- Nav links with `data-route="role_config"` as individual `<a>` tags -- replaced by dropdown

## Key Decisions Already Made (from CONTEXT.md)

These are LOCKED and must not be reconsidered:

1. **Dropdown submenu, not a dedicated page** -- click to toggle
2. **No chevron/arrow** on the Admin text
3. **Single route: #/admin** -- no deep links like #/admin/users
4. **Default section: User Management** (most frequently used)
5. **Old routes removed entirely** -- no redirects
6. **Section order:** User Management, Assignments, Settings
7. **Close on outside click** and when navigating away
8. **Admin nav item stays highlighted** when any admin section is active

## Files to Modify (Complete List)

| File | Action | Changes |
|------|--------|---------|
| `index.html` | MODIFY | Replace 3 admin `<a>` tags (lines 35-37) with 1 dropdown `<div>` |
| `app/router.js` | MODIFY | Remove 3 old routes + permission map entries; add 1 new `/admin` route + entry |
| `app/auth.js` | MODIFY | Extend `updateNavForAuth()` to handle `.nav-dropdown[data-route]` |
| `app/views/admin.js` | CREATE | New wrapper view with section switching |
| `styles/components.css` | MODIFY | Add `.nav-dropdown`, `.nav-dropdown-trigger`, `.nav-dropdown-menu`, `.nav-dropdown-item` styles |
| `app/views/role-config.js` | UNCHANGED | Works as-is, imported by admin.js |
| `app/views/project-assignments.js` | UNCHANGED | Works as-is, imported by admin.js |
| `app/views/user-management.js` | UNCHANGED | Works as-is, imported by admin.js |

## Window Functions Inventory (Critical for Cleanup)

### role-config.js (3 functions)
- `window.handleRoleConfigCheckboxChange`
- `window.handleRoleConfigSave`
- `window.handleRoleConfigDiscard`

### project-assignments.js (2 functions)
- `window.handleAllProjectsChange`
- `window.handleProjectCheckboxChange`

### user-management.js (12 functions)
- `window.switchUserMgmtTab`
- `window.generateInvitationCode`
- `window.copyCodeToClipboard`
- `window.openApprovalModal`
- `window.handleRejectUser`
- `window.confirmApproval`
- `window.closeApprovalModal`
- `window.handleUserSearch`
- `window.toggleUserActionMenu`
- `window.handleEditRole`
- `window.handleDeactivateUser`
- `window.handleReactivateUser`
- `window.handleDeleteUser`

All of these are properly cleaned up in each view's `destroy()` function. No conflicts exist between the three views.

## Section Naming Recommendation (Claude's Discretion)

Per CONTEXT.md, Claude picks descriptive names for sections. Based on the existing view headers and user-facing labels:

| Current Nav Label | Recommended Section Name | Rationale |
|---|---|---|
| Users | User Management | Matches existing view header (user-management.js line 74) |
| Assignments | Assignments | Already clear and concise; "Project Assignments" is the page header but "Assignments" fits dropdown better |
| Settings | Settings | "Role Configuration" is the internal name but "Settings" is the user-facing label already in nav |

Order (per CONTEXT.md, most used first): **User Management, Assignments, Settings**

## Open Questions

None. All technical aspects are fully understood from code reading. This is a straightforward refactoring task with no external dependencies or unknowns.

## Sources

### Primary (HIGH confidence)
- Direct code reading of all files listed in Files to Modify section
- `index.html` lines 28-42: current nav structure
- `app/router.js` lines 1-453: complete routing logic
- `app/auth.js` lines 397-426: `updateNavForAuth()` permission filtering
- `app/permissions.js` lines 1-138: permission system
- `app/views/role-config.js` lines 1-431: settings view complete
- `app/views/project-assignments.js` lines 1-259: assignments view complete
- `app/views/user-management.js` lines 1-1759: user management view complete
- `styles/components.css` lines 1-62: navigation CSS
- `styles/views.css` lines 1030-1195: role config CSS
- `.planning/phases/19-navigation-consolidation/19-CONTEXT.md`: locked decisions

### Secondary (MEDIUM confidence)
None needed -- all information from direct code reading.

### Tertiary (LOW confidence)
None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no external deps, all existing code
- Architecture: HIGH - all patterns from direct code reading of existing multi-tab views
- Pitfalls: HIGH - identified from actual code analysis (permission filtering, window functions, listeners)
- Code examples: HIGH - based on actual existing patterns in the codebase

**Research date:** 2026-02-08
**Valid until:** Indefinite (codebase-specific research, no external dependency concerns)
