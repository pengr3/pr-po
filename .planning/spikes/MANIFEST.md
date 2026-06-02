# Spike Manifest

## Idea (current series: 015–018)
Extend the baselining mechanic (spike 014 / Phase 86.12) into **project plan iterations** — let users save the current plan as a named snapshot and later restore one. Conceptually distinct from baselines: baselines are immutable comparison anchors; iterations are save-states the user can rewind to. Open questions: restore semantics (destructive replace vs preview vs auto-snapshot safety net), snapshot scope (dates vs full task doc), history UX, and whether a diff view is worth the surface area.

## Idea (prior series: 001–010)
Add an update notification feature to the CLMC Engineering SPA — when a new version is deployed to Netlify, active users see a non-intrusive prompt to refresh their browser and pick up the latest changes. No build step available; must work with pure static JS.

## Requirements
- Must work without a build step (no webpack/vite — pure static SPA)
- Detection must be passive (polling, no user action needed to trigger check)
- Poll interval: **30 minutes** (deployed ~twice/month; HEAD request is headers-only, zero Firebase usage)
- Notification must be dismissible without forcing a refresh
- Must not interfere with active workflows (e.g. filling in a form)
- UX: **Variant A — fixed top strip** (full-width, slides in above nav, stacks vertically on mobile)
- Notification rows: **3-line anatomy** — event title + optional "● Action needed" chip + relative time / objectId · objectName / actor name (omit if System)
- Relationship badge: **not used** — noise without proportional value
- FYI chip: **not used** — silence signals informational
- Schema delta: only **2 new fields** needed — `object_name` (embedded from source doc) and `actor_name` (embedded from auth.currentUser or "System")

## Spikes

| # | Name | Type | Validates | Verdict | Tags |
| 011 | assignee-picker-in-grid | standard | Given a Resources column with free-text input, when user wants structured assignees, then a people picker sourced from project.personnel_user_ids is needed | DROPPED — retain free-text Resources; no picker | gantt, assignee, grid, project-plan |
|---|------|------|-----------|---------|------|
| 001 | etag-head-poll | standard | Given `HEAD /index.html` is polled every 30 min, when Netlify deploys a new version, then the ETag or Last-Modified header changes and we detect it | VALIDATED ✓ | detection, netlify, polling, headers |
| 002 | update-banner-ux | standard | Given a version change is detected, when the banner renders, then the user can see and dismiss it without disrupting active workflows | VALIDATED ✓ — Variant A chosen | ux, banner, notification, design |
| 003a | icon-inline-svg | comparison | Given 16 notification types each get a unique inline SVG path in TYPE_META.icon, when rendered in the type badge, then all types are visually distinct and consistent across Win/Mac | VALIDATED ✓ WINNER — inline SVG, no index.html changes | icons, svg, notification, design |
| 003b | icon-svg-symbol | comparison | Given icons are `<symbol>` defs in index.html referenced via `<use>`, same validation question — implementation approach only differs | VALIDATED ✓ — visually identical to 003a; 003a preferred for simplicity | icons, svg, symbol, notification |
| 004a | animation-slide | comparison | Given dropdown opens via `.open` class, when CSS transition fires, then content slides down via `translateY` smoothly | VALIDATED ✓ WINNER — translateY(-12px→0) + opacity, 200ms ease-out. Content readable throughout. | animation, dropdown, notification |
| 004b | animation-scale | comparison | Given same open trigger, when transition fires, then content scales from top-right origin via `scaleY` | VALIDATED ✓ — scaleY squashes row text mid-animation; 004a preferred | animation, dropdown, notification |
| 005 | unread-indicator | standard | Given an unread row, when rendered, then a left-border accent + subtle tint feels distinct without heavy blue fill | VALIDATED ✓ — Variant B wins: 3px #1a73e8 left border + #f8fbff tint. Best balance of signal vs badge-color interference. | unread, ux, notification, design |
| 006 | notification-row-anatomy | standard | Given the 5W+2 framework applied to a redesigned row, when scanning 8 types, then every row is complete and no slot is redundant | VALIDATED ✓ — 3-line anatomy: event+chip+time / objectId·name / actor. Relationship badge dropped (noise). FYI chip dropped (silence = informational). | notification, ux, layout, content, 5w2 |
| 007 | notification-copy-templates | standard | Given a 5W+2 data contract for all 16 types, then every slot fills without faking data and schema gap is minimal | VALIDATED ✓ — 2 new fields only (object_name, actor_name); all 16 types fill cleanly; message blob can be deprecated | notification, content, schema, copy, 5w2 |
| 008 | project-detail-layout | standard | Given excessive whitespace across stacked cards, when reorganized into compact 2-column layout with conditional plan/proposal visibility, then page density improves ~50% | VALIDATED ✓ — Concept B chosen; Status card eliminated (merged to header strip); plan hidden for For Inspection/Loss; bottom row adapts to proposal state | layout, ux, project-detail, whitespace |
| 009 | proposal-card-redesign | comparison | Given the inline proposal card lacks a heading and uses a subtle dot+label for status, when redesigned as A (status pill in header) or B (progress track), then the card matches the polish of the Project Plan card | VALIDATED ✓ — Concept B (track) + Alt B (title-first stat chips); track shows stage journey, chips match Financial Summary style, empty states silenced | ux, proposal, project-detail, design |
| 010 | milestone-ux | comparison | Given a task row in the Gantt grid, when user marks a task as milestone via A (context menu) or B (inline ◆ column), then the Gantt shows a diamond and the project-detail plan card "Next/Ongoing Milestone" slots populate | VALIDATED ✓ WINNER — Variant A (context menu right-click); amber entry; diamond prefix on name row | gantt, milestone, ux, project-plan, project-detail |
| 012 | overdue-status-visual | comparison | Given a task whose end_date is past with progress < 100, when rendered in the grid, then A (Status chip column) vs B (row tint + bar color) — which makes overdue obvious without noise on healthy tasks | VALIDATED ✓ WINNER — Variant B (row tinting + bar color); no Status column; overdue=red fill+border, complete=green fill | gantt, overdue, status, ux, project-plan |
| 013 | cascade-reschedule | standard | Given a predecessor bar is dragged to a later date, when committed, then downstream tasks shift automatically or via one-click prompt | SKIPPED — manual re-date acceptable | gantt, dependencies, cascade, project-plan |
| 014 | baseline | comparison | Given a saved baseline snapshot, when rendered alongside live task dates, then A (ghost bars) vs B (slim rail) — which makes schedule drift readable without cluttering the Gantt | VALIDATED ✓ WINNER — Variant F (dashed outline + slip badge); bar color untouched — owned by Spike 012 | gantt, baseline, schedule, ux, project-plan |
| 015a | restore-destructive-replace | comparison | Given a saved iteration, when user clicks Load, then a confirm modal warns "Replace current plan with this version?" → tasks in project_tasks are batched-overwritten | REJECTED — confirm modal becomes click-through theater; safety belongs in the system not a warning dialog | iteration, restore, save-state, project-plan, ux |
| 015b | restore-readonly-preview | comparison | Given a saved iteration, when user clicks Preview, then the Plan view shows the saved tasks in read-only mode with an Exit Preview banner — project_tasks untouched | REJECTED — preview-only defers the real restore question; feature has no teeth without actual load | iteration, restore, save-state, project-plan, ux |
| 015c | restore-auto-snapshot | comparison | Given a saved iteration, when user clicks Load, then current state is auto-saved as Iteration N+1 (auto) first, then the chosen iteration overwrites tasks — no data loss possible | WINNER — auto-snapshot safety net makes restore feel cheap and safe; 5s undo toast + auto-remove on undo prevents sidebar clutter | iteration, restore, save-state, undo, project-plan, ux |
| 016 | snapshot-scope | standard | Given the user wants to rewind, when an iteration is saved, then the snapshot must include {dates only / dates+deps / full task doc} — what scope feels like a real save-state without being heavy | WINNER — full task doc; partial scopes create confusing partial restores; storage cost negligible | iteration, snapshot, storage, schema, project-plan |
| 017 | iteration-history-ux | comparison | Given multiple saved iterations, when user wants to browse, then A (modal with rows) vs B (right rail timeline) vs C (toolbar dropdown like baseline) makes the right tradeoff | WINNER — Variant B (right rail); keeps live plan visible while browsing history; modal forces context switch; dropdown too cramped at scale | iteration, ux, history, project-plan |
| 018 | iteration-diff-view | standard | Given an iteration in history, when user wants "what's different from now?", then a side-by-side task list with adds/changes/deletes highlighted answers without loading the iteration | PENDING | iteration, diff, comparison, ux, project-plan |

