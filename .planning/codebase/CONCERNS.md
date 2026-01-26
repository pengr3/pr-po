# Codebase Concerns

**Analysis Date:** 2026-01-23

## Tech Debt

**Hardcoded Firebase API Key in Source Control:**
- Issue: Firebase API key and config exposed in `app/firebase.js` and committed to public repository
- Files: `app/firebase.js` (line 29), `archive/index.html` (line 1113), `archive/finance.html` (line 1516), `mrf-submission-form.html` (line 501), `finance.html` (line 1516)
- Impact: While Firebase has security rules that protect data access, exposed API keys can lead to quota exhaustion attacks, unauthorized billing, or abuse of Firebase services
- Fix approach: Move to environment variables with build-time injection, implement Firebase App Check for additional security, monitor usage quotas closely

**Window-Based Function Management:**
- Issue: All view functions must be attached to `window` object for onclick handlers to work, creating global namespace pollution
- Files: `app/views/procurement.js` (lines 42-86, 364-397), `app/views/finance.js` (lines 225-234)
- Impact: 40+ global functions per view, risk of function name collisions, difficult to track function lifecycle, memory leak potential if cleanup fails
- Fix approach: Refactor to event delegation pattern with data attributes instead of inline onclick handlers, allowing module-scoped functions

**Large Monolithic View Files:**
- Issue: Procurement view contains 4,459 lines in single file with 44 functions managing multiple concerns
- Files: `app/views/procurement.js` (4,459 lines), `app/views/finance.js` (1,068 lines)
- Impact: Hard to navigate, difficult to maintain, slows IDE performance, increases merge conflict risk
- Fix approach: Split into feature modules (mrf-management.js, supplier-management.js, po-tracking.js, document-generation.js) with shared state manager

**Archive Files Still Deployed:**
- Issue: Old monolithic HTML files (11,549 total lines) remain in repository and deployment despite migration to SPA
- Files: `archive/index.html` (5,785 lines, 285KB), `archive/finance.html` (4,965 lines, 216KB), `archive/mrf-submission-form.html` (799 lines, 31KB)
- Impact: Confusing for developers, increases deployment size by ~532KB, potential for users to access outdated interfaces if they bookmark old URLs
- Fix approach: Remove archive files from deployment (keep in git history only), add redirects from old URLs to new SPA routes

**No Build System for Zero-Dependency Constraint:**
- Issue: Project intentionally has no package.json, no transpilation, no bundling - relies on native ES6 modules and CDN Firebase
- Files: All JavaScript files use native ES6 modules
- Impact: No tree-shaking (entire Firebase SDK loaded), no minification (larger file sizes), no TypeScript (no type safety), limited to modern browser features only
- Fix approach: Evaluate if zero-build constraint still provides value vs. modern tooling benefits, consider minimal Vite setup with Firebase SDK tree-shaking

**JSON String Storage in Firestore:**
- Issue: Items are stored as JSON strings in `items_json` field instead of native Firestore arrays/maps
- Files: All views that read/write items (procurement.js, finance.js, mrf-form.js - 30 occurrences of JSON.parse/stringify)
- Impact: Cannot query individual items, must load entire items array for any operation, risk of JSON.parse errors breaking views, harder to maintain data integrity
- Fix approach: Migrate to Firestore subcollections (mrfs/{mrf_id}/items/{item_id}) or use native array field with proper schema

**Tab Navigation Router Complexity:**
- Issue: Router has special logic to skip destroy() when switching tabs within same view, but still re-runs init() every time
- Files: `app/router.js` (lines 96-106, 115-122)
- Impact: Confusing lifecycle (partial cleanup), Firebase listeners recreated unnecessarily on tab switch, potential for duplicate listeners if cleanup fails
- Fix approach: Implement proper tab component system where init() only runs once per view, tabs managed internally without full re-render

**Listener Cleanup Relies on Array Discipline:**
- Issue: Each view manually tracks Firebase listeners in array, must remember to push every listener and clear on destroy
- Files: `app/views/procurement.js` (line 32, listeners array), `app/views/finance.js` (line 10), `app/views/home.js`
- Impact: Easy to forget to track a listener (memory leak), cleanup only happens if destroy() is called, no verification that cleanup worked
- Fix approach: Create listener manager utility with automatic tracking and cleanup verification, or use AbortController pattern for cancellation

## Known Bugs

**PR Generation Selector Bug (Fixed 2026-01-16):**
- Symptoms: "At least one item is required" error despite items being visible in table
- Files: `app/views/procurement.js` (generatePR, submitTransportRequest, generatePRandTR functions)
- Trigger: Clicking "Generate PR" button after adding items to MRF
- Workaround: Bug was fixed in commit bbee96b by correcting DOM selectors from `#mrfDetailsItemRows` to `#lineItemsBody` and using CSS class selectors
- Note: This pattern suggests selector brittleness - if HTML structure changes, selectors break silently

**Window Function Deletion During Tab Switching (Fixed 2026-01-16):**
- Symptoms: `TypeError: window.loadMRFs is not a function` when switching between procurement tabs
- Files: `app/router.js` (navigation logic), all view modules
- Trigger: Navigating from MRF Processing → Suppliers → PO Tracking tabs
- Workaround: Fixed by preventing destroy() from being called during same-view tab navigation
- Note: Fragile pattern - onclick handlers fail silently if window functions aren't attached

**Multiple Recent Critical Fixes:**
- Pattern: Git history shows 7 bug fix commits in last 20 commits (35% of recent work is bug fixes)
- Files: Router, procurement view, navigation tabs
- Impact: Suggests architectural issues causing recurring bugs rather than one-off mistakes
- Examples: "Fix critical procurement tab errors" (3d892b0), "Fix loadMRFs error" (91cafc9), "Fix navigation tabs displaying all sections at once" (d5e2374)

## Security Considerations

**No Authentication System:**
- Risk: Application has no login or user authentication - anyone with URL can access and modify all data
- Files: Entire application
- Current mitigation: Deployment URL is private, Firebase security rules may provide some protection
- Recommendations: Implement Firebase Authentication, add role-based access control (Procurement vs Finance roles), audit trail for all data modifications

**Client-Side Only Security:**
- Risk: All business logic runs in browser with full database access via Firebase SDK
- Files: `app/firebase.js` exports full Firestore API to client
- Current mitigation: Firebase security rules (not visible in codebase)
- Recommendations: Document security rules in repository, implement Firebase Cloud Functions for sensitive operations (PO generation, deletions), move business logic server-side

**No Input Sanitization:**
- Risk: User inputs are directly inserted into HTML without sanitization
- Files: All views that render user-generated content (item names, justifications, supplier names)
- Current mitigation: None detected - relies on browser's native XSS protection
- Recommendations: Implement DOMPurify library for HTML sanitization, validate all inputs before Firestore writes, escape special characters in rendered content

**Soft Delete Without Access Control:**
- Risk: Deleted MRFs with cascade data stored in `deleted_mrfs` collection but may still be accessible
- Files: `app/views/procurement.js` (deleteMRF function, lines 1537-1611)
- Current mitigation: Data moved to separate collection with audit trail
- Recommendations: Ensure Firebase rules restrict read access to deleted_mrfs collection, implement permanent deletion after retention period

**CSP Header Too Permissive:**
- Risk: Content Security Policy only restricts `frame-ancestors`, allows all scripts and styles
- Files: `netlify.toml` (line 9), `_headers` (Netlify config), `.htaccess` (Apache config)
- Current mitigation: `X-Content-Type-Options: nosniff` prevents MIME sniffing
- Recommendations: Strengthen CSP to whitelist only Firebase CDN and own-origin scripts, add `script-src 'self' https://www.gstatic.com` directive

## Performance Bottlenecks

**Real-Time Listeners on Large Collections:**
- Problem: Every view uses `onSnapshot()` listeners that re-fetch all matching documents on any change
- Files: `app/views/finance.js` (lines 251, 274, 987), `app/views/procurement.js` (lines 416, 448, 1628, 3147)
- Cause: Firebase onSnapshot triggers full collection scan on every document change in watched collection
- Improvement path: Add pagination limits to listeners (limit(100)), use query cursors for large datasets, implement virtual scrolling for tables, cache data in IndexedDB

**No Loading States During Tab Switches:**
- Problem: Tab switches trigger full data reload without showing loading indicator
- Files: `app/router.js` (navigate function), all view init() functions
- Cause: showLoading() called at router level but hidden before Firebase listeners populate data
- Improvement path: Add skeleton screens for tables during data load, show loading state until first snapshot received, implement optimistic UI updates

**Synchronous PDF Generation:**
- Problem: `generateAllPODocuments()` loops through POs with 500ms delays, blocking UI
- Files: `app/views/procurement.js` (lines 4432-4457)
- Cause: Sequential PDF generation to prevent browser pop-up blocking
- Improvement path: Generate PDFs in Web Worker, use Service Worker to cache PDFs, batch generate server-side with Cloud Functions, use zip download instead of multiple tabs

**No Code Splitting:**
- Problem: All views loaded lazily via dynamic imports, but router and utils loaded upfront
- Files: `index.html` loads firebase.js, router.js, utils.js, components.js immediately
- Current capacity: ~6KB (router) + ~8KB (utils) + ~10KB (components) loaded before first render
- Scaling path: Defer utils/components loading until first view needs them, split components into separate files (modal.js, pagination.js), lazy-load Firebase SDK

**Items Table Re-renders Entire Table:**
- Problem: Every input change triggers calculateSubtotal which may cause layout thrashing
- Files: `app/views/procurement.js` (calculateSubtotal function, called on every oninput)
- Cause: DOM updates on every keystroke without debouncing
- Improvement path: Debounce calculation by 300ms, update only affected row instead of full table, use React/Vue for efficient DOM diffing

## Fragile Areas

**DOM Selector Coupling:**
- Files: `app/views/procurement.js` (lines 2567-2577: item collection selectors), all view files
- Why fragile: Selectors hardcoded to specific CSS classes and IDs - HTML structure changes break functionality silently
- Safe modification: Create selector constants at top of file, add data-testid attributes for stable selection, use semantic HTML elements
- Test coverage: None - no automated tests to catch selector breakage

**Firebase Listener Lifecycle:**
- Files: All view modules with listeners array pattern
- Why fragile: If destroy() isn't called or listener not added to array, memory leak occurs with no error
- Safe modification: Always add new listeners to array immediately after creation, verify listeners.length matches expected count in console
- Test coverage: No memory leak detection, no listener count verification

**Inline Event Handlers:**
- Files: All view render() functions returning HTML with onclick attributes (hundreds of occurrences)
- Why fragile: Functions must exist on window at exact moment of click, typos in onclick string fail silently until clicked
- Safe modification: Search all onclick references when renaming functions, use TypeScript for compile-time checking, migrate to event delegation
- Test coverage: No automated tests for event handler wiring

**Status String Matching:**
- Files: All views filtering by status (e.g., `where('status', '==', 'Pending')`)
- Why fragile: Status values are magic strings - typo or case mismatch causes silent query failures
- Safe modification: Create STATUS_CONSTANTS object with all valid values, use constants instead of strings, add Firestore data validation
- Test coverage: No validation that status values match expected constants

**MRF Deletion Cascade:**
- Files: `app/views/procurement.js` (deleteMRF function, lines 1449-1611)
- Why fragile: Manually queries and deletes related PRs, POs, TRs - if new relationships added, must update deletion logic
- Safe modification: Document all FK relationships clearly, add integration tests for cascade behavior, consider Firestore rules to prevent orphaned documents
- Test coverage: No tests for cascade deletion - could orphan related documents

**Router Hash Parsing:**
- Files: `app/router.js` (parseHash function, lines 42-54)
- Why fragile: Splits hash on '/' and assumes [0] is path, [1] is tab - malformed URLs could break routing
- Safe modification: Add validation for parsed path against routes object, handle edge cases (trailing slashes, empty parts)
- Test coverage: No unit tests for hash parsing edge cases

## Scaling Limits

**Single Firebase Project:**
- Current capacity: All environments (dev/staging/prod) share same Firebase project "clmc-procurement"
- Limit: Cannot isolate test data from production, no way to test migrations safely
- Scaling path: Create separate Firebase projects for dev/staging/prod, use Firebase emulator for local development

**No Data Pagination Strategy:**
- Current capacity: Loads all MRFs, all suppliers, all POs into memory - only pagination is on rendered table
- Limit: Performance degrades with >500 documents per collection, browser memory constraints
- Scaling path: Implement query pagination with startAfter cursors, use Firestore limit() in queries, add "Load More" instead of loading everything

**Sequential ID Generation Race Condition:**
- Current capacity: Sequential IDs (MRF-2026-001) generated by finding max number in current year
- Limit: Concurrent submissions could generate duplicate IDs if two users submit simultaneously
- Scaling path: Use Firestore transactions for ID generation, implement server-side Cloud Function for atomic ID assignment, or switch to UUID-based IDs

**Client-Side Document Generation:**
- Current capacity: PDF generation happens in browser using jsPDF (though library not imported yet)
- Limit: Browser memory limits PDF generation to ~50 POs at once, blocks UI during generation
- Scaling path: Move PDF generation to Cloud Functions with Cloud Storage, implement queue system for bulk document generation

**No Caching Strategy:**
- Current capacity: Every page load fetches all data from Firebase, no offline capability
- Limit: Slow on poor network connections, doesn't work offline, Firebase read costs scale with usage
- Scaling path: Implement Firebase offline persistence, use IndexedDB for caching reference data (suppliers, projects), add Service Worker for offline support

## Dependencies at Risk

**Firebase v10.7.1 Loaded from CDN:**
- Risk: Application pins to specific Firebase version from gstatic.com CDN - no dependency management
- Impact: Cannot upgrade Firebase without updating hardcoded URLs in `app/firebase.js`, no security updates unless manually tracked
- Migration plan: Add package.json with Firebase as dependency, use bundler to tree-shake unused Firebase modules, implement SRI (Subresource Integrity) hashes for CDN scripts

**No PDF Generation Library Imported:**
- Risk: Code references PDF generation functions (generatePRDocument, generatePODocument) but no jsPDF library imported
- Impact: PDF generation likely broken or using older inline implementation
- Migration plan: Import jsPDF from CDN or npm, implement modern PDF generation with jsPDF-AutoTable for better table formatting

**Browser ES6 Module Support Required:**
- Risk: Application requires modern browser with ES6 module support (no transpilation)
- Impact: Excludes IE11 and older browsers, no polyfills for newer JavaScript features
- Migration plan: Document minimum browser versions (Chrome 61+, Firefox 60+, Safari 11+), add browser detection warning, consider adding build step for wider compatibility

## Missing Critical Features

**No Error Boundary:**
- Problem: JavaScript errors crash entire application with no recovery
- Blocks: User loses all unsaved work on any error, no visibility into production errors
- Impact: Poor user experience, no error reporting to developers

**No Form Validation Feedback:**
- Problem: Forms validate on submit but provide minimal feedback on what's wrong
- Blocks: Users must guess which fields are invalid, no inline validation guidance
- Impact: Frustrating user experience, increases support burden

**No Undo/Redo for Destructive Actions:**
- Problem: Delete operations are permanent (though soft-deleted), no way to undo
- Blocks: User mistakes are unrecoverable without database access
- Impact: High risk of accidental data loss

**No Audit Trail UI:**
- Problem: System stores deletion metadata but no UI to view audit history
- Blocks: Cannot investigate who deleted what or when from application
- Impact: Must query database directly for audit information

**No Bulk Operations:**
- Problem: No way to approve/reject multiple PRs at once, or update multiple PO statuses
- Blocks: Finance team must process items one-by-one
- Impact: Inefficient workflow for high-volume processing

## Test Coverage Gaps

**Zero Automated Tests:**
- What's not tested: Everything - no unit tests, no integration tests, no E2E tests
- Files: Entire codebase (6,558 lines in views alone)
- Risk: Refactoring breaks functionality silently, regression bugs common (35% of recent commits are bug fixes)
- Priority: High

**No Type Safety:**
- What's not tested: No TypeScript, no JSDoc validation, no runtime type checking
- Files: All JavaScript files
- Risk: Type mismatches only discovered at runtime (e.g., expecting array but getting string)
- Priority: High

**Firebase Security Rules Not in Repository:**
- What's not tested: Security rules exist somewhere but not version controlled with code
- Files: Firebase project "clmc-procurement"
- Risk: Security rules could be misconfigured without code review, no way to test rules locally
- Priority: Critical - security impact

**Manual Testing Only:**
- What's not tested: All testing done manually through browser DevTools
- Files: Documented in CLAUDE.md (lines 872-878)
- Risk: Test coverage depends on developer memory, easy to miss edge cases, regression testing incomplete
- Priority: Medium

**No Performance Testing:**
- What's not tested: No load testing, no measurement of query performance with large datasets
- Files: Firebase queries in all views
- Risk: Performance degradation only discovered in production under real load
- Priority: Medium

---

*Concerns audit: 2026-01-23*
