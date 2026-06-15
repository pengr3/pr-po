---
phase: 95-notification-row-redesign
plan: "01"
subsystem: notifications
tags: [notifications, ui, css, data-model]
dependency_graph:
  requires: []
  provides: [notification-row-3-line-anatomy, TYPE_META-action_required, TYPE_META-target_route, createNotification-object_name, createNotification-actor_name]
  affects: [app/notifications.js, styles/components.css]
tech_stack:
  added: []
  patterns: [3-line-notification-anatomy, escapeHTML-on-user-strings, optional-param-backward-compat]
key_files:
  modified:
    - app/notifications.js
    - styles/components.css
decisions:
  - "[Phase 95-01]: TYPE_META extended with action_required (bool) and target_route (string) on all 16 entries; 5 types are action_required=true (PR_REVIEW_NEEDED, TR_REVIEW_NEEDED, RFP_REVIEW_NEEDED, PROPOSAL_SUBMITTED, REGISTRATION_PENDING)"
  - "[Phase 95-01]: createNotification/createNotificationForRoles/createNotificationForUsers all accept object_name='' and actor_name='' as optional params with empty-string defaults; zero impact on all existing callers"
  - "[Phase 95-01]: renderDropdownRows uses n.source_id (not n.target_id from spike) as the Line 2 ID slot — source_id is the field written by all three createNotification* functions"
  - "[Phase 95-01]: safeObjName fallback chain: n.object_name || n.message — old docs lacking object_name show message text in Line 2 (NOTIF-R04 compliance)"
  - "[Phase 95-01]: handleNotificationClick falls back to TYPE_META[cached?.type]?.target_route when cached?.link is absent — defensive graceful fallback, stored links still take precedence"
  - "[Phase 95-01]: .notif-row-message CSS rule preserved as dead-but-harmless fallback; .notif-row-content rule also preserved; additive-only CSS change"
metrics:
  duration: "~15 min"
  completed: "2026-05-26"
  tasks: 3
  files: 2
---

# Phase 95 Plan 01: Notification Row Redesign — Core Module Summary

**One-liner:** Extended TYPE_META with action_required+target_route (16 entries), added object_name+actor_name to all creation APIs, and replaced renderDropdownRows with 3-line .na-body anatomy (event/objectId·name/actor).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend TYPE_META and creation function signatures | 363382e | app/notifications.js |
| 2 | Replace renderDropdownRows HTML with 3-line anatomy | 7c297ac | app/notifications.js |
| 3 | Add .na-* CSS rules to components.css | da4abf5 | styles/components.css |

## What Was Built

**Task 1 — TYPE_META + creation API extension:**
- All 16 TYPE_META entries now carry `action_required` (bool) and `target_route` (string) alongside existing label/icon/color
- 5 action_required=true types: PR_REVIEW_NEEDED, TR_REVIEW_NEEDED, RFP_REVIEW_NEEDED, PROPOSAL_SUBMITTED, REGISTRATION_PENDING
- All three creation functions (`createNotification`, `createNotificationForRoles`, `createNotificationForUsers`) accept and write `object_name` and `actor_name` to Firestore; both default to `''` so all 22+ existing callers continue to work unmodified

**Task 2 — renderDropdownRows 3-line anatomy:**
- Replaced `.notif-row-content` > `.notif-row-message` + `.notif-row-time` with `.na-body` > `.na-l1` / `.na-l2` / `.na-l3`
- Line 1: `<span class="na-event">` (type label) + optional `<span class="na-chip">● Action needed</span>` + `<span class="na-time">`
- Line 2: `<span class="na-obj-id">` (source_id) + `<span class="na-sep">·</span>` + `<span class="na-obj-name">` (object_name or message fallback); entire div omitted when both empty
- Line 3: `<div class="na-l3">by ActorName</div>` — omitted when actor_name is 'System' or absent
- All user-supplied strings (source_id, object_name, actor_name) wrapped in escapeHTML() per T-95-01 mitigation
- `handleNotificationClick` now falls back to `TYPE_META[cached?.type]?.target_route` when `cached?.link` is absent

**Task 3 — .na-* CSS rules:**
- 10 new CSS classes added to styles/components.css after `.notif-row-time` block
- Section comment header matches existing Phase 83 convention
- Design tokens aligned with project system: #1a73e8 (primary), #1e293b (text), #64748b (muted), #334155 (secondary text)
- Action chip uses amber palette (#fef3c7 bg / #92400e text / #fcd34d border)
- .na-obj-id uses Consolas monospace for ID visual treatment

## Deviations from Plan

**1. [Rule 2 — Clarification] n.source_id used instead of n.target_id for Line 2 ID slot**
- **Found during:** Task 2 implementation
- **Issue:** Spike 006 HTML in PATTERNS.md references `n.target_id`, but the Firestore field written by all three createNotification* functions is `source_id`. The plan's action explicitly notes this: "Note on safeTargetId: the spike uses n.target_id but the Firestore field written by createNotification is source_id."
- **Fix:** Used `n.source_id` as specified in the plan task action, not `n.target_id` from the spike prototype
- **Files modified:** app/notifications.js (Task 2)

No other deviations. Plan executed as specified.

## Known Stubs

None. The renderer is fully wired to live Firestore data. Line 2 and Line 3 will be empty/absent for existing notifications that were written before this plan (they have no object_name or actor_name fields) — this is expected pre-95-02 behavior documented in the plan's verification section.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries introduced beyond what was declared in the plan's threat model.

T-95-01 (XSS via user-supplied strings in renderDropdownRows) — **mitigated**: all three user-supplied fields (n.source_id, n.object_name, n.actor_name) are passed through escapeHTML() before HTML interpolation.

T-95-02 (TYPE_META target_route disclosure) — **accepted**: static compile-time strings, no user data.

T-95-03 (Firestore write of object_name/actor_name) — **accepted**: display-only fields, no privilege escalation, existing Firestore security rules govern write access.

## Self-Check: PASSED

- app/notifications.js: FOUND
- styles/components.css: FOUND
- 95-01-SUMMARY.md: FOUND
- Commit 363382e (Task 1): FOUND
- Commit 7c297ac (Task 2): FOUND
- Commit da4abf5 (Task 3): FOUND
