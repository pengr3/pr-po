---
spike: 006
name: notification-row-anatomy
type: standard
validates: "Given a redesigned row applies the 5W+2 layout (event / object / actor / time / relationship / action-badge), when scanning 8 diverse notification types, then every row feels complete and no slot feels redundant or cluttered at normal dropdown width"
verdict: VALIDATED
related: [003, 004, 005]
tags: [notification, ux, layout, content, design, 5w2]
---

# Spike 006: Notification Row Anatomy

## What This Validates

**Given** a redesigned notification row applying the 5W+2 framework  
**When** scanning 8 notification types with varied actors, objects, and relationships  
**Then** every row communicates its signal clearly without feeling cluttered

## How to Run

```bash
python -m http.server 8000
# Open: http://localhost:8000/.planning/spikes/006-notification-row-anatomy/spike.html
```

## What to Expect

- **Left panel:** Current format — a blob of prose text + time
- **Right panel:** 5W+2 format — 3-line anatomy with icon / event+chip+time / objectId·name / actor·relationship
- **Anatomy legend:** Numbered labels mapping each visual slot to its 5W+2 question
- **Controls (bottom-left):** Toggle each of the four "signal layers" on/off to test what's load-bearing vs noise

### Test these questions while reviewing:
1. Does the 3-line height feel acceptable, or does it make the list feel too tall?
2. Does the "● Action needed" chip add urgency, or is it just noise against the event title?
3. Does the relationship badge ("You submitted this", "You are the approver") add orientation, or can you already tell from context?
4. Is the object ID (monospace, blue) helpful or distracting on the FYI rows?

## Investigation Trail

### Session 1 (2026-05-26)
- Decomposed 5W+2 into 3 visual lines: event+chip+time / objectId·name / actor·relationship
- Built side-by-side comparison with 8 representative notification types
- Toggle controls to isolate signal layers — lets us decide what's load-bearing vs decorative
- Key tension: relationship badge ("Why me?") is the most novel slot — needs human judgment to validate

## Results

**VALIDATED ✓**

| Slot | Verdict |
|------|---------|
| 3-line row height | Keep — acceptable |
| "● Action needed" chip | Keep — shows only when `action_required=true`; silence = informational |
| Relationship badge ("Why me?") | **DROP** — noise |
| Object ID + name (line 2) | Keep — single parent doc, always ID + label |

**Final anatomy:**
- Line 1: event title · optional "● Action needed" chip · relative time
- Line 2: objectId (monospace blue) · objectName
- Line 3: actor name (omit if System)
