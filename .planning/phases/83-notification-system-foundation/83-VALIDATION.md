---
phase: 83
slug: notification-system-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-29
---

# Phase 83 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: 83-RESEARCH.md → ## Validation Architecture (lines 673-707).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None for app code (zero-build SPA, no Jest/Vitest). Existing `test/firestore.test.js` uses `@firebase/rules-unit-testing` for Security Rules. |
| **Config file** | None for app code. `test/firestore.test.js` uses Firebase emulator config (verify currency in Wave 0). |
| **Quick run command** | Manual: `python -m http.server 8000` → DevTools Console / Network tab |
| **Full suite command** | `npm test` (runs `test/firestore.test.js` against emulator) — IF harness is current; verify per Open Question 1 in RESEARCH.md |
| **Estimated runtime** | Manual smoke ~30s; full UAT ~10 min; rule emulator suite (if added) ~15-30s |

---

## Sampling Rate

- **After every task commit:** Manual smoke — load app at `localhost:8000`, log in, run `window.__createTestNotification()`, observe badge increment (~30s)
- **After every plan wave:** Full UAT script across all 7 requirements (~10 min)
- **Before `/gsd:verify-work`:** Full suite must be green. If `test/firestore.test.js` rule tests added, `npm test` (or equivalent emulator run) must pass.
- **Max feedback latency:** ~30 seconds per task; ~10 minutes per wave

---

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command / Manual Procedure | Observable Signal | File Exists |
|--------|----------|-----------|--------------------------------------|-------------------|-------------|
| NOTIF-01 | Bell icon in top nav with real-time unread badge | manual + DOM | (1) Open `localhost:8000`, log in as active user. (2) `document.querySelector('#notifBell')` returns element. (3) `document.querySelector('#notifBadge')` exists. (4) Open second browser tab as another user; from tab A console run `__createTestNotification()` with tab B's `user_id`. (5) In tab B, badge increments within ~2s without refresh. | DOM has `#notifBell`, `#notifBadge`. Badge text increments live. Network tab shows `onSnapshot` Firestore listener established. | ❌ W0 — manual UAT |
| NOTIF-02 | Bell click → dropdown shows last 10 with type/message/source link/time | manual | (1) With ≥3 test notifications, click `#notifBell`. (2) `#notifDropdownMenu` toggles `.open`. (3) ≤10 rows render with type, message, time, source link. (4) "Mark all as read" header visible. (5) "View all notifications" footer to `#/notifications` visible. | Dropdown DOM has ≤10 `.notif-row` children with `.notif-row-message`, `.notif-row-time`, link. | ❌ W0 — manual UAT |
| NOTIF-03 | Click row → navigate to source AND mark read | manual + Network | (1) Create test notification with `link: '#/procurement/records'`. (2) Click row. (3) Hash changes to `#/procurement/records`. (4) Network tab shows ONE `updateDoc` setting `read=true, read_at=<timestamp>`. (5) Dropdown closes. (6) Badge decrements by 1. | URL hash changes; one Firestore `update`; dropdown closes. | ❌ W0 — manual UAT |
| NOTIF-04 | Mark single notification read | manual + Network | (1) ≥1 unread. Click per-row "mark read" affordance (NOT the row body). (2) Row visually flips read (loses `.notif-row--unread`). (3) Network tab shows ONE `updateDoc`. (4) Dropdown stays open. (5) Hash unchanged. | `read=true` in Firestore; UI updates within ~500ms via listener; dropdown stays open. | ❌ W0 — manual UAT |
| NOTIF-05 | "Mark all as read" in one click | manual + Network | (1) Create ≥5 unread. (2) Click "Mark all as read". (3) Network tab shows ONE `commit` (writeBatch atomic). (4) Badge → 0 within ~1s. (5) Button becomes disabled. (6) Verify zero-unread case starts disabled. | Single batch commit; badge → 0; button disabled. | ❌ W0 — manual UAT |
| NOTIF-06 | Full history page paginated 20/page including read items | manual + DOM | (1) Seed ≥25 notifications mixing read/unread. (2) Navigate to `#/notifications` via dropdown footer link. (3) Page renders 20 rows, "Older" enabled, "Newer" disabled (first page). (4) Click "Older" → next 5 rows render, "Newer" now enabled. (5) Read AND unread both appear. (6) Page title = "Notifications | CLMC Operations". | URL hash = `#/notifications`. DOM has paginated 20-row list. Page title set. | ❌ W0 — manual UAT |
| NOTIF-13 | Per-user Security Rules + persisted schema | rules-unit-test (preferred) OR manual | **Preferred (if `test/firestore.test.js` harness current):** add tests asserting (a) user A cannot read user B's notification (b) user A cannot create with `actor_id != request.auth.uid` (c) user A can flip `read` on own but not `user_id`/`type`/`created_at` (d) inactive user denied. **Manual fallback:** DevTools console: cross-user `getDoc`/`updateDoc` → `permission-denied`. **Schema:** write one notification via `__createTestNotification`, inspect Firestore — confirm all 10 fields (`user_id`, `type`, `message`, `link`, `source_collection`, `source_id`, `actor_id`, `read`, `read_at`, `created_at`). | Rule tests pass OR `permission-denied` errors caught. All 10 fields present. | ❌ W0 — `test/firestore.test.js` likely needs new test cases |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] **Test infra investigation:** Read `test/firestore.test.js` — confirm currency for v3.2 collections (`rfps` etc.). Decide ADD notification rule tests vs DEFER to hygiene task.
- [ ] **`__createTestNotification` dev helper:** Phase 83 ships gated by `isLocal` check. Without it, manual UAT for NOTIF-01..05 is much slower (must wait for Phase 84 triggers).
- [ ] **UAT script document:** Optional — small `.planning/phases/83-notification-system-foundation/UAT.md` listing the 7 procedures so verification is repeatable. (Planner's call.)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Bell badge real-time increment across tabs | NOTIF-01 | DOM listener behavior across browser-tab boundary; no test infra for live DOM in this codebase | Procedure in NOTIF-01 row above |
| Dropdown row click → atomic mark-read + navigate + close | NOTIF-03 | UI integration spans router, listener, and Firestore round-trip; not unit-testable in zero-build SPA | Procedure in NOTIF-03 row above |
| Cursor-based pagination (Newer/Older) | NOTIF-06 | Cursor edges depend on Firestore live data; deterministic only with seeded fixtures, which we don't have for app-level tests | Procedure in NOTIF-06 row above |
| Mobile bell visibility at ≤768px | NOTIF-01 (D-02) | Visual layout regression; no Storybook/Chromatic; check by resizing viewport | Resize viewport to 375px width — bell + badge must remain visible alongside hamburger and brand |

*Other manual UATs (NOTIF-02, NOTIF-04, NOTIF-05) listed in the Per-Task Verification Map. Rule-level NOTIF-13 has a preferred automated path (rules-unit-test) — only the schema-presence portion is purely manual.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies (manual UAT scripts documented in this file)
- [ ] Sampling continuity: no 3 consecutive tasks without verifiable signal
- [ ] Wave 0 covers all MISSING references (test infra investigation; `__createTestNotification` helper)
- [ ] No watch-mode flags
- [ ] Feedback latency < 600s per wave (10 min UAT)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
