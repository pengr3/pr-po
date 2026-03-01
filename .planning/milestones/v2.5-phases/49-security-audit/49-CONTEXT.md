# Phase 49: Security Audit - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Review client-side code, Firebase Security Rules, and CSP headers for production safety. Identify XSS vectors, authorization gaps, sensitive data exposure, and header misconfigurations — fix all findings. The application must be verified safe for production deployment.

</domain>

<decisions>
## Implementation Decisions

### XSS Remediation
- Create a lightweight `escapeHTML()` utility function in `app/utils.js` — no external library (no DOMPurify)
- Apply `escapeHTML()` to all user-supplied data before innerHTML insertion across all 17 view files (113 innerHTML usages to review)
- No refactoring of inline onclick handlers to addEventListener — out of scope for this audit

### Console Log Cleanup
- Remove all `console.log` and `console.info` statements across the entire app (406 total across 24 files)
- Keep `console.warn` and `console.error` for actionable signals
- Auth module (`app/auth.js`) gets stricter treatment: remove ALL console statements except `console.error` (29 statements, auth is PII-sensitive)
- Firebase error details in `console.error` stay as-is — full details help debugging, only developers see the console

### CSP Hardening
- Moderate CSP level: add `script-src`, `style-src`, `connect-src` directives whitelisting Firebase origins (`gstatic.com`, `firebaseio.com`, `googleapis.com`) and own origin
- Allow `'unsafe-inline'` in `script-src` — required for hundreds of inline onclick handlers
- Add standard security headers alongside CSP: `Referrer-Policy` (no-referrer-when-downgrade), `X-Frame-Options` (DENY), `Permissions-Policy` (restrict camera, mic, geolocation)
- Update BOTH `_headers` and `netlify.toml` to stay in sync

### Findings Documentation
- Create `SECURITY-AUDIT.md` in `.planning/phases/49-security-audit/` documenting all findings
- Include severity ratings: Critical / High / Medium / Low per finding
- Each finding captures: location, description, severity, fix applied
- `invitation_codes` open read/update rules documented as accepted risk (intentional design — codes are random, security is in user approval workflow)

### Claude's Discretion
- eval()/Function() patterns in services.js and projects.js — investigate and apply judgment (remove if risky, document if safe)
- Per-innerHTML decision on textContent vs escapeHTML — use textContent where content is plain text, escapeHTML for mixed HTML content
- Firebase Security Rules audit across all 12 collections — identify and fix any authorization gaps
- Auth edge cases (session expiry, concurrent sessions, role escalation) — review and address gaps found

</decisions>

<specifics>
## Specific Ideas

- Auth module should be the strictest — only console.error allowed, everything else removed
- CSP must not break Firebase SDK loading or Firestore real-time connections
- The audit report should serve as a production-readiness checkpoint before data migration phases (50-52)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/utils.js`: Already contains `formatCurrency`, `validateEmail`, `validatePhone` — natural home for `escapeHTML()`
- `app/auth.js`: Firebase Auth module with role-based access, session management
- `app/permissions.js`: Role permission checks used across views
- `firestore.rules`: Comprehensive Security Rules with helper functions (`isActiveUser()`, `hasRole()`, `isAssignedToProject()`)

### Established Patterns
- innerHTML used for all dynamic content rendering (113 occurrences across 17 files)
- Console logs use prefixed format: `[Router]`, `[Procurement]`, `[Finance]` for module identification
- Security Rules follow consistent template: read for active users, write for specific roles
- Two header config files maintained in parallel: `_headers` and `netlify.toml`

### Integration Points
- `netlify.toml` and `_headers`: Where CSP and security headers are configured for Netlify deployment
- `app/firebase.js`: Firebase config with API key (client-safe, documented)
- All view files import from `utils.js` — adding `escapeHTML()` there requires no new imports
- `firestore.rules`: 12 collection rules + 2 subcollection rules to audit

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 49-security-audit*
*Context gathered: 2026-03-01*
