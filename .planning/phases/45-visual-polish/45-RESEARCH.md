# Phase 45: Visual Polish - Research

**Researched:** 2026-02-27
**Domain:** CSS, HTML — static SPA visual consistency (no framework, no build step)
**Confidence:** HIGH

## Summary

Phase 45 is a pure front-end polish phase with four tightly scoped requirements: replace the text placeholder logo on the registration page, eliminate emojis from Finance tab labels, ensure tab `<a>` elements carry `text-decoration: none`, and make the Admin dropdown trigger button visually match the other `<a class="nav-link">` items.

All four problems are diagnosable by direct code inspection. No external libraries are needed. No new Firestore collections or Firebase rules are touched. Every fix is in CSS or JS template literals — the change surface is small and low-risk.

The single hardest sub-problem is the Admin button: it is a `<button>` element, so browser-default `font`, `font-size`, and padding resets do NOT inherit from parent unlike `<a>` elements. The fix must explicitly apply the full `.nav-link` visual property set to `.nav-dropdown-trigger` rather than relying on an inherited CSS comment.

**Primary recommendation:** Fix each defect in one targeted pass per file (register.js for BRD-01, finance.js for NAV-01, components.css for NAV-01/NAV-02, components.css for NAV-03). Scope is 2-3 files total.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BRD-01 | Registration page displays company logo instead of the "CL" text placeholder | Logo PNG files exist at repo root; `pending.js` already uses the correct `<img>` pattern; CSS `.auth-logo img` rule is already defined |
| NAV-01 | All navigation links standardized — no underlines, no emojis across all views | Finance.js tab labels contain 3 emojis; `.tab-btn` CSS lacks `text-decoration: none` for `<a>` elements; all other tab views use clean labels |
| NAV-02 | Navigation appearance consistent across all tabs and sub-tabs | Finance tabs rendered as `<a href="...">` whereas most other tabs are `<button>` — both use `.tab-btn` class but `<a>` inherits browser underline unless explicitly suppressed |
| NAV-03 | Admin button visually uniform with rest of top navigation items | `.nav-dropdown-trigger` is a `<button>` with comment "inherits .nav-link styles" but CSS inheritance does NOT flow from class selectors to element type — explicit property duplication required |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vanilla CSS | — | Styling | Project has no build system; all fixes are in existing `.css` files |
| ES6 template literals | — | HTML generation | View modules use JS template strings for render(); logo swap is a string replacement |

### Supporting
No new libraries. No npm install required.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Local PNG path (`./CLMC Registered Logo.png`) | GitHub raw URL (already used in nav) | Local path is served from the same Netlify origin — avoids cross-origin dependency, no CORS issues; nav already works with GitHub raw URL so either works; local path preferred for reliability |

---

## Architecture Patterns

### Recommended Project Structure
No structural changes. All edits are in-place:
```
app/views/
├── register.js    ← BRD-01: replace CL placeholder with <img>
├── finance.js     ← NAV-01: strip emojis from 3 tab labels
styles/
└── components.css ← NAV-01/NAV-02: add text-decoration:none to .tab-btn
                   ← NAV-03: apply explicit nav-link visual properties to .nav-dropdown-trigger
```

### Pattern 1: Logo Swap in Auth Views
**What:** Replace the inline `<div>` placeholder with an `<img>` tag inside `.auth-logo`, matching the pattern already used in `pending.js`.
**When to use:** Any auth view that still shows the "CL" text.
**Example:**
```javascript
// Source: app/views/pending.js (existing working pattern)
// BEFORE (register.js and login.js):
<div class="auth-logo">
    <div style="width: 60px; height: 60px; background: var(--primary); border-radius: 12px; ...">
        <span style="color: white; font-size: 24px; font-weight: 700;">CL</span>
    </div>
</div>

// AFTER:
<div class="auth-logo">
    <img src="./CLMC Registered Logo Cropped (black fill).png"
         alt="CLMC Logo"
         onerror="this.style.display='none'">
</div>
```

**CSS already handles this:** `styles/views.css` line 905:
```css
.auth-logo img {
    max-width: 120px;
    height: auto;
    display: inline-block;
}
```
No CSS change needed for BRD-01.

### Pattern 2: Suppress Underlines on Anchor Tab Buttons
**What:** Add `text-decoration: none` to the `.tab-btn` CSS rule. Currently missing — `<a class="tab-btn">` elements get browser-default underline because `.tab-btn` only suppresses it for `.nav-link` and `.nav-brand`, not for tab anchors.
**When to use:** Any time `.tab-btn` is applied to an `<a>` element (finance.js, procurement.js).
**Example:**
```css
/* Source: styles/components.css — add to existing .tab-btn rule */
.tab-btn,
.tab-button {
    padding: 0.75rem 1.5rem;
    background: transparent;
    border: none;
    border-bottom: 3px solid transparent;
    cursor: pointer;
    font-size: 1rem;
    color: var(--gray-700);
    transition: all 0.2s;
    font-weight: 500;
    text-decoration: none;   /* ADD THIS */
}
```

### Pattern 3: Strip Emojis from Finance Tab Labels
**What:** Remove the emoji prefix characters from the three `<a class="tab-btn">` elements in `finance.js`.
**When to use:** Any tab label that contains an emoji character.
**Example:**
```javascript
// Source: app/views/finance.js lines 581-590
// BEFORE:
<a href="#/finance/approvals" class="tab-btn ...">
    📋 Pending Approvals
</a>
<a href="#/finance/pos" class="tab-btn ...">
    📄 Purchase Orders
</a>
<a href="#/finance/projects" class="tab-btn ...">
    💰 Project List
</a>

// AFTER:
<a href="#/finance/approvals" class="tab-btn ...">
    Pending Approvals
</a>
<a href="#/finance/pos" class="tab-btn ...">
    Purchase Orders
</a>
<a href="#/finance/projects" class="tab-btn ...">
    Project List
</a>
```

### Pattern 4: Admin Button Visual Parity with Nav Links
**What:** Explicitly duplicate the `.nav-link` visual properties onto `.nav-dropdown-trigger`. Browsers do NOT auto-inherit CSS class properties — a `<button>` will not pick up `<a class="nav-link">` styling unless it is also a `.nav-link` or the properties are re-stated.
**When to use:** Any `<button>` that must look identical to an `<a class="nav-link">`.

**Root cause:** In `index.html`, the Admin button is:
```html
<button class="nav-link nav-dropdown-trigger" ...>Admin</button>
```
Note it DOES have both `nav-link` and `nav-dropdown-trigger` classes — so `.nav-link` properties DO apply to it. However, browser user-agent stylesheet adds `font-family: initial`, `font-size: initial` to `<button>`, and the `.nav-dropdown-trigger` rule resets `background: none; border: none` but doesn't reset font. **The fix is to add `font: inherit` to `.nav-dropdown-trigger`.**

```css
/* Source: styles/components.css — update existing .nav-dropdown-trigger rule */
.nav-dropdown-trigger {
    background: none;
    border: none;
    cursor: pointer;
    font: inherit;   /* ADD THIS — ensures button uses same font as <a> nav-links */
    line-height: inherit;
}
```

### Anti-Patterns to Avoid
- **Relying on CSS comment "inherits .nav-link styles":** A CSS comment has zero effect on inheritance; the `<button>` default font-family will still override unless explicitly reset with `font: inherit`.
- **Using GitHub raw URL for auth page logos:** If the raw GitHub URL is temporarily unavailable, the registration page logo breaks. Local path `./CLMC Registered Logo Cropped (black fill).png` is served from the same Netlify origin — preferred.
- **Modifying login.js:** BRD-01 only requires the registration page. Do not change login.js unless the planner scopes it explicitly — it has the same CL placeholder but the requirement is BRD-01 (registration) only.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Logo display | Custom canvas drawing, base64 encoding | Direct `<img>` tag with local PNG path | PNG files already exist at project root; `.auth-logo img` CSS rule is already defined |
| Tab underline suppression | JavaScript that removes underlines dynamically | CSS `text-decoration: none` on `.tab-btn` | CSS is the correct layer for visual properties |
| Button font normalization | Explicit font-size/family values | `font: inherit` shorthand | Inherits from `.nav-link` color, size, weight in one declaration |

**Key insight:** Every fix is a 1-4 line CSS or string change. No new abstractions, no new utility functions, no new components needed.

---

## Common Pitfalls

### Pitfall 1: Logo Path with Spaces
**What goes wrong:** `./CLMC Registered Logo.png` has spaces in the filename. Some browsers handle this but it is not valid in unquoted CSS `url()` values and may fail in certain contexts.
**Why it happens:** The PNG files on disk have spaces in their names.
**How to avoid:** In HTML `src` attribute, spaces in paths are fine (HTML spec allows them). But prefer the cropped version: `"./CLMC Registered Logo Cropped (black fill).png"` — also has spaces and parentheses, which is valid in `src` attributes but worth noting.
**Warning signs:** The `onerror="this.style.display='none'"` fallback in `pending.js` silently hides a broken image. Test the path manually.

### Pitfall 2: Scope Creep on Logo Replacement
**What goes wrong:** Login page also has the "CL" placeholder. Developer fixes both register.js and login.js.
**Why it happens:** BRD-01 says "registration page" specifically; login.js has the same pattern.
**How to avoid:** Only modify `register.js` for BRD-01. If login should also be fixed, it must be explicitly added to scope. The planner should note this as an open question.

### Pitfall 3: Tab `<a>` vs `<button>` Inconsistency
**What goes wrong:** Finance tabs use `<a href="...">` elements as tab buttons; most other views use `<button>` elements. Adding `text-decoration: none` to `.tab-btn` fixes the underline for both without affecting `<button>` behavior.
**Why it happens:** Finance tabs navigate via hash URL; procurement and other views use `onclick` with `navigateToTab()`.
**How to avoid:** The CSS fix (`text-decoration: none` on `.tab-btn`) is correct for both element types. Do not change `<a>` to `<button>` or vice versa — that would require changing click handlers.

### Pitfall 4: Nav Consistency During Tab Switching
**What goes wrong:** When switching tabs within Finance or Procurement, the router calls `render()` + `init()` again with the new tab. If any tab label HTML is conditionally generated, an emoji might reappear.
**Why it happens:** Template literals regenerate HTML on every render.
**How to avoid:** The emoji fix is in the template literal string itself (removing the emoji characters). Once removed from the string, no tab switch will reintroduce them.

---

## Code Examples

### BRD-01: Register Page Logo (verified pattern from pending.js)
```javascript
// Source: app/views/pending.js lines 19-22 (existing working pattern)
<div class="auth-logo">
    <img src="https://raw.githubusercontent.com/pengr3/pr-po/main/CLMC%20Registered%20Logo.png"
         alt="CLMC Logo"
         onerror="this.style.display='none'">
</div>
```

Recommended variant using local path (avoids GitHub cross-origin):
```javascript
<div class="auth-logo">
    <img src="./CLMC Registered Logo Cropped (black fill).png"
         alt="CLMC Logo"
         onerror="this.style.display='none'">
</div>
```

### NAV-01 + NAV-02: CSS fix for tab anchors
```css
/* styles/components.css — add text-decoration: none to existing rule */
.tab-btn,
.tab-button {
    padding: 0.75rem 1.5rem;
    background: transparent;
    border: none;
    border-bottom: 3px solid transparent;
    cursor: pointer;
    font-size: 1rem;
    color: var(--gray-700);
    transition: all 0.2s;
    font-weight: 500;
    text-decoration: none;  /* NEW */
}
```

### NAV-03: Admin button font normalization
```css
/* styles/components.css — add font: inherit to existing rule */
.nav-dropdown-trigger {
    background: none;
    border: none;
    cursor: pointer;
    font: inherit;      /* NEW — prevents browser button font override */
    line-height: inherit; /* NEW — matches <a> line-height */
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| "CL" text placeholder in blue box | Company PNG logo via `<img>` | Matches professional branding; CSS `.auth-logo img` already handles sizing |
| Emoji prefixes in Finance tabs | Clean text labels | Consistent with all other tab views (Procurement, MRF Form, Services, User Management all have no emojis) |

**Current state of each defect (code-verified):**

| File | Location | Issue |
|------|----------|-------|
| `app/views/register.js` | line 33-35 | "CL" text placeholder inside blue div |
| `app/views/login.js` | line 18-20 | Same "CL" placeholder (out of BRD-01 scope, same fix if desired) |
| `app/views/finance.js` | lines 582, 585, 588 | Emoji prefixes `📋`, `📄`, `💰` on tab labels |
| `styles/components.css` | lines 963-974 | `.tab-btn` missing `text-decoration: none` (affects `<a>` tab elements) |
| `styles/components.css` | lines 87-92 | `.nav-dropdown-trigger` missing `font: inherit` |

---

## Open Questions

1. **Should login.js also get the logo replacement?**
   - What we know: `login.js` has the identical "CL" placeholder as `register.js`; BRD-01 specifies "registration page" only
   - What's unclear: Is the login page logo also expected to show the company logo, or was that intentional?
   - Recommendation: Planner should scope login.js into a separate task or note it as a free addition if desired; the fix is identical

2. **Local path vs GitHub raw URL for auth page logo**
   - What we know: `pending.js` uses the GitHub raw URL; the PNG files exist locally at repo root; Netlify serves static files from root
   - What's unclear: Whether the local file path `./CLMC Registered Logo Cropped (black fill).png` (with spaces and parens in name) causes any issues
   - Recommendation: Use local path with URL-encoding in the `src` attribute — `./CLMC%20Registered%20Logo%20Cropped%20(black%20fill).png` — or use the GitHub raw URL pattern from `pending.js` for consistency

3. **Which PNG to use: full logo or cropped black fill?**
   - What we know: Two files exist — `CLMC Registered Logo.png` (40KB, full) and `CLMC Registered Logo Cropped (black fill).png` (16KB, cropped)
   - What's unclear: Design preference — the auth card background is white, so the black fill version may contrast better
   - Recommendation: Use the cropped black fill version for auth pages (white card background); planner can leave as Claude's discretion

---

## Sources

### Primary (HIGH confidence)
- Direct file inspection of `app/views/register.js` — confirmed "CL" text placeholder at lines 33-35
- Direct file inspection of `app/views/login.js` — confirmed same pattern at lines 18-20
- Direct file inspection of `app/views/pending.js` — confirmed working logo `<img>` pattern at lines 19-22
- Direct file inspection of `app/views/finance.js` — confirmed emoji tab labels at lines 582, 585, 588
- Direct file inspection of `styles/components.css` — confirmed `.tab-btn` lacks `text-decoration: none` (lines 963-974); `.nav-dropdown-trigger` lacks `font: inherit` (lines 87-92)
- Direct file inspection of `index.html` — confirmed Admin button has class `nav-link nav-dropdown-trigger`

### Secondary (MEDIUM confidence)
- MDN CSS `font: inherit` behavior — `font: inherit` on `<button>` elements overrides user-agent stylesheet that sets `font-family: initial` and `font-size: initial` on buttons; this is well-established cross-browser behavior

---

## Metadata

**Confidence breakdown:**
- BRD-01 (logo): HIGH — exact file locations confirmed, working pattern copied from pending.js
- NAV-01 (emojis): HIGH — exact emoji characters identified in finance.js lines 582/585/588
- NAV-02 (underlines): HIGH — `.tab-btn` CSS confirmed missing `text-decoration: none`; finance tabs confirmed as `<a>` elements
- NAV-03 (admin button): HIGH — `.nav-dropdown-trigger` CSS confirmed; `font: inherit` fix is standard browser behavior

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (stable domain — CSS/HTML, no moving parts)
