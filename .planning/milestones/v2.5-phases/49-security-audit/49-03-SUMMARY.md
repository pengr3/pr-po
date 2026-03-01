---
phase: 49-security-audit
plan: 03
subsystem: security
tags: [csp, headers, security-audit, netlify, hardening]

# Dependency graph
requires:
  - phase: 49-security-audit plan 01
    provides: XSS findings (SEC-01, SEC-02)
  - phase: 49-security-audit plan 02
    provides: Firebase Rules and auth findings (SEC-04, SEC-05)
  - phase: 49-security-audit plan 04
    provides: Console log findings (SEC-03)
provides:
  - Hardened CSP with 7 directives whitelisting Firebase CDN origins
  - X-Frame-Options DENY, Referrer-Policy, Permissions-Policy headers
  - netlify.toml and _headers synced with identical header values
  - SECURITY-AUDIT.md — comprehensive report of all Phase 49 findings
affects:
  - All Netlify deployments (CSP applied at CDN edge)
  - Future phases adding external CDN dependencies (must update connect-src/script-src)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CSP whitelisting pattern: wildcard subdomain allowlist (https://*.gstatic.com) for Firebase CDN"
    - "Dual-file header sync: netlify.toml (TOML) and _headers (plain text) must be updated together"
    - "Security header trio: X-Frame-Options + CSP frame-ancestors + Referrer-Policy + Permissions-Policy"

key-files:
  created:
    - .planning/phases/49-security-audit/SECURITY-AUDIT.md
  modified:
    - netlify.toml
    - _headers

key-decisions:
  - "'unsafe-inline' required in script-src — hundreds of inline onclick handlers cannot be refactored in this phase"
  - "CSP applied to /* and /*.html routes only — CSS/JS/image/font routes need no CSP"
  - "netlify.toml and _headers maintained in sync — both serve production traffic depending on deployment config"

patterns-established:
  - "Any future external CDN dependency must be added to both netlify.toml and _headers connect-src/script-src simultaneously"

requirements-completed: [SEC-06]

# Metrics
duration: ~2min
completed: 2026-03-01
---

# Phase 49 Plan 03: CSP Hardening & Security Audit Report Summary

**CSP hardened from single frame-ancestors directive to full 7-directive policy whitelisting Firebase CDN origins; three new security headers added; SECURITY-AUDIT.md documents all 11 Phase 49 findings with severity ratings**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-01T08:44:29Z
- **Completed:** 2026-03-01
- **Tasks:** 2 (C1, C2)
- **Files modified:** 2 (netlify.toml, _headers) + 1 created (SECURITY-AUDIT.md)

## Accomplishments

- Updated CSP in both `netlify.toml` and `_headers` from `frame-ancestors 'self'` to full 7-directive policy:
  - `default-src 'self'` — blocks all unlisted sources
  - `script-src 'self' 'unsafe-inline' https://*.gstatic.com https://*.googleapis.com` — Firebase CDN + inline handlers
  - `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` — Google Fonts + inline styles
  - `connect-src 'self' https://*.firebaseio.com https://*.googleapis.com wss://*.firebaseio.com` — Firestore HTTP + WebSocket
  - `font-src 'self' https://fonts.gstatic.com` — Google Font files
  - `img-src 'self' data: https:` — data URIs + HTTPS images
  - `frame-ancestors 'self'` — preserved from original
- Added three new security headers to `/*` and `/*.html` routes in both files:
  - `X-Frame-Options: DENY` — legacy browser framing prevention
  - `Referrer-Policy: no-referrer-when-downgrade` — controlled referrer exposure
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()` — device API denial
- Created `SECURITY-AUDIT.md` documenting all 11 Phase 49 findings with severity, location, description, fix, and status
- CSS/JS/image/font routes left unchanged (no CSP applied)

## Task Commits

Each task was committed atomically:

1. **Task C1: Harden CSP and add security headers to Netlify config** — `c84abfb` (feat)
2. **Task C2: Create comprehensive security audit report** — `7a6d876` (docs)

## Files Created/Modified

- `netlify.toml` — CSP expanded to 7 directives; X-Frame-Options, Referrer-Policy, Permissions-Policy added for /* and /*.html
- `_headers` — Same updates as netlify.toml, in _headers plain-text format
- `.planning/phases/49-security-audit/SECURITY-AUDIT.md` — 207-line comprehensive audit report

## Decisions Made

- `'unsafe-inline'` included in `script-src` — required for hundreds of inline onclick handlers throughout the SPA. Replacing with nonces would require a substantial refactor; deferred to future phase (documented in SECURITY-AUDIT.md Recommendations).
- CSP applied to `/*` and `/*.html` only — static asset routes (CSS, JS, images, fonts) only need `X-Content-Type-Options` and `Cache-Control`; adding CSP there provides no security benefit.
- Both `netlify.toml` and `_headers` updated — Netlify can use either file depending on build configuration; keeping them in sync ensures headers are applied regardless.

## Deviations from Plan

None — plan executed exactly as written. The SECURITY-AUDIT.md was populated using findings from Plans 01, 02, and 04 SUMMARY files as specified.

## SECURITY-AUDIT.md Finding Summary

| Finding | Severity | Area | Status |
|---------|----------|------|--------|
| Role escalation via Firestore self-update | Critical | SEC-04 | Fixed (3b93daa) |
| XSS in procurement.js innerHTML | High | SEC-01 | Fixed (343cc0a) |
| XSS in finance.js / mrf-records.js | High | SEC-01 | Fixed (343cc0a) |
| XSS in 8 other view files | High | SEC-01 | Fixed (343cc0a) |
| Sensitive data in auth.js console.log/warn | Medium | SEC-03 | Fixed (01353bb) |
| Sensitive data in 22 other app/ files | Medium | SEC-03 | Fixed (01353bb) |
| Weak CSP (frame-ancestors only) | Medium | SEC-06 | Fixed (c84abfb) |
| Missing security headers | Low | SEC-06 | Fixed (c84abfb) |
| Auth listener failure no recovery | Medium | SEC-05 | Fixed (a918027) |
| invitation_codes open read/update rules | Medium | SEC-04 | Accepted Risk |
| firebase.js log at wrong severity | Low | SEC-03 | Fixed (01353bb) |

## Self-Check: PASSED

- FOUND: `netlify.toml` updated with 7-directive CSP and 3 new headers
- FOUND: `_headers` updated with identical values
- FOUND: `.planning/phases/49-security-audit/SECURITY-AUDIT.md` (207 lines)
- FOUND: commit `c84abfb` (Task C1 — CSP hardening)
- FOUND: commit `7a6d876` (Task C2 — SECURITY-AUDIT.md)
- VERIFIED: netlify.toml and _headers have identical CSP values for /* and /*.html
- VERIFIED: CSS/JS/image/font routes have no CSP (unchanged)
- VERIFIED: All 6 SEC areas covered in SECURITY-AUDIT.md
- VERIFIED: All 11 findings have severity, location, description, fix, status
- VERIFIED: invitation_codes accepted risk documented with justification

---
*Phase: 49-security-audit*
*Completed: 2026-03-01*
