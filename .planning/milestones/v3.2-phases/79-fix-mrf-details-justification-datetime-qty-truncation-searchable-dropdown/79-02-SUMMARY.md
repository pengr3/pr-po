---
phase: 79-fix-mrf-details-justification-datetime-qty-truncation-searchable-dropdown
plan: 02
subsystem: mrf-form
tags: [combobox, ux, searchable-dropdown, vanilla-js]
dependency_graph:
  requires: []
  provides: [searchable-project-service-combobox-in-mrf-form]
  affects: [mrf-form.js]
tech_stack:
  added: []
  patterns: [vanilla-js-combobox, hidden-inputs-for-form-data, module-level-state]
key_files:
  modified:
    - app/views/mrf-form.js
decisions:
  - "Use three hidden inputs (projectServiceValue/Type/Name) to decouple combobox display from form submission logic — preserves existing handleFormSubmit() interface with zero changes to Firestore write path"
  - "window._selectPSOption exposes selectPSOption for inline onmousedown handlers in dynamically generated dropdown HTML"
  - "psShowProjects/psShowServices flags set before loadProjects() call to avoid race condition where synchronous Firestore cache replay could call rebuildPSOptions() before role flags were initialized"
  - "window.escapeHTML used with fallback to raw label string — avoids importing escapeHTML separately since it is already exposed on window by utils.js"
metrics:
  duration: 15m
  completed: "2026-04-27T03:59:44Z"
  tasks_completed: 2
  files_changed: 1
---

# Phase 79 Plan 02: Searchable Project/Service Combobox in MRF Form Summary

Replaced the native `<select id="projectServiceSelect">` in `app/views/mrf-form.js` with a pure vanilla JS searchable combobox — text input with a filtered dropdown overlay backed by three hidden inputs. Zero external dependencies.

## What Was Built

**Combobox markup** (in `render()`):
- `#projectServiceDisplay` — visible text input; user types to filter
- `#projectServiceDropdown` — absolutely-positioned overlay div populated on focus/input
- `#projectServiceValue`, `#projectServiceType`, `#projectServiceName` — hidden inputs that carry the selection through to `handleFormSubmit()`

**JS helpers** (added after `populateServiceDropdown()`):
- `rebuildPSOptions()` — rebuilds the flat `psOptions[]` array from `cachedProjects` + `cachedServices`, applying the same role-based filter as the old optgroup `.hidden` flags
- `renderPSDropdown(filter)` — renders filtered option divs into the dropdown; shows "No results" when empty
- `selectPSOption(value, label, type, name)` — fills display input + hidden inputs, closes dropdown
- `escapeForAttr(str)` — escapes backslashes and single quotes for inline `onmousedown` attribute strings
- `window._selectPSOption` — exposes `selectPSOption` for inline event handlers in dynamic HTML

**init() changes:**
- `psShowProjects`/`psShowServices` set before `loadProjects()` (race-condition-safe)
- focus/input/blur/keydown event listeners wired to `#projectServiceDisplay`
- Escape key closes dropdown without selecting
- 150ms blur delay allows `onmousedown` on options to fire before dropdown hides
- Label and placeholder text adjusted per role (projects-only, services-only, both)

**handleFormSubmit() changes:**
- Reads `selectedType`, `selectedCode`, `selectedName` from hidden inputs instead of the removed native select
- Downstream `projectCode`/`projectName`/`serviceCode`/`serviceName` assignments unchanged

**Reset paths:**
- `resetForm()` — explicitly clears all three hidden inputs + display input after `form.reset()`
- Post-submission `setTimeout` — same clears applied after successful MRF submission

**Removed:**
- `<optgroup id="projectsOptgroup">` and `<optgroup id="servicesOptgroup">` from HTML
- `optgroup.hidden` assignments from `init()`
- `if (!document.getElementById('projectsOptgroup')) return` early-exit guard from `loadProjects()`
- `if (!document.getElementById('servicesOptgroup')) return` early-exit guard from `loadServices()`
- DOM-building loops in `populateProjectDropdown()` and `populateServiceDropdown()` (both now just call `rebuildPSOptions()`)

## Deviations from Plan

None — plan executed exactly as written, with one additional improvement: `psShowProjects`/`psShowServices` flags moved to before `loadProjects()` call (rather than after) to prevent a synchronous Firestore cache replay from calling `rebuildPSOptions()` before role flags were initialized.

## Known Stubs

None — combobox is fully wired. Options populate from live Firestore data via existing `onSnapshot` listeners.

## Self-Check: PASSED

- `app/views/mrf-form.js` modified: confirmed
- commit `ef27988` exists: confirmed
- No remaining references to `projectsOptgroup`, `servicesOptgroup`, or `projectServiceSelect` in `mrf-form.js`
- `app/views/procurement.js` untouched: confirmed (critical constraint met)
