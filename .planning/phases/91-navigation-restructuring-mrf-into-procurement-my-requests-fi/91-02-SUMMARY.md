---
phase: 91-navigation-restructuring-mrf-into-procurement-my-requests-fi
plan: "02"
subsystem: router-nav
tags: [routing, navigation, redirect, backward-compat]
dependency_graph:
  requires: [91-01]
  provides: [retired-mrf-form-route, procurement-request-default-tab, mrf-form-redirect]
  affects: [app/router.js, index.html]
tech_stack:
  added: []
  patterns: [hash-redirect, routePermissionMap-cleanup, defaultTab-change]
key_files:
  created: []
  modified:
    - app/router.js
    - index.html
decisions:
  - "Removed /mrf-form entry from routePermissionMap (line 17) — key is no longer valid after route retirement"
  - "Removed entire /mrf-form route block from routes object — Material Request route fully retired"
  - "Changed /procurement defaultTab from 'mrfs' to 'request' — D-01: all roles default to Request sub-tab"
  - "Added path === '/mrf-form' redirect branch in both handleHashChange() and handleInitialRoute() targeting navigate('/procurement', 'request') — backward-compat for bookmarks and shared links"
  - "mrf-form.js view module NOT deleted — Plan 03 delegates to its render()/init()/destroy() exports"
metrics:
  duration_minutes: 3
  completed_date: "2026-05-13"
  tasks_completed: 2
  files_modified: 2
---

# Phase 91 Plan 02: Router and Nav Cleanup — Retire #/mrf-form Summary

**One-liner:** Retired standalone `#/mrf-form` route from nav and router; backward-compat redirect to `#/procurement/request`; procurement defaultTab changed from `mrfs` to `request`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Remove Material Request nav links from desktop and mobile nav | 17012fe | index.html |
| 2 | Update router.js — remove /mrf-form route, add redirect, change procurement defaultTab | 89641be | app/router.js |

## What Was Built

### Task 1 — index.html nav cleanup
- Deleted `<a href="#/mrf-form" class="nav-link" data-route="mrf_form">Material Request</a>` from desktop `.nav-links`
- Deleted `<a href="#/mrf-form" class="mobile-nav-item" data-route="mrf_form" ...>Material Request</a>` from mobile `.mobile-nav-items`
- Zero other nav items disturbed; Procurement link remains in both desktop and mobile with `data-route="procurement"`

### Task 2 — router.js changes
1. **routePermissionMap** — removed `'/mrf-form': 'mrf_form'` entry
2. **routes object** — removed entire `/mrf-form` block (name: 'Material Request', load: mrf-form.js, defaultTab: 'form')
3. **procurement defaultTab** — changed from `'mrfs'` to `'request'`
4. **handleHashChange() redirect** — added branch before final `navigate(path, tab)` call:
   ```javascript
   // Phase 91 — #/mrf-form is retired; redirect to #/procurement/request
   if (path === '/mrf-form') { navigate('/procurement', 'request'); return; }
   ```
5. **handleInitialRoute() redirect** — mirrored same branch in the `else if` chain with same Phase 91 comment

## Deviations from Plan

None — plan executed exactly as written. All 5 automated verification checks passed on first run.

## Known Stubs

None. This plan makes no stub changes — it only removes nav links and routes, and adds a redirect.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. The `/mrf-form` redirect is purely client-side hash routing — T-91.2-02, T-91.2-03, T-91.2-04, T-91.2-05 dispositions verified:
- T-91.2-02 (hand-edited sub-path): `path === '/mrf-form'` matches on first path segment only; any `/mrf-form/x/y` collapses to same redirect target.
- T-91.2-03 (redirect loop): Impossible — `/procurement` route is a known-good route with defaultTab: 'request'.
- T-91.2-04 (unauthenticated redirect): `/procurement` retains its `'procurement'` permission key; existing auth guard in `navigate()` still fires.
- T-91.2-05 (orphaned half-nav): Verified — zero `data-route="mrf_form"` anchors across full `index.html`.

## Self-Check: PASSED

- `app/router.js` modified: FOUND
- `index.html` modified: FOUND
- Commit 17012fe exists: FOUND
- Commit 89641be exists: FOUND
- `app/views/mrf-form.js` still exists: FOUND
