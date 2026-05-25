---
phase: 94-app-update-notification-top-strip-banner-with-etag-head-poll
reviewed: 2026-05-25T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - app/update-check.js
  - index.html
  - styles/components.css
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 94: Code Review Report

**Reviewed:** 2026-05-25
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Phase 94 ships a self-contained ETag/Last-Modified HEAD-poll update detector (`app/update-check.js`), a collapsing strip banner slot in `index.html`, and CSS for the strip in `styles/components.css`. The logic is sound at desktop width and the XSS surface is zero (no user data reaches the banner). Three quality/correctness warnings were found: one CSS animation regression on mobile, one mobile nav mis-alignment when the strip is open, and one missing visibility-change trigger that causes up to a 30-minute lag in notification delivery when the user returns to a backgrounded tab. Three minor info items follow.

---

## Warnings

### WR-01: Mobile strip height transition falls back to a snap — `height: auto` is not animatable

**File:** `styles/components.css:1998-2007`

**Issue:** At desktop width the strip animates smoothly because the `open` class sets `height: 46px`, which CSS `transition: height 0.3s` can interpolate. The `@media (max-width: 768px)` override changes `.update-strip-slot.open { height: auto; }` so the stacked layout fits. However, CSS transitions cannot animate `height: 0 → auto`; the browser snaps immediately to the final value. The strip will appear and disappear without any animation on mobile, which is inconsistent with the desktop behaviour and can disorient users on small screens.

**Fix:** Use `max-height` clamping instead of `height: auto` for the mobile open state. Replace the mobile block with:

```css
@media (max-width: 768px) {
    .update-strip-slot {
        /* switch to max-height transition so 0 → N animates on both breakpoints */
        transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        max-height: 0;
    }
    .update-strip-slot.open {
        height: auto;          /* unconstrained; max-height does the collapsing */
        max-height: 120px;     /* generous upper bound for two-line stacked strip */
    }
}
```

Also add `max-height` to the desktop rule to avoid the need for two separate transition properties:

```css
.update-strip-slot {
    overflow: hidden;
    height: 0;
    max-height: 0;
    transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.update-strip-slot.open {
    height: 46px;
    max-height: 46px;
}
```

---

### WR-02: Mobile nav menu misaligns when the update strip is open

**File:** `styles/components.css:1315`

**Issue:** `.mobile-nav-menu` has `position: fixed; top: 64px;`. This hardcodes the assumption that the nav sits at the top of the viewport. When the update strip is open on mobile it adds variable height above the nav (which is `position: sticky; top: 0`). The sticky nav scrolls with the page until it reaches viewport top, but the mobile menu always opens at `top: 64px` from the viewport edge — not from the bottom of the nav bar. With the strip visible (strip height ~86px stacked + 64px nav = ~150px total), the mobile menu panel will open 64px from the top, visually overlapping the nav bar and part of the strip, instead of appearing directly below the nav.

**Fix:** Drive the menu's top offset dynamically from JS (which already manages open/close) or use a CSS custom property set at open time. The simplest CSS-only mitigation is to set `top` to the combined height when the strip is open. If JS management is preferred:

```javascript
// In openMobileMenu(), after computing strip state:
function openMobileMenu() {
    _mobileMenuOpen = true;
    var menu = document.getElementById('mobileNavMenu');
    var strip = document.getElementById('updateStripSlot');
    var stripH = strip && strip.classList.contains('open') ? strip.offsetHeight : 0;
    if (menu) {
        menu.style.top = (64 + stripH) + 'px';
        menu.classList.add('is-open');
    }
    // ... rest unchanged
}
```

For a pure-CSS approach, restructure `.mobile-nav-menu` to `position: sticky` or use a CSS custom property `--strip-height` toggled by JS.

---

### WR-03: Up-to-30-minute detection lag when user returns from a backgrounded tab

**File:** `app/update-check.js:41`

**Issue:** The visibility guard correctly skips polls while the tab is hidden to avoid wasted network requests. However, there is no `visibilitychange` listener to fire a poll immediately when the user brings the tab back to the foreground. The next scheduled tick may be up to 30 minutes away, so a user who backgrounds the tab for any length of time will not be notified of a pending update until that timer fires — defeating the intent of the feature for the most common usage pattern (leaving a tab open for hours).

**Fix:** Add a `visibilitychange` listener in `startUpdateCheck()`:

```javascript
export function startUpdateCheck() {
    if (pollTimer !== null) return;

    window.dismissUpdateBanner = function () {
        const slot = document.getElementById('updateStripSlot');
        if (slot) slot.classList.remove('open');
    };

    // Immediate baseline capture on load.
    poll();

    // Poll on visibility restore so a returning tab checks right away.
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') poll();
    });

    // Then repeat every 30 minutes.
    pollTimer = setInterval(poll, POLL_INTERVAL_MS);
}
```

---

## Info

### IN-01: Dismiss button calls `window.dismissUpdateBanner` before module scripts have run — narrow but real failure window

**File:** `index.html:34`

**Issue:** The Dismiss button uses `onclick="window.dismissUpdateBanner()"`, an inline handler resolved at click time against the global. `window.dismissUpdateBanner` is registered inside `startUpdateCheck()`, which runs inside a `type="module"` script. Module scripts are deferred by the browser and execute after the HTML is parsed but asynchronously relative to user interaction. In the extremely short window between DOM-ready and module execution (typically a few milliseconds on localhost, potentially longer on slow connections), if a user somehow triggered the Dismiss button, the call would throw `TypeError: window.dismissUpdateBanner is not a function`. In practice the banner starts collapsed so the button is not accessible, making this theoretical. Worth noting for completeness.

**Fix:** No immediate action needed given the button is inside the collapsed slot. A defensive no-op guard can be added if desired:

```html
<button class="update-strip-btn update-strip-btn--dismiss"
        onclick="window.dismissUpdateBanner && window.dismissUpdateBanner()">Dismiss</button>
```

---

### IN-02: `pollTimer` idempotency guard is `!== null` but `setInterval` can return `0` in non-browser runtimes

**File:** `app/update-check.js:65`

**Issue:** The guard `if (pollTimer !== null) return;` is correct for all browsers (which return a positive integer handle from `setInterval`). In non-browser runtimes like Node.js, `setInterval` returns an object. This code is browser-only SPA code so this is inconsequential, but documenting it avoids confusion if the file is ever imported in a test harness.

**Fix:** No change required for production. If a test harness is ever introduced, initialize `pollTimer` as `false` or use a boolean flag instead.

---

### IN-03: `console.log` left in production path

**File:** `app/update-check.js:35`

**Issue:** `console.log('[UpdateCheck] new version detected')` fires every time the banner is shown, including on every subsequent poll once a version change has been detected (every 30 minutes). The project's existing debug console pattern uses `console.log` with prefixes (`[Router]`, `[Procurement]`) so this is consistent with project convention. However, in a production build it generates repeated log noise.

**Fix:** No strict requirement to remove per project convention, but consider `console.debug` which is filtered out by default in production DevTools log levels and is consistent with "informational, not action-required" intent.

---

_Reviewed: 2026-05-25_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
