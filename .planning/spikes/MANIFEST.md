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
