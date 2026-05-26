---
status: reviewed
phase: 95-notification-row-redesign
reviewed_at: "2026-05-26"
reviewer: claude-sonnet-4-6
depth: standard
files_reviewed: 10
finding_counts:
  critical: 0
  warning: 2
  info: 0
  total: 2
---

# Code Review: Phase 95 — Notification Row Redesign

**Files reviewed:** app/notifications.js, styles/components.css, app/proposal-modal.js, app/views/finance.js, app/views/home.js, app/views/mrf-form.js, app/views/procurement.js, app/views/project-detail.js, app/views/register.js, app/views/service-detail.js

---

## Findings

### WR-01 — `safeId` single-quote not escaped in onclick attribute strings

**File:** `app/notifications.js` (renderDropdownRows, line ~212)
**Severity:** Warning | **Confidence:** 82

`safeId` and the markNotificationRead docId are interpolated into `onclick="…('safeId')"`. `escapeHTML()` converts `<`, `>`, `&`, and `"` but does NOT escape single quotes (`'`). Firestore auto-generated IDs are alphanumeric-only so this is not exploitable with current data, but any manually supplied doc ID containing `'` would break the onclick handler by ending the string early.

**Fix:** Append `.replace(/'/g, "\\'")` after `escapeHTML()` for IDs used inside single-quoted JS attribute strings, or refactor to `data-*` attribute + delegated event listener.

---

### WR-02 — `timeStr` not wrapped in `escapeHTML` before HTML insertion

**File:** `app/notifications.js` (renderDropdownRows, line ~202)
**Severity:** Warning | **Confidence:** 80

`timeStr` is placed in `<span class="na-time">…</span>` without escaping. `absTime` (the tooltip) is correctly escaped but `timeStr` (the visible text) is not. `formatRelativeTime` only returns static/locale strings today so this is not exploitable in practice — but it is inconsistent with the XSS mitigation comment at line ~195 and the escaping discipline applied to all other user-supplied values.

**Fix:** `const timeStr = escapeHTML(formatRelativeTime(n.created_at));`

---

## Passed Checks

- **XSS (object_name, actor_name, source_id):** All three user-supplied strings in `renderDropdownRows` wrapped in `escapeHTML()` before HTML interpolation. T-95-01 mitigation confirmed.
- **Creation functions:** All 3 (`createNotification`, `createNotificationForRoles`, `createNotificationForUsers`) write `object_name` and `actor_name` to every Firestore payload. Both params have `= ''` defaults — all existing callers unaffected.
- **27 call sites:** Confirmed present across all 8 files (2+1+1+1+2+2+6+12). No broken try/catch blocks or argument restructuring.
- **actor_name: 'System':** Correctly applied to automated events — `PO_DELIVERED` (procurement.js) and `REGISTRATION_PENDING` (register.js). All other 25 sites use the human-actor pattern.
- **`excludeActor: false` on REGISTRATION_PENDING:** Intentional and correct — new user IS the actor; self-exclusion would suppress the admin fan-out.
- **CSS additive-only:** All `.notif-row*` rules preserved. `.na-*` rules (10 classes) are strictly additive. No regressions.
- **`safeObjName` fallback to `n.message`:** Correctly handles pre-95 notifications without `object_name`. NOTIF-R04 satisfied.
- **Line 3 suppression (`safeActor !== 'System'`):** Correct. `escapeHTML('System') === 'System'` so no false-negatives.
- **handleNotificationClick target_route fallback:** Defensive — stored links take precedence, `target_route` fires only when `cached?.link` is absent.
