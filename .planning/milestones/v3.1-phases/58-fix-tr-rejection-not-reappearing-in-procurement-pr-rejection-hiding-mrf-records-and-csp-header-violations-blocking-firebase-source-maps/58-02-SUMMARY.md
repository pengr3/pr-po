---
phase: 58-production-bug-fixes
plan: "02"
subsystem: security-headers
tags: [csp, netlify, firebase, security, bug-fix]
dependency_graph:
  requires: []
  provides: [csp-gstatic-connect-src]
  affects: [_headers, netlify.toml]
tech_stack:
  added: []
  patterns: [csp-header-management]
key_files:
  created: []
  modified:
    - _headers
    - netlify.toml
decisions:
  - "Added exact-domain https://www.gstatic.com to connect-src (not wildcard) because source maps come from www.gstatic.com specifically; script-src already uses https://*.gstatic.com which is correct for script loading"
metrics:
  duration: "45s"
  completed: "2026-03-05"
  tasks_completed: 2
  files_modified: 2
---

# Phase 58 Plan 02: CSP gstatic.com Source Map Fix Summary

Fixed CSP connect-src violations by adding https://www.gstatic.com to both Netlify header config files, allowing Firebase SDK source map fetches without browser CSP blocks.

## What Was Done

### Task 1: Add https://www.gstatic.com to connect-src in _headers
- **Commit:** 72479e1
- **File:** `_headers`
- Updated the `/*` CSP header connect-src directive to include `https://www.gstatic.com`
- Updated the `/*.html` CSP header connect-src directive to include `https://www.gstatic.com`
- Both CSP entries now end with `wss://*.firebaseio.com https://www.gstatic.com`

### Task 2: Add https://www.gstatic.com to connect-src in netlify.toml
- **Commit:** 2c79fe4
- **File:** `netlify.toml`
- Updated the `/*` [[headers]] Content-Security-Policy value connect-src to include `https://www.gstatic.com`
- Updated the `/*.html` [[headers]] Content-Security-Policy value connect-src to include `https://www.gstatic.com`
- Both CSP string values now end with `wss://*.firebaseio.com https://www.gstatic.com`

## Verification Results

```
_headers:    2 occurrences of https://www.gstatic.com (one per CSP entry)
netlify.toml: 2 occurrences of https://www.gstatic.com (one per CSP entry)
```

All other CSP directives unchanged. `script-src` still has `https://*.gstatic.com` (wildcard, for script loading). No new directives added.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Use exact domain `https://www.gstatic.com` in connect-src | Source maps are fetched via XHR/fetch from `www.gstatic.com` specifically; connect-src controls fetch/XHR/WebSocket not script loading |
| Keep script-src with `https://*.gstatic.com` wildcard | Script loading from CDN may come from multiple gstatic subdomains; wildcard is appropriate for script-src |

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- `_headers` updated: FOUND
- `netlify.toml` updated: FOUND
- Commit 72479e1: FOUND
- Commit 2c79fe4: FOUND
- grep -c "https://www.gstatic.com" _headers = 2: PASSED
- grep -c "https://www.gstatic.com" netlify.toml = 2: PASSED
