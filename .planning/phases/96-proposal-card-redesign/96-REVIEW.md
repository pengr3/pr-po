---
phase: 96-proposal-card-redesign
reviewed: 2026-05-26T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - styles/components.css
  - app/views/project-detail.js
  - app/views/service-detail.js
findings:
  critical: 1
  warning: 4
  info: 2
  total: 7
status: issues_found
---

# Phase 96: Code Review Report

**Reviewed:** 2026-05-26
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Phase 96 replaced the inline proposal card with a Concept B (progress track) + Alt B (stat chips) design. The CSS namespace is clean — all new rules use `.proposal-` prefix, old `.proposal-inline-card__header` / `__label` classes were removed from CSS, and there are no conflicts with pre-existing classes. The STATUS_META track logic is correct for all six proposal states (verified by simulation). XSS coverage is solid for all Firestore user-supplied strings; the few unescaped interpolations (`ageLabel`, `ageChipClass`, `ageSubHtml`, `overdueBorder`) are safe by construction (outputs of arithmetic, boolean logic, and hardcoded strings respectively). Overdue detection boundary (`> 7`) and `created_at` fallback both match the spec.

The critical finding is a missing `syncBottomRow()` call in `service-detail.js`: the service view uses a different DOM structure than project-detail and never calls `syncBottomRow`, meaning the grid layout is never applied there — but that function does not exist in service-detail at all, and the proposal card inside service-detail is appended as a standalone element outside the 2-column grid, so this is an architectural deviation from the spec. Beyond that there are four warnings and two info items.

---

## Critical Issues

### CR-01: `service-detail.js` — `syncBottomRow()` missing; proposal card does not apply 2-column grid layout

**File:** `app/views/service-detail.js:296`
**Issue:** `project-detail.js` implements `syncBottomRow()` (lines 1542–1551) and calls it from both the empty-state branch and the proposal-found branch of `loadProposalCard()`. This function sets `projectDetailBottomRow` to `display: grid; grid-template-columns: 1fr 1fr` when the proposal card is visible, pairing the proposal card with the Project Plan card side-by-side as per the Phase 96 spec.

`service-detail.js` has no `syncBottomRow()` function and no equivalent grid-layout element. The proposal card placeholder is injected as `<div id="proposalInlineCard" style="margin-top:1rem;"></div>` appended after Card 3 ("Status & Assignment") with no surrounding grid wrapper. When a proposal exists, `loadProposalCard()` in service-detail populates the card but never switches the layout to 2-column — the card always renders as a full-width block below all three service cards, and the empty-state branch (lines 1325–1328) also never calls `syncBottomRow()`. The D-10 parity requirement (service-detail.js should match project-detail.js implementation) is not met.

Additionally, the service-detail empty-state early `return` at line 1328 is missing the `syncBottomRow()` call that project-detail has at line 1589, even if grid behavior were added.

**Fix:** Either add a `syncBottomRow()` function and a `<div id="serviceDetailBottomRow">` wrapper (mirroring project-detail.js), or explicitly accept that service-detail uses full-width layout and document the divergence. If full-width is the intent, the review spec requirement "D-10 parity" should be updated to exempt layout structure. At minimum the empty-state hidden path in `loadProposalCard` (service-detail, line 1325–1328) is missing a layout toggle call:

```javascript
// In service-detail.js loadProposalCard(), after el.style.display = 'none':
el.style.display = 'none';
syncBottomRow(); // add this call (if syncBottomRow is implemented)
return;
```

---

## Warnings

### WR-01: `ageLabel` rendered without `escapeHTML()` — safe by construction only, not by sanitization

**File:** `app/views/project-detail.js:1453` and `app/views/service-detail.js:1200`
**Issue:** `ageLabel` is inserted directly into HTML without `escapeHTML()`:
```html
<div class="proposal-chip-val">${ageLabel}</div>
```
`ageLabel` is computed as `Math.round(ageDays) + ' days'` or the em dash literal `'—'`. `Math.round()` returns a number, making injection impossible today. However, this relies on the arithmetic chain remaining intact. If the computation is ever refactored to incorporate user-supplied text (e.g., a unit label from the database), the unescaped interpolation becomes a stored XSS vector. The project convention is to escape all innerHTML template interpolations — even computed ones — to prevent future breakage.

**Fix:**
```javascript
// project-detail.js line 1453 / service-detail.js line 1200
<div class="proposal-chip-val">${escapeHTML(ageLabel)}</div>
```

### WR-02: `proposal-inline-card__body` class used in CTA card has no CSS rule

**File:** `app/views/project-detail.js:1576` and `app/views/service-detail.js:1315`
**Issue:** The Start Proposal CTA card (empty-state when `project_status === 'For Proposal'`) uses the class `proposal-inline-card__body`:
```html
<div class="proposal-inline-card__body" style="text-align:center;padding:1rem 0;">
```
This class was never defined in `components.css` (confirmed: not in the pre-Phase-96 file either, and not added in Phase 96). The element gets its layout entirely from the inline `style` attribute, making `class="proposal-inline-card__body"` dead markup that creates a false impression of CSS coverage. If a future developer removes the inline style expecting the class to take effect, the layout will break silently.

**Fix:** Either remove the class (keep inline style only) or add the CSS rule to `components.css` under the `.proposal-` namespace:
```css
.proposal-inline-card__body {
    text-align: center;
    padding: 1rem 0;
}
```
The inline style can then be removed.

### WR-03: `ageLabel` shows "1 days" when `ageDays` rounds to 1 — grammatically incorrect

**File:** `app/views/project-detail.js:1426` and `app/views/service-detail.js:1173`
**Issue:**
```javascript
const ageLabel = ageDays > 0 ? Math.round(ageDays) + ' days' : '—';
```
When `ageDays` is between 0.5 and 1.4, `Math.round(ageDays)` equals `1`, producing the string `"1 days"`. This is grammatically incorrect and visible to end users in the STAGE AGE chip.

Additionally, when `ageDays` is between 0 and 0.5 (e.g., a proposal created earlier today), `Math.round(ageDays)` equals `0`, producing `"0 days"` — which is technically wrong (the proposal is less than one day old). The `'—'` fallback only applies when `ageDays === 0` (initial value before the `try` block succeeds), not when the age is genuinely sub-day.

**Fix:**
```javascript
const ageDaysRounded = Math.round(ageDays);
const ageLabel = ageDays <= 0
    ? '—'
    : ageDaysRounded < 1
        ? '< 1 day'
        : ageDaysRounded === 1
            ? '1 day'
            : ageDaysRounded + ' days';
```

### WR-04: `showEditControls` semantic divergence between `project-detail.js` and `service-detail.js` — authorization bypass risk

**File:** `app/views/service-detail.js:287` vs `app/views/project-detail.js:373`
**Issue:** The two files evaluate `canEdit` differently:

`project-detail.js` (line 373):
```javascript
const showEditControls = canEdit !== false;  // true when canEdit is null/undefined too
```

`service-detail.js` (line 287):
```javascript
const showEditControls = canEdit === true;   // false when canEdit is null/undefined
```

When `window.canEditTab` is not yet initialized (returns `undefined`), project-detail shows edit controls (`canEdit !== false` → `true`), while service-detail hides them (`canEdit === true` → `false`). This is an existing pre-Phase-96 inconsistency that was not corrected by this phase. While the Phase 96 changes do not make it worse, the CTA card `canDrive` check (lines 1295–1299) could grant "Submit for Approval" access when `window.canEditTab` has not initialized, because `canDrive` is determined independently of `showEditControls`. This is a latent authorization inconsistency that should be normalized.

**Fix:** Align both files to use the same guard. Given service-detail's stricter pattern (`=== true`) is safer, prefer it in project-detail:
```javascript
// project-detail.js line 373 — change to match service-detail:
const showEditControls = canEdit === true;
```
Alternatively, add a defensive `canDrive = canDrive && canEdit !== false` check before it's used to gate the Submit button.

---

## Info

### IN-01: `client_approved` shows as `t-active` (ring) rather than `t-passed` (filled) on Approved node

**File:** `app/views/project-detail.js:1338–1345` and `app/views/service-detail.js:1085–1092`
**Issue:** `STATUS_META.client_approved` has `trackIdx: 3`. In `_buildProposalTrack`, node `i=3` satisfies `i === trackIdx` → gets `t-active` (ring glow). Nodes `i=0,1,2` get `t-passed` (filled dot). This means the final "Approved" node shows a pulsing ring, not a filled check — which may be the intended UX to indicate this is the current/terminal state. However, the spike README describes only "completed stages: filled blue dot with check icon" vs "active stage: ring glow". By strict reading, `client_approved` is a completed success state, so all four nodes arguably should be `t-passed`.

This is a design ambiguity, not a bug. If the intent is "Approved = completion, all nodes filled," change `client_approved` trackIdx to `4` (or add a special `completed: true` meta flag) so all 4 nodes receive `t-passed`.

**No fix required** unless the design intent is all-filled for final approval.

### IN-02: Duplicate constant declarations (`STATUS_META`, `TRACK_NODES`, `_PROPOSAL_CHECK_SVG`) between the two files

**File:** `app/views/project-detail.js:1338–1356` and `app/views/service-detail.js:1085–1103`
**Issue:** `STATUS_META`, `TRACK_NODES`, and `_PROPOSAL_CHECK_SVG` are declared identically in both files. This is copy-paste duplication — if the track node labels or status mapping ever change, both files must be updated in sync. A divergence would be a subtle display bug (different track behavior on project vs service detail).

**Fix:** Extract to a shared module, e.g., `app/proposal-card-helpers.js`, and import from both views. Given this is a pure-JS project with no build step, a lightweight ES module export works:
```javascript
// app/proposal-card-helpers.js
export const STATUS_META = { ... };
export const TRACK_NODES = [ ... ];
export const _PROPOSAL_CHECK_SVG = '...';
```

---

_Reviewed: 2026-05-26_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
