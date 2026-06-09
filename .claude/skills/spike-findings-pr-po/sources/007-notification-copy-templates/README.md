---
spike: 007
name: notification-copy-templates
type: standard
validates: "Given a 5W+2 data contract applied to all 16 notification types, then every slot can be filled without faking data, and the schema gap reveals the minimum new fields needed"
verdict: VALIDATED ✓
related: [006]
tags: [notification, content, schema, copy, design, 5w2]
---

# Spike 007: Notification Copy Templates

## What This Validates

**Given** the validated 3-line anatomy from spike 006  
**When** applied to all 16 existing notification types  
**Then** every row fills cleanly — and the schema gap is a clear, minimal delta to the notification document

## How to Run

```bash
python -m http.server 8000
# Open: http://localhost:8000/.planning/spikes/007-notification-copy-templates/spike.html
```

## What to Expect

Three tabs:

**Content Matrix** — 16-row table, each column mapped to a 5W+2 slot, color-coded:
- Green (STORED) — already in the notification document
- Blue (DERIVED) — computable from event_type at render time
- Yellow (NEW FIELD) — must be embedded when the notification is written

**Rendered Preview** — All 16 types shown as actual notification rows using the spike 006 anatomy. See how each event title, object ID, object name, actor, and action chip look with realistic example data.

**Schema Gap** — The minimum Firestore delta: current document structure → updated structure, plus the write-time pattern.

## Key Finding (before human review)

Only **2 new fields** are needed in the notification document:
- `object_name` — human label of the target doc (project name, proposal title, supplier name, etc.)
- `actor_name` — who triggered the event (display name, or `"System"` for automated events)

Everything else is either already stored (`target_id`, `timestamp`) or fully derivable from `event_type` (`action_required`, `target_route`, `event_title`).

The current `message` blob field can be deprecated once these two fields are added.

## Investigation Trail

### Session 1 (2026-05-26)
- Applied 006 anatomy to all 16 types: MRF ×3, PR ×2, TR ×2, RFP ×2, PO ×1, Proposal ×2, Project ×2, Registration ×1, Collectible ×1
- All 16 fill without gaps when `object_name` and `actor_name` are available
- Derived fields: action_required, target_route, event_title — all encodable in TYPE_META
- System-triggered types (PO_DELIVERED, PROJECT_COST_CHANGED, REGISTRATION_PENDING, COLLECTIBLE_CREATED) always get actor = "System" — no user lookup needed

## Results

**VALIDATED ✓** — 5W+2 framework fills cleanly across all 16 types. Schema gap confirmed: only 2 new fields needed (`object_name`, `actor_name`). All 16 types render without faking data. `message` blob field can be deprecated once these fields are embedded at write time. Content matrix and rendered preview verified correct by human review.
