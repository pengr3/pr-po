# Notification UI

## Requirements

- Notification rows: **3-line anatomy** — event title + optional "● Action needed" chip + relative time / objectId · objectName / actor name (omit if System)
- Relationship badge: **not used** — confirmed noise; dropped
- FYI chip: **not used** — silence = informational; chip adds no value
- Icon approach: **inline SVG in TYPE_META.icon** (003a) — zero index.html changes
- Dropdown animation: **translateY(-12px→0) + opacity** (004a) — 200ms ease-out
- Unread indicator: **3px `#1a73e8` left border + `#f8fbff` background tint** (005, Variant B)
- Schema delta: only **2 new fields** — `object_name` and `actor_name` embedded at write time

## How to Build It

### Row Anatomy (Spike 006)

Three-line structure per row:

```
Line 1: [Icon] [Event title]  [● Action needed chip?]  [relative time]
Line 2:        [objectId (monospace blue)] · [objectName]
Line 3:        [actor name]  — omit entire line if actor === "System"
```

```javascript
function renderNotificationRow(n) {
    const meta = TYPE_META[n.event_type] || {};
    const actionChip = n.action_required
        ? `<span class="notif-action-chip">● Action needed</span>`
        : '';
    const actorLine = (n.actor_name && n.actor_name !== 'System')
        ? `<div class="notif-actor">${escapeHTML(n.actor_name)}</div>`
        : '';
    return `
        <div class="notif-row ${n.is_read ? '' : 'notif-unread'}" onclick="...">
            <div class="notif-icon">${meta.icon || ''}</div>
            <div class="notif-body">
                <div class="notif-line1">
                    <span class="notif-title">${escapeHTML(meta.title || n.event_type)}</span>
                    ${actionChip}
                    <span class="notif-time">${relativeTime(n.timestamp)}</span>
                </div>
                <div class="notif-line2">
                    <span class="notif-obj-id">${escapeHTML(n.target_id || '')}</span>
                    ${n.object_name ? `· <span>${escapeHTML(n.object_name)}</span>` : ''}
                </div>
                ${actorLine}
            </div>
        </div>
    `;
}
```

### Icon Set (Spike 003a)

Use inline SVG strings in `TYPE_META[type].icon`. Heroicons outline set, 24×24 viewBox, `stroke-width="1.75"`, `stroke-linecap="round"` `stroke-linejoin="round"`. Render at 16×16 in the badge.

```javascript
const TYPE_META = {
    MRF_APPROVED:           { title: 'MRF Approved',        action_required: false, icon: `<svg viewBox="0 0 24 24" ...><polyline points="20,6 9,17 4,12"/></svg>` },
    MRF_REJECTED:           { title: 'MRF Rejected',        action_required: false, icon: `<svg ...><line x1="18" y1="6" x2="6" y2="18"/>...</svg>` },
    PR_REVIEW_NEEDED:       { title: 'PR Review Needed',    action_required: true,  icon: `<svg ...><!-- circle-exclamation --></svg>` },
    TR_REVIEW_NEEDED:       { title: 'TR Review Needed',    action_required: true,  icon: `<svg ...><!-- truck --></svg>` },
    RFP_REVIEW_NEEDED:      { title: 'RFP Review Needed',   action_required: true,  icon: `<svg ...><!-- document+magnify --></svg>` },
    PROJECT_STATUS_CHANGED: { title: 'Project Updated',     action_required: false, icon: `<svg ...><!-- rotating arrows --></svg>` },
    PROJECT_COST_CHANGED:   { title: 'Cost Changed',        action_required: false, icon: `<svg ...><!-- dollar-circle --></svg>` },
    REGISTRATION_PENDING:   { title: 'New User Pending',    action_required: true,  icon: `<svg ...><!-- user-plus --></svg>` },
    PROPOSAL_SUBMITTED:     { title: 'Proposal Submitted',  action_required: false, icon: `<svg ...><!-- paper-plane --></svg>` },
    PROPOSAL_DECIDED:       { title: 'Proposal Decided',    action_required: false, icon: `<svg ...><!-- star --></svg>` },
    MRF_SUBMITTED:          { title: 'MRF Submitted',       action_required: false, icon: `<svg ...><!-- document-plus --></svg>` },
    PR_DECIDED:             { title: 'PR Decided',          action_required: false, icon: `<svg ...><!-- check-circle --></svg>` },
    TR_DECIDED:             { title: 'TR Decided',          action_required: false, icon: `<svg ...><!-- badge-check --></svg>` },
    RFP_PAID:               { title: 'RFP Paid',            action_required: false, icon: `<svg ...><!-- banknotes --></svg>` },
    PO_DELIVERED:           { title: 'PO Delivered',        action_required: false, icon: `<svg ...><!-- archive-box --></svg>` },
    COLLECTIBLE_CREATED:    { title: 'Collectible Created', action_required: false, icon: `<svg ...><!-- coin --></svg>` },
};
```

Full SVG paths are in `sources/003-notification-polish/spike.html` — extract from the TYPE_META block.

### Dropdown Animation (Spike 004a)

```css
.notif-dropdown {
    transform: translateY(-12px);
    opacity: 0;
    pointer-events: none;
    transition: transform 0.2s ease-out, opacity 0.2s ease-out;
}
.notif-dropdown.open {
    transform: translateY(0);
    opacity: 1;
    pointer-events: auto;
}
```

**Do not use `scaleY`** — it squashes row text mid-animation (validated as inferior in 004b).

### Unread Indicator (Spike 005, Variant B)

```css
.notif-row.notif-unread {
    border-left: 3px solid #1a73e8;
    background: #f8fbff;
    padding-left: calc(/* existing padding */ - 3px); /* compensate for border */
}
```

Variant B (border + tint) beats Variant A (heavy blue fill) — fill fights with type badge colors; tint is subtle enough to not clash.

### Schema Delta (Spike 007)

Add **2 fields** to every notification document at write time:

```javascript
// When writing a notification to Firestore:
await addDoc(collection(db, 'notifications'), {
    event_type: 'MRF_APPROVED',
    target_id: mrfId,
    object_name: mrf.mrf_id,        // NEW — human label of target doc
    actor_name: user?.displayName || 'System',  // NEW — who triggered it
    timestamp: serverTimestamp(),
    is_read: false,
    action_required: false,
    // message: '...',  // DEPRECATED — can be removed once new fields are live
});
```

`actor_name` for system-triggered events (PO_DELIVERED, PROJECT_COST_CHANGED, REGISTRATION_PENDING, COLLECTIBLE_CREATED): always set to `"System"` — no user lookup needed.

## What to Avoid

- **emoji icons** (`⏳`, `📦`) — render at inconsistent sizes and OS-specific colors
- **Shared text characters** (`✓`, `$`, `!`) across multiple types — no visual distinction
- **003b (SVG symbol)** — requires modifying `index.html` for no visual gain over 003a
- **`scaleY` animation** — squashes row text mid-transition; slides feel broken
- **Heavy blue fill for unread** — fights with type badge background colors
- **Relationship badge** ("You submitted this") — confirmed noise by user in spike 006
- **FYI chip** on informational rows — silence already signals "no action needed"
- **`message` field** for row display — replace with `event_title` (derived) + `object_name` + `actor_name`

## Constraints

- SVG icons must render cleanly at 16×16 (viewBox 24×24, stroke-width 1.75)
- `actor_name` is embedded at write time — don't try to look it up at read time
- `object_name` must be embedded at write time — it's the label at that moment (project names change)

## Origin

Synthesized from spikes: 003a, 003b, 004a, 004b, 005, 006, 007
Source files: `sources/003-notification-polish/`, `sources/006-notification-row-anatomy/`, `sources/007-notification-copy-templates/`
