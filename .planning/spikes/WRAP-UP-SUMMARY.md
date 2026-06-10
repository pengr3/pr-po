# Spike Wrap-Up Summary

**Date:** 2026-06-09 / 2026-06-10
**Spikes processed:** 5 (032, 033, 034, 035, 036)
**Feature areas:** Project Journal (On-going Activity), Project Portfolio View, DLP & Retention Tranche Management
**Skill output:** `./.claude/skills/spike-findings-pr-po/`

## Processed Spikes

| # | Name | Type | Verdict | Feature Area |
|---|------|------|---------|--------------|
| 032 | ongoing-activity-panel | comparison | VALIDATED ✓ | Project Journal |
| 033 | project-table-redesign | comparison | VALIDATED ✓ — D+B hybrid chosen | Project Portfolio View |
| 034 | dlp-entry-placement | comparison | PARTIAL — Hybrid A+B chosen | DLP & Retention |
| 035 | tranche-editor-in-detail | standard | VALIDATED ✓ | Tranche Management |
| 036 | dlp-states-finance-bar | standard | VALIDATED ✓ | DLP Display |

## Key Findings

The On-going project phase was a functional void — only a "Mark as Completed" button existed. Spike 032 explored three journal surfaces as tabs in a unified panel. All three confirmed for the real build:

- **Activity Feed** — freeform tagged notes (Update / Milestone / Client Comm) + system auto-entries (status changes, PO events, field edit diffs). Edit history folds in as system entries — no separate UI needed.
- **Progress Updates** — manual structured check-ins (% complete, summary, blockers, next milestone). Manual-only; no Gantt integration. Justified by a client/management reporting use case.
- **Issues** — categorized punch list (Delay / Change Order / Site Issue / Client Request) with open/resolved workflow and filter chips.

**Data model:** 3 Firestore subcollections under `projects/{projectId}` — `activity_entries`, `progress_updates`, `issues`. Real-time `onSnapshot` listeners per tab. No composite indexes needed.

**Permissions:** Any project-access user (ops, admin, procurement, finance) can post to all surfaces. No role-gating within the journal.

---

## DLP & Retention Tranche Management (034–036, 2026-06-10)

**Architecture decision (034):** Hybrid entry point chosen — "Ret?" toggle on the tranche editor marks which tranche is the retention tranche (accessible any time via inline tranche editor in project-detail); DLP period/dates filled at completion gate Step 2. Three alternatives compared (tranche toggle / gate step / standalone card); pure tranche-entry rejected because DLP details are typically unknown at tranche-setup time.

**Tranche editing gap closed (035):** `collection_tranches` was only editable from the Projects list edit modal. Inline tranche editor in project-detail.js makes it accessible while the project is On-going. "Ret?" toggle is single-select (toggling one clears others). DLP sub-fields are optional at tranche-setup time.

**4-state finance bar (036):** `getDlpState()` derives state at render time from `dlp_months`, `dlp_expires_at`, `retention_released_at`. Stacked bar separates collected cash from held retention. "Record Release" on expired state is Finance-only (role-gated). Same 3 DLP states appear in the portfolio row via left-border accent color.

**Data model confirmed:**
- DLP fields on project document: `dlp_months`, `dlp_start_date`, `dlp_expires_at`, `retention_percentage`, `retention_amount`, `retention_released_at`
- `is_retention: true` flag on one `collection_tranches` entry identifies the retention tranche
- No Firestore migration — schemaless; documents without DLP fields → `active` state
