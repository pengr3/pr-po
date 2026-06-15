# Phase 34: Documentation & Minor Fixes — Research

**Researched:** 2026-02-19
**Domain:** Documentation cleanup, REQUIREMENTS.md maintenance, Phase 31 verification, Finance PO filter gap
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DASH-01 | Dashboard shows Services department statistics (active services count) | Implemented in home.js (confirmed by code reading); needs VERIFICATION.md and checkbox update in REQUIREMENTS.md |
| DASH-02 | Dashboard shows Services-linked MRFs count | Implemented in home.js (confirmed by code reading); needs VERIFICATION.md and checkbox update in REQUIREMENTS.md |
| SEC-08 | Department field enforced on all new MRFs, PRs, POs, TRs going forward | Implemented in mrf-form.js, procurement.js (4 paths), finance.js (1 PO path); needs checkbox update in REQUIREMENTS.md; formal evidence already in Phase 29 VERIFICATION.md |
| DASH-03 | Dashboard shows department breakdown (Projects vs Services) | Orphaned/deferred — needs to be removed from v2.3 traceability table and moved to Future Requirements section |
</phase_requirements>

---

## Summary

Phase 34 is a documentation and cleanup phase. It has two distinct workstreams: (1) documentation artifacts — creating a missing VERIFICATION.md for Phase 31 and updating REQUIREMENTS.md checkbox states, coverage count, and DASH-03 traceability; and (2) a code change — adding a department filter dropdown to the Finance Purchase Orders tab (Tab 2).

The audit (v2.3-MILESTONE-AUDIT.md) identified that Phase 31 was executed and its SUMMARY says DASH-01 and DASH-02 are complete, but no VERIFICATION.md was ever produced. The implementation is confirmed real: home.js contains `getDashboardMode()`, `projectsStatsHtml()`, `servicesStatsHtml()`, the full `loadStats(mode)` branching logic, and all five stat keys. The verification step was simply skipped. Phase 34's job is to write that missing VERIFICATION.md and update the REQUIREMENTS.md bookkeeping.

The Finance PO filter gap is genuine code work: Tab 1 (Pending Approvals) has a `deptFilterApprovals` select that calls `window.applyFinanceDeptFilter(this.value)`. Tab 2 (Purchase Orders) has no such control — the card-header has only a Refresh button. However, `renderPOs()` already respects `activeDeptFilter` (line 2021-2023 in finance.js). The filter state and render function are wired — only the HTML dropdown UI element is missing from Tab 2's card-header.

**Primary recommendation:** Split into two plans: 34-01 for documentation artifacts (VERIFICATION.md + REQUIREMENTS.md updates), 34-02 for the finance.js Tab 2 filter dropdown. Both are low-risk, well-bounded tasks.

---

## Standard Stack

No new libraries required. This phase operates entirely within the existing codebase patterns.

| Tool | Purpose | Notes |
|------|---------|-------|
| Markdown frontmatter (YAML) | VERIFICATION.md format | Matches existing phase verification files (28-VERIFICATION.md, 29-VERIFICATION.md, 30-VERIFICATION.md) |
| Pure JS string template | Finance tab HTML | Tab 2 card-header dropdown using existing inline style pattern |
| `applyFinanceDeptFilter` (existing) | Filter handler | Already exposed on `window`, already called from Tab 1 |

---

## Architecture Patterns

### Pattern 1: VERIFICATION.md Structure (from existing files)

All existing phase verification files follow this format. Phase 31 VERIFICATION.md must match it.

**Frontmatter:**
```yaml
---
phase: 31-dashboard-integration
verified: 2026-02-19T00:00:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "..."
    expected: "..."
    why_human: "..."
---
```

**Body sections:**
1. Phase Goal and Status header
2. `## Goal Achievement` with `### Observable Truths` table (# | Truth | Status | Evidence)
3. `### Required Artifacts` table
4. `### Key Link Verification` table
5. `### Requirements Coverage` table (Requirement | Source Plan | Description | Status | Evidence)

Source: inspected 28-VERIFICATION.md, 29-VERIFICATION.md, 30-VERIFICATION.md — all follow this structure.

### Pattern 2: REQUIREMENTS.md Checkbox Update

REQUIREMENTS.md uses standard markdown task list syntax:
- `[ ]` = not complete
- `[x]` = complete

Three checkboxes to change from `[ ]` to `[x]`:
- Line 59: `- [ ] **SEC-08**` → `- [x] **SEC-08**`
- Line 95: `- [ ] **DASH-01**` → `- [x] **DASH-01**`
- Line 96: `- [ ] **DASH-02**` → `- [x] **DASH-02**`

DASH-03 (line 97) stays as `[ ]` but the traceability table entry needs updating from `Phase 31 | Pending` to match its status as deferred. DASH-03 also needs to be removed from the main requirements list's `[ ]` state and the traceability row updated.

### Pattern 3: Finance Tab Department Filter (from Tab 1)

Tab 1 card-header dropdown (confirmed working at lines 651-657 in finance.js):
```html
<select id="deptFilterApprovals"
        onchange="window.applyFinanceDeptFilter(this.value)"
        style="padding:0.35rem 0.6rem;border:1.5px solid #e2e8f0;border-radius:6px;font-size:0.875rem;color:#475569;">
    <option value="">All Departments</option>
    <option value="projects">Projects</option>
    <option value="services">Services</option>
</select>
```

For Tab 2, the same pattern applies. The card-header (lines 717-720) currently has:
```html
<div class="card-header">
    <h2>Recently Generated Purchase Orders</h2>
    <button class="btn btn-secondary" onclick="window.refreshPOs()">🔄 Refresh</button>
</div>
```

It needs to become:
```html
<div class="card-header">
    <h2>Recently Generated Purchase Orders</h2>
    <div style="display:flex;gap:0.5rem;align-items:center;">
        <select id="deptFilterPOs"
                onchange="window.applyFinanceDeptFilter(this.value)"
                style="padding:0.35rem 0.6rem;border:1.5px solid #e2e8f0;border-radius:6px;font-size:0.875rem;color:#475569;">
            <option value="">All Departments</option>
            <option value="projects">Projects</option>
            <option value="services">Services</option>
        </select>
        <button class="btn btn-secondary" onclick="window.refreshPOs()">🔄 Refresh</button>
    </div>
</div>
```

**Critical insight:** `renderPOs()` already filters by `activeDeptFilter` (line 2021-2023). `applyFinanceDeptFilter()` already calls `renderPOs()` (line 90). The function is already on `window` (line 133). The ONLY change needed is adding the HTML dropdown to the Tab 2 card-header. No JavaScript logic changes required.

### Pattern 4: REQUIREMENTS.md Traceability Cleanup for DASH-03

Current state (lines 195-197):
```
| DASH-01 | Phase 34 | Pending |
| DASH-02 | Phase 34 | Pending |
| DASH-03 | Deferred to v2.4+ | N/A |
```

DASH-03 traceability row is already updated to "Deferred to v2.4+ | N/A" in the current REQUIREMENTS.md. The main requirements list still has `- [ ] **DASH-03**` on line 97.

The phase goal says "DASH-03 moved from traceability table to Future Requirements section". The DASH-03 item in the main requirements list body (line 97) should be removed from the `### Dashboard Integration` section and added to the `## Future Requirements` section. The traceability row (already showing N/A) can simply be removed or left as-is.

**Current REQUIREMENTS.md state assessment (HIGH confidence, read file directly):**
- DASH-01: `[ ]` unchecked, traceability says `Phase 34 | Pending` — needs `[x]` + traceability updated to `Phase 31 | Complete` (or Phase 34 as formal verifier)
- DASH-02: `[ ]` unchecked, traceability says `Phase 34 | Pending` — same treatment
- SEC-08: `[ ]` unchecked, traceability says `Phase 34 | Pending` — needs `[x]` + traceability updated to `Phase 29 | Complete`
- DASH-03: `[ ]` unchecked, traceability says `Deferred to v2.4+ | N/A` — needs to be moved to Future Requirements section, removed from main list

**Coverage count (line 200):** Currently reads `65 total (54 original + CROSS-01-07, DASH-01-03, SEC-08 added during v2.3)`. This count is already 65. The audit noted "REQUIREMENTS.md Coverage section states 54 requirements" but the current file already says 65. The ROADMAP success criterion says "updated to reflect 65 actual requirements" — this appears to already be done. The planner should verify this is accurate in the current file before making changes.

---

## Phase 31 Code Evidence (for VERIFICATION.md)

Reading home.js (current state, HIGH confidence):

### getDashboardMode() — VERIFIED present
```javascript
function getDashboardMode() {
    const role = window.getCurrentUser?.()?.role || '';
    if (['operations_admin', 'operations_user'].includes(role)) return 'projects';
    if (['services_admin', 'services_user'].includes(role)) return 'services';
    return 'both'; // super_admin, finance, procurement_staff, unknown
}
```
Location: home.js lines 22-27.

### stats object — VERIFIED contains all 5 keys
```javascript
let stats = {
    activeMRFs: 0,
    pendingPRs: 0,
    activePOs: 0,
    activeServices: 0,   // DASH-01
    servicesMRFs: 0      // DASH-02
};
```
Location: home.js lines 10-16.

### render() — VERIFIED mode-branched
- Line 72: calls `getDashboardMode()`
- Lines 75-95: `if (mode === 'both')` → two stat-group divs; `else if (mode === 'services')` → `servicesStatsHtml()`; else → `projectsStatsHtml()`
- Line 56-65: `servicesStatsHtml()` returns `stat-services` and `stat-services-mrfs` elements

### loadStats(mode) — VERIFIED mode-branched
- Lines 151-188: projects/both branch registers 3 listeners (MRFs/PRs/POs)
- Line 156-158: MRF listener uses `(d.data().department || 'projects') === 'projects'` client-side filter
- Lines 191-217: services/both branch registers 2 listeners (active services + services MRFs)
- Line 196-198: services listener uses `d.data().active !== false` client-side filter
- Line 209-211: servicesMRFs listener uses `d.data().department === 'services'` client-side filter

### destroy() — VERIFIED resets all 5 stat keys (lines 249-255)

### stats/hero.css — VERIFIED (31-01-SUMMARY.md confirms `.stat-group*` rules added and `.quick-stats` widened to 1200px)

### Key links for VERIFICATION.md:
- `render()` → `getDashboardMode()` → mode string → branched HTML
- `init()` → `loadStats(mode)` via `getDashboardMode()`
- `loadStats()` → `statsListeners.push()` → cleanup in `destroy()`

---

## SEC-08 Code Evidence (for REQUIREMENTS.md checkbox)

**Implementation is confirmed at these locations (HIGH confidence, verified by reading source files):**

| Document | File | Evidence |
|----------|------|---------|
| MRF `department` field | mrf-form.js line 664, 690 | `const department = hasService ? 'services' : 'projects'`; stored as `department: department` in addDoc |
| PR `department` field | procurement.js (4 paths) | Lines 2987, 3254, 3542, 3607 — all store `department: mrfData.department \|\| 'projects'` |
| PO `department` field | finance.js line 1686 | `department: pr.department \|\| 'projects'` in PO addDoc |
| TR `department` field | procurement.js line 3605-3607 | Same pattern as PR paths |

**Phase 29 VERIFICATION.md already documents this** (line 42-43): "PR and TR documents created from services MRFs carry service_code and service_name fields — VERIFIED" with specific line numbers. The audit classified this as "partial" only because the SEC-08 checkbox was unchecked and it wasn't in the formal VERIFICATION.md requirements table. The implementation is real.

**SEC-08 traceability note:** Current REQUIREMENTS.md shows `SEC-08 | Phase 34 | Pending`. After Phase 34 formally verifies it, this should be updated to `SEC-08 | Phase 29 | Complete` (implementation was Phase 29 work; Phase 34 just confirms it formally).

---

## Finance PO Filter Gap — Full Technical Analysis

### Current state of Tab 2 (HIGH confidence, read finance.js lines 713-725):
```html
<!-- Tab 2: Purchase Orders -->
<section id="pos-section" class="section ${activeTab === 'pos' ? 'active' : ''}">
    ...
    <div class="card">
        <div class="card-header">
            <h2>Recently Generated Purchase Orders</h2>
            <button class="btn btn-secondary" onclick="window.refreshPOs()">🔄 Refresh</button>
        </div>
        <div id="poList">...</div>
    </div>
</section>
```

### What already works (no code changes needed):
- `activeDeptFilter` module variable (line 80): shared state between Tab 1 and Tab 2
- `applyFinanceDeptFilter(value)` (line 86-91): sets `activeDeptFilter`, calls `renderPOs()` and both PR tables
- `renderPOs()` (line 2018-2095): already filters `poData` by `activeDeptFilter` at line 2021-2023
- `window.applyFinanceDeptFilter` is already registered in `attachWindowFunctions()` (line 133)

### What is missing:
- The HTML `<select>` element in Tab 2's card-header that calls `window.applyFinanceDeptFilter(this.value)`

### Side effect awareness:
`applyFinanceDeptFilter(value)` calls `renderMaterialPRs()`, `renderTransportRequests()`, AND `renderPOs()`. This means the Tab 2 dropdown will also filter Tab 1 tables (same filter state). This is correct and intentional — per STATE.md decision: "applyFinanceDeptFilter re-renders all three tables on every filter change". The shared filter is by design.

### Selected value persistence:
When `activeDeptFilter` is set via Tab 1's dropdown, the Tab 2 dropdown (once added) will not automatically show the selected value because it's a separate DOM element rendered from the static `render()` function. The Tab 2 dropdown's selected option reflects what was last selected in Tab 2 — it won't mirror Tab 1's selection state. This is acceptable for now; both dropdowns affect the same underlying filter and both will show correct filtered results.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Phase 31 verification truths | Custom verification format | Existing VERIFICATION.md pattern (frontmatter + Observable Truths table + Artifacts + Key Links + Requirements Coverage) |
| Finance tab filter state | New filter variable | `activeDeptFilter` already exists as module-level state |
| Finance filter render function | New render logic | `renderPOs()` already respects `activeDeptFilter` |
| Filter window registration | New window.xxx assignment | `window.applyFinanceDeptFilter` already in `attachWindowFunctions()` |

---

## Common Pitfalls

### Pitfall 1: Over-engineering the VERIFICATION.md
**What goes wrong:** Writing a verification document that re-runs analysis instead of documenting what the code does.
**How to avoid:** Follow the established pattern exactly — Observable Truths table with specific line number evidence. Look at 29-VERIFICATION.md and 30-VERIFICATION.md as templates.

### Pitfall 2: Changing the DASH-03 checkbox state to [x]
**What goes wrong:** Marking DASH-03 as complete when it was intentionally deferred. DASH-03 (department breakdown on dashboard) was never implemented.
**How to avoid:** DASH-03 should be moved to `## Future Requirements` with the other deferred items, not checked. Its `[ ]` checkbox in the main list should be removed from the list entirely (it moves to future requirements without a checkbox).

### Pitfall 3: Changing REQUIREMENTS.md traceability incorrectly
**What goes wrong:** Updating DASH-01/DASH-02 traceability to "Phase 34" instead of the phase that actually implemented them (Phase 31).
**How to avoid:** DASH-01/DASH-02 were implemented in Phase 31, formally verified in Phase 34. Traceability should show `Phase 31 | Complete`. SEC-08 was implemented in Phase 29 and should show `Phase 29 | Complete`.

### Pitfall 4: Adding a second `applyFinanceDeptFilter` window registration
**What goes wrong:** Adding `window.applyFinanceDeptFilter = applyFinanceDeptFilter` a second time in the code.
**How to avoid:** It's already registered in `attachWindowFunctions()` at line 133. No change needed to the JavaScript.

### Pitfall 5: Tab 2 dropdown ID collision
**What goes wrong:** Using `id="deptFilterApprovals"` for the Tab 2 dropdown (same as Tab 1).
**How to avoid:** Use `id="deptFilterPOs"` for the Tab 2 dropdown. Two distinct IDs, same `onchange` handler.

### Pitfall 6: REQUIREMENTS.md coverage count already says 65
**What goes wrong:** The audit noted a discrepancy but the current REQUIREMENTS.md already shows "65 total". Changing it would be wrong.
**How to avoid:** Verify the current coverage count in REQUIREMENTS.md before editing. Current state (line 200): `65 total (54 original + CROSS-01-07, DASH-01-03, SEC-08 added during v2.3)`. This is already correct. No change needed to the count.

---

## Code Examples

### Dept filter dropdown HTML (for Tab 2 card-header)
```html
<!-- Source: finance.js Tab 1 card-header (lines 650-658), adapted for Tab 2 -->
<div style="display:flex;gap:0.5rem;align-items:center;">
    <select id="deptFilterPOs"
            onchange="window.applyFinanceDeptFilter(this.value)"
            style="padding:0.35rem 0.6rem;border:1.5px solid #e2e8f0;border-radius:6px;font-size:0.875rem;color:#475569;">
        <option value="">All Departments</option>
        <option value="projects">Projects</option>
        <option value="services">Services</option>
    </select>
    <button class="btn btn-secondary" onclick="window.refreshPOs()">🔄 Refresh</button>
</div>
```

### REQUIREMENTS.md lines to change (from confirmed current state)
```
Line 59:  - [ ] **SEC-08** → - [x] **SEC-08**
Line 95:  - [ ] **DASH-01** → - [x] **DASH-01**
Line 96:  - [ ] **DASH-02** → - [x] **DASH-02**
Line 97:  - [ ] **DASH-03** → REMOVE from this section, ADD to Future Requirements
```

Traceability updates:
```
SEC-08  | Phase 29 | Complete   (was: Phase 34 | Pending)
DASH-01 | Phase 31 | Complete   (was: Phase 34 | Pending)
DASH-02 | Phase 31 | Complete   (was: Phase 34 | Pending)
DASH-03 | Deferred to v2.4+ | N/A  (row can be removed; DASH-03 moves to Future Requirements)
```

---

## State of the Art

| Old State | Current State | Changed | Impact |
|-----------|---------------|---------|--------|
| REQUIREMENTS.md checkboxes unchecked for DASH-01, DASH-02, SEC-08 | Unchecked (needs Phase 34 to check them) | Will change in Phase 34 | Documentation integrity |
| Phase 31 has no VERIFICATION.md | VERIFICATION.md missing | Phase 34 creates it | Formal verification record |
| DASH-03 in main requirements list as unimplemented | Deferred per ROADMAP.md | Phase 34 moves it | Traceability accuracy |
| Finance Tab 2 has no dept filter control | activeDeptFilter state exists but no UI | Phase 34 adds dropdown HTML | CROSS-04 full closure |

---

## Open Questions

1. **REQUIREMENTS.md coverage count — already correct?**
   - What we know: Line 200 currently reads "65 total (54 original + CROSS-01-07, DASH-01-03, SEC-08 added during v2.3)"
   - What's unclear: The audit noted a discrepancy but may have been reading an older version
   - Recommendation: The planner should verify the current line 200 content and skip editing it if it already says 65. Research confirms it already says 65.

2. **DASH-03 traceability row — remove or update?**
   - What we know: Traceability row currently says `Deferred to v2.4+ | N/A`
   - What's unclear: Should the row stay (with N/A) or be deleted entirely from the traceability table?
   - Recommendation: Remove the row from the traceability table entirely. DASH-03 belongs in Future Requirements, not in the v2.3 traceability matrix.

3. **Finance Tab 1 dept filter sync with Tab 2**
   - What we know: Both dropdowns share `activeDeptFilter` state but are rendered independently in static HTML
   - What's unclear: If user selects "Projects" in Tab 1 then switches to Tab 2, the Tab 2 dropdown shows "All Departments" even though the filter is active
   - Recommendation: Accept as acceptable UX for now. The data in Tab 2 is correctly filtered — the dropdown just doesn't visually reflect Tab 1's selection. The plan could add `value="${activeDeptFilter}"` to the select to sync state, but this requires access to module state at render time. The plan should note this as a known limitation.

---

## Sources

### Primary (HIGH confidence)
- `C:/Users/Admin/Roaming/pr-po/app/views/home.js` — full file read; confirmed getDashboardMode(), loadStats(mode), all stat keys, render() branching
- `C:/Users/Admin/Roaming/pr-po/app/views/finance.js` — lines 60-136, 608-725, 1677-1695, 2015-2095 read; confirmed applyFinanceDeptFilter(), renderPOs() filter logic, Tab 2 card-header HTML
- `C:/Users/Admin/Roaming/pr-po/.planning/REQUIREMENTS.md` — full file read; confirmed exact checkbox states and traceability rows
- `C:/Users/Admin/Roaming/pr-po/.planning/v2.3-MILESTONE-AUDIT.md` — full file read; confirmed all gaps identified
- `C:/Users/Admin/Roaming/pr-po/.planning/phases/31-dashboard-integration/31-01-PLAN.md` — full file read; source of truths for VERIFICATION.md
- `C:/Users/Admin/Roaming/pr-po/.planning/phases/31-dashboard-integration/31-01-SUMMARY.md` — full file read; confirms implementation complete, files modified
- `C:/Users/Admin/Roaming/pr-po/.planning/phases/29-mrf-integration/29-VERIFICATION.md` — lines 1-80 read; SEC-08 evidence present, format template
- `C:/Users/Admin/Roaming/pr-po/.planning/phases/28-services-view/28-VERIFICATION.md` — full file read; VERIFICATION.md format reference

### Secondary (MEDIUM confidence)
- `C:/Users/Admin/Roaming/pr-po/.planning/STATE.md` — lines 55-100 read; confirmed Phase 30 and 31 decisions
- `C:/Users/Admin/Roaming/pr-po/.planning/ROADMAP.md` — Phase 34 section; confirmed 2-plan structure and success criteria
- `C:/Users/Admin/Roaming/pr-po/app/views/mrf-form.js` — grep; confirmed department field at line 664, 690
- `C:/Users/Admin/Roaming/pr-po/app/views/procurement.js` — grep; confirmed department field at 4 PR/TR addDoc paths

---

## Metadata

**Confidence breakdown:**
- Phase 31 code evidence: HIGH — read home.js directly, all functions confirmed present with line numbers
- Finance PO filter gap: HIGH — read finance.js directly, gap is exactly one HTML block in render()
- REQUIREMENTS.md current state: HIGH — read file directly, confirmed exact checkbox and traceability states
- SEC-08 evidence: HIGH — confirmed in mrf-form.js, procurement.js, finance.js, and Phase 29 VERIFICATION.md
- DASH-03 handling: HIGH — ROADMAP.md explicitly says "DASH-03 deferred"; traceability already shows N/A

**Research date:** 2026-02-19
**Valid until:** 2026-03-19 (stable codebase, no external dependencies)
