# Coding Conventions

**Analysis Date:** 2026-01-23

## Naming Patterns

**Files:**
- Kebab-case for all files: `mrf-form.js`, `procurement-base.js`, `main.css`
- View modules match route names: `home.js` → `#/`, `procurement.js` → `#/procurement`
- Style files grouped by purpose: `main.css` (base), `components.css`, `views.css`, `hero.css`
- Markdown documentation in UPPERCASE: `CLAUDE.md`, `HEADERS-README.md`, `MIGRATION-STATUS.md`

**Functions:**
- camelCase for all functions: `formatCurrency()`, `loadMRFs()`, `createStatusBadge()`
- Prefix `create` for component generators: `createModal()`, `createTable()`, `createPagination()`
- Action verbs first: `showLoading()`, `parseItems()`, `validateEmail()`, `generateSequentialId()`
- Async functions clearly named for data operations: `loadProjects()`, `saveProgress()`, `deleteMRF()`
- Event handlers prefixed by action: `toggleAddForm()`, `updateActionButtons()`, `changeSuppliersPage()`

**Variables:**
- camelCase for all variables: `currentMRF`, `suppliersData`, `poCurrentPage`
- Plural for arrays/collections: `listeners`, `projectsData`, `allPRPORecords`
- State variables describe purpose: `editingSupplier`, `currentPRForApproval`, `filteredPRPORecords`
- Constants use camelCase (not SCREAMING_SNAKE): `suppliersItemsPerPage`, `poItemsPerPage`
- Boolean flags use `is` prefix: `isSameView`, `is_subcon`

**Types/Collections:**
- Firebase collection names lowercase: `mrfs`, `prs`, `pos`, `suppliers`, `projects`, `transport_requests`
- Document ID fields use underscore: `mrf_id`, `pr_id`, `po_id`, `tr_id`
- Status fields use underscore: `finance_status`, `procurement_status`, `urgency_level`

## Code Style

**Formatting:**
- No automated formatter (Prettier/Biome) configured
- Indentation: 4 spaces (consistent across all files)
- Line length: Generally ~120 characters, no hard limit
- Comments use block style with separator lines

**Comment Headers:**
```javascript
/* ========================================
   SECTION NAME
   ======================================== */
```

**File Headers:**
```javascript
/* ========================================
   MODULE NAME - Brief description
   Additional context about purpose
   ======================================== */
```

**Linting:**
- No ESLint or other linter configured
- No automated code quality checks
- Manual code review only

**CSS Variables:**
- All colors defined in `:root` in `styles/main.css`
- Naming convention: `--primary`, `--gray-600`, `--success-light`
- Use CSS variables exclusively: `var(--primary)` not hardcoded hex values

## Import Organization

**Order:**
1. Firebase imports (from centralized `firebase.js`)
2. Utility imports (from `utils.js`)
3. Component imports (from `components.js`)

**Example:**
```javascript
import { db, collection, getDocs, addDoc, updateDoc } from '../firebase.js';
import { formatCurrency, showToast, generateSequentialId } from '../utils.js';
import { createStatusBadge, createModal, openModal } from '../components.js';
```

**Path Aliases:**
- No path aliases configured
- Relative paths only: `'../firebase.js'`, `'./utils.js'`, `'./views/home.js'`
- Views use `../ `to reach up to `app/` directory

**CDN Imports:**
- Firebase loaded via CDN in `app/firebase.js`:
```javascript
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
```

## Error Handling

**Patterns:**
- Try-catch blocks wrap all async operations:
```javascript
try {
    const docs = await getDocs(collection(db, 'mrfs'));
    // Process docs
} catch (error) {
    console.error('Error loading MRFs:', error);
    showToast('Failed to load MRFs', 'error');
}
```

- User-facing error messages via `showToast()`:
```javascript
showToast('Error loading finance data', 'error');
```

- Validation errors shown inline or via alert:
```javascript
if (missingFields.length > 0) {
    alert('Please fill in all required fields');
    return;
}
```

- Firebase listener errors handled in callback:
```javascript
onSnapshot(query, (snapshot) => {
    // Success handler
}, (error) => {
    console.error('Error loading stats:', error);
});
```

- No centralized error handling service
- No error tracking integration (Sentry, etc.)

## Logging

**Framework:** Native `console` methods only

**Patterns:**
- Module load confirmations:
```javascript
console.log('Components module loaded successfully');
console.log('Router initialized');
```

- Navigation tracking with prefixes:
```javascript
console.log('[Router] Navigation:', { path, tab, currentRoute, isSameView });
console.log('[Procurement] ✅ All window functions attached successfully');
```

- Error logging with context:
```javascript
console.error('Error fetching active projects:', error);
console.error('Route not found:', path);
```

- Debug logs with emojis for visibility:
```javascript
console.log('[Router] 🔴 Cleaning up previous view:', currentRoute);
console.log('[Router] 📦 Loading view module:', path);
console.log('[Router] ✅ Navigation complete:', { path, tab, isSameView });
```

- Initialization logs for lifecycle tracking:
```javascript
console.log('Initializing finance view, tab:', activeTab);
console.log('Finance view initialized successfully');
```

## Comments

**When to Comment:**
- All file headers describing module purpose
- Section separators for major code blocks
- Complex business logic (PR/PO generation, status cascading)
- JSDoc for exported public functions

**JSDoc/TSDoc:**
```javascript
/**
 * Format number as Philippine Peso currency
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency string
 */
export function formatCurrency(amount) {
    // Implementation
}
```

- JSDoc used for all exported utility and component functions
- Parameter types and return types documented
- View lifecycle functions (`render`, `init`, `destroy`) always documented

## Function Design

**Size:**
- Utility functions: 5-30 lines (focused, single purpose)
- View render functions: 100-300 lines (template strings)
- Business logic functions: 30-100 lines (data processing)
- No hard limit enforced

**Parameters:**
- Object destructuring for multiple options:
```javascript
export function createCard({ title, subtitle = '', content = '', actions = '', headerClass = '' }) {
    // Implementation
}
```

- Default parameters preferred over undefined checks:
```javascript
export async function init(activeTab = 'mrfs') {
    // Use activeTab directly
}
```

- Firebase references passed as strings, resolved internally:
```javascript
async function selectMRF(mrfId, element) {
    const mrfDoc = await getDoc(doc(db, 'mrfs', mrfId));
}
```

**Return Values:**
- HTML generation functions return template strings
- Data fetch functions return arrays or objects
- Event handlers typically return void
- Async functions return Promises implicitly

## Module Design

**Exports:**
- Named exports only (no default exports):
```javascript
export function render(activeTab = null) { }
export async function init(activeTab = null) { }
export async function destroy() { }
```

- Utils/components export multiple functions from single file
- Views export exactly three functions: `render`, `init`, `destroy`

**Barrel Files:**
- Not used (no `index.js` re-exports)
- Direct imports from specific files

**Window Global Exposure:**
- Critical pattern for onclick handlers:
```javascript
// Export for module use
export function openModal(modalId) { }

// Expose to window for onclick handlers
window.openModal = openModal;
```

- Entire utility/component namespaces exposed:
```javascript
window.utils = {
    formatCurrency,
    formatDate,
    showToast,
    // ... all utilities
};
```

- View-specific functions attached in `attachWindowFunctions()`:
```javascript
function attachWindowFunctions() {
    window.loadMRFs = loadMRFs;
    window.selectMRF = selectMRF;
    window.saveProgress = saveProgress;
    // ... all view functions used in onclick
}
```

---

*Convention analysis: 2026-01-23*
