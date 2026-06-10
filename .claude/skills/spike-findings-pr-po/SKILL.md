---
name: spike-findings-pr-po
description: Implementation blueprint from spike experiments for pr-po (CLMC Engineering procurement + project management SPA). Requirements, proven patterns, and verified knowledge for building project journal, lifecycle, activity tracking, and portfolio view features. Auto-loaded during implementation work.
---

<context>
## Project: pr-po (CLMC Engineering Operations SPA)

Pure static SPA (no build step, no framework) backed by Firebase Firestore. Manages procurement (MRFs, PRs, POs) and project lifecycle from inspection through completion. Spike sessions have explored: update notifications (001–007), project-detail layout redesign (008–009), Gantt milestones/overdue/baseline/iterations (010–018), fee display (019–020), plan card redesign (021–023), collectible billing UI (025–027), lifecycle gate map and accordion (027–031), project journal for On-going execution (032), and projects/services portfolio table redesign (033).

Spike sessions wrapped: 032 (2026-06-09), 033 (2026-06-10)
</context>

<requirements>
## Requirements

- Must work without a build step (no webpack/vite — pure static SPA, ES6 modules via CDN)
- Firebase Firestore v10.7.1 CDN imports; project ID `clmc-procurement`
- Detection/polling: passive, no user action needed (for update notification feature)
- Poll interval: 30 minutes for version checks
- Update notification: dismissible, non-intrusive, fixed top strip (Variant A)
- Notification row anatomy: 3-line (event title + optional chip + time / objectId·name / actor)
- Project journal: all three surfaces ship — Activity Feed, Progress Updates, Issues
- Project journal edit history folds into Activity Feed as system auto-entries (field diffs)
- Project journal Progress Updates are manual only — no Gantt integration
- Project journal permissions: any user with project access can post — no role-gating
- Gantt baseline: Variant F (dashed outline + slip badge); bar color owned separately by overdue logic
- Gantt overdue: Variant B (row tinting + bar color); no Status column
- Iteration restore: auto-snapshot safety net (015c canonical); 5s undo toast
- Iteration history: right rail (017B canonical)
- Lifecycle: accordion card above Info+Financial; status dropdown removed; For Revision = amber sub-state on Client Review node
- Projects portfolio: D+B hybrid — Option D (Attention Feed) as default, Option B (Grouped List) as Browse All toggle in same toolbar
- Stage-aware finance: pre-contract shows label only (no bar), contracted shows value + "billing not started", active shows utilization bar + %, completed shows green ✓ (or retention display once DLP phase ships)
- Retention/DLP display: 3 states (in-DLP amber, DLP-expired red, released green) — stubbed in code, activated when DLP phase ships
- Option E (Swimlane) deferred: requires per-status `status_changed_at` timestamps not yet stored
</requirements>

<findings_index>
## Feature Areas

| Area | Reference | Key Finding |
|------|-----------|-------------|
| Project Journal (On-going Activity) | references/project-journal.md | 3 Firestore subcollections (activity_entries, progress_updates, issues); real-time listeners per tab; edit history as system feed entries; no role-gating |
| Project Portfolio View | references/project-portfolio-view.md | D+B hybrid: Attention Feed (default) + Browse All toggle; stage-aware finance (4 states); urgency signals; DLP retention hooks stubbed for future phase |

## Source Files

Original spike source files preserved in `sources/` for complete reference.

- `sources/032-ongoing-activity-panel/` — Activity panel demo with all 3 tabs, full CSS, interaction logic
- `sources/033-project-table-redesign/` — All 5 layout options + D+B combo tab; open spike.html in browser
</findings_index>

<metadata>
## Processed Spikes

- 032-ongoing-activity-panel
- 033-project-table-redesign
</metadata>
