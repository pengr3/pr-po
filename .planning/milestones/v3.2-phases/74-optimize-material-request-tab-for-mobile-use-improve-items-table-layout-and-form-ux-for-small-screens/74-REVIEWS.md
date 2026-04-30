---
phase: 74
reviewers: [gemini]
reviewed_at: 2026-04-16T00:00:00Z
plans_reviewed:
  - 74-01-PLAN.md
  - 74-02-PLAN.md
  - 74-03-PLAN.md
---

# Cross-AI Plan Review — Phase 74

## Gemini Review

This review evaluates the implementation plan for **Phase 74: Optimize Material Request Tab for Mobile**.

### Summary

The plan is architecturally consistent with the established "dual-mode" CSS pattern used in the Finance module. By maintaining both Table and Card DOM trees simultaneously, the system avoids complex JS-driven layout recalculations. The use of a sticky, scroll-aware navigation bar provides a modern mobile experience. However, the reliance on persistent global event delegation on `document.body` for DOM synchronization introduces risks regarding memory management and potential side effects during view transitions.

### Strengths

- **Architectural Consistency:** Reusing the Finance pill-bar and card patterns ensures a unified UX across the application.
- **CSS-First Responsiveness:** Using Media Queries to toggle visibility (Dual-Mode) is the most robust way to handle responsiveness in a no-build, vanilla JS environment.
- **Scoped Styling:** Prefixing all new rules with `mrf-` prevents regression in the Finance or Procurement views.
- **Context Menu Preservation:** Maintaining the desktop right-click menu while providing a 3-dot menu for mobile respects the platform-specific expectations of the user.

### Concerns

- **[HIGH] Zombie Event Handlers:** The plan attaches event delegation to `document.body` with a `window._mrfItemSyncInstalled` guard. Since the handler is never removed in `destroy()`, it persists for the entire session. If the user navigates to a different view that happens to have elements matching the `.mrf-card-item-*` selectors (or if selectors are broad), the handler will still fire, consuming cycles and potentially throwing errors when it tries to find non-existent table rows.

- **[MEDIUM] Data Divergence Risk:** In Wave 3, `render()` recomputes display data (ID, Date, Status) separately for cards. If the logic for formatting an MRF status ever changes in the table row generator but is missed in the card generator, the mobile and desktop views will show inconsistent data for the same record.

- **[MEDIUM] Options Duplication:** Duplicating `UNIT_OPTIONS` and `CATEGORY_OPTIONS` inside `buildItemCardHTML` creates a maintenance burden. Any change to the master list of units/categories will require updates in multiple places, increasing the chance of "Value not found" errors during form submission.

- **[LOW] Bidirectional Sync Loops:** While the plan specifies "card to table and table to card" sync, it must ensure that updating the table from a card change doesn't trigger an event that tries to update the card back, creating an infinite loop or unnecessary DOM churn.

- **[LOW] 3-Dot Menu Positioning:** `position: fixed` with `getBoundingClientRect` is sensitive to window resizing and scroll events. If the menu is open and the user scrolls the background, the menu will stay floating in space (detached from the card).

### Suggestions

- **Encapsulate Listeners:** Instead of `document.body`, attach the sync event delegation to the `.mrf-items-section` container. Store a reference to this bound function and use `removeEventListener` in the `destroy()` method. This eliminates the need for the `window._mrfItemSyncInstalled` global guard and prevents zombie handlers.

- **Centralize Options:** Move `UNIT_OPTIONS` and `CATEGORY_OPTIONS` to a shared constant in `app/utils.js` or `app/views/mrf-form.js` (module level) so `buildItemCardHTML` and the table row generator use the exact same source of truth.

- **Unified Data Mapper:** Create a single `mapMRFToDisplayData(mrf)` helper function. Both the Table Row generator and the Card generator should call this function to get the formatted ID, Status HTML, and Date string.

- **Scroll-Close for Menus:** In Wave 3, add a `scroll` listener to the window/container when the 3-dot menu is open that automatically closes the menu. This prevents "floating" menus when the user scrolls while a dropdown is open.

- **Input Sync Optimization:** Instead of a generic `input` listener, use `change` for Selects and `input` for Text fields to reduce the frequency of sync calls. Ensure the sync logic checks if `newValue === oldValue` before touching the DOM to prevent cursor-jumping issues in text inputs.

### Risk Assessment

**Overall Risk: MEDIUM**

The "Dual-Mode" DOM approach is low-risk for layout, but the **Wave 2 Synchronization** logic is the primary point of failure. Syncing two sets of inputs in real-time without a data-binding framework is notoriously brittle. If the re-indexing fails after a row removal, the "Sync" will target the wrong indices, leading to data corruption in the MRF submission. Strict adherence to cleaning up event listeners is required to maintain SPA performance over long sessions.

---

## Consensus Summary

Only one external reviewer (Gemini) — no consensus comparison needed. Key findings stand as-is.

### Agreed Strengths

- CSS dual-mode approach is well-suited to a no-build vanilla JS SPA
- Scoped `.mrf-` prefix prevents Finance/Procurement regressions
- Preserving desktop right-click context menu while adding mobile 3-dot menu is the right UX approach

### Top Concerns (Priority Order)

1. **[HIGH] Zombie body event handlers (Plan 74-02)** — `installItemSyncHandlers` attaches to `document.body` but is never removed on `destroy()`. The `window._mrfItemSyncInstalled` guard prevents re-registration but the handler fires for the whole session lifetime. Fix: scope to `.mrf-items-section` element, store handler reference, remove in `destroy()`.

2. **[MEDIUM] UNIT_OPTIONS/CATEGORY_OPTIONS duplication (Plan 74-02)** — `buildItemCardHTML` duplicates these arrays inline instead of referencing the module-level constants already defined in `mrf-form.js`. Fix: reference the existing module-level constants directly in `buildItemCardHTML`.

3. **[MEDIUM] Card data recomputed separately from row data (Plan 74-03)** — `render()` calculates `displayId`, `dateNeeded`, `mrfStatusHtml` in a separate `Promise.all` for cards, duplicating logic from the row loop. Fix: compute once per MRF and pass to both `row` and `buildMRFRequestCard`.

4. **[LOW] Floating 3-dot menu on scroll (Plan 74-03)** — `position:fixed` menu detaches visually from card when user scrolls. Fix: add window `scroll` listener that closes the menu when it is open.

5. **[LOW] Bidirectional sync loop risk (Plan 74-02)** — Input handler updates both directions; verify that setting a DOM value programmatically does not re-trigger the listener (it shouldn't for programmatic `.value =` assignment without dispatching an event, but worth a note in plan).

### Divergent Views

None (single reviewer).
