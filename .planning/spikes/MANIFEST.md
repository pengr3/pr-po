# Spike Manifest

## Idea
Add an update notification feature to the CLMC Engineering SPA — when a new version is deployed to Netlify, active users see a non-intrusive prompt to refresh their browser and pick up the latest changes. No build step available; must work with pure static JS.

## Requirements
- Must work without a build step (no webpack/vite — pure static SPA)
- Detection must be passive (polling, no user action needed to trigger check)
- Poll interval: **30 minutes** (deployed ~twice/month; HEAD request is headers-only, zero Firebase usage)
- Notification must be dismissible without forcing a refresh
- Must not interfere with active workflows (e.g. filling in a form)
- UX: **Variant A — fixed top strip** (full-width, slides in above nav, stacks vertically on mobile)

## Spikes

| # | Name | Type | Validates | Verdict | Tags |
|---|------|------|-----------|---------|------|
| 001 | etag-head-poll | standard | Given `HEAD /index.html` is polled every 30 min, when Netlify deploys a new version, then the ETag or Last-Modified header changes and we detect it | VALIDATED ✓ | detection, netlify, polling, headers |
| 002 | update-banner-ux | standard | Given a version change is detected, when the banner renders, then the user can see and dismiss it without disrupting active workflows | VALIDATED ✓ — Variant A chosen | ux, banner, notification, design |
| 003a | icon-inline-svg | comparison | Given 16 notification types each get a unique inline SVG path in TYPE_META.icon, when rendered in the type badge, then all types are visually distinct and consistent across Win/Mac | VALIDATED ✓ WINNER — inline SVG, no index.html changes | icons, svg, notification, design |
| 003b | icon-svg-symbol | comparison | Given icons are `<symbol>` defs in index.html referenced via `<use>`, same validation question — implementation approach only differs | VALIDATED ✓ — visually identical to 003a; 003a preferred for simplicity | icons, svg, symbol, notification |
| 004a | animation-slide | comparison | Given dropdown opens via `.open` class, when CSS transition fires, then content slides down via `translateY` smoothly | VALIDATED ✓ WINNER — translateY(-12px→0) + opacity, 200ms ease-out. Content readable throughout. | animation, dropdown, notification |
| 004b | animation-scale | comparison | Given same open trigger, when transition fires, then content scales from top-right origin via `scaleY` | VALIDATED ✓ — scaleY squashes row text mid-animation; 004a preferred | animation, dropdown, notification |
| 005 | unread-indicator | standard | Given an unread row, when rendered, then a left-border accent + subtle tint feels distinct without heavy blue fill | VALIDATED ✓ — Variant B wins: 3px #1a73e8 left border + #f8fbff tint. Best balance of signal vs badge-color interference. | unread, ux, notification, design |
