# Phase 114: Observability Foundation — Pattern Map

**Mapped:** 2026-08-12
**Files analyzed:** 7 (2 new, 5 modified)
**Analogs found:** 7 / 7

**Stack constraint carried forward:** no build step, no bundler, no linter, no test runner. Every
constant below is hand-maintained; do not propose an analog that assumes tooling (npm scripts,
webpack config, ESLint config, etc. do not exist in this repo).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|---------------|
| `lib/obs.min.js` | vendor/config (committed binary-ish asset) | none (static asset) | `lib/signature_pad.umd.min.js` | exact |
| `app/sentry-init.js` | config/service (classic script, not ESM) | event-driven (SDK init + scrub hooks) | `app/firebase.js` (dual-config pattern) + `app/notifications.js` (guarded `window.*` debug global) | role-match (composite) |
| `index.html` (`<head>` edit) | config (markup) | none | `index.html:14-22` (existing pinned `<script>`/`<link>` block) | exact |
| `netlify.toml` (CSP edit) | config | request-response (HTTP headers) | Phase 58 Plan 02 precedent (`netlify.toml` CSP `connect-src` edit) | exact |
| `_headers` (CSP edit) | config | request-response (HTTP headers) | Phase 58 Plan 02 precedent (`_headers` CSP `connect-src` edit) | exact |
| `HEADERS-README.md` (D-18 addition) | docs | none | `HEADERS-README.md` own "Testing" section (existing verification-procedure style) | exact |
| `CLAUDE.md` (D-07 note) | docs | none | `CLAUDE.md` "Important Notes" / "Tech Stack" bullet style | role-match |

## Pattern Assignments

### `lib/obs.min.js` (vendor asset)

**Analog:** `lib/signature_pad.umd.min.js`

**What it is:** a single committed, pre-built, minified UMD/classic-script bundle with no project
code inside it — the library's own build output, checked in verbatim. `lib/` currently contains
exactly one file:

```
$ ls -la lib/
signature_pad.umd.min.js   12,734 bytes
```

**Version-banner convention inside the vendor file itself** (`lib/signature_pad.umd.min.js:1-3`,
this is the *library's* own header comment, not something the project added):
```javascript
/*!
 * Signature Pad v5.0.3 | https://github.com/szimek/signature_pad
 * (c) 2024 Szymon Nowak | Released under the MIT license
```
Sentry's official browser CDN bundle ships an equivalent top-of-file banner (`/*! @sentry/browser
7.x.x ... */` or similar depending on version) — **do not strip it**; it is the in-repo evidence of
which build was pinned, useful the day someone has to eyeball-diff after a re-download.

**How it is loaded** (`index.html:17-18`):
```html
<!-- Signature capture library (self-hosted to avoid CDN tracking-prevention warnings) -->
<script src="lib/signature_pad.umd.min.js"></script>
```

**Key structural fact:** the signature_pad comment carries a *rationale* ("self-hosted to avoid CDN
tracking-prevention warnings") but **no version-pin comment** — that convention belongs to the CDN
`<script>` tags (see next section), because `lib/` files have no CDN URL to pin against; the pin
lives in whatever process re-downloads the file, not in the tag. `lib/obs.min.js` should follow
this exact shape: a rationale comment, no inline version number in the HTML comment (the version
lives in the vendor file's own banner + wherever D-07's CLAUDE.md note records the pinned version).

---

### `index.html` `<head>` edit — two new classic `<script>` tags

**Analog:** `index.html:9-23` (full existing head block, read in one pass)

**Full existing pattern to extend** (verbatim, `index.html:9-23`):
```html
    <!-- CSS Files -->
    <link rel="stylesheet" href="styles/main.css">
    <link rel="stylesheet" href="styles/components.css">
    <link rel="stylesheet" href="styles/views.css">
    <link rel="stylesheet" href="styles/hero.css">
    <!-- Frappe Gantt (Phase 86) — pinned to v1.2.2; powers the project plan view -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/frappe-gantt@1.2.2/dist/frappe-gantt.css">

    <!-- Signature capture library (self-hosted to avoid CDN tracking-prevention warnings) -->
    <script src="lib/signature_pad.umd.min.js"></script>
    <!-- Chart.js (Phase 77.1) — pinned to v4.4.7 for home page status breakdown charts -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
    <!-- Frappe Gantt (Phase 86) — pinned to v1.2.2; expose window.Gantt for app/views/project-plan.js -->
    <script src="https://cdn.jsdelivr.net/npm/frappe-gantt@1.2.2/dist/frappe-gantt.umd.js"></script>
</head>
```

**Version-pin comment convention** (the shape D-06 says `lib/obs.min.js`'s comment must follow):
`<!-- LibraryName (PhaseNN) — pinned to vX.Y.Z; <why> -->` — phase reference, exact semver, one-line
rationale, all on the comment line directly above the `<script>` tag.

**Insertion point:** immediately after line 22 (Frappe Gantt classic script) and before line 23
(`</head>`) — i.e., last in the classic-script sequence, still before the `<script type="module">`
block which begins at `index.html:250`. Two new tags, in order: `lib/obs.min.js` (classic, vendor
bundle) → `app/sentry-init.js` (classic, config/init) — matching D-08's specified load order.

**Module bootstrap block for context** (`index.html:249-256`, read to confirm nothing there needs
touching this phase per D-09):
```html
    <!-- Load Firebase and Initialize App -->
    <script type="module">
        // Import Firebase service (initializes Firebase)
        import './app/firebase.js';

        // Client diagnostics — passive evidence capture (registers window.logDiag
        // BEFORE auth/router run so their failure paths can record events).
        import { initDiagnostics } from './app/diagnostics.js';
```
`app/sentry-init.js` runs as a classic script *before* this block executes, so `Sentry.init()` is
guaranteed to be live before the first `import './app/firebase.js'` runs — matching the project's
existing "capture failures from the earliest possible point" pattern already used for
`initDiagnostics()`.

---

### `app/sentry-init.js` (new classic script — NOT an ES module)

No single existing file is both (a) a classic non-module script and (b) a config+init pattern with
env-derived branching and a guarded debug global. Compose from three analogs:

**1. Env-derivation pattern to extend** — `app/firebase.js:59` (D-14 extends this, not a parallel
mechanism):
```javascript
// Runtime environment detection
const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
```
D-14's three-value version needs a second check (exact production hostname vs. any other
`*.netlify.app`) layered on top of this same `window.location.hostname` read — same variable name
convention (`isLocal`), same single-line derivation style, no helper module.

**2. Dual-config-by-environment shape** — `app/firebase.js:68-86`:
```javascript
const prodConfig = {
    apiKey: "AIzaSyAlHcmPmkCk6CKsRbfpHpCheHb2GcLz0Oc",
    authDomain: "clmc-procurement.firebaseapp.com",
    projectId: "clmc-procurement",
    storageBucket: "clmc-procurement.firebasestorage.app",
    messagingSenderId: "946184501660",
    appId: "1:946184501660:web:6559c5de405e72100ab059"
};

const devConfig = {
    apiKey: "AIzaSyB1x47298azJBQr4dN4fqmqtepsh5mMsN0",
    authDomain: "clmc-procurement-dev.firebaseapp.com",
    projectId: "clmc-procurement-dev",
    storageBucket: "clmc-procurement-dev.firebasestorage.app",
    messagingSenderId: "1723100020",
    appId: "1:1723100020:web:d3a809d280720943f35a21"
};

const firebaseConfig = isLocal ? devConfig : prodConfig;
```
Shape to mirror for `environment`: compute the branch value as a plain `const`, ternary/if-chain off
the hostname check, no external config file. Note this file uses `initializeApp(firebaseConfig)`
right after — `Sentry.init({ dsn, release, environment, beforeSend, beforeBreadcrumb, ... })` is the
equivalent call for `app/sentry-init.js`, called once at module-evaluation time (this file runs top
to bottom exactly like `firebase.js` does today).

**3. Guarded debug-global pattern** — `app/notifications.js:689-724` (the `__createTestNotification`
precedent named in CONTEXT.md, found and read in full):
```javascript
/* ========================================
   DEV-ONLY TEST WRITER (Claude's Discretion)
   Gated by isLocal — never available in production.
   Mirrors the dev-banner gating pattern from app/firebase.js:91-99.
   Plan 05 uses this for UAT without waiting for Phase 84 triggers.

   Usage (DevTools console on localhost):
     await window.__createTestNotification()
     await window.__createTestNotification({ type: 'MRF_REJECTED', message: 'Custom msg', link: '#/procurement/mrfs' })
   ======================================== */

const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
if (isLocal) {
    /**
     * Dev-only: write a test notification for the currently signed-in user.
     * @param {object} [overrides] - Override any field
     */
    window.__createTestNotification = async (overrides = {}) => {
        const user = window.getCurrentUser?.();
        if (!user?.uid) { console.error('[Notifications] Not signed in'); return null; }
        return createNotification({ /* ...defaults... */ });
    };
}
```
**Critical divergence for `window.__sentryTest()` (D-16):** this precedent gates the global behind
`if (isLocal)` so it does not exist in production at all. D-16 explicitly requires the *opposite* —
`window.__sentryTest()` must be registered **unconditionally** (or gated some other way that still
allows production), because OBS-06 needs it callable from DevTools in production. Keep the doc-block
comment style and the "registered as a plain function assignment on `window`" mechanic; drop the
`if (isLocal)` wrapper itself. A guard is still appropriate (e.g., confirm `window.Sentry` exists
before calling `captureException`), just not an environment guard.

**Section-header comment convention to use throughout** (`.planning/codebase/CONVENTIONS.md:41-53`,
already the file-header style every module in this repo uses):
```javascript
/* ========================================
   SECTION NAME
   ======================================== */
```
4-space indentation, no semicolon-less style anywhere in the codebase (semicolons used
consistently), named `const`/`function` declarations, no arrow-function-only style mandate (both
appear across the codebase — `notifications.js` above uses an arrow for the debug global).

**Error/console-prefix convention** (`.planning/codebase/CONVENTIONS.md:140-150`, and confirmed live
at `app/firebase.js:111`, `app/diagnostics.js:87/95/112`):
```javascript
console.error('[Firebase] purgeStoragePrefix failed for', prefix, e);
```
`app/sentry-init.js` should log its own init failures (e.g., Sentry bundle blocked by an ad-blocker
or CSP — the OBS-03 degradation path) with a `[Sentry]` or `[SentryInit]` prefix, consistent with
`[Router]`, `[Procurement]`, `[CLMC-DIAG]`, `[Firebase]`, `[Notifications]`.

---

### `netlify.toml` CSP edit (2 of 4 occurrences)

**Analog — exact same task shape, already done once:**
`.planning/milestones/v3.1-phases/58-fix-tr-rejection-not-reappearing-in-procurement-pr-rejection-hiding-mrf-records-and-csp-header-violations-blocking-firebase-source-maps/58-02-SUMMARY.md`
— Phase 58 Plan 02 added `https://www.gstatic.com` to `connect-src` in **both** `_headers` and
`netlify.toml`, at **both** the `/*` and `/*.html` occurrences, as two atomic commits (one per
file), verified with `grep -c`. Directly reusable task structure:
- Task 1: edit `_headers` (both occurrences), commit.
- Task 2: edit `netlify.toml` (both occurrences), commit.
- Verification: `grep -c "<new-directive-value>" _headers` and `grep -c "<new-directive-value>"
  netlify.toml` must equal the occurrence count (2 each).

**Current live CSP string, `/*` block** (`netlify.toml:12`, verbatim):
```
Content-Security-Policy = "default-src 'self'; script-src 'self' 'unsafe-inline' https://*.gstatic.com https://*.googleapis.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com wss://*.firebaseio.com https://www.gstatic.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; frame-ancestors 'self'"
```

**Current live CSP string, `/*.html` block** (`netlify.toml:24`, byte-identical to the `/*` block's
CSP value):
```
Content-Security-Policy = "default-src 'self'; script-src 'self' 'unsafe-inline' https://*.gstatic.com https://*.googleapis.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com wss://*.firebaseio.com https://www.gstatic.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; frame-ancestors 'self'"
```

**Edit required:** add the Sentry ingest host to `connect-src` (exact form deferred to Claude's
Discretion per CONTEXT.md — narrowest form that works, derived from the real DSN at D-17's gate). No
other directive needs touching — `script-src` does not need a new source because `lib/obs.min.js`
is same-origin (`'self'` already covers it); only `connect-src` needs the new host for the SDK's
outbound `POST` to Sentry's ingest endpoint.

---

### `_headers` CSP edit (2 of 4 occurrences)

**Analog:** same Phase 58 Plan 02 precedent as `netlify.toml` above — this project always edits
`_headers` and `netlify.toml` together, in the same commit or immediately adjacent commits, because
of the byte-identical invariant.

**Current live CSP string, `/*` block** (`_headers:11`, verbatim):
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://*.gstatic.com https://*.googleapis.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com wss://*.firebaseio.com https://www.gstatic.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; frame-ancestors 'self'
```

**Current live CSP string, `/*.html` block** (`_headers:23`, byte-identical to the `/*` block's CSP
value):
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://*.gstatic.com https://*.googleapis.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com wss://*.firebaseio.com https://www.gstatic.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; frame-ancestors 'self'
```

**Format difference from `netlify.toml` to preserve:** `_headers` uses bare `Directive: value` lines
(no TOML quoting, `:` not `=`), `netlify.toml` uses `Content-Security-Policy = "..."` inside a
`[headers.values]` TOML table. The CSP *string content* must stay byte-identical between the two
files even though the surrounding syntax differs — this is the "byte-identical invariant" the
CONTEXT.md canonical refs call out.

---

### `HEADERS-README.md` (D-18 — two recurring verification procedures)

**Analog:** the file's own existing "Testing" section (`HEADERS-README.md:61-77`), which is already
the durable-doc home for a manual verification procedure:
```markdown
## Testing

After deploying, verify the headers are working:

1. Open your site in Chrome/Firefox
2. Open DevTools (F12)
3. Go to Network tab
4. Reload the page
5. Click on `finance.html`
6. Check "Headers" section - you should see:
   - `cache-control: no-cache, must-revalidate, max-age=0`
   - `x-content-type-options: nosniff`
   - `content-security-policy: frame-ancestors 'self'`
   - No `x-xss-protection` or `x-frame-options`

7. Click on any .css or .js file - you should see:
   - `cache-control: public, max-age=31536000, immutable`
```
Same numbered-steps, DevTools-driven style should be used for D-18's two additions:
(a) the `curl -I` command that reads back the live CSP header and resolves `netlify.toml` vs.
`_headers` precedence (the ambiguity flagged in `.planning/research/SUMMARY.md:184`: "Netlify's own
documentation does not define precedence... resolve empirically per deploy"),
(b) DevTools request-blocking steps to simulate a blocked `lib/obs.min.js` and verify OBS-03's
degradation path. Add as a new `## Verifying Sentry / CSP Changes` section (or extend `## Testing`)
— follow the existing numbered-list-with-code-ticks format, do not introduce a new doc style.

---

### `CLAUDE.md` (D-07 — note naming what `lib/obs.min.js` actually is)

**No direct in-repo precedent** — `CLAUDE.md` currently has no mention of `lib/` or
`signature_pad.umd.min.js` at all (confirmed by search — zero matches). This is itself useful
information: the project's `CLAUDE.md` documents *behavioral* patterns (SPA structure, Firestore
schema, workflow) rather than cataloguing every vendor file, so D-07's note should be a small,
single addition, not a new section.

**Style to match** — existing bullet-point convention under "Important Notes" (`CLAUDE.md`, already
in context):
```markdown
## Important Notes

- **Firebase**: Config in `app/firebase.js` (client-safe, no .env)
- **Security**: CSP headers configured, see HEADERS-README.md
- **Archive**: Reference only - DO NOT EDIT
```
Add one bullet in this same `**Label**: sentence.` shape, e.g. `**lib/obs.min.js**: self-hosted
Sentry browser SDK bundle (obscured filename — see D-07 in Phase 114 CONTEXT for rationale).`

---

## Shared Patterns

### Version-pin comment convention (D-06)
**Source:** `index.html:14,19,21` (three live examples: Frappe Gantt CSS, Chart.js, Frappe Gantt JS)
**Apply to:** the new `lib/obs.min.js` `<script>` tag in `index.html`
```html
<!-- Chart.js (Phase 77.1) — pinned to v4.4.7 for home page status breakdown charts -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
```
Shape: `<!-- LibraryName (PhaseNN) — pinned to vX.Y.Z; <one-line why> -->` directly above the tag.

### Self-hosted vendor file convention (D-07, OBS-01)
**Source:** `lib/signature_pad.umd.min.js` + `index.html:17-18`
**Apply to:** `lib/obs.min.js`
```html
<!-- Signature capture library (self-hosted to avoid CDN tracking-prevention warnings) -->
<script src="lib/signature_pad.umd.min.js"></script>
```
One committed file in `lib/`, one classic `<script src="lib/...">` tag, rationale comment stating
*why* it's self-hosted rather than a version pin (the pin, per D-06, is a separate comment
convention borrowed from the CDN tags).

### Environment/hostname branching (D-14)
**Source:** `app/firebase.js:59`
**Apply to:** `app/sentry-init.js`'s three-value `environment` derivation
```javascript
const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
```
Extend with a second check for the exact production hostname vs. any other `*.netlify.app` suffix —
same inline-const style, no new module, no helper function elsewhere in the codebase.

### Guarded `window.*` debug global (D-16)
**Source:** `app/notifications.js:689-724` (`window.__createTestNotification`)
**Apply to:** `window.__sentryTest()` in `app/sentry-init.js`
**Diverges from the source pattern in one deliberate way:** the source gates with `if (isLocal)` so
production never sees the global; D-16 requires `window.__sentryTest()` to exist **in production**
too. Keep: the doc-comment block above the registration, the plain `window.name = async (...) =>
{...}` assignment shape. Drop: the `if (isLocal)` wrapper.

### `[Prefix] message:` console/breadcrumb convention (D-01, D-11)
**Source:** confirmed live at `app/diagnostics.js:87,95,112`, `app/firebase.js:111,215`,
`.planning/codebase/CONVENTIONS.md:140-150`
```javascript
console.error(`[CLMC-DIAG] ${type}`, ev);
console.error('[Firebase] purgeStoragePrefix failed for', prefix, e);
```
This is the exact shape D-01's `beforeBreadcrumb` rule is designed around: keep `breadcrumb.message`
(the `[Prefix] text` string), drop `breadcrumb.data` (where the second/third console arguments —
`ev`, `prefix, e` — land as `data.arguments`). No code change needed at any of the 422 call sites;
the scrub rule in `app/sentry-init.js` is the only place this pattern needs to be encoded.

### CSP two-file/four-occurrence edit (D-06, OBS-02)
**Source:** `.planning/milestones/v3.1-phases/58-.../58-02-SUMMARY.md` (Phase 58 Plan 02 — prior
precedent, same task shape, already executed once for `https://www.gstatic.com`)
**Apply to:** `netlify.toml` + `_headers`, `connect-src` directive, ingest host addition
Task/commit structure to reuse:
1. Edit `_headers` (`/*` then `/*.html` occurrence) → commit.
2. Edit `netlify.toml` (`/*` then `/*.html` occurrence) → commit (or same commit; CONTEXT.md's
   integration-points list calls for "one atomic commit" — a slight tightening of the Phase 58
   precedent, which used two commits).
3. Verify: `grep -c "<new-host-string>" _headers` and same for `netlify.toml`, expect 2 each.
4. Verify the two CSP strings across both files stay byte-identical (diff the extracted
   `Content-Security-Policy` values, not the whole file — TOML vs. plain-text syntax differs).

### File-header / section-header comment style
**Source:** `.planning/codebase/CONVENTIONS.md:41-53`, confirmed live in `app/firebase.js:1-4` and
`app/diagnostics.js:1-22`
```javascript
/* ========================================
   MODULE NAME - Brief description
   Additional context about purpose
   ======================================== */
```
4-space indentation throughout; `app/sentry-init.js` should open with this exact block style.

## No Analog Found

None. Every file in this phase's touch list has at least a role-match or exact analog above. The
one genuine gap — no file in the codebase combines "classic (non-module) script" + "SDK
init/config with env branching" — is resolved by composing three existing analogs (`app/firebase.js`
for env/config shape, `app/notifications.js` for the guarded-global mechanic, `CONVENTIONS.md` for
comment style), documented above under `app/sentry-init.js`.

## Metadata

**Analog search scope:** `index.html`, `app/firebase.js`, `app/diagnostics.js`, `app/notifications.js`,
`netlify.toml`, `_headers`, `HEADERS-README.md`, `CLAUDE.md`, `lib/`,
`.planning/codebase/CONVENTIONS.md`, `.planning/research/SUMMARY.md`, prior-phase plan/summary docs
for CSP edits (Phase 58) and debug-global precedent (Phase 83).
**Files scanned:** 12 read directly (full or targeted range), plus grep sweeps across the repo for
`__createTestNotification`, `type="module"`, and CSP/curl precedent.
**Pattern extraction date:** 2026-08-12
