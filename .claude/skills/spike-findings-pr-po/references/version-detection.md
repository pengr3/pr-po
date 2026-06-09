# Version Detection & Update Banner

## Requirements

- No build step — pure static SPA, must work with `python -m http.server`
- Detection is passive — polling only, no user action required
- Poll interval: **30 minutes** (HEAD request is headers-only, zero Firebase usage)
- Update notification must be **dismissible** without forcing a refresh
- Must not shift layout or interrupt active form workflows

## How to Build It

### Detection (Spike 001)

Poll `HEAD /index.html` every 30 minutes. Netlify sets `Cache-Control: public, max-age=0, must-revalidate` on HTML, so the ETag changes atomically with each deploy.

```javascript
let currentEtag = null;

async function checkForUpdate() {
    try {
        const res = await fetch('/index.html', { method: 'HEAD', cache: 'no-store' });
        const etag = res.headers.get('ETag') || res.headers.get('Last-Modified');
        if (!etag) return;
        if (currentEtag === null) { currentEtag = etag; return; } // baseline
        if (etag !== currentEtag) showUpdateBanner();
    } catch (_) { /* network error — skip silently */ }
}

// Start polling (30 min = 1800000ms)
checkForUpdate(); // baseline immediately
setInterval(checkForUpdate, 1800000);
```

### Update Banner UX (Spike 002)

**Chosen variant: A — fixed top strip.** Full-width, slides in above the nav, does not overlap content.

```css
#update-banner {
    position: fixed;
    top: 0; left: 0; right: 0;
    background: #1557b0;
    color: white;
    padding: 10px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    z-index: 9999;
    transform: translateY(-100%);
    transition: transform 0.3s ease;
    font-size: 0.875rem;
}
#update-banner.visible {
    transform: translateY(0);
}
```

```javascript
function showUpdateBanner() {
    const banner = document.getElementById('update-banner');
    if (banner) banner.classList.add('visible');
}

function dismissUpdateBanner() {
    document.getElementById('update-banner')?.classList.remove('visible');
    // currentEtag stays updated — won't re-trigger until next deploy
}
```

HTML in `index.html`:
```html
<div id="update-banner">
    <span>A new version is available.</span>
    <div style="display:flex;gap:8px;">
        <button onclick="location.reload()">Refresh now</button>
        <button onclick="dismissUpdateBanner()">Later</button>
    </div>
</div>
```

## What to Avoid

- **Service Workers** — require a separate file at root, complex `skipWaiting` lifecycle, adds failure modes for a zero-build app
- **`version.json`** — requires manual bump on every deploy; error-prone
- **Firebase Remote Config** — overkill, adds latency, costs
- **Aggressive poll intervals** — 5-minute intervals work locally but burn bandwidth in prod; 30 minutes matches deploy cadence

## Constraints

- `python -m http.server` returns ETags based on file mtime+size — perfect for local testing (save index.html to simulate a deploy)
- Netlify CDN may have brief propagation delay after deploy; 30-min interval makes this irrelevant in practice
- `Last-Modified` is the fallback when ETag is absent; use whichever header is non-null

## Origin

Synthesized from spikes: 001, 002
Source files: `sources/001-etag-head-poll/`, `sources/002-update-banner-ux/`
