# Proposal Card (Inline — Project/Service Detail)

## Requirements

- **Concept B chosen** — 4-node progress track (Draft → Internal Review → Client Review → Approved)
- **Alt B data section** — title-first, stat chips matching Financial Summary card style
- Loss state: track replaced with a `✕ Loss — Proposal closed` badge
- Overdue (>7d in current stage): amber left border on the card (`border-left: 3px solid #f59e0b`)
- Card has a `PROPOSAL` heading (uppercase, matching `PROJECT PLAN` card)
- Empty states silenced — do NOT render "No attachment" or "No comms yet"

## How to Build It

### Status Metadata

```javascript
const PROPOSAL_STATUS_META = {
    draft:            { trackIdx: 0 },
    pending_internal: { trackIdx: 1 },
    pending_client:   { trackIdx: 2 },
    for_revision:     { trackIdx: 2, warn: true },  // orange ring, same position as client
    client_approved:  { trackIdx: 3 },
    loss:             { trackIdx: -1 },              // -1 = show badge, not track
};
```

### Progress Track HTML

```javascript
const TRACK_NODES = ['Draft', 'Internal\nReview', 'Client\nReview', 'Approved'];
const CHECK_SVG = `<svg ...><polyline points="2,6 5,9 10,3"/></svg>`;

function renderProposalTrack(status) {
    const meta = PROPOSAL_STATUS_META[status];

    if (meta.trackIdx === -1) {
        return `<div class="proposal-track-loss-wrap">
            <div class="proposal-loss-badge">✕ Loss — Proposal closed</div>
        </div>`;
    }

    const isWarn = !!meta.warn;
    const nodes = TRACK_NODES.map((lbl, i) => {
        const passed = i < meta.trackIdx;
        const active = i === meta.trackIdx;
        const cls = passed ? 'passed' : (active ? (isWarn ? 'active-warn' : 'active') : '');
        return `<div class="proposal-track-node ${cls}">
            <div class="proposal-track-dot">${passed ? CHECK_SVG : ''}</div>
            <div class="proposal-track-label">${lbl.replace('\n','<br>')}</div>
        </div>`;
    }).join('');

    return `<div class="proposal-track-wrapper"><div class="proposal-track">${nodes}</div></div>`;
}
```

### Data Section (Alt B — Title-first + Stat Chips)

```javascript
function renderProposalData(proposal, overdue) {
    const ageDays = getAgeInStageDays(proposal);
    const isOverdue = isOverdueInStage(proposal);

    const attachHtml = proposal.attachment_kind
        ? (() => {
            let label = 'View link';
            if (proposal.attachment_kind === 'link') {
                try { label = new URL(proposal.attachment_url).hostname.replace('www.',''); } catch(_) {}
                return `<div class="proposal-info-row">📎 <a href="${escapeHTML(proposal.attachment_url)}" target="_blank" rel="noopener">${escapeHTML(label)}</a></div>`;
            }
            if (proposal.attachment_kind === 'file') {
                return `<div class="proposal-info-row">📎 <a href="${escapeHTML(proposal.attachment_url)}" target="_blank" rel="noopener">${escapeHTML(proposal.attachment_filename || 'Download')}</a></div>`;
            }
            return '';
        })()
        : '';  // NOTHING when absent — no "No attachment" text

    const log = proposal.comms_log || [];
    const commsHtml = log.length
        ? (() => {
            const last = log[log.length - 1];
            const desc = (last.description || '').slice(0, 60) + ((last.description || '').length > 60 ? '…' : '');
            return `<div class="proposal-info-row">💬 ${escapeHTML(last.date)} · ${escapeHTML(desc)}</div>`;
        })()
        : '';  // NOTHING when absent — no "No comms yet" text

    return `
        <div class="proposal-data-section">
            <div class="proposal-title">${escapeHTML(proposal.title || '(Untitled proposal)')}</div>
            <div class="proposal-id-secondary">${escapeHTML(proposal.proposal_id || proposal.id)} · v${proposal.version || 1}</div>
            <div class="proposal-chips-row">
                <div class="proposal-stat-chip">
                    <div class="proposal-chip-label">Value</div>
                    <div class="proposal-chip-val">PHP ${formatCurrency(proposal.amount ?? 0)}</div>
                </div>
                <div class="proposal-stat-chip ${isOverdue ? 'chip-warn' : ''}">
                    <div class="proposal-chip-label">Stage age</div>
                    <div class="proposal-chip-val">${ageDays} day${ageDays !== 1 ? 's' : ''}</div>
                    ${isOverdue ? `<div class="proposal-chip-sub">needs attention</div>` : ''}
                </div>
            </div>
            ${attachHtml}
            ${commsHtml}
        </div>
    `;
}
```

### Full Card Assembly

```javascript
function renderInlineProposalCard(proposal, canDrive) {
    const isOverdue = isOverdueInStage(proposal);
    const showSubmit = canDrive && ['draft', 'for_revision'].includes(proposal.status);

    return `
        <div class="card proposal-inline-card ${isOverdue ? 'proposal-overdue' : ''}">
            <div class="card-header">
                <span class="card-title">Proposal</span>
            </div>
            ${renderProposalTrack(proposal.status)}
            ${renderProposalData(proposal, isOverdue)}
            <div class="proposal-card-footer">
                ${showSubmit ? `<button class="btn btn-primary" onclick="window.openProposalInlineSubmitModal('${escapeHTML(proposal.id)}')">Submit for Approval</button>` : ''}
                <button class="btn btn-outline" onclick="window.openProposalModal('${escapeHTML(proposal.id)}')">View Proposal</button>
            </div>
        </div>
    `;
}
```

### Required CSS (add to `components.css`)

```css
/* Proposal card overdue border */
.proposal-overdue { border-left: 3px solid #f59e0b !important; }

/* Progress track */
.proposal-track-wrapper {
    padding: 12px 12px 8px;
    border-bottom: 1px solid #e2e8f0;
}
.proposal-track { display: flex; align-items: flex-start; }
.proposal-track-node {
    display: flex; flex-direction: column; align-items: center;
    gap: 5px; flex: 1; position: relative; z-index: 1;
}
.proposal-track-node:not(:last-child)::after {
    content: ''; position: absolute; top: 9px;
    left: calc(50% + 10px); right: calc(-50% + 10px);
    height: 2px; background: #e2e8f0; z-index: 0;
}
.proposal-track-node.passed:not(:last-child)::after { background: #1a73e8; }
.proposal-track-dot {
    width: 18px; height: 18px; border-radius: 50%;
    border: 2px solid #e2e8f0; background: white; z-index: 1;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.proposal-track-node.passed .proposal-track-dot { background: #1a73e8; border-color: #1a73e8; }
.proposal-track-node.active .proposal-track-dot {
    border-color: #1a73e8; box-shadow: 0 0 0 3px rgba(26,115,232,0.18);
    width: 20px; height: 20px;
}
.proposal-track-node.active-warn .proposal-track-dot {
    border-color: #f97316; box-shadow: 0 0 0 3px rgba(249,115,22,0.18);
    width: 20px; height: 20px;
}
.proposal-track-label {
    font-size: 0.625rem; font-weight: 500; color: #94a3b8;
    text-align: center; line-height: 1.25; max-width: 50px;
}
.proposal-track-node.passed .proposal-track-label { color: #475569; font-weight: 600; }
.proposal-track-node.active .proposal-track-label { color: #1a73e8; font-weight: 700; }
.proposal-track-node.active-warn .proposal-track-label { color: #f97316; font-weight: 700; }

/* Loss badge */
.proposal-track-loss-wrap { padding: 10px 14px 4px; border-bottom: 1px solid #e2e8f0; }
.proposal-loss-badge {
    display: inline-flex; align-items: center; gap: 6px;
    background: #fef2f2; color: #991b1b; border: 1px solid #fecaca;
    border-radius: 6px; padding: 6px 12px; font-size: 0.8125rem; font-weight: 600;
}

/* Data section */
.proposal-data-section { padding: 12px 14px; }
.proposal-title { font-size: 0.9375rem; font-weight: 600; color: #1e293b; line-height: 1.35; margin-bottom: 2px; }
.proposal-id-secondary {
    font-size: 0.75rem; color: #94a3b8;
    font-family: 'SF Mono','Fira Code','Consolas',monospace;
    margin-bottom: 10px;
}
.proposal-chips-row { display: flex; gap: 8px; margin-bottom: 8px; }
.proposal-stat-chip {
    flex: 1; background: #f8fafc; border: 1px solid #e2e8f0;
    border-radius: 6px; padding: 6px 10px;
}
.proposal-stat-chip.chip-warn { background: #fffbeb; border-color: #fde68a; }
.proposal-chip-label {
    font-size: 0.625rem; font-weight: 600; color: #64748b;
    text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3px;
}
.proposal-stat-chip.chip-warn .proposal-chip-label { color: #92400e; }
.proposal-chip-val { font-size: 0.8125rem; font-weight: 700; color: #1e293b; }
.proposal-stat-chip.chip-warn .proposal-chip-val { color: #92400e; }
.proposal-chip-sub { font-size: 0.65rem; color: #92400e; margin-top: 1px; }
.proposal-info-row {
    font-size: 0.75rem; color: #475569; line-height: 1.4; margin-top: 5px;
    display: flex; align-items: flex-start; gap: 5px;
}
.proposal-info-row a { color: #1a73e8; text-decoration: none; }
.proposal-info-row a:hover { text-decoration: underline; }

/* Footer */
.proposal-card-footer {
    padding: 10px 14px; border-top: 1px solid #e2e8f0;
    background: #f8fafc;
    display: flex; align-items: center; justify-content: flex-end; gap: 8px;
}
```

## What to Avoid

- **8px dot + uppercase label for status** — current implementation; replaced entirely by the track
- **ID as the first/dominant element** — current implementation; title should lead (users scan by name)
- **Rendering empty-state text** ("No attachment", "No comms yet") — confirmed noise; hide the row instead
- **scaleY for track node size transitions** — squashes; use width/height change instead
- **Hardcoding `for_revision` at trackIdx 1** — revision can come from either internal or client stage; spike validated `trackIdx: 2` (client review position) with orange warn styling

## Constraints

- `isOverdueInStage()` and `getAgeInStageDays()` are imported from `proposals.js` — reuse, don't reimplement
- `for_revision` maps to `trackIdx: 2` with `warn: true` — the orange ring distinguishes it from the normal `pending_client` active state
- Card heading `PROPOSAL` must match the `PROJECT PLAN` card heading style (same `.card-title` class)
- `loadProposalCard()` must call `syncBottomRow()` after all branches (success, empty, error) — see project-detail-layout reference

## Origin

Synthesized from spike: 009
Source files: `sources/009-proposal-card-redesign/`
