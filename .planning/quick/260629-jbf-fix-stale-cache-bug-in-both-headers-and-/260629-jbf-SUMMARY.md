---
phase: quick-260629-jbf
plan: 01
subsystem: netlify-headers
tags: [cache-control, netlify, headers, stale-cache, quick-fix]
dependency_graph:
  requires: []
  provides: [revalidating-js-css-cache-headers]
  affects: [_headers, netlify.toml]
tech_stack:
  added: []
  patterns: [netlify-headers-two-file-sync]
key_files:
  created: []
  modified:
    - _headers
    - netlify.toml
decisions:
  - "Changed /*.css and /*.js Cache-Control from immutable 1-year to public, max-age=0, must-revalidate to match the existing /* default and enable ETag revalidation on every page load"
metrics:
  duration: "~5 minutes"
  completed: 2026-06-29
---

# Quick Task 260629-jbf: Fix Stale Cache Bug in _headers and netlify.toml

## One-liner

Removed `immutable` from JS/CSS cache rules in both Netlify config files so browsers revalidate modules via ETag on every load instead of serving a year-long stale copy.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | De-immutable JS/CSS cache rules in _headers | 6cd502a | _headers |
| 2 | De-immutable JS/CSS cache rules in netlify.toml | 345bbf8 | netlify.toml |

## Changes Made

### _headers (6cd502a)

`/*.css` and `/*.js` rules changed:
- Before: `Cache-Control: public, max-age=31536000, immutable`
- After: `Cache-Control: public, max-age=0, must-revalidate`

Section comment updated from "cache for 1 year with immutable" to "revalidate on every request". Image rules (/*.jpg, /*.jpeg, /*.png, /*.gif, /*.svg, /*.webp, /*.ico) and font rules (/*.woff, /*.woff2, /*.ttf, /*.eot, /*.otf) left unchanged with `max-age=31536000, immutable`.

### netlify.toml (345bbf8)

`/*.css` and `/*.js` `[[headers]]` blocks changed:
- Before: `Cache-Control = "public, max-age=31536000, immutable"`
- After: `Cache-Control = "public, max-age=0, must-revalidate"`

Section comments updated. Image and font `[[headers]]` blocks (using `/:filename.:ext` with `[headers.match]`) left unchanged.

Both files now declare the identical Cache-Control value for JS/CSS: `public, max-age=0, must-revalidate`.

## Verification

- `_headers`: 12 immutable rules remain (all images and fonts) — dropped by exactly 2 from original 14. `/*.css` and `/*.js` blocks confirmed `public, max-age=0, must-revalidate`.
- `netlify.toml`: `/*.css` and `/*.js` blocks confirmed `public, max-age=0, must-revalidate`. Image/font blocks (`/:filename.:ext`) still carry `max-age=31536000, immutable`.
- Both files declare byte-identical Cache-Control for JS/CSS.
- `index.html`, `app/update-check.js`, and all other files: untouched.
- No build step added. No `?v=` import stamping. Scope held to exactly two files and four rules.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — header-only change, no new network endpoints, auth paths, file access patterns, or schema changes.

## Self-Check: PASSED

- `_headers` exists and contains `public, max-age=0, must-revalidate` for both JS and CSS rules.
- `netlify.toml` exists and contains `public, max-age=0, must-revalidate` for both JS and CSS rules.
- Commits `6cd502a` and `345bbf8` confirmed present in git log.
