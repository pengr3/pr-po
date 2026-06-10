# Project Portfolio View

## Requirements

- Must work without a build step (pure static SPA, ES6 modules)
- Stage-aware finance: do NOT show a billing bar for pre-contract stages — value is null/zero and misleads
- Both modes (Priority Feed + Browse All) must live at the same URL — no new route, no new nav item
- DLP/retention display requires DLP phase to be built first (fields not yet in Firestore)

## How to Build It

### Structure

Replace the flat projects table with two rendering modes toggled by a toolbar button pair.

**Toolbar toggle (HTML):**
```html
<div class="vm-toggle">
  <button class="vm-btn vm-on" id="vm-feed" onclick="vmSwitch('feed')">🔥 Priority Feed</button>
  <button class="vm-btn" id="vm-browse" onclick="vmSwitch('browse')">≡ Browse All</button>
</div>
```

**JS toggle:**
```javascript
function vmSwitch(mode) {
  document.getElementById('pdb-feed').style.display   = mode === 'feed'   ? 'block' : 'none';
  document.getElementById('pdb-browse').style.display = mode === 'browse' ? 'block' : 'none';
  document.getElementById('vm-feed').classList.toggle('vm-on',   mode === 'feed');
  document.getElementById('vm-browse').classList.toggle('vm-on', mode === 'browse');
  localStorage.setItem('projects-view-mode', mode); // persist preference
}
// restore on load:
const saved = localStorage.getItem('projects-view-mode') || 'feed';
vmSwitch(saved);
```

### Priority Feed (Option D) — default mode

Three sections, computed from live Firestore data:

```javascript
function computeUrgencySignals(projects) {
  const urgent = [], watch = [], ok = [];
  const now = Date.now();

  for (const p of projects) {
    const signal = getProjectSignal(p, now);
    if (signal.level === 'urgent') urgent.push({ ...p, signal });
    else if (signal.level === 'watch') watch.push({ ...p, signal });
    else ok.push({ ...p, signal });
  }
  return { urgent, watch, ok };
}

function getProjectSignal(p, now) {
  const daysInStage = (now - new Date(p.updated_at).getTime()) / 86400000;

  // Needs Attention thresholds
  if (p.project_status === 'Proposal Under Client Review' && daysInStage > 14)
    return { level: 'urgent', text: `Proposal stale — ${Math.round(daysInStage)}d`, hint: 'Client hasn\'t responded' };
  if (p.project_status === 'For Inspection' && daysInStage > 30)
    return { level: 'urgent', text: `Inspection overdue — ${Math.round(daysInStage)}d`, hint: 'No progress since assigned' };
  if (p.project_status === 'On-going' && daysInStage > 7)
    return { level: 'urgent', text: `No activity in ${Math.round(daysInStage)} days`, hint: 'On-going project has gone quiet' };

  // DLP overdue (when DLP phase is built):
  // if (p.retention_status === 'dlp_expired')
  //   return { level: 'urgent', text: 'Retention release overdue', hint: `DLP expired · ₱${fmt(p.retention_amount)} not released` };

  // Worth Watching thresholds
  if (p.project_status === 'For Revision' && daysInStage > 5)
    return { level: 'watch', text: `Revision requested — ${Math.round(daysInStage)}d`, hint: 'Expected turnaround 3–5 days' };
  if (p.project_status === 'For Mobilization' && daysInStage > 3)
    return { level: 'watch', text: 'Contract signed, not mobilized', hint: `${Math.round(daysInStage)}d since For Mobilization` };
  // Near-final billing: when tranche data available, check if ≥86% billed
  // if (billedPct >= 86 && billedPct < 100)
  //   return { level: 'watch', text: `${billedPct}% billed — final billing due`, hint: 'Last tranche not yet requested' };

  // DLP in-progress (when DLP phase is built):
  // if (p.retention_status === 'in_dlp')
  //   return { level: 'ok', text: 'In defect liability period', hint: `Retention held pending ${p.dlp_months}-month DLP` };

  return { level: 'ok', text: getDefaultOkSignal(p), hint: '' };
}
```

### Stage-Aware Finance Display

Four display states — pick based on `project_status`:

```javascript
function renderFinancial(project) {
  const pre = ['For Inspection','For Proposal','Proposal for Internal Approval',
                'Proposal Under Client Review','For Revision'];
  const contracted = ['Client Approved','For Mobilization'];
  const active = ['On-going'];
  const complete = ['Completed'];

  if (pre.includes(project.project_status)) {
    // Show proposed/estimated value only — no bar
    const val = project.budget ? `Est. ${fmt(project.budget)}` : '—';
    return `<div class="fin-pre"><div class="fin-pre-amount">${val}</div>
            <div class="fin-pre-label">Pre-contract</div></div>`;
  }
  if (contracted.includes(project.project_status)) {
    return `<div class="fin-ready"><div class="fin-ready-amount">${fmt(project.contract_cost)}</div>
            <div class="fin-ready-label">Contract signed · billing not started</div></div>`;
  }
  if (active.includes(project.project_status)) {
    const pct = computeBillingPct(project); // from collection_tranches
    const fill = pct >= 80 ? 'fill-blue' : 'fill-orange';
    return `<div class="fin-active">
      <div class="fin-active-top"><span>${fmt(project.contract_cost)}</span><span>${pct}%</span></div>
      <div class="mini-bar"><div class="mini-fill ${fill}" style="width:${pct}%"></div></div>
      <div class="fin-active-sub">${fmt(billed)} billed</div></div>`;
  }
  if (complete.includes(project.project_status)) {
    // After DLP phase: check retention_status here
    // if (project.retention_status === 'in_dlp') → show retention bar (amber)
    // if (project.retention_status === 'dlp_expired') → show retention bar (red)
    return `<div class="fin-done"><div class="fin-done-amount">${fmt(project.contract_cost)}</div>
            <div class="fin-done-label">Fully billed · 100% ✓</div></div>`;
  }
}
```

### Browse All (Option B) — toggle mode

Stage groups with collapsible sections. Persist collapse state:

```javascript
const STAGE_GROUPS = [
  { key: 'ongoing',    label: 'On-going',               statuses: ['On-going'],                          color: 'var(--blue)'   },
  { key: 'contracted', label: 'Contracted & Mobilizing', statuses: ['Client Approved','For Mobilization'], color: 'var(--amber)'  },
  { key: 'proposal',   label: 'Proposal Stage',          statuses: ['For Proposal','Proposal for Internal Approval',
                                                                     'Proposal Under Client Review','For Revision'], color: 'var(--purple)' },
  { key: 'inspection', label: 'For Inspection',          statuses: ['For Inspection'],                   color: 'var(--slate-300)' },
  { key: 'completed',  label: 'Completed',               statuses: ['Completed'],                        color: 'var(--green)'  },
];

// Collapse persistence
function getCollapseState(key) {
  const saved = JSON.parse(localStorage.getItem('browse-collapse') || '{}');
  return saved[key] ?? (key === 'completed'); // completed collapsed by default
}
function setCollapseState(key, collapsed) {
  const saved = JSON.parse(localStorage.getItem('browse-collapse') || '{}');
  saved[key] = collapsed;
  localStorage.setItem('browse-collapse', JSON.stringify(saved));
}
```

## What to Avoid

- **Don't show billing bars for pre-contract projects** — `contract_cost` is null; the bar shows 0% of nothing
- **Don't put the view toggle in the nav** — it's a display preference for the same data, not a new section
- **Don't use `updated_at` as a stage-entry timestamp for Option E (Swimlane)** — it's updated on any field change; need per-status `changed_at` entries for accurate swimlane bands
- **Don't re-probe Kanban (A) or Card Grid (C)** — user explicitly said list-style preferred for construction PM
- **Don't gate retention signals until DLP phase is built** — leave the commented `retention_status` checks in place as forward hooks

## Constraints

- `updated_at` is the only staleness signal available today — urgency thresholds must be tuned against real data
- Stage transition timestamps (for Swimlane / Option E) require a new `status_history` subcollection or `status_changed_at` fields — not yet stored
- DLP/retention display hooks are stubbed in `getProjectSignal()` and `renderFinancial()` — activate when DLP phase ships

## DLP Phase Prerequisites

Before retention display is live, this phase must build:
- `dlp_months`, `dlp_expires_at`, `retention_percentage`, `retention_amount` written at completion gate
- `retention_status: 'in_dlp' | 'dlp_expired' | 'released'` + `retention_released_at`
- `getRetentionSignal(project)` helper returning `{ status, daysLeft?, daysOverdue? }`
- "Release Retention" gate on project-detail (admin/finance role, gated on DLP expiry)

## Origin

Synthesized from spike: 033
Source files: `sources/033-project-table-redesign/`
Mockup (all 5 options + D+B combo): `sources/033-project-table-redesign/spike.html`
