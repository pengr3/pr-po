---
spike: 032
name: ongoing-activity-panel
type: comparison
validates: "Given a project in On-going status, when we mock 3 surface candidates (A: Activity Feed, B: Progress Updates, C: Issue Tracker) as tabs in one panel, then we can feel which surfaces earn a real build and which can be cut"
verdict: PENDING
related: [031]
tags: [on-going, activity, notes, project-detail, ux, feed, issues, progress]
---

# Spike 032: On-going Activity Panel

## What This Validates

Given a project in On-going status, when we embed three surface candidates as tabs in a unified "On-going Activity" panel below the Info+Financial cards, then we can feel which one best fills the current void (today: only a "Mark as Completed" button exists), and decide what to actually build.

**Three candidates:**
- **Tab A — Activity Feed:** Freeform timestamped entries with tag types (Update / Milestone / Issue / Client Comm). System auto-entries merge in from status changes and PO events. Post-box composer at top.
- **Tab B — Progress Updates:** Periodic structured check-ins with % complete slider, summary, blockers, next milestone. Snapshot history showing progress curve over time.
- **Tab C — Issues:** Categorized punch list (Delay / Change Order / Site Issue / Client Request) with open/resolved workflow. Filter chips. Log form.

## How to Run

```
python -m http.server 8000
```
Open: `http://localhost:8000/.planning/spikes/032-ongoing-activity-panel/spike.html`

## What to Expect

- A mocked project-detail page for "Metro Line 7 — Station Fit-out Package" (status: On-going)
- Lifecycle accordion at top (click to expand — shows the same gate UI from spike 031)
- Info + Financial 2-column cards
- Activity Panel below with **3 tabs** — click through all three
- **Tab A (Feed):** 7 pre-populated entries. Try the composer — type a note, pick a tag, post it. Feed appends, count updates.
- **Tab B (Progress Updates):** 3 historical updates showing progress curve 8%→22%→38%. Click "+ New Progress Update", use the % slider, save.
- **Tab C (Issues):** 4 pre-seeded issues (2 open, 2 resolved). Try filter chips. Resolve an issue (amber button → badge). Log a new issue.
- Log pane at bottom shows all interactions with timestamps.

## Investigation Trail

### What we're really asking

The project currently has a functional void: once "On-going", the system has no way to record what happens. Every project just goes quiet until "Completed." The real question is: **what does ops actually want to record, and what do admins/finance want to read?**

Three candidates represent three very different mental models:
- **Feed** = "what happened today" — most natural for field staff; least structured; hardest to extract insight from
- **Progress Updates** = "where are we" — structured, good for client reporting; requires discipline to fill weekly; % field is only meaningful if tied to real task completion
- **Issues** = "what's blocking us" — most actionable for management; easy to scan; risk: becomes noise if everything gets logged

### Combination hypothesis

Feed + Issues is a natural pairing: the feed is the narrative, issues are the trackable exceptions. Progress updates might belong inside the Gantt (% complete already exists on tasks) rather than as a separate form.

### Data model preview (Firestore)

```
projects/{projectId}/activity_entries/{entryId}  // subcollection
  type: 'update' | 'milestone' | 'issue' | 'client' | 'system'
  text: string
  created_at: Timestamp
  created_by_uid: string
  created_by_name: string
  is_system: boolean  // auto-entries from status changes, PO events

projects/{projectId}/progress_updates/{updateId}  // subcollection
  pct_complete: number
  summary: string
  blockers: string
  next_milestone: string
  created_at: Timestamp
  created_by_uid: string

projects/{projectId}/issues/{issueId}  // subcollection
  issue_type: 'delay' | 'change_order' | 'site_issue' | 'client_request'
  title: string
  description: string
  status: 'open' | 'resolved'
  resolved_at: Timestamp | null
  created_at: Timestamp
  created_by_uid: string
```

Each is a subcollection — real-time listener per tab, no composite indexes needed for ordering by created_at.

## Results

PENDING — awaiting browser verification from user.
