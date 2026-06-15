---
spike: 033
name: project-table-redesign
type: comparison
validates: "Given the flat projects/services table (Code, Name, Client, Status, Active, Actions), when management opens the Projects view, then they can immediately identify which projects need action without scanning every row"
verdict: VALIDATED ✓ — D+B hybrid chosen
tags: [projects, portfolio, table, ux, redesign, stage-aware-finance, attention-feed, dlp, retention]
---

# Spike 033 — Project Portfolio Table Redesign

## What Was Explored

5 layout options for the projects/services summary table. Driven by the insight that the current flat table gives management no urgency signal — every row looks the same regardless of whether a proposal has been stale for 47 days or a project is quietly making progress.

| Option | Concept | Verdict |
|--------|---------|---------|
| A | Kanban Pipeline Board | Not recommended — horizontal scroll; list-style preferred for construction PM |
| B | Stage-Grouped List | WINNER (toggle) — collapsible groups, aggregate totals, familiar table feel per group |
| C | Portfolio Card Grid | Not recommended — less dense, no sortable headers |
| D | Attention-Priority Feed | WINNER (primary) — urgency-sorted, app does the thinking |
| E | Portfolio Swimlane | Deferred — requires stage transition timestamps not yet stored |

## Decision: D+B Hybrid

**Option D (Attention Feed)** as the default — projects sorted by computed urgency signals, not status or date. Three sections: "Needs Attention" (red), "Worth Watching" (amber), "On Track" (green). Management opens the view and sees what needs their eyes first.

**Option B (Grouped List)** as "Browse All" toggle — a `[🔥 Priority Feed] [≡ Browse All]` button in the toolbar. Satisfies the neutral browse-all mental model without a separate view or route.

## Stage-Aware Finance

A critical constraint discovered early: contract value doesn't exist for pre-contract projects, so showing a billing bar for Inspection/Proposal is meaningless. Four display states:

| Stage | Display |
|-------|---------|
| Pre-contract (Inspection → Client Review) | "Proposed ₱X" or "Pre-contract" in muted text — no billing bar |
| Contracted, not billing (Client Approved / For Mobilization) | Contract value + amber "Billing not started" label |
| Active billing (On-going) | Contract value + mini billing utilization bar + % |
| Completed | Green ✓ "Fully billed · 100%" — or retention display (see below) |

## Retention / DLP (Design Only — Not Yet Built)

Three retention states modelled in the spike for completed projects:

| State | Color | Feed section |
|-------|-------|--------------|
| In defect liability period (DLP) | Amber bar | On Track |
| DLP expired, retention not released | Red bar + red left border | Needs Attention |
| Fully collected | Green ✓ | On Track |

**Important:** the app has no DLP fields today. `project_completed_at` exists but no `dlp_months`, `dlp_expires_at`, `retention_percentage`, `retention_amount`, `retention_status`, or `retention_released_at`. Building the retention display requires a DLP phase first (deferred).

## Urgency Signals (Option D)

Signals the feed computes automatically:
- Proposal stale (days in Client Review stage > threshold)
- Inspection overdue (days in For Inspection > threshold)
- No activity in N days (On-going project, `updated_at` stale)
- Contract signed, not yet mobilized (For Mobilization > N days)
- 86%+ billed — final tranche not requested
- Retention release overdue (DLP expired, retention not released)

Thresholds are constants that can be tuned post-launch.

## What to Avoid

- Do not show a billing progress bar for pre-contract projects — the value is null/zero and the bar implies 0% of something that doesn't exist yet
- Do not use Option E until `status_changed_at` timestamps are stored per stage transition — `updated_at` alone is too coarse
- Do not put the toggle in the nav — both modes are the same view, same URL, no new route needed

## Source

`index.html` — all 5 options + D+B combo tab, open in browser
