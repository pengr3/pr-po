# Testing Patterns

**Analysis Date:** 2026-01-23

## Test Framework

**Runner:**
- None configured
- No `package.json`, no test dependencies
- No Jest, Vitest, Mocha, or similar framework

**Assertion Library:**
- None

**Run Commands:**
```bash
# No automated tests exist
# Manual testing only
```

## Test File Organization

**Location:**
- No test files exist in codebase
- No `__tests__/` directories
- No `*.test.js` or `*.spec.js` files

**Naming:**
- N/A - no test files

**Structure:**
```
# No test directory structure
# Tests would need to be created from scratch
```

## Test Structure

**Suite Organization:**
```javascript
// No test suites exist
// Example pattern if tests were added:
// describe('formatCurrency', () => {
//     it('should format numbers as Philippine Peso', () => {
//         expect(formatCurrency(1000)).toBe('1,000.00');
//     });
// });
```

**Patterns:**
- No established testing patterns
- No test setup/teardown patterns
- No assertion conventions

## Mocking

**Framework:** None configured

**Patterns:**
```javascript
// No mocking patterns established
// Firebase would need to be mocked for unit tests
// DOM manipulation would need JSDOM or similar
```

**What to Mock:**
- Firebase Firestore operations (`getDocs`, `addDoc`, `updateDoc`, `deleteDoc`)
- Firebase real-time listeners (`onSnapshot`)
- Browser APIs (`localStorage`, `window.location.hash`)
- DOM elements (`document.getElementById`, `document.querySelector`)

**What NOT to Mock:**
- Pure utility functions (formatters, validators)
- CSS variable lookups
- Static configuration objects

## Fixtures and Factories

**Test Data:**
```javascript
// No test data fixtures exist
// Example needed patterns:
// - Mock MRF documents
// - Mock supplier data
// - Mock Firebase snapshots
```

**Location:**
- No fixtures directory exists
- Would recommend `tests/fixtures/` if created

## Coverage

**Requirements:** None enforced

**View Coverage:**
```bash
# No coverage tooling configured
# Manual testing coverage documented in CLAUDE.md
```

## Test Types

**Unit Tests:**
- None exist
- Would need tests for:
  - `app/utils.js` functions (formatters, validators, calculators)
  - `app/components.js` component generators
  - Sequential ID generation logic
  - Item parsing and validation

**Integration Tests:**
- None exist
- Would need tests for:
  - Firebase read/write operations
  - View lifecycle (render → init → destroy)
  - Router navigation and tab switching
  - Form submission workflows

**E2E Tests:**
- None exist
- No Playwright, Cypress, or similar framework
- Manual browser testing only

## Common Patterns

**Async Testing:**
```javascript
// No async testing patterns established
// Would need to use async/await in test framework:
// test('loads MRFs from Firebase', async () => {
//     const mrfs = await loadMRFs();
//     expect(mrfs).toBeArray();
// });
```

**Error Testing:**
```javascript
// No error testing patterns established
// Would need to test error handling:
// test('handles missing Firebase document', async () => {
//     await expect(selectMRF('invalid-id')).rejects.toThrow();
// });
```

## Current Testing Approach

**Manual Testing Workflow:**
1. Run local server: `python -m http.server 8000` or `npx http-server`
2. Open browser to `http://localhost:8000`
3. Use browser DevTools Console for debugging
4. Check Network tab to verify Firebase calls
5. Test all status transitions in the workflow
6. Verify real-time updates work (open multiple browser tabs)

**Important Notes:**
- Changes write to production Firebase database
- No staging environment exists
- No automated regression testing
- Quality relies on manual verification

**Browser Testing:**
- Chrome DevTools primary debugging tool
- Console logs track application state:
  - `[Router]` prefix for navigation events
  - `[Procurement]` prefix for procurement view
  - Emoji indicators: 🔵 init, ✅ success, 🔴 destroy, 🗑️ cleanup

**Firebase Testing:**
- Real database used for all testing
- No Firebase emulator configured
- Data mutations affect production immediately
- Manual cleanup of test data required

## Testing Gaps

**Untested Critical Paths:**
- MRF submission and validation (`app/views/mrf-form.js`)
- PR/PO generation logic (`app/views/procurement.js`)
- Finance approval workflow (`app/views/finance.js`)
- Sequential ID generation (`app/utils.js` generateSequentialId)
- Router tab navigation without destroy (`app/router.js`)
- Firebase listener cleanup on view destroy

**Validation Testing:**
- Email validation regex (`validateEmail()`)
- Phone number validation for Philippine format (`validatePhone()`)
- Required field validation (`validateRequired()`)
- Item quantity and cost calculations (`calculateTotal()`)

**Edge Cases Not Covered:**
- Empty Firebase collections
- Malformed `items_json` strings
- Missing project or supplier references
- Concurrent updates to same document
- Network failures during Firebase operations
- Browser back/forward with hash routing

## Recommendations for Future Testing

**Priority 1: Unit Tests for Utils**
- Test all functions in `app/utils.js`
- Focus on formatters, validators, calculators
- Mock Firebase for `generateSequentialId()`

**Priority 2: Component Rendering**
- Test HTML generation in `app/components.js`
- Verify correct classes and attributes
- Test parameter variations and defaults

**Priority 3: Router Navigation**
- Test hash parsing logic
- Test view lifecycle (init/destroy)
- Test tab switching without full destroy
- Mock view modules for isolation

**Priority 4: Firebase Integration**
- Set up Firebase emulator for testing
- Test CRUD operations on collections
- Test real-time listener setup/cleanup
- Test error handling for network failures

**Priority 5: E2E Critical Workflows**
- MRF submission end-to-end
- PR approval → PO generation flow
- Supplier CRUD operations
- Document generation (PDF export)

---

*Testing analysis: 2026-01-23*
