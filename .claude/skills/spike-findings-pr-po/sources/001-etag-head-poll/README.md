---
spike: "001"
name: etag-head-poll
type: standard
validates: "Given HEAD /index.html is polled every 5 minutes, when Netlify deploys a new version, then the ETag or Last-Modified header changes and we detect it reliably"
verdict: PENDING
related: []
tags: [detection, netlify, polling, headers, no-build]
---

# Spike 001: ETag HEAD Poll

## What This Validates
Given we periodically fire `fetch('/index.html', { method: 'HEAD', cache: 'no-store' })`, when a new deploy lands on Netlify, then the `ETag` or `Last-Modified` response header changes — giving us a zero-build-step version signal.

## Research

| Approach | Tool | Pros | Cons | Status |
|----------|------|------|------|--------|
| ETag HEAD poll | Native fetch | Zero build step, works everywhere, simple logic | CDN may not propagate immediately; some servers don't send ETag | **Chosen** |
| Service Worker `updatefound` | SW API | Event-driven, no polling | Requires SW file at root, complex lifecycle, `skipWaiting` dance | Skipped |
| `version.json` poll | fetch + manual | Explicit, reliable | Requires manual bump on every deploy — error-prone | Skipped |
| Firebase Remote Config | Firebase SDK | Already in project | Overkill; cost; latency to propagate | Skipped |

**Chosen approach:** ETag HEAD poll. Netlify sets `Cache-Control: public, max-age=0, must-revalidate` on HTML files, so `index.html` is always revalidated — and its ETag changes atomically with each deploy. `Last-Modified` is the fallback if ETag is absent. No build step needed.

**Gotcha to watch:** `python -m http.server` returns ETags based on file mtime + size, so modifying and saving `index.html` locally simulates a deploy perfectly — ideal for this spike.

## How to Run
1. From project root: `python -m http.server 8000`
2. Open: `http://localhost:8000/.planning/spikes/001-etag-head-poll/spike.html`
3. Watch the snapshot table and poll log populate

## What to Expect
- Initial poll sets the baseline ETag/Last-Modified and shows it in the table
- Every 5 seconds (demo cadence), a new poll fires and logs the result
- **To trigger detection:** Open `index.html` in your editor, add a space, save it → within 5 seconds the log shows `CHANGE DETECTED` and the update banner slides in from the top
- Headers table shows Cache-Control, ETag, Last-Modified so you can verify what Netlify will actually send

## Investigation Trail
— (to be filled during run)

## Results
— (to be filled after verification)
