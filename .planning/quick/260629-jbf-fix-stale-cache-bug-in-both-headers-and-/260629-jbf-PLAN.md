---
phase: quick-260629-jbf
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - _headers
  - netlify.toml
autonomous: true
requirements:
  - STALE-CACHE-FIX
must_haves:
  truths:
    - "JS modules are served with revalidating cache headers (max-age=0, must-revalidate) instead of immutable"
    - "CSS files are served with revalidating cache headers instead of immutable"
    - "_headers and netlify.toml agree on the Cache-Control for /*.js and /*.css"
    - "A single window.location.reload() after a deploy pulls fresh module bytes via ETag revalidation"
  artifacts:
    - path: "_headers"
      provides: "Netlify header rules with non-immutable JS/CSS cache control"
      contains: "public, max-age=0, must-revalidate"
    - path: "netlify.toml"
      provides: "Netlify TOML header rules with non-immutable JS/CSS cache control"
      contains: "public, max-age=0, must-revalidate"
  key_links:
    - from: "_headers /*.js, /*.css rules"
      to: "netlify.toml /*.js, /*.css rules"
      via: "identical Cache-Control value"
      pattern: "public, max-age=0, must-revalidate"
---

<objective>
Fix the stale-cache bug for static ES modules by removing the `immutable` directive from the JS and CSS cache rules in both Netlify config files. Currently `/*.js` and `/*.css` are served `public, max-age=31536000, immutable` against bare, unversioned module URLs, so browsers never re-fetch updated modules after a deploy until a hard refresh (Ctrl-Shift-R). This caused a procurement user to see a stale MRF Records scoreboard long after the update shipped.

Changing both rules in both files to `public, max-age=0, must-revalidate` (matching the existing `/*` default) makes every module participate in normal ETag revalidation. A fresh page load AND the existing update banner's plain `window.location.reload()` then reliably pull new code.

Purpose: Eliminate Layer 1 (immutable modules) and Layer 2 (soft reload can't clear immutable cache) of the diagnosed root cause with a minimal, robust two-file header edit — no build step, no per-import version stamping, within the project's zero-build constraint.
Output: Updated `_headers` and `netlify.toml` with revalidating JS/CSS cache control that agree with each other.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/debug/stale-cache-mrf-scoreboard.md

<interfaces>
<!-- Exact current state of the two rules to change. Executor edits these in place; no exploration needed. -->

_headers (lines 25-32) — CURRENT:
```
# CSS and JavaScript - cache for 1 year with immutable
/*.css
  Cache-Control: public, max-age=31536000, immutable
  X-Content-Type-Options: nosniff

/*.js
  Cache-Control: public, max-age=31536000, immutable
  X-Content-Type-Options: nosniff
```

netlify.toml (lines 26-38) — CURRENT:
```
[[headers]]
  # CSS files - cache for 1 year with immutable
  for = "/*.css"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
    X-Content-Type-Options = "nosniff"

[[headers]]
  # JavaScript files - cache for 1 year with immutable
  for = "/*.js"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
    X-Content-Type-Options = "nosniff"
```

Target value for ALL FOUR rules: `public, max-age=0, must-revalidate`
This matches the existing `/*` default already present in both files.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: De-immutable JS/CSS cache rules in _headers</name>
  <files>_headers</files>
  <action>In `_headers`, change the `Cache-Control` value on BOTH the `/*.css` rule (currently line 27) and the `/*.js` rule (currently line 31) from `public, max-age=31536000, immutable` to `public, max-age=0, must-revalidate`. Do NOT touch the `X-Content-Type-Options: nosniff` line on either rule. Do NOT touch the image rules (.jpg/.jpeg/.png/.gif/.svg/.webp/.ico), font rules (.woff/.woff2/.ttf/.eot/.otf), the `/*` default, or the `/*.html` rule — only the two .css and .js rules change. Optionally update the section comment on line 25 from "cache for 1 year with immutable" to reflect revalidation, but the comment is cosmetic and not required.</action>
  <verify>
    <automated>grep -c "max-age=31536000, immutable" _headers — confirm the count dropped by exactly 2 vs. the original (image/font rules still legitimately keep immutable). Then confirm both `/*.css` and `/*.js` blocks now contain `public, max-age=0, must-revalidate` via `grep -A1 "^/\*\.\(css\|js\)$" _headers`.</automated>
  </verify>
  <done>The `/*.css` and `/*.js` rules in `_headers` both read `Cache-Control: public, max-age=0, must-revalidate`. No other rule changed.</done>
</task>

<task type="auto">
  <name>Task 2: De-immutable JS/CSS cache rules in netlify.toml</name>
  <files>netlify.toml</files>
  <action>In `netlify.toml`, change the `Cache-Control` value in BOTH the `for = "/*.css"` header block (currently line 30) and the `for = "/*.js"` header block (currently line 37) from `"public, max-age=31536000, immutable"` to `"public, max-age=0, must-revalidate"`. Do NOT touch the `X-Content-Type-Options = "nosniff"` lines. Do NOT touch the image `[[headers]]` block (ext = jpg/jpeg/png/gif/svg/webp/ico), the font `[[headers]]` block (ext = woff/woff2/ttf/eot/otf), the `/*` default block, or the `/*.html` block. The resulting JS/CSS value MUST be byte-identical to the value set in `_headers` (Task 1) so the two config files agree. Optionally update the section comments ("cache for 1 year with immutable") cosmetically.</action>
  <verify>
    <automated>grep -A4 'for = "/\*\.css"' netlify.toml and grep -A4 'for = "/\*\.js"' netlify.toml both show `Cache-Control = "public, max-age=0, must-revalidate"`. Confirm the image/font `[[headers]]` blocks still carry `max-age=31536000, immutable` (unchanged).</automated>
  </verify>
  <done>The `/*.css` and `/*.js` header blocks in `netlify.toml` both read `Cache-Control = "public, max-age=0, must-revalidate"`, byte-identical to the value set in `_headers`.</done>
</task>

</tasks>

<verification>
- `_headers`: `/*.css` and `/*.js` rules read `public, max-age=0, must-revalidate`; image/font rules unchanged.
- `netlify.toml`: `/*.css` and `/*.js` blocks read `public, max-age=0, must-revalidate`; image/font blocks unchanged.
- Both files declare the SAME Cache-Control for JS/CSS (no divergence — Netlify may prefer netlify.toml or merge; they must agree).
- index.html untouched; app/update-check.js untouched; no build step added; no `?v=` stamping added (all explicitly out of scope).
- Post-deploy production verification (manual, by user): in DevTools Network tab, a request to an `app/*.js` module returns `Cache-Control: public, max-age=0, must-revalidate` and a 304 on revalidation when unchanged. This is a post-push check the user performs manually — not part of plan execution.
</verification>

<success_criteria>
- Both `_headers` and `netlify.toml` serve JS and CSS with `public, max-age=0, must-revalidate`.
- The two config files agree on the JS/CSS Cache-Control value.
- Only the four targeted rules (two .css, two .js) changed; image, font, HTML, and default rules are untouched.
- Scope held to exactly two files; no out-of-scope changes (no build step, no version-stamped imports, no index.html or update-check.js edits).
</success_criteria>

<output>
Create `.planning/quick/260629-jbf-fix-stale-cache-bug-in-both-headers-and-/260629-jbf-SUMMARY.md` when done.
</output>
