# Architecture

**Analysis Date:** 2026-01-23

## Pattern Overview

**Overall:** Modular Single Page Application (SPA) with hash-based routing

**Key Characteristics:**
- Zero-build architecture - pure ES6 modules loaded directly by browser
- View-based modular structure with lazy loading for code splitting
- Firebase Firestore as real-time data backend with onSnapshot listeners
- Hash-based client-side routing for navigation without page reloads
- Separation of concerns: presentation (views), data access (firebase), utilities, and components

## Layers

**Presentation Layer (Views):**
- Purpose: Render UI and handle user interactions
- Location: `app/views/`
- Contains: View modules that export render(), init(), and destroy() functions
- Depends on: Firebase service, utilities, components
- Used by: Router module
- Pattern: Each view manages its own state and Firebase listeners with proper lifecycle cleanup

**Routing Layer:**
- Purpose: Handle navigation between views and manage view lifecycle
- Location: `app/router.js`
- Contains: Hash-based routing logic, view loading, navigation management
- Depends on: Utils module for loading overlay
- Used by: Entry point (index.html) and all navigation links
- Pattern: Lazy loads view modules on demand, manages view initialization and destruction

**Data Access Layer:**
- Purpose: Centralized Firebase configuration and Firestore operations
- Location: `app/firebase.js`
- Contains: Firebase initialization, database instance export, Firestore method exports
- Depends on: Firebase SDK (loaded from CDN)
- Used by: All views, utilities module
- Pattern: Single initialization point, exports db instance and all Firestore functions

**Utilities Layer:**
- Purpose: Shared helper functions used across views
- Location: `app/utils.js`
- Contains: Formatting, validation, UI helpers, data utilities, status helpers, storage helpers
- Depends on: Firebase service for some data operations
- Used by: All views and components
- Pattern: Pure functions exported as ES6 modules and exposed to window for onclick handlers

**Components Layer:**
- Purpose: Reusable UI component generators
- Location: `app/components.js`
- Contains: Status badges, urgency badges, cards, modals, pagination controls
- Depends on: Utils module for formatting and status classes
- Used by: Views for rendering common UI elements
- Pattern: Factory functions that return HTML strings

**Styling Layer:**
- Purpose: CSS styles organized by concern
- Location: `styles/`
- Contains: main.css (base styles), components.css (UI components), views.css (view-specific), hero.css (landing page)
- Depends on: None
- Used by: index.html loads all CSS files
- Pattern: CSS variables for theming, BEM-like naming conventions

## Data Flow

**User Navigation Flow:**

1. User clicks navigation link with hash (#/procurement)
2. Browser triggers hashchange event
3. Router parses hash to extract path and optional tab
4. Router checks if navigating to same view (tab switch) or different view
5. If different view: Router calls destroy() on current view to clean up listeners
6. If same view: Router skips destroy() to preserve window functions
7. Router lazy loads view module via dynamic import (or reuses current module)
8. Router calls view.render(tab) to generate HTML
9. Router injects HTML into #app-container
10. Router calls view.init(tab) to set up listeners and event handlers
11. View attaches functions to window for onclick handler access

**Data Synchronization Flow:**

1. View.init() establishes Firebase onSnapshot listeners
2. Firestore sends initial data snapshot
3. View updates local state array (e.g., mrfsData, poData)
4. View calls render function to update table/UI
5. User changes data in Firestore (via form submission)
6. Firestore triggers onSnapshot callback with new data
7. View automatically updates UI with new data (real-time sync)
8. View.destroy() unsubscribes all listeners when navigating away

**Form Submission Flow:**

1. User fills form and clicks submit
2. onclick handler calls window function (e.g., window.saveNewMRF)
3. Function validates form data
4. Function generates sequential ID (queries Firestore for max ID)
5. Function calls addDoc() or setDoc() to save to Firestore
6. Firebase returns success/error
7. Function shows toast notification
8. onSnapshot listener automatically updates UI with new record
9. Function clears form or navigates to next view

**State Management:**
- View-level state stored in module-scoped variables (currentMRF, suppliersData, etc.)
- No global state management library - each view manages its own state
- Real-time synchronization via Firebase onSnapshot listeners
- Local storage used for preferences (pagination settings)
- Window object used to expose functions for onclick handlers

## Key Abstractions

**View Module:**
- Purpose: Encapsulates a complete application screen/page
- Examples: `app/views/home.js`, `app/views/procurement.js`, `app/views/finance.js`, `app/views/mrf-form.js`
- Pattern: Each view exports three required functions:
  - render(activeTab) - Returns HTML string for the view
  - init(activeTab) - Sets up listeners, event handlers, loads data
  - destroy() - Cleans up listeners, clears state, removes window functions
- Lifecycle: Created by router on navigation, destroyed when navigating to different view

**Firebase Listener:**
- Purpose: Real-time data synchronization with Firestore
- Examples: onSnapshot(collection(db, 'mrfs'), callback)
- Pattern:
  - Listeners stored in array during init()
  - Callback updates local state and re-renders UI
  - Unsubscribe functions called in destroy()
- Lifecycle: Established in view.init(), cleaned up in view.destroy()

**Sequential ID Generator:**
- Purpose: Generate unique IDs in format PREFIX-YEAR-###
- Examples: MRF-2026-001, PR-2026-005, PO-2026-012
- Pattern:
  - Query Firestore collection for all documents
  - Filter by current year
  - Find max number in sequence
  - Increment and pad with zeros
- Used by: All document creation flows (MRF, PR, PO, TR)

**Window Functions:**
- Purpose: Make module functions accessible to onclick handlers in HTML
- Examples: window.selectMRF, window.generatePR, window.approveFinance
- Pattern:
  - Functions defined in module scope
  - Attached to window in init() via attachWindowFunctions()
  - Used in onclick attributes: onclick="window.selectMRF('MRF-2026-001')"
  - Critical for tab navigation where destroy() is skipped
- Lifecycle: Attached in init(), re-attached on tab switches, deleted in destroy()

**Pagination Controller:**
- Purpose: Handle large data sets with page-based navigation
- Examples: Suppliers table, PO tracking, historical records
- Pattern:
  - State: currentPage, itemsPerPage, totalItems
  - Functions: changePage(), updatePaginationControls()
  - UI: Previous/Next buttons, page numbers, showing "X-Y of Z"
  - Consistent CSS classes: .pagination-container, .pagination-btn, .pagination-info

## Entry Points

**Single Page Entry (index.html):**
- Location: `index.html`
- Triggers: Browser loads page or user refreshes
- Responsibilities:
  - Load all CSS files
  - Load Firebase SDK from CDN
  - Initialize router via app/router.js
  - Import utilities and components modules
  - Render initial view based on URL hash
- Initial route: Defaults to #/ (home) if no hash present

**Hash Navigation:**
- Location: Hash change events monitored by `app/router.js`
- Triggers: User clicks navigation link or browser back/forward
- Responsibilities:
  - Parse hash to extract route path and tab
  - Load appropriate view module
  - Manage view lifecycle (destroy old, init new)
  - Update navigation active states
  - Update page title

**Firebase Initialization:**
- Location: `app/firebase.js` (auto-executes on import)
- Triggers: Module import in index.html
- Responsibilities:
  - Initialize Firebase app with config
  - Create Firestore database instance
  - Export db instance and all Firestore methods
  - Expose to window for backward compatibility
  - Log initialization status

## Error Handling

**Strategy:** Defensive programming with try-catch blocks and user feedback

**Patterns:**
- Firebase operations wrapped in try-catch with error logging
- Validation before form submissions (validateRequired, validateEmail)
- Toast notifications for user feedback (showToast)
- Loading overlays during async operations (showLoading)
- Empty state messages in tables when no data
- Router fallback to home page on invalid routes
- Graceful degradation if Firebase fails to load

**Validation:**
- Required field validation before form submission
- Email format validation (validateEmail)
- Phone number validation for Philippine format (validatePhone)
- Sequential ID collision prevention (query before generating)
- Status value matching (case-sensitive string comparison)

**User Feedback:**
- Success: Green toast, 3-second auto-hide
- Error: Red toast with error message
- Warning: Yellow toast for validation issues
- Info: Blue toast for informational messages
- Loading: Full-screen overlay with spinner during operations

## Cross-Cutting Concerns

**Logging:**
- Console.log statements throughout for debugging
- Prefixes for module identification: [Router], [Procurement], [Finance]
- Lifecycle events logged: init started, destroy started, functions attached
- Firebase operations logged: queries, updates, errors

**Validation:**
- Centralized in utils.js (validateEmail, validatePhone, validateRequired)
- Form-level validation in each view before submission
- Firestore query validation (status matching, ID formats)
- Sequential ID uniqueness validation before document creation

**Authentication:**
- No authentication implemented
- Firebase configured for open access (test mode)
- Security rules not enforced in current implementation
- All users have full read/write access to Firestore

**Real-time Synchronization:**
- All views use onSnapshot listeners for live data updates
- No manual refresh needed - UI updates automatically
- Multiple browser tabs stay synchronized via Firebase
- Listeners cleaned up in destroy() to prevent memory leaks

**Performance:**
- Lazy loading of view modules (dynamic imports)
- Pagination for large data sets (15 items per page)
- CSS and JS files cached with immutable headers (1 year)
- HTML files must-revalidate for immediate updates
- Minimal dependencies (only Firebase from CDN)

---

*Architecture analysis: 2026-01-23*
