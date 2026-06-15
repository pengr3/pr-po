---
phase: quick-260615-odj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [app/views/project-detail.js]
autonomous: false
requirements: [ODJ-01]

must_haves:
  truths:
    - "When the user has edit permission, the project status in the header strip renders as a dropdown, not a static badge"
    - "The dropdown lists all 10 UNIFIED_STATUS_OPTIONS with the project's current status preselected"
    - "A legacy/unmapped status (not in UNIFIED_STATUS_OPTIONS) appears as a selected '(legacy)' option so the user can see and re-stage it"
    - "Choosing a canonical option saves via saveField('project_status', ...) and the project leaves the Legacy bucket on the portfolio"
    - "When the user lacks edit permission, the read-only badge span renders exactly as before"
    - "updateLifecycleBadge no longer corrupts the dropdown by wiping its <option> children"
  artifacts:
    - path: "app/views/project-detail.js"
      provides: "Permission-gated editable status dropdown in header strip + select-aware updateLifecycleBadge"
      contains: "hdrStatusSelect"
  key_links:
    - from: "hdrStatusSelect <select> onchange"
      to: "window.saveField('project_status', ...)"
      via: "onchange handler"
      pattern: "saveField\\('project_status'"
    - from: "updateLifecycleBadge"
      to: "hdrStatusSelect"
      via: "set .value when select exists, skip textContent"
      pattern: "hdrStatusSelect"
---

<objective>
Make the project status editable from the project DETAIL header strip via a permission-gated dropdown, so legacy/unmapped projects (and any project) can be re-staged onto a canonical status.

Purpose: `UNIFIED_STATUS_OPTIONS` exists but is unused — the status renders only as a display-only badge, so legacy projects with non-canonical `project_status` values are stranded in the portfolio's Legacy bucket with no UI to migrate them.
Output: An inline `<select>` (when the user can edit) wired to the existing `saveField('project_status', ...)` path, plus a fix to `updateLifecycleBadge` so it does not destroy the select's options.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<interfaces>
<!-- All identifiers verified in app/views/project-detail.js. Line numbers drift — match by identifier. -->

UNIFIED_STATUS_OPTIONS (~L64) — 10 canonical statuses:
  'For Inspection', 'For Proposal', 'Proposal for Internal Approval',
  'Proposal Under Client Review', 'For Revision', 'Client Approved',
  'For Mobilization', 'On-going', 'Completed', 'Loss'

_getProjectStatusColor(status) (~L94) — returns hex; falls back to '#64748b' (grey) for any unmapped/legacy status.

Header strip badge (~L632), currently a static span gated nowhere (always rendered):
  <span id="hdrStatusBadge" class="hdr-status"
    style="background:${_getProjectStatusColor(currentProject.project_status || '')};color:white;padding:0.3rem 0.85rem;border-radius:20px;font-size:0.82rem;font-weight:600;">${escapeHTML(currentProject.project_status || '—')}</span>

showEditControls — boolean already in scope in render(), used to disable .detail-field inputs (e.g. ~L654 `${!showEditControls ? 'disabled' : ''}`). Reuse it to gate the dropdown.

saveField(fieldName, newValue) (~L1627) — already on window (`window.saveField = saveField` ~L3631). Already handles 'project_status': stamps status_changed_at, updateDoc write, edit history, NOTIF-11. No project_status validation branch — any canonical value saves cleanly. Re-checks permission internally and no-ops if value unchanged. The write triggers onSnapshot → full header re-render, so the select rebuilds with the new value preselected.

updateLifecycleBadge(project) (~L2756) — the in-place fast-path. THE GOTCHA at ~L2767-2771:
  const hdrBadge = document.getElementById('hdrStatusBadge');
  if (hdrBadge) {
      hdrBadge.style.background = color;
      hdrBadge.textContent = status;   // wipes a <select>'s <option> children
  }
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Render permission-gated status dropdown + make updateLifecycleBadge select-aware</name>
  <files>app/views/project-detail.js</files>
  <action>
Two coordinated edits in app/views/project-detail.js (ODJ-01). Make NO other changes; do not touch service-detail.js or the lifecycle gate buttons.

EDIT 1 — Header strip status control (~L632, the `hdrStatusBadge` span).
Replace the single static badge span with a conditional on `showEditControls`:

- When `showEditControls` is FALSE: render the EXISTING read-only span exactly as it is today — keep `id="hdrStatusBadge"`, `class="hdr-status"`, the same inline style using `_getProjectStatusColor(currentProject.project_status || '')`, and the same `escapeHTML(currentProject.project_status || '—')` text. Do not alter this path.

- When `showEditControls` is TRUE: render a compact `<select id="hdrStatusSelect">` styled inline to sit in the badge/code row (compact: e.g. font-size:0.82rem; padding:0.3rem 0.5rem; border-radius:8px; border:1px solid #cbd5e1; background:white; color:#1e293b; font-weight:600; cursor:pointer). Use inline styles only — no CSS tokens. The `<select>` MUST use the distinct id `hdrStatusSelect` (NOT `hdrStatusBadge`) so updateLifecycleBadge's textContent path never targets it.
  - onchange: `onchange="window.saveField('project_status', this.value)"`.
  - Build options from UNIFIED_STATUS_OPTIONS. Mark the option whose value === currentProject.project_status as `selected`. escapeHTML each option label/value.
  - LEGACY handling: compute `const _isLegacy = currentProject.project_status && !UNIFIED_STATUS_OPTIONS.includes(currentProject.project_status);`. If `_isLegacy`, PREPEND one extra `<option selected value="${escapeHTML(currentProject.project_status)}">${escapeHTML(currentProject.project_status)} (legacy)</option>` so the real current legacy value is visible AND selected. (Picking any canonical option then fires saveField and migrates the project out of the Legacy bucket.) When `_isLegacy`, do not also mark a canonical option selected.
  - When `project_status` is falsy/empty and not legacy: leave all options unselected (browser shows the first) — acceptable, matches the '—' empty state. Optionally prepend a disabled placeholder `<option value="" disabled selected>—</option>` for clarity; keep it disabled so it cannot be saved.

EDIT 2 — updateLifecycleBadge (~L2767-2771), the `hdrBadge` block.
Make it select-aware so the in-place fast-path never corrupts the dropdown:
  - Look up the editable select first: `const hdrSelect = document.getElementById('hdrStatusSelect');`
  - If `hdrSelect` exists: set `hdrSelect.value = status;` and do NOT touch its textContent or children. (If `status` is not among its options because it's a not-yet-known value, leaving .value unset is harmless — the subsequent onSnapshot re-render rebuilds the select authoritatively.)
  - Else if the read-only span `hdrStatusBadge` exists: keep the existing behavior (set `.style.background = color` and `.textContent = status`).
  Leave the rest of updateLifecycleBadge (lcCurBadge, accordion classes, action hint) unchanged.

Notes:
- saveField already gates permission, stamps status_changed_at, records history, and fires NOTIF-11 — do not duplicate any of that.
- Status matching is case-sensitive; compare values exactly.
  </action>
  <verify>
    <automated>node -e "const s=require('fs').readFileSync('app/views/project-detail.js','utf8'); const checks=[/id=\"hdrStatusSelect\"/, /saveField\('project_status', this\.value\)/, /\(legacy\)/, /const hdrSelect = document\.getElementById\('hdrStatusSelect'\)/]; const miss=checks.filter(r=>!r.test(s)); if(miss.length){console.error('MISSING:',miss.map(r=>r.source));process.exit(1);} console.log('OK: dropdown, onchange, legacy option, select-aware badge present');"</automated>
  </verify>
  <done>The header status renders as `<select id="hdrStatusSelect">` when showEditControls is true (read-only span unchanged when false); options come from UNIFIED_STATUS_OPTIONS with current value preselected; a legacy status appears as a selected '(legacy)' option; onchange calls window.saveField('project_status', this.value); updateLifecycleBadge sets the select's .value instead of wiping its options.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>A permission-gated editable status dropdown in the project DETAIL header strip, wired to the existing saveField('project_status') path, with legacy-value support and a fix so the lifecycle fast-path no longer corrupts the dropdown.</what-built>
  <how-to-verify>
This repo has no automated tests — verify in the browser against dev Firebase (clmc-procurement-dev). There are 5 seeded legacy projects in dev: codes CLMC-LEGACY-001..005 with project_status values Active, Won, In Progress, On Hold, Cancelled.

1. Start the server: `python -m http.server 8000`, open http://localhost:8000 in the browser, sign in with an account that HAS project edit permission.
2. Go to `#/projects` → click "Browse All" → find the "Legacy" group → open project CLMC-LEGACY-001.
3. In the header strip (badge · code · status row), confirm the status now shows a DROPDOWN (not a static badge). Confirm its currently-selected option reads the project's real legacy value with a "(legacy)" suffix (e.g. "Active (legacy)").
4. Open the dropdown — confirm all 10 canonical options are listed (For Inspection … Loss).
5. Select "On-going". Confirm: a success toast/no error appears, the dropdown now shows "On-going", and there is NO console error.
6. Navigate back to `#/projects` → "Browse All". Confirm CLMC-LEGACY-001 has LEFT the Legacy bucket (it now appears under its canonical/On-going grouping). The legacy "(legacy)" option should no longer appear when you reopen the project.
7. Lifecycle fast-path check: still in the project detail, expand the Lifecycle accordion and advance a stage (or change status again). Confirm the header dropdown still works and its options are NOT wiped (open it — all options still present), and its value reflects the new status. No console errors.
8. Permission check: sign in (or use an account) WITHOUT project edit permission, open any project. Confirm the status renders as the read-only badge span exactly as before (no dropdown), and other fields are disabled as usual.
  </how-to-verify>
  <resume-signal>Type "approved" if all steps pass, or describe any issue (e.g. dropdown options wiped after lifecycle change, project still in Legacy bucket, dropdown visible without edit permission).</resume-signal>
</task>

</tasks>

<verification>
- `node` grep gate passes (dropdown id, onchange, legacy option, select-aware updateLifecycleBadge all present).
- Manual browser UAT checkpoint passes all 8 steps against dev Firebase using the seeded CLMC-LEGACY-00x projects.
</verification>

<success_criteria>
- Editable status dropdown renders in the header strip only when showEditControls is true; read-only badge unchanged otherwise.
- Legacy/unmapped status values are visible and selectable, and re-staging to a canonical value moves the project out of the Legacy bucket.
- updateLifecycleBadge no longer destroys the dropdown's options.
- No changes outside app/views/project-detail.js. service-detail.js has the identical gap and is a known follow-up (out of scope).
</success_criteria>

<output>
Create `.planning/quick/260615-odj-editable-project-status-dropdown-on-deta/260615-odj-SUMMARY.md` when done.
</output>
