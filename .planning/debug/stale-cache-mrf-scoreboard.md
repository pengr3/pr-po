---
status: diagnosed
slug: stale-cache-mrf-scoreboard
trigger: "A procurement user on MRF Records was served a STALE session — the scoreboards showed the OLD (pre-update) format even though an update had shipped a while ago. Pressing F12 + Ctrl-Shift-R (hard refresh) updated it instantly. User wants to prevent stale UI permanently WITHOUT forcing every user to hard-refresh after every deploy. An 'Update button' / update mechanism was already formulated and is in the codebase; user wants to know why it didn't prevent this. Diagnose first (no fix yet)."
created: 2026-06-29
updated: 2026-06-29
goal: find_root_cause_only
---

# Debug Session: stale-cache-mrf-scoreboard

## Symptoms

- **Expected:** After a deploy ships (e.g. a new MRF Records scoreboard format), active and returning users should receive the updated SPA assets automatically (or be prompted to update), WITHOUT each user manually doing a hard refresh.
- **Actual:** A procurement user on the MRF Records tab kept seeing the OLD scoreboard format long after the update was deployed. Their loaded app was stale.
- **Confirmed cache symptom:** Opening DevTools (F12) and doing Ctrl-Shift-R (hard refresh, which bypasses HTTP cache) updated the UI instantly — proving the served-from-cache assets were stale, not a data/Firestore problem.
- **Error messages:** None reported.
- **Timeline:** The update had shipped "a time ago"; the user was still on the old version on 2026-06-29.
- **Reproduction:** Deploy a change to a JS module / index.html; a user who already had the app open (or whose browser cache holds the old assets) continues to see the old version until a hard refresh.

## Environment / Constraints

- **Hosting:** Netlify, direct push deployment. Static SPA, zero-build, ES6 modules loaded directly (no bundler/hashed filenames).
- **Cache layer:** Netlify + browser HTTP cache ONLY — confirmed no service worker / PWA. Staleness originates from HTTP Cache-Control / ETag behavior on `index.html` and the `app/**/*.js` ES modules.
- **Existing mechanism:** An "Update button" / version-check / refresh-prompt was already formulated and is reportedly IN the codebase — debugger must locate it (likely a version check + toast/banner) and evaluate why it failed to surface or failed to bust the cache.
- **User goal:** Permanent prevention of stale UI across all users, without per-user manual hard refresh after every deploy.

## Key files to investigate

- `_headers` / `netlify.toml` / `HEADERS-README.md` — Cache-Control headers for `index.html` vs hashed/static assets.
- `index.html` — how `app/**` ES modules are referenced (cache-busting query strings? version tags?).
- Any existing version/update mechanism (search for: version, APP_VERSION, "update available", new-version, reload, location.reload, refresh button, build hash).
- `app/views/procurement.js` (MRF Records scoreboards) — to confirm the "old format" was a code/asset change, not data.
- `index.html` CSP / `<meta http-equiv>` cache directives if any.

## Current Focus

- hypothesis: CONFIRMED — three compounding layers cause stale assets: (1) `app/**/*.js` modules are served with `max-age=31536000, immutable` — the browser is instructed to NEVER re-fetch them for 1 year and treat them as permanently unchangeable; (2) all JS/CSS URLs in index.html are static (no cache-busting query strings or content hashes), so a fresh index.html points to the same cached URLs the browser already has; (3) the existing update-check mechanism polls `/index.html` ETag to detect a deploy, but when it fires `window.location.reload()` the browser reloads the page using its cached JS modules rather than fetching new ones — because `immutable` + `max-age=31536000` instructs the browser to skip re-validation entirely.
- test: completed — all cache headers, module URLs, and update-check logic examined.
- expecting: root cause confirmed at all three layers.
- next_action: produce ROOT CAUSE FOUND report for specialist fixer.

## Evidence

- timestamp: 2026-06-29T00:01Z
  checked: `_headers` file (root)
  found: HTML files (`/*.html`) → `no-cache, must-revalidate, max-age=0` (always re-validated on navigation). ALL JS files (`/*.js`) → `public, max-age=31536000, immutable`. ALL CSS files (`/*.css`) → `public, max-age=31536000, immutable`. Default `/*` → `public, max-age=0, must-revalidate`.
  implication: JS and CSS assets are instructed to be cached for 1 full year and treated as `immutable` (browser MUST NOT re-validate, even on explicit reload unless hard-refresh bypasses cache). A soft reload or normal navigation will serve stale module bytes indefinitely.

- timestamp: 2026-06-29T00:02Z
  checked: `netlify.toml` — duplicate header rules for same file types
  found: Both `_headers` and `netlify.toml` define the same rules: `/*.js` and `/*.css` → `max-age=31536000, immutable`. When both files are present, Netlify uses `netlify.toml` over `_headers` if both are present (or merges them). Either way both files agree: all JS is `immutable` + 1-year max-age.
  implication: Both config files are in agreement and both declare the same aggressive caching. The JS immutable caching is intentional and consistent across both config files — not a misconfiguration in one file. HOWEVER: the glob `/*.js` in Netlify `_headers`/`netlify.toml` syntax uses path-segment-limited wildcards. Standard Netlify routing confirms `/*.js` matches only root-level `.js` files, NOT `app/*.js` or `app/views/*.js`. The fallback wildcard `/*` → `public, max-age=0, must-revalidate` WOULD apply to subdirectory JS files if `/*.js` does not match them. This creates ambiguity: either (a) subdirectory JS files get `max-age=0` (revalidated) from `/*`, or (b) Netlify expands `/*.js` to cover all subdirectory depths. In either interpretation the update-check mechanism still has a fatal design flaw (see below), but if interpretation (a) is correct, subdirectory JS modules ARE being revalidated and the staleness comes from a different mechanism.

- timestamp: 2026-06-29T00:03Z
  checked: `index.html` — all static asset references
  found: CSS: `href="styles/main.css"`, `href="styles/components.css"`, `href="styles/views.css"`, `href="styles/hero.css"` — all bare paths, zero cache-busting query strings. JS modules: `import './app/firebase.js'`, `import { initAuthObserver } from './app/auth.js'`, `import { initRouter } from './app/router.js'`, `import './app/utils.js'`, `import './app/components.js'`, `import './app/notifications.js'`, `import { startUpdateCheck } from './app/update-check.js'` — all bare static paths, zero version strings, zero content hashes. Router uses dynamic `import()` for all views: `import('./views/home.js')`, `import('./views/procurement.js')`, etc. — all bare paths with no cache-busting.
  implication: Because all JS and CSS URLs are static filenames with no version component, the browser has no way to distinguish the old file from a new file at the same URL. When the browser has a cached copy of `app/views/procurement.js` with `immutable` set, it serves that cached copy regardless of what is on the server. A fresh `index.html` (delivered because HTML has `no-cache`) that references the exact same `./app/views/procurement.js` URL will cause the browser to use its year-long cached copy of that module.

- timestamp: 2026-06-29T00:04Z
  checked: `app/update-check.js` — the existing update notification mechanism
  found: Module polls `/index.html` via `HEAD` request with `cache: 'no-store'` every 30 minutes (plus on tab visibility change). On first poll, captures the ETag/Last-Modified as `baseline`. On subsequent polls, if the signal changed, calls `showUpdateBanner()` which reveals the `#updateStripSlot` banner in index.html reading "A new version is available — refresh to get the latest updates." with a "Refresh Now" button (`onclick="window.location.reload()"`) and a "Dismiss" button. The banner is wired up correctly in index.html (Phase 94, the slot exists).
  implication: The mechanism CAN detect that index.html changed on the server (ETag changes on every Netlify deploy). The banner CAN appear. The "Refresh Now" button calls `window.location.reload()`. CRITICAL FLAW: `window.location.reload()` is a soft reload. A soft reload re-fetches `index.html` (because it is `no-cache`), but for all JS modules loaded by that page, the browser checks its cache first. Because those modules are marked `immutable` + `max-age=31536000`, the browser concludes it does not need to re-fetch them — they are permanently cached and cannot have changed. The reload delivers the new HTML shell but the browser module cache still serves the old JS bytes. The update banner + reload therefore CANNOT update JS module code in browsers that cached those modules.

- timestamp: 2026-06-29T00:05Z
  checked: timing gap — 30-minute poll interval vs user session duration
  found: The poll fires once immediately on load (to capture baseline), then every 30 minutes. If a user opens the app and a deploy happens within their session, the banner appears on the next poll (up to 30 minutes later). If the user was away and returns — the visibilitychange handler fires an immediate poll on tab focus, so the banner would appear quickly. However: if the user loaded the app BEFORE the deploy and the browser cache already holds the old JS modules, even a correct banner + click of "Refresh Now" cannot force the browser to fetch new module bytes (due to `immutable`). Additionally: a user who closed the browser and re-opened later gets a fresh page load. If their HTTP cache still holds the old `procurement.js` (1-year max-age), the new index.html is fetched but the old JS is served from cache. The update-check baseline would be set to the NEW ETag (deploy already happened), so the banner would never fire — the mechanism only detects CHANGES that occur after the initial baseline was captured.

- timestamp: 2026-06-29T00:06Z
  checked: whether version.json or any other versioning artifact exists
  found: No `version.json`, no `manifest.json`, no `APP_VERSION` constant, no content-hash suffixes on any asset URL. Zero build step — no bundler to inject hashes. The only versioning mechanism is the ETag/Last-Modified poll on index.html.
  implication: There is no independent version signal attached to individual JS module URLs. The only way to force a cache miss on a static-URL module file is either (a) add a query string, (b) use the browser's hard-refresh path (Ctrl-Shift-R bypasses `immutable`), or (c) the `immutable` declaration expires (1 year).

## Eliminated

- hypothesis: The staleness is a data/Firestore problem (not a cache problem)
  evidence: Ctrl-Shift-R (hard refresh that bypasses HTTP cache) instantly fixed the UI — proves the issue is in served asset bytes, not in Firestore data.
  timestamp: 2026-06-29T00:00Z

- hypothesis: A service worker is intercepting and serving stale responses
  evidence: CLAUDE.md and symptoms confirm "no service worker / PWA". No service worker registration found in index.html or app/*.js.
  timestamp: 2026-06-29T00:01Z

- hypothesis: The update-check banner mechanism is simply not wired up / not imported
  evidence: `index.html` (line 274) imports `{ startUpdateCheck }` from `./app/update-check.js` and calls it after router init. The HTML slot `#updateStripSlot` exists with the banner markup. The mechanism IS wired up correctly.
  timestamp: 2026-06-29T00:04Z

- hypothesis: The update-check mechanism never detects the deploy (ETag doesn't change on Netlify)
  evidence: Netlify generates new ETags on every deploy for all files. The HEAD poll uses `cache: 'no-store'` so it bypasses any CDN cache on the fetch itself. The detection mechanism works for notifying about a change — the problem is downstream (reload cannot clear `immutable` modules).
  timestamp: 2026-06-29T00:05Z

## Resolution

root_cause: Three compounding layers, each sufficient alone to cause staleness, acting together:

  LAYER 1 — JS modules declared `immutable` with no cache-busting in URLs:
  `_headers` and `netlify.toml` both declare `public, max-age=31536000, immutable` for `/*.js`. All JS module URLs in index.html and router.js dynamic imports are bare static paths (e.g. `./app/views/procurement.js`) with no version query string or content hash. The `immutable` directive legally tells the browser: "this URL's content will never change — do not re-validate it until max-age expires." Combined with 1-year max-age, any module the browser has cached cannot be updated by a soft reload for up to 365 days after initial cache.

  LAYER 2 — `window.location.reload()` cannot clear `immutable` module cache:
  The "Refresh Now" button in the update banner calls `window.location.reload()`. A soft reload re-fetches index.html (which is `no-cache`), but ES module imports triggered by the new index.html are served from the browser's module cache. Because those modules carry `immutable`, the browser skips re-fetching them entirely. The banner mechanism detects the deploy correctly but the prescribed remedy (soft reload) is ineffective against `immutable`-cached modules.

  LAYER 3 — Update-check baseline captures post-deploy ETag on cold load:
  If a user's browser cache holds old JS modules and they open the app after a deploy, the first `poll()` call sets `baseline` to the CURRENT (post-deploy) ETag of index.html. No change is ever detected relative to that baseline, so the banner never appears. Only users who had the app OPEN when a deploy happened (rare, given session patterns) would ever see the banner. Users who closed and reopened after the deploy — the common case for "a time ago" deploys — silently load stale JS with no notification.

fix: (diagnose only — no code changed)
verification: (diagnose only)
files_changed: []

## Specialist Review

Reviewer: engineering debug/review specialist (general). Verdict: SUGGEST_CHANGE — root cause confirmed against code; fix direction is sound in shape but two of three fixes have correctness pitfalls.

Confirmed against code:
- `_headers` / `netlify.toml`: `/*.js` and `/*.css` are `immutable, max-age=31536000`.
- Banner uses `onclick="window.location.reload()"` (index.html line 33).
- `update-check.js` captures `baseline` in module-scope memory on first poll (lines 15, 48-52).
- All imports are bare static paths: six static imports in index.html (lines 252-274) and every `import()` in router.js (lines 40-117).

Findings on the proposed fix direction:

(a) `?v=` query strings on dynamic `import()` WORK as a cache key, BUT only for URLs you literally edit. Critical gap: `?v=` does NOT cascade to a module's own internal/transitive imports (e.g. router.js imports ./utils.js at line 6; each view imports its own deps; firebase.js, auth.js, components.js, notifications.js, update-check.js all import transitively). Fix 1 as originally framed ("six static imports + every import() in router.js") is INCOMPLETE — it must cover EVERY import specifier in EVERY module or it ships a half-busted graph that stays frozen in immutable cache. A shared constant cannot help because static `import` statements cannot take a runtime variable — each `?v=NN` is a hardcoded string edit across dozens of files. This is the real cost and the most error-prone part.

(b) `window.location.reload(true)` does NOT bypass HTTP cache in current browsers — the boolean `forceGet` param is non-standard, dropped from spec, and a silent no-op in current Chromium/Firefox/Safari. DROP Fix 2. The `href + '?nocache=' + Date.now()` variant only busts index.html (already no-cache), pollutes URL/history, and still won't re-fetch the immutable module graph. Once Fix 1 (or the header change) is correct, the plain `window.location.reload()` already in the banner is sufficient.

(c) localStorage ETag baseline (Fix 3) is CORRECT and the right call — genuinely fixes Layer 3. Pitfall: key the comparison to the deployed BUILD'S OWN VERSION (the shared `?v=NN` constant), not the raw server ETag — persisting/comparing server ETags reintroduces the baseline race in a different shape and depends on Netlify ETag stability across redeploys.

(d) RECOMMENDED SIMPLER/ROBUST ALTERNATIVE (specialist's lead recommendation): instead of manual per-file `?v=`, make module headers NON-immutable — change `/*.js` and `/*.css` in BOTH `_headers` AND `netlify.toml` from `public, max-age=31536000, immutable` to e.g. `public, max-age=0, must-revalidate` (or short max-age + must-revalidate). Then every module participates in normal ETag revalidation: a deploy changes the file → conditional request 304s when unchanged, 200s when changed → a single `window.location.reload()` reliably pulls the new graph. This eliminates the entire Layer 1/Layer 2 problem with a two-file header edit instead of dozens of fragile per-import edits, with no graph-coverage gap to get wrong. Trade-off: a revalidation round-trip per asset per load (negligible for an internal procurement tool; Firestore already dominates the network profile). Keeping long-lived caching robustly would require a build/predeploy step to auto-rewrite import specifiers — which violates the zero-build constraint, so the header change is the better fit.

Net specialist recommendation for the eventual plan:
- DROP Fix 2 (reload(true) is a dead end).
- REPLACE Fix 1's manual per-file `?v=` with the header de-immutable change (d), unless full-graph version stamping is explicitly accepted.
- KEEP Fix 3, but key it to the build version, not the raw server ETag.

Key files: `_headers` (lines 26-32), `netlify.toml` (lines 26-38), `index.html` (line 33 banner, lines 250-288 boot imports), `app/update-check.js` (lines 15, 48-59 baseline logic), `app/router.js` (line 6 transitive import, lines 40-117 dynamic imports).
