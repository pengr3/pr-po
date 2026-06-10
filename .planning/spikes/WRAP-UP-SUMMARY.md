# Spike Wrap-Up Summary

**Date:** 2026-06-09 / 2026-06-10
**Spikes processed:** 2
**Feature areas:** Project Journal (On-going Activity), Project Portfolio View
**Skill output:** `./.claude/skills/spike-findings-pr-po/`

## Processed Spikes

| # | Name | Type | Verdict | Feature Area |
|---|------|------|---------|--------------|
| 032 | ongoing-activity-panel | comparison | VALIDATED ✓ | Project Journal |
| 033 | project-table-redesign | comparison | VALIDATED ✓ — D+B hybrid chosen | Project Portfolio View |

## Key Findings

The On-going project phase was a functional void — only a "Mark as Completed" button existed. Spike 032 explored three journal surfaces as tabs in a unified panel. All three confirmed for the real build:

- **Activity Feed** — freeform tagged notes (Update / Milestone / Client Comm) + system auto-entries (status changes, PO events, field edit diffs). Edit history folds in as system entries — no separate UI needed.
- **Progress Updates** — manual structured check-ins (% complete, summary, blockers, next milestone). Manual-only; no Gantt integration. Justified by a client/management reporting use case.
- **Issues** — categorized punch list (Delay / Change Order / Site Issue / Client Request) with open/resolved workflow and filter chips.

**Data model:** 3 Firestore subcollections under `projects/{projectId}` — `activity_entries`, `progress_updates`, `issues`. Real-time `onSnapshot` listeners per tab. No composite indexes needed.

**Permissions:** Any project-access user (ops, admin, procurement, finance) can post to all surfaces. No role-gating within the journal.
