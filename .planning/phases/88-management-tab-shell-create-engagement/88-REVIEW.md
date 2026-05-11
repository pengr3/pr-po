---
phase: 88
status: has_findings
files_reviewed: 11
findings:
  critical: 0
  warning: 2
  info: 1
  total: 3
---

# Phase 88 Code Review

## WR-01 — proposals.js: client label color not reset on type switch back to project

**Severity:** warning
**File:** app/views/proposals.js — handleEngagementTypeChange()
**Confidence:** 92

`handleEngagementTypeChange` sets `clientLabel.style.color = '#ef4444'` (red) when switching to a service type but never clears it when switching back to project. After selecting One-time or Recurring then switching back to Project, the "(optional — clientless project allowed)" label stays red, suggesting a required field when it isn't.

**Fix:** Add `clientLabel.style.color = '';` in the `type === 'project'` branch.

## WR-02 — procurement.js: loadServicesForNewMRF missing Draft filter

**Severity:** warning
**File:** app/views/procurement.js — loadServicesForNewMRF()
**Confidence:** 88

`loadProjects` correctly skips `project_status === 'Draft'` entries so Draft projects don't appear in the procurement MRF dropdown. `loadServicesForNewMRF` has no equivalent guard — Draft services are pushed unconditionally into `cachedServicesForNewMRF`. Result: Draft services appear as selectable MRF targets while Draft projects don't. Asymmetric enforcement of D-05.

**Fix:** Add `if (data.project_status === 'Draft') return;` inside the `snapshot.forEach` callback in `loadServicesForNewMRF`.

## IN-01 — proposals.js: personnel dropdown has no click-outside handler

**Severity:** info
**File:** app/views/proposals.js — init()
**Confidence:** 82

`projects.js` attaches a `mousedown` click-outside handler that hides the personnel dropdown when clicking elsewhere. `proposals.js` omits this — once opened, the dropdown stays visible until a selection is made or input cleared. The handler also needs cleanup in `destroy()`.

**Fix:** Add `document.addEventListener('mousedown', clickOutsideHandler)` in init, save reference as `window._proposalPersonnelClickOutside`, and remove in destroy.

## Clean items

- `engagement-create.js` — service_type forwarding, onAfterCreate callback, edit-history shape all correct.
- `router.js` — /proposals absent from routePermissionMap intentionally; hard gate correctly placed.
- `index.html` — nav link order and data-route match auth.js selectors.
- `auth.js` — proposals override correctly targets both desktop and mobile nav links.
- `projects.js` / `services.js` — Draft in UNIFIED_STATUS_OPTIONS; list views intentionally show Draft (management surface).
- `mrf-form.js` — Both loadProjects and loadServices filter Draft correctly.
- `finance.js` — Draft excluded via return null / .filter(Boolean) (MED-1 confirmed).
- `home.js` — UNIFIED_STATUS_OPTIONS and MONOCHROMATIC_STATUS_COLORS both updated correctly.
