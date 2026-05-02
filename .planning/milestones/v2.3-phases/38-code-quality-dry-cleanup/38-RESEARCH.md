# Phase 38: Code Quality & DRY Cleanup - Research

**Researched:** 2026-02-24
**Domain:** Vanilla JS SPA refactoring — function extraction, dead code removal, scoreboard bug fix, audit trail hardening
**Confidence:** HIGH (all findings from direct codebase inspection)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- HTML/UI generators (getMRFLabel, getDeptBadgeHTML, etc.) go to **components.js**
- Data/logic helpers go to **utils.js** — split by type
- **Full audit across ALL view files** (not just finance.js + procurement.js) for duplicate functions
- Old duplicate definitions **removed completely** — no thin wrappers, update all call sites to import from shared module
- **Consolidate duplicate CSS** alongside JS extraction — move shared styles to components.css
- Let the audit discover duplicates; no specific known duplicates beyond getMRFLabel/getDeptBadgeHTML
- Procurement PO Tracking scoreboard shows **global totals only** — no filtered counts
- **Silently global** — no labels or indicators when department filter is active
- Use **current logged-in user's display name** as approver
- Fallback: **use email address** if display name unavailable
- **Store on document**: write `approved_by_name` AND `approved_by_uid` fields to Firestore for audit trail
- **Audit ALL approval flows** for hardcoded names (not just TR approval)
- **Full sweep across ALL view files** for unreachable functions, unused imports, orphaned code
- **Remove dead CSS** rules that no longer have matching HTML
- **Remove commented-out code blocks** — git has the history
- **Audit all user-facing labels/headers** for accuracy (not just the PR-PO Records fix)
- General optimization as opportunities arise during cleanup — no specific performance concerns reported
- **Include Firestore audit**: check for redundant reads, listeners that could be getDocs, missing composite indexes

### Claude's Discretion

- Claude decides per function whether to use ES6 exports + window, or window only, based on how each function is actually called
- Claude picks the cleanest approach (calculate before filter vs separate data source) for scoreboard fix based on current code structure
- Claude checks if other views have the same filter-leaking-into-totals issue and fixes if found
- Claude keeps meaningful prefixed logs ([Router], [Procurement], etc.) and removes raw debug console.log() noise

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

## Summary

Phase 38 is a comprehensive code quality pass targeting five specific tech debt items carried from v2.2 and v2.3 audits. The domain is pure JS SPA refactoring — no new Firebase collections, no new views, no UI features. All changes are internal: extracting shared helpers, fixing a scoreboard data bug, adding audit trail fields to approval writes, and removing dead code.

Direct codebase inspection reveals the current state of each item. `getMRFLabel()` and `getDeptBadgeHTML()` exist identically in both `finance.js` (lines 36-57) and `procurement.js` (lines 17-38) with zero differences — clean extraction candidate. The procurement scoreboard bug is confirmed: `renderPOTrackingTable(pos)` calculates scoreboards from its `pos` parameter, which is pre-filtered when called from `applyPODeptFilter()` — the fix is to use `poData` (module-level full array) for scoreboard calculation. The "hardcoded approver name" is `DOCUMENT_CONFIG.defaultFinancePIC: 'Ma. Thea Angela R. Lacsamana'` in BOTH `finance.js` (line 232) and `procurement.js` (line 4532) — a static fallback used in PO document generation. The `approveTR()` function already uses dynamic `currentUser.full_name || currentUser.email` but does NOT write the `approved_by_name`/`approved_by_uid` fields. The "section header PR-PO Records" item is **already resolved** in the current codebase — procurement.js line 280 already reads "MRF Records".

The full audit scope (all view files, CSS, Firestore patterns) means discovering and fixing additional duplication found during the sweep.

**Primary recommendation:** Treat this as three independent workstreams that can be planned sequentially but use the audit-then-fix pattern within each workstream — scan everything first, then implement, so the plan is data-driven rather than assumption-driven.

## Architecture Patterns

### Current `getMRFLabel()` Definition (identical in both files)

```javascript
// finance.js lines 36-45, procurement.js lines 17-26 — IDENTICAL
function getMRFLabel(doc) {
    if (doc.department === 'services' || (!doc.department && doc.service_code)) {
        return doc.service_code
            ? `${doc.service_code} - ${doc.service_name || 'No service'}`
            : 'No service';
    }
    return doc.project_code
        ? `${doc.project_code} - ${doc.project_name || 'No project'}`
        : (doc.project_name || 'No project');
}
```

### Current `getDeptBadgeHTML()` Definition (identical in both files)

```javascript
// finance.js lines 52-58, procurement.js lines 33-39 — IDENTICAL
function getDeptBadgeHTML(doc) {
    const isServices = doc.department === 'services' || (!doc.department && doc.service_code);
    const label = isServices ? 'Services' : 'Projects';
    const bg    = isServices ? '#ede9fe' : '#dbeafe';
    const color = isServices ? '#6d28d9' : '#1d4ed8';
    return `<span style="background:${bg};color:${color};padding:2px 7px;border-radius:4px;font-size:0.7rem;font-weight:600;white-space:nowrap;">${label}</span>`;
}
```

### Call Sites for getMRFLabel()

**finance.js** — 8 call sites:
- Line 556: `getMRFLabel(po)` (PO document generation)
- Line 1194: `${getDeptBadgeHTML(pr)} ${getMRFLabel(pr)}` (PR table row)
- Line 1247: `${getDeptBadgeHTML(tr)} ${getMRFLabel(tr)}` (TR table row)
- Line 1330: `${getDeptBadgeHTML(pr)} ${getMRFLabel(pr)}` (PR approval modal)
- Line 1463: `${getDeptBadgeHTML(tr)} ${getMRFLabel(tr)}` (TR detail modal)
- Line 2082: `${getDeptBadgeHTML(po)} ${getMRFLabel(po)}` (PO table row)

**procurement.js** — 9 call sites:
- Line 525: `getMRFLabel(po)` (PO tracking table)
- Line 844: `getMRFLabel(mrf)` (MRF card)
- Line 900: `getMRFLabel(mrf)` (MRF card)
- Line 1058: `getMRFLabel(mrf)` (MRF detail)
- Line 2749: `getMRFLabel(mrf)` (MRF records table)
- Line 3833: `${getDeptBadgeHTML(po)} ${getMRFLabel(po)}` (PO tracking table)
- Line 4078: `getMRFLabel(pr)` (PR detail)
- Line 4235: `getMRFLabel(po)` (PO detail)
- Line 4465: `getMRFLabel(mrf)` (timeline description)
- Line 5030: `getMRFLabel(pr)` (PO generation from PR)
- Line 5078: `getMRFLabel(po)` (PO generation)

### Export Pattern to Use (for components.js additions)

These functions are called from template literals inside module functions — never from inline `onclick` handlers. Therefore ES6 `export` only (no `window` registration needed). Both files already import from `../components.js`:

- `finance.js` line 8: `import { showExpenseBreakdownModal } from '../expense-modal.js';`
- `procurement.js` line 9: `import { createStatusBadge, createModal, openModal, closeModal, createTimeline } from '../components.js';`

The import lines need updating to add the new exports.

### Scoreboard Bug — Current Broken Behavior

`renderPOTrackingTable(pos)` receives a potentially-filtered array:

```javascript
// applyPODeptFilter calls with already-filtered array
function applyPODeptFilter(value) {
    activePODeptFilter = value;
    const filtered = activePODeptFilter
        ? poData.filter(po => (po.department || 'projects') === activePODeptFilter)
        : poData;
    renderPOTrackingTable(filtered);  // pos = FILTERED array
}

// renderPOTrackingTable then calculates scoreboards from pos (filtered!)
function renderPOTrackingTable(pos) {
    // WRONG: scoreboards calculated from pos (could be filtered)
    pos.forEach(po => { /* count stats */ });

    // THEN applies filter again for display:
    const displayPos = activePODeptFilter
        ? pos.filter(po => (po.department || 'projects') === activePODeptFilter)
        : pos;
    // ... renders table from displayPos
}
```

### Scoreboard Fix — Correct Pattern

The module-level `poData` variable always holds the complete unfiltered dataset. The fix is to calculate scoreboards from `poData` regardless of what `pos` is passed:

```javascript
function renderPOTrackingTable(pos) {
    // CORRECT: scoreboards always from full poData (global totals)
    poData.forEach(po => { /* count stats for scoreboard */ });

    // Filter for table display:
    const displayPos = activePODeptFilter
        ? pos.filter(po => (po.department || 'projects') === activePODeptFilter)
        : pos;
    // ... renders table from displayPos
}
```

This matches the Phase 30 intent noted in STATE.md:
> "30-02: displayPos pattern — derive filtered array from function param AFTER scoreboard calculation; scoreboards always show global totals from full pos array"

The bug: `renderPOTrackingTable` has a SECOND internal filter at line 3774 (`displayPos`). When called from `applyPODeptFilter`, `pos` is already filtered once, and then filtered again — but the real issue is scoreboards use the already-filtered `pos`.

### Hardcoded Approver Name — Current State

`DOCUMENT_CONFIG.defaultFinancePIC` is defined in BOTH files:

```javascript
// finance.js line 231-240
const DOCUMENT_CONFIG = {
    defaultFinancePIC: 'Ma. Thea Angela R. Lacsamana',
    companyInfo: {
        name: 'C. Lacsamana Management and Construction Corporation',
        address: '133 Pinatubo St. City of Mandaluyong City',
        tel: '09178182993',
        email: 'cgl@consultclm.com',
        logo: '/CLMC Registered Logo Cropped (black fill).png'
    }
};

// Used in PO document generation (finance.js line 565):
FINANCE_APPROVER: po.finance_approver_name || po.finance_approver || DOCUMENT_CONFIG.defaultFinancePIC,

// Same structure in procurement.js line 4531-4535
// Used in procurement.js lines 5087, 5089
```

The `defaultFinancePIC` is the hardcoded fallback. It triggers when PO documents are opened for old POs that don't have `finance_approver_name` on the document. New POs created via `approvePRWithSignature()` DO store `finance_approver_name` dynamically (line 1703).

**For the approveTR() fix:** Currently writes `finance_approver` + `finance_approver_name` + `finance_approver_user_id` dynamically — but does NOT write `approved_by_name` and `approved_by_uid`. Per CONTEXT decisions, the fix adds these two fields.

### Dead Code Status

The ROADMAP and v2.3 audit reference dead `approvePR()` and `generatePOsForPR()` functions in `finance.js`. **These do NOT exist in the current `finance.js`.** They only exist in `finance.js.backup` (the archive backup file). The live `finance.js` has the replacement functions `approvePRWithSignature()` and `generatePOsForPRWithSignature()`.

**Implication:** The dead code item may be a false positive (already cleaned up in a v2.3 phase). The full audit sweep should look for other actual dead code. Candidates to investigate:
- `updatePOScoreboards()` function in procurement.js (lines 2318+) — this is a separate scoreboard updater in the MRF Records tab; distinct from the PO Tracking scoreboard
- `procurement-base.js` — confirmed "not in use" per STRUCTURE.md (331 lines, experimental base class)
- Unused imports in any view file
- Orphaned window function registrations

### Section Header Status

The `PR-PO Records` → `MRF Records` fix is **already done** in the current `procurement.js`:
- Tab nav (line 171): `MRF Records` ✓
- Section HTML comment (line 275): `<!-- MRF Records Section -->` ✓
- Section `<h2>` (line 280): `MRF Records` ✓

This item is already resolved. The audit sweep should verify there are no remaining `PR-PO Records` occurrences in live code (only in `.backup2` and `.planning` markdown files).

## Common Pitfalls

### Pitfall 1: Import Cycle Risk When Adding to components.js

**What goes wrong:** `components.js` already imports from `utils.js` (line 6: `import { formatCurrency, getStatusClass, getUrgencyClass } from './utils.js'`). Adding `getMRFLabel` to `components.js` is safe. Adding to `utils.js` is also safe since `getMRFLabel` has no dependencies on either file.

**How to avoid:** The decision is already locked (HTML generators → components.js). This is safe — no cycle risk because `getMRFLabel` and `getDeptBadgeHTML` have zero dependencies (they only access object properties).

### Pitfall 2: Double-filter Bug Lurking in Scoreboard Fix

**What goes wrong:** `renderPOTrackingTable(pos)` has TWO filter layers: (1) the passed-in `pos` could be pre-filtered by `applyPODeptFilter`, and (2) internally it also has `displayPos = activePODeptFilter ? pos.filter(...) : pos`.

**Fix clarification:** After the fix, the call from `applyPODeptFilter` should pass the UNFILTERED `poData` (or pass the filter separately). The cleanest fix: always call `renderPOTrackingTable(poData)` and handle filtering entirely inside the function using `activePODeptFilter`. This eliminates the double-filter entirely.

```javascript
// Clean approach: always call with full data
function applyPODeptFilter(value) {
    activePODeptFilter = value;
    renderPOTrackingTable(poData);  // always pass full array
}

// Inside renderPOTrackingTable: calculate scoreboards from pos (= poData)
// then derive displayPos via internal filter — single filter point
```

### Pitfall 3: Breaking `window.getMRFLabel` / `window.getDeptBadgeHTML` References

**What goes wrong:** After extraction, any call site that accesses these via `window.` or as implicit globals will break.

**How to avoid:** Grep confirms all call sites use local function calls (no `window.getMRFLabel` or `onclick="getMRFLabel(...)"` patterns). Both are only called from within template literals inside module functions. ES6 named import is sufficient — no window registration needed.

### Pitfall 4: `approveTR` Missing `approved_by_name`/`approved_by_uid` vs. `finance_approver_name`

**What goes wrong:** The function already writes `finance_approver_name` and `finance_approver_user_id`. The additional fields `approved_by_name` and `approved_by_uid` are a new schema addition for audit trail consistency.

**Critical check:** Before adding these fields, verify that other approval flows (approvePRWithSignature, rejection flows) also get the same `approved_by_name`/`approved_by_uid` treatment — the decision says "audit ALL approval flows."

### Pitfall 5: `procurement-base.js` — Do Not Touch

**What goes wrong:** The file exists at `app/views/procurement-base.js` and references "PR-PO Records" in older code. It is NOT loaded by the router.

**How to avoid:** Verify via router.js that `procurement-base.js` is not imported. Leave it alone — it's an artifact, not dead code in the running app. Only router-imported views matter for the sweep.

### Pitfall 6: `defaultFinancePIC` Is a Fallback, Not a Display Bug

**What goes wrong:** Removing or changing `DOCUMENT_CONFIG.defaultFinancePIC` could break PO document rendering for legacy POs that don't have `finance_approver_name` stored.

**How to avoid:** Keep the fallback but make it derive from a better source. Options:
1. Remove hardcoded string, make fallback `po.finance_approver_name || po.finance_approver || 'Finance Approver'`
2. Or remove the DOCUMENT_CONFIG object and inline the companyInfo directly (since it's just company data, not user data)

The CONTEXT says "fix hardcoded approver name" — interpret as removing the personal name literal, not removing the fallback mechanism.

## Code Examples

### Extraction Pattern for components.js

```javascript
// In app/components.js — add at the end of the file, before window.components

/**
 * Returns a display label for a document linked to a project or service.
 * Checks department field first, then falls back to service_code presence.
 * @param {object} doc - MRF, PR, TR, or PO document
 * @returns {string}
 */
export function getMRFLabel(doc) {
    if (doc.department === 'services' || (!doc.department && doc.service_code)) {
        return doc.service_code
            ? `${doc.service_code} - ${doc.service_name || 'No service'}`
            : 'No service';
    }
    return doc.project_code
        ? `${doc.project_code} - ${doc.project_name || 'No project'}`
        : (doc.project_name || 'No project');
}

/**
 * Returns a styled department badge HTML span for a document.
 * @param {object} doc - Document with optional department/service_code fields
 * @returns {string} HTML span string
 */
export function getDeptBadgeHTML(doc) {
    const isServices = doc.department === 'services' || (!doc.department && doc.service_code);
    const label = isServices ? 'Services' : 'Projects';
    const bg    = isServices ? '#ede9fe' : '#dbeafe';
    const color = isServices ? '#6d28d9' : '#1d4ed8';
    return `<span style="background:${bg};color:${color};padding:2px 7px;border-radius:4px;font-size:0.7rem;font-weight:600;white-space:nowrap;">${label}</span>`;
}
```

```javascript
// finance.js — update import line
import { createStatusBadge, createModal, openModal, closeModal, createTimeline, getMRFLabel, getDeptBadgeHTML } from '../components.js';
// Remove local function definitions at lines 36-58

// procurement.js — update import line
import { createStatusBadge, createModal, openModal, closeModal, createTimeline, getMRFLabel, getDeptBadgeHTML } from '../components.js';
// Remove local function definitions at lines 17-39
```

### Scoreboard Fix Pattern

```javascript
// procurement.js — fix applyPODeptFilter
function applyPODeptFilter(value) {
    activePODeptFilter = value;
    renderPOTrackingTable(poData);  // always pass full unfiltered array
}

// procurement.js — fix renderPOTrackingTable scoreboard calculation
function renderPOTrackingTable(pos) {
    // Calculate scoreboards from pos (which is always poData after fix above)
    const materialCounts = { pending: 0, procuring: 0, procured: 0, delivered: 0 };
    const subconCounts = { pending: 0, processing: 0, processed: 0 };

    pos.forEach(po => { /* scoreboard count logic unchanged */ });

    // Apply department filter for display
    const displayPos = activePODeptFilter
        ? pos.filter(po => (po.department || 'projects') === activePODeptFilter)
        : pos;

    // ... rest of table render uses displayPos
}
```

### Approved-by Fields for approveTR()

```javascript
// finance.js approveTR() — add approved_by fields alongside existing finance_approver fields
await updateDoc(trRef, {
    finance_status: 'Approved',
    finance_approver: currentUser.full_name || currentUser.email || 'Finance User',
    finance_approver_user_id: currentUser.uid,
    finance_approver_name: currentUser.full_name || currentUser.email || 'Finance User',
    approved_by_name: currentUser.full_name || currentUser.email || 'Finance User',  // NEW
    approved_by_uid: currentUser.uid,                                                  // NEW
    date_approved: new Date().toISOString().split('T')[0],
    approved_at: new Date().toISOString()
});
```

## Key Findings & Scope Clarifications

### Finding 1: Section Header Already Fixed
The "PR-PO Records → MRF Records" item (success criterion #5) is **already resolved** in the current `procurement.js`. Tab nav, HTML comment, and `<h2>` all read "MRF Records". This item requires only verification, not implementation. During the audit sweep, confirm no remaining `PR-PO Records` in live code files.

### Finding 2: Dead Code Not in Live finance.js
`approvePR()` and `generatePOsForPR()` are ONLY in `finance.js.backup` (the archive backup). The live `finance.js` does not contain them. These are already gone. During the full sweep, look for OTHER dead code (unreachable functions, unused imports, orphaned window registrations).

### Finding 3: DOCUMENT_CONFIG Duplicated in Two Files
`DOCUMENT_CONFIG` with `defaultFinancePIC: 'Ma. Thea Angela R. Lacsamana'` exists identically in both `finance.js` (line 231) and `procurement.js` (line 4531). This is a DRY violation with a hardcoded personal name. The fix should address both files: remove the hardcoded personal name from the fallback. The company info block in DOCUMENT_CONFIG is NOT a code smell (it's static config for document generation) — only the personal name needs to change.

### Finding 4: Finance.js TR Approval Already Dynamic
`approveTR()` at line 1748-1756 already uses `currentUser.full_name || currentUser.email`. The v2.2 tech debt note was about the version in `finance.js.backup` (which used `'Ma. Thea Angela R. Lacsamana'` directly). The remaining work is: add `approved_by_name` + `approved_by_uid` fields to the updateDoc call for audit trail, and audit OTHER approval flows (rejection flows, approvePRWithSignature) for the same fields.

### Finding 5: Full Audit Scope
The CONTEXT decision mandates a comprehensive sweep across ALL view files. This is meaningful work because the codebase has 18 view files (`app/views/`) ranging from small (login.js, register.js) to very large (procurement.js at 5,296 lines, finance.js at 2,146 lines). Other files to audit: `home.js`, `mrf-form.js`, `projects.js`, `project-detail.js`, `services.js`, `service-detail.js`, `admin.js`, `user-management.js`, `clients.js`, `role-config.js`, `service-assignments.js`, `project-assignments.js`.

### Finding 6: Two Plan Structure from ROADMAP
The ROADMAP already defines two plans:
- **38-01**: Extract getMRFLabel()/getDeptBadgeHTML() to components.js + fix procurement scoreboard global totals
- **38-02**: Remove dead code (approvePR/generatePOsForPR) + fix hardcoded approver name + fix section header

Given the clarifications above (dead code already gone, section header already fixed), Plan 38-02 should be reframed as: full dead code sweep + hardcoded approver fix + audit of all approval flows + verify section header (trivial) + CSS/log cleanup.

## Architecture

### File Structure (Affected Files)

```
app/
├── components.js          → ADD: getMRFLabel(), getDeptBadgeHTML() exports
├── views/
│   ├── finance.js         → REMOVE: local getMRFLabel/getDeptBadgeHTML; UPDATE import;
│   │                         ADD: approved_by_name/uid in approveTR;
│   │                         REMOVE: hardcoded 'Ma. Thea Angela R. Lacsamana' in DOCUMENT_CONFIG;
│   │                         SWEEP: dead code, debug logs, unused imports
│   ├── procurement.js     → REMOVE: local getMRFLabel/getDeptBadgeHTML; UPDATE import;
│   │                         FIX: renderPOTrackingTable scoreboard uses poData;
│   │                         FIX: applyPODeptFilter passes poData;
│   │                         REMOVE: hardcoded 'Ma. Thea Angela R. Lacsamana' in DOCUMENT_CONFIG;
│   │                         SWEEP: dead code, debug logs, unused imports
│   └── [16 other views]   → SWEEP: look for duplicates, dead code
styles/
├── components.css          → SWEEP: dead CSS (dept badge uses inline styles — no CSS to add)
└── [other css]             → SWEEP: remove orphaned rules
```

### Audit Checklist for Each View File

When sweeping each view file, check for:
1. Duplicate functions that exist in utils.js or components.js
2. Functions defined but never called
3. `window.X = X` registrations for functions with no HTML call site
4. `import { ... }` with unused names
5. Raw `console.log()` (no prefix) vs prefixed logs like `[Finance]` (keep)
6. Commented-out code blocks (3+ lines)
7. Hardcoded personal names or role-specific strings that should be dynamic

## Open Questions

1. **DOCUMENT_CONFIG company info in procurement.js** — Should `DOCUMENT_CONFIG` be extracted to a shared config module, or just fix the `defaultFinancePIC` personal name in-place in both files?
   - What we know: Both files have identical `companyInfo` blocks with company name, address, etc.
   - What's unclear: Whether the CONTEXT decision "fix hardcoded approver name" implies extracting the whole DOCUMENT_CONFIG to a shared location or just removing the personal name literal
   - Recommendation: Fix in-place (remove the personal name from fallback, keep `companyInfo` where it is). The CONTEXT only mandated `getMRFLabel`/`getDeptBadgeHTML` extraction to components.js — DOCUMENT_CONFIG extraction wasn't called out. Scope creep risk if we also extract DOCUMENT_CONFIG.

2. **updatePOScoreboards() in procurement.js** — This separate scoreboard function (lines 2318+) is called from `loadMRFRecords()` in the MRF Records tab (not the PO Tracking tab). It appears to be intentionally separate (different tab, different data source). Not dead code — but should be verified.
   - What we know: Two scoreboard functions exist — `updatePOScoreboards()` (in records tab) and inline scoreboard logic in `renderPOTrackingTable()` (PO tracking tab)
   - Recommendation: Keep `updatePOScoreboards()` as-is (serves MRF Records tab); only fix `renderPOTrackingTable()` for the PO Tracking tab scoreboard.

3. **`procurement-base.js`** — Not imported by router, confirmed "not in use". Should it be deleted?
   - What we know: 331 lines, experimental, not loaded anywhere
   - Recommendation: Leave for planner to decide whether deletion is in scope. Deleting it is low-risk but the CONTEXT didn't specifically call it out.

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `app/views/finance.js` (2,146 lines) — function definitions at lines 36-58, approveTR at 1722, DOCUMENT_CONFIG at 231, all window registrations verified
- Direct code inspection: `app/views/procurement.js` (5,296 lines) — function definitions at lines 17-39, renderPOTrackingTable at 3724, applyPODeptFilter at 74, DOCUMENT_CONFIG at 4531
- Direct code inspection: `app/components.js` — existing exports, import structure
- `.planning/v2.3-MILESTONE-AUDIT.md` — source of all 7 tech debt items
- `.planning/v2.2-MILESTONE-AUDIT.md` — source of 3 carried tech debt items
- `.planning/phases/38-code-quality-dry-cleanup/38-CONTEXT.md` — locked decisions

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` line 95: "30-02: displayPos pattern — derive filtered array from function param AFTER scoreboard calculation; scoreboards always show global totals from full pos array" — confirms the scoreboard fix intent
- `.planning/ROADMAP.md` lines 492-506 — plan structure for phase 38

## Metadata

**Confidence breakdown:**
- Specific bug locations: HIGH — direct line-by-line inspection
- Fix patterns: HIGH — code structure is clear, patterns are standard
- Scope of "full audit": MEDIUM — 18 view files total; audit may find more or fewer duplicates than expected
- Dead code claims: HIGH — confirmed `approvePR`/`generatePOsForPR` are NOT in live finance.js

**Research date:** 2026-02-24
**Valid until:** Immediately before planning — this is a live codebase, verify line numbers at plan time
