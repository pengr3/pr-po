# Phase 66: Fix MRF Records PO Payment Progress Bar - Research

**Researched:** 2026-03-24
**Domain:** Vanilla JS inline HTML rendering, CSS progress bar pattern, status badge UI
**Confidence:** HIGH

## Summary

The MRF Records table POs column renders each PO ID as a pill badge (`status-badge` CSS class) with a semi-transparent payment fill overlay painted as an absolutely-positioned `<span>` inside the pill wrapper. This "badge fill" approach has three compounding problems: (1) the fill color bleeds onto the badge background making the chip look wrong (two competing background layers), (2) the fill overlay (`opacity:0.7`) at partial percentages produces a muddied, illegible mixed color over the badge's `pending`/`procuring`/`approved`/`delivered` background, and (3) the text color set by `status-badge` CSS class variants can become unreadable against the blended overlay.

The fix replaces the fill-within-badge pattern with a "flush" dynamic progress bar rendered as a separate element below (or alongside) the pill badge. A flush bar sits outside the badge entirely so badge coloring and text remain clean and unaffected. The PO Tracking table (Finance view) uses a different rendering path (`renderPOTrackingTable` at line 5314) that already has the fill applied to a full table cell (`<td class="po-id-cell">`), not a narrow pill badge — this may or may not need parallel treatment but the phase name targets MRF Records specifically.

**Primary recommendation:** In `renderPRPORecordsTable` (MRF Records, around line 3977-3996), replace the badge-fill `<span>` overlay with a thin progress bar `<div>` rendered below the pill badge inside the same wrapper, using `getPOPaymentFill()` data for width and color. The badge's own background, text color, and padding remain unmodified.

## Standard Stack

No new libraries. This is a pure HTML/CSS/JS change within the existing zero-build system.

### Core Pattern Change
| Element | Old Approach | New Approach |
|---------|-------------|--------------|
| Payment fill | Absolute-positioned `<span>` inside pill badge wrapper | Separate thin `<div>` progress bar below/beside the badge |
| Badge background | `background:${badgeBg}` on outer wrapper, fill overlay on top | Badge retains its own `status-badge` class coloring, no outer wrapper needed |
| Font color | Set by `status-badge` class but blended by fill overlay | Set exclusively by `status-badge` class — no overlay interference |

## Architecture Patterns

### Where the Change Lives

**File:** `app/views/procurement.js`
**Function:** the `matchedPOs.map()` block inside `renderPRPORecordsTable()` — approximately lines 3977-3996.

**Current rendering structure (MRF Records POs column):**
```html
<!-- Current: fill inside badge wrapper -->
<span title="..." style="position:relative;display:inline-block;overflow:hidden;border-radius:12px;vertical-align:middle;background:${badgeBg};">
    <span style="position:absolute;left:0;top:0;height:100%;width:${fillData.pct}%;background:${fillData.color};opacity:${fillData.opacity};pointer-events:none;"></span>
    <a class="status-badge ${poStatusClass}" style="position:relative;z-index:1;background:transparent;">PO-2026-001</a>
</span>
```

**Target rendering structure (flush progress bar):**
```html
<!-- New: badge clean, progress bar below -->
<span style="display:inline-flex;flex-direction:column;align-items:flex-start;vertical-align:middle;gap:2px;">
    <a class="status-badge ${poStatusClass}"
       style="text-decoration:none;cursor:pointer;white-space:nowrap;font-size:0.75rem;"
       onclick="window.viewPODetails('${po.docId}')"
       oncontextmenu="event.preventDefault(); window.showRFPContextMenu(event, '${po.docId}'); return false;"
       title="${escapeHTML(fillData.tooltip)}">
        ${escapeHTML(po.po_id)}
    </a>
    <div style="width:100%;height:3px;border-radius:2px;background:#e5e7eb;overflow:hidden;">
        <div style="height:100%;width:${fillData.pct}%;background:${fillData.color};transition:width 0.4s ease;"></div>
    </div>
</span>
```

Key design decisions in the new pattern:
- The outer wrapper switches from `position:relative;overflow:hidden` (needed for fill) to `inline-flex;flex-direction:column` (stack badge + bar vertically)
- The `status-badge` class anchor retains its own background and text color — `background:transparent` override is removed
- `badgeBg` variable and the absolute fill `<span>` are both eliminated
- The progress track is a neutral `#e5e7eb` background bar (`height:3px`, full width of anchor)
- The fill `<div>` inside the track uses `fillData.color` and `fillData.pct` — same data source as before
- `fillData.opacity` is no longer needed on the bar (bars don't need opacity — use the color directly or adjust the color itself)
- The `title` tooltip moves from the outer wrapper to the anchor where it's more naturally reachable
- `oncontextmenu` stays on the anchor (already scoped to PO ID cell)

### What `getPOPaymentFill()` Returns (Unchanged)

```javascript
// No RFPs submitted
{ pct: 100, color: '#f8d7da', opacity: 0.7, tooltip: 'No payment requests submitted' }

// Fully paid
{ pct: 100, color: '#d4edda', opacity: 0.7, tooltip: `Fully paid: ${formatCurrency(...)}` }

// Partially paid (most common active case)
{ pct: percentPaid, color: '#fff3cd', opacity: 0.7, tooltip: `Paid: ... | Balance: ... | ${percentPaid}% complete` }
```

The function itself does NOT need to change — `pct` and `color` are sufficient for the bar. `opacity` is ignored by the new bar pattern.

### Font Color Fix

With the badge fill removed, `status-badge` CSS class controls text color exclusively. The problem described in the phase name ("fix font color") should be resolved automatically because the fill overlay was blending with text. However, verify one edge case:

When `poStatusClass` is `'pending'` (Pending Procurement), the badge is `color: var(--warning-dark)` (amber/dark yellow). For a PO that is also partially paid, the bar below will be `#fff3cd` (also yellow-ish). This is fine because they're separate elements — the bar doesn't sit behind the text.

The "No RFPs" case (`pct:100, color:'#f8d7da'`) fills the entire bar red even though zero payment progress has been made — this is semantically confusing. The bar logic should use `pct: 0` for "no RFPs" rather than `100`. This may be an improvement the planner should consider (low-risk, same file).

### PO Tracking Table (Lines 5314-5323) — Parallel Consideration

The PO Tracking table uses a full `<td>` cell fill (not a badge fill) with CSS class `po-payment-fill`. This approach works well for table cells because the cell background is wide enough to serve as a meaningful fill canvas. The phase description names "MRF Records" specifically — the planner should decide whether to leave the PO Tracking table's cell fill intact or apply a consistent change there too.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Progress percentage | Custom calculation | `getPOPaymentFill()` already returns `pct` — reuse it |
| Status-based colors | New color map | `fillData.color` already has badge-aligned colors from quick task 260319-gkf |
| Badge coloring | Custom inline styles | `status-badge` CSS class + `getStatusClass()` — already in use at line 3984 |

## Common Pitfalls

### Pitfall 1: Removing `background:transparent` exposes double background
**What goes wrong:** The current `<a>` has `background:transparent` to let the fill show through. Removing the fill but forgetting to remove `background:transparent` from the anchor makes the badge render with transparent background, showing through to the outer wrapper's background.
**How to avoid:** Remove `background:transparent` from the `<a>` style at the same time as removing the outer wrapper's `background:${badgeBg}` and fill span.

### Pitfall 2: Outer wrapper width mismatch with badge width
**What goes wrong:** If outer wrapper is `display:inline-block` instead of `inline-flex`, the progress track `<div>` may not auto-size to match the badge width (badges have variable-length text).
**How to avoid:** Use `display:inline-flex;flex-direction:column;align-items:stretch` on the wrapper so the track stretches to match badge width.

### Pitfall 3: `border-radius:12px` on wrapper clips the track
**What goes wrong:** The old wrapper had `border-radius:12px;overflow:hidden` to clip the fill. If this persists, the track bar edges get clipped.
**How to avoid:** The new wrapper needs no `overflow:hidden` and no `border-radius` because there is no overflow to clip.

### Pitfall 4: Tooltip no longer accessible
**What goes wrong:** The tooltip `title` attribute was on the outer wrapper span. After restructuring to inline-flex, if the title is not moved to the anchor, it may not trigger on hover.
**How to avoid:** Move `title="${escapeHTML(fillData.tooltip)}"` to the `<a>` anchor element.

### Pitfall 5: Context menu handler placement
**What goes wrong:** The `oncontextmenu` must remain on the anchor (or an element that covers the PO ID text), not on a wrapper that includes the track bar.
**How to avoid:** Keep `oncontextmenu` on the `<a>` anchor only.

## Code Examples

### Current Code (Lines 3985-3995)
```javascript
// Source: app/views/procurement.js ~line 3985
const badgeBg = { 'Pending Procurement': '#fff3cd', 'Pending': '#fff3cd', 'Procuring': '#dbeafe', 'Procured': '#d4edda', 'Delivered': '#d1fae5' }[poStatus] || '#f1f5f9';
const fillData = getPOPaymentFill(po.po_id);
return `<span title="${escapeHTML(fillData.tooltip)}" style="position:relative;display:inline-block;overflow:hidden;border-radius:12px;vertical-align:middle;background:${badgeBg};">
    <span style="position:absolute;left:0;top:0;height:100%;width:${fillData.pct}%;background:${fillData.color};opacity:${fillData.opacity};pointer-events:none;"></span>
    <a href="javascript:void(0)"
        onclick="window.viewPODetails('${po.docId}')"
        oncontextmenu="event.preventDefault(); window.showRFPContextMenu(event, '${po.docId}'); return false;"
        class="status-badge ${poStatusClass}"
        style="position:relative;z-index:1;text-decoration:none;cursor:pointer;white-space:nowrap;font-size:0.75rem;background:transparent;">
        ${escapeHTML(po.po_id)}</a>
</span>${subconBadge}`;
```

### Target Code Pattern
```javascript
// Source: research synthesis
const fillData = getPOPaymentFill(po.po_id);
// badgeBg variable is no longer needed — badge uses status-badge CSS class
return `<span style="display:inline-flex;flex-direction:column;align-items:stretch;vertical-align:middle;gap:2px;">
    <a href="javascript:void(0)"
        onclick="window.viewPODetails('${po.docId}')"
        oncontextmenu="event.preventDefault(); window.showRFPContextMenu(event, '${po.docId}'); return false;"
        class="status-badge ${poStatusClass}"
        title="${escapeHTML(fillData.tooltip)}"
        style="text-decoration:none;cursor:pointer;white-space:nowrap;font-size:0.75rem;">
        ${escapeHTML(po.po_id)}</a>
    <div style="width:100%;height:3px;border-radius:2px;background:#e5e7eb;overflow:hidden;">
        <div style="height:100%;width:${fillData.pct}%;background:${fillData.color};transition:width 0.4s ease;"></div>
    </div>
</span>${subconBadge}`;
```

Note: `badgeBg` variable and its lookup object can be deleted from the block. The fill `<span>` is removed entirely.

## State of the Art

| Old Approach | Current Approach | Reason for Change |
|--------------|-----------------|-------------------|
| Badge fill overlay (absolute span inside pill) | Flush progress bar below pill | Fill blends with badge background, muddies text color |
| `opacity:0.7` on fill for translucency | Opaque progress bar track | No need for blending in separate bar element |
| `badgeBg` lookup per status for outer wrapper | No outer wrapper background — badge CSS class handles it | Removes dual-background problem |

## Open Questions

1. **"Fix font color" — is there a remaining issue after fill removal?**
   - What we know: Quick task 260319-j18 already fixed the color from green to `#1a73e8`. Then quick task 260319-j5f replaced the inline `color:#1a73e8` with `status-badge` class coloring, removing the explicit color override.
   - What's unclear: Whether the current `status-badge` class colors are producing a font color problem against the blended fill background (expected: yes, because `pending` class = amber text on amber fill), or if there's a separate font color regression.
   - Recommendation: The flush bar approach eliminates the blending problem. No separate font color fix should be needed — verify during implementation.

2. **Should `getPOPaymentFill()` return `pct:0` for "No RFPs" case?**
   - What we know: Currently returns `pct:100, color:'#f8d7da'` (full red bar) when no RFPs exist. A full red bar for zero payment progress is semantically misleading.
   - What's unclear: Is this intentional (indicating "no payment tracking yet" as a warning state) or a bug?
   - Recommendation: Change "No RFPs" case to `pct:0` so the bar is empty. The tooltip still explains the state. Low-risk change in the same file/function — planner should include as a sub-task.

3. **PO Tracking table (`renderPOTrackingTable`) — keep cell fill or align with new pattern?**
   - What we know: This table uses a full `<td>` cell with `po-payment-fill` CSS class. The cell is wide enough that a fill makes visual sense.
   - Recommendation: Leave PO Tracking table unchanged — the phase name targets MRF Records specifically. The cell fill in PO Tracking is a different, larger-canvas pattern and works better there.

## Validation Architecture

No automated test framework detected (no jest.config, vitest.config, package.json test scripts — zero-build static SPA). Validation is manual browser testing.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None — manual browser testing only |
| Config file | none |
| Quick run command | `python -m http.server 8000` then open browser |
| Full suite command | N/A |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Verification |
|--------|----------|-----------|--------------|
| (none specified) | PO pill badge in MRF Records shows clean text and color | manual | Navigate to MRF Records, find MRF with POs, verify badge colors are correct |
| (none specified) | Progress bar renders below PO pill for paid POs | manual | Find MRF with partially/fully paid PO, verify thin bar below badge |
| (none specified) | Progress bar is absent or empty for POs with no RFPs | manual | Find MRF with unpaid PO, verify no fill or empty bar |
| (none specified) | `oncontextmenu` (right-click RFP menu) still works | manual | Right-click PO ID in MRF Records, verify context menu appears |
| (none specified) | `onclick` viewPODetails still works | manual | Left-click PO ID, verify PO detail modal opens |

### Wave 0 Gaps
None — no test infrastructure exists in this project by design (static SPA, no build system).

## Sources

### Primary (HIGH confidence)
- Direct code read: `app/views/procurement.js` lines 255-290 (`getPOPaymentFill`), 3971-3999 (MRF Records POs column rendering), 5314-5323 (PO Tracking cell fill)
- Direct code read: `styles/components.css` lines 511-558 (`status-badge` CSS class variants)
- Direct code read: `styles/views.css` lines 1618-1630 (`.po-payment-fill`, `.po-id-cell` CSS)
- Direct code read: `app/utils.js` lines 458-483 (`getStatusClass` utility)
- Quick task summaries: `260319-gkf` (fill color alignment), `260319-j18` (font color fix), `260319-j5f` (pill badge styling)
- Debug file: `.planning/debug/proof-indicator-no-update.md` (MRF Records table one-time getDocs context)

### Secondary (MEDIUM confidence)
- CSS flexbox column pattern for stacking badge + progress bar: standard HTML/CSS, no library needed

## Metadata

**Confidence breakdown:**
- Problem identification: HIGH — current code read directly, issue mechanically verifiable
- Solution pattern: HIGH — standard CSS flex column + progress bar div, no novel patterns
- Edge cases: MEDIUM — "No RFPs = pct:100" semantic issue is inferred from logic, not user-reported

**Research date:** 2026-03-24
**Valid until:** Stable — pure UI change in a static JS file, no external dependencies
