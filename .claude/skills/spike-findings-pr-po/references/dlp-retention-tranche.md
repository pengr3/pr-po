# DLP, Retention & Tranche Management

## Requirements

- Must work without a build step (pure static SPA, no webpack/vite)
- DLP fields stored on the **project document** (not on the tranche object)
- Retention tranche is marked via a boolean flag on the tranche object (`is_retention: true`)
- DLP entry happens at the **completion gate** (Step 2 of "Mark Completed" modal) — NOT at tranche-setup time
- Tranche editor must be accessible from **project-detail.js** while project is On-going (not only from the Projects list edit modal)
- Only one retention tranche per project allowed
- Finance-only action: "Record Release" to mark retention as released
- "Record Release" must be role-gated in the real implementation

## Firestore Schema

### Project document — new DLP fields
```javascript
{
  // Existing tranche field — add is_retention boolean
  collection_tranches: [
    { label: 'Mobilization', percentage: 20, is_retention: false },
    { label: 'Progress Billing 1', percentage: 30, is_retention: false },
    { label: 'Progress Billing 2', percentage: 30, is_retention: false },
    { label: 'Final / Retention', percentage: 20, is_retention: true },  // NEW flag
  ],

  // New DLP fields — written at completion gate, Step 2
  dlp_months: 12,                    // number: months of defect liability period
  dlp_start_date: '2026-06-10',      // string YYYY-MM-DD: equals completion date unless overridden
  dlp_expires_at: '2027-06-10',      // string YYYY-MM-DD: calculated = dlp_start_date + dlp_months
  retention_percentage: 10,          // number: % of contract_cost withheld
  retention_amount: 420000,          // number: calculated = contract_cost * retention_percentage / 100
  retention_released_at: null,       // timestamp | null: set by Finance when releasing; null = not released
}
```

## DLP State Derivation

Four states; derive at render time from live project document data:

```javascript
function getDlpState(project) {
  // Not completed or no DLP configured → normal active display
  if (project.project_status !== 'Completed' || !project.dlp_months) return 'active';

  const now = Date.now();
  const expires = new Date(project.dlp_expires_at).getTime();

  if (project.retention_released_at) return 'released';   // green ✓
  if (now > expires) return 'expired';                     // red ⚠
  return 'in-dlp';                                         // amber ◑
}
```

## How to Build It

### 1. Tranche Editor in project-detail.js (closes the "ongoing" gap)

Add an "Edit Tranches" button to the Financial card's tranche section. Clicking expands an inline editor below the existing read-only display.

**Key pattern — where it goes in the layout:**
```javascript
// In the Financial card render, after the billing bar:
`<div class="tranche-header">
  <span class="section-title">Collection Tranches</span>
  <button class="edit-tranches-btn" onclick="window.toggleTrancheEditor()">⚙ Edit Tranches</button>
</div>
<div id="trancheDisplay"><!-- read-only rows --></div>
<div class="tranche-editor" id="trancheEditor"><!-- expands below --></div>`
```

**Editor rows pattern:**
```javascript
// Each row: label input + percentage input + Ret? toggle + remove button
// The "Ret?" toggle is a soft tag — clicking it marks that row as retention, removes the tag from any other row
// Only one retention tranche allowed per project

function toggleRetention(index) {
  const wasOn = editorTranches[index].is_retention;
  editorTranches.forEach((t, i) => t.is_retention = (i === index && !wasOn));
  renderEditorRows();
}
```

**DLP sub-fields (rendered BELOW the editor list, not inline on the row):**
```javascript
// Show DLP sub-fields when any tranche has is_retention: true
// Fields: retention_percentage input, dlp_months select, dlp_start_date input, dlp_expires_at (readonly, auto-calc)
// At tranche-setup time these are OPTIONAL — left blank, filled in later at completion gate

function calcDlpExpiry(startDateStr, months) {
  const d = new Date(startDateStr);
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
```

**Save — writes to project document:**
```javascript
// Validation before save:
// 1. All tranche labels filled
// 2. Percentages sum to exactly 100
// 3. DLP fields optional at this stage

await updateDoc(doc(db, 'projects', projectId), {
  collection_tranches: editorTranches,
  // DLP fields only if retention tranche has them filled:
  ...(retTranche && retPct ? { retention_percentage: Number(retPct) } : {}),
  ...(retTranche && dlpMonths ? { dlp_months: Number(dlpMonths) } : {}),
});
```

**Empty state CTA:**
```javascript
// If collection_tranches is empty/absent, show a prompt instead of a blank section:
`<div class="setup-cta">
  <p>No collection tranches set — billing can't be linked to milestones.</p>
  <button onclick="window.toggleTrancheEditor()">⚙ Set Up Tranches</button>
</div>`
```

---

### 2. DLP Entry at Completion Gate (Step 2 of Mark Completed modal)

The existing completion gate modal (Mark Project Completed) gets a new Step 2 between the COC/date step and the confirmation step.

**Step structure:**
- Step 1: Completion Documents (COC URL, completion date) — existing
- Step 2: DLP Setup (NEW — only shown if project has a retention tranche)
- Step 3: Confirm & Submit — existing

**Skip Step 2 if no retention tranche:**
```javascript
function getGateSteps(project) {
  const hasRetention = (project.collection_tranches || []).some(t => t.is_retention);
  return hasRetention
    ? ['completion-docs', 'dlp-setup', 'confirm']
    : ['completion-docs', 'confirm'];
}
```

**Step 2 fields:**
```javascript
// DLP period: <select> with options 3/6/12/18/24 months + "No DLP"
// Retention %: <input type="number"> (pre-fills from tranche editor if already set)
// DLP Start Date: <input type="date"> (defaults to completion date)
// DLP Expiry: readonly, auto-calculated from start + months
// Retention Amount: readonly, calculated from contract_cost * retention_percentage / 100
```

**On completion save — write DLP fields to project document:**
```javascript
await updateDoc(doc(db, 'projects', projectId), {
  project_status: 'Completed',
  project_completed_at: serverTimestamp(),
  coc_url: cocUrl,
  dlp_months: Number(dlpMonths),
  dlp_start_date: dlpStartDate,
  dlp_expires_at: calcDlpExpiryString(dlpStartDate, Number(dlpMonths)),
  retention_percentage: Number(retentionPct),
  retention_amount: Math.round(contractCost * Number(retentionPct) / 100),
  retention_released_at: null,
});
```

---

### 3. Finance Bar — 4-State Display

The finance bar in project-detail adapts based on `getDlpState()`:

**State: `active`** (On-going, no DLP yet)
```javascript
// Blue bar showing utilization %
// Sub-label: "Cash Collected" | sub-value in blue
// No DLP strip
```

**State: `in-dlp`** (amber)
```javascript
// Stacked bar: blue (collected %) + amber segment (retention %)
// Finance bar wrapper: background #fffbeb, border #fde68a
// Sub-label: "Collected excl. Retention" | sub-value in amber
// DLP strip below bar: amber background, "◑ In Defect Liability Period — retention held until DLP expires"
// Right side of strip: days remaining (calculate from dlp_expires_at - now)

const daysLeft = Math.ceil((new Date(project.dlp_expires_at) - new Date()) / 86400000);
```

**State: `expired`** (red)
```javascript
// Stacked bar: blue + red retention segment
// Finance bar wrapper: background #fff5f5, border #fecaca
// Sub-label: "Retention Overdue" | sub-value in red
// DLP strip: red, "⚠ DLP period expired — retention release overdue"
// Right side: "Expired N days ago"
// Show "Record Release" button (Finance-only, role-gated)
```

**State: `released`** (green)
```javascript
// Single green bar at 100%
// Finance bar wrapper: background #f0fdf4, border #bbf7d0
// Sub-label: "Fully Collected" | sub-value in green
// DLP strip: green, "✓ Retention released — project fully collected"
// Right side: "Released [date]"
```

**Retention amount display in bar:**
```javascript
// Retention segment width = retention_percentage (not the collected %)
// e.g. if retention is 10%, segment is 10% wide regardless of what's collected
const retentionWidth = project.retention_percentage + '%';
const collectedWidth = (100 - project.retention_percentage) + '%'; // assumes 100% minus retention
```

---

### 4. Portfolio View — DLP States

Same 3-state logic applied to the portfolio row:
```javascript
// Left border accent color driven by DLP state:
// in-dlp: border-left: 3px solid #f59e0b (amber)
// expired: border-left: 3px solid #ef4444 (red)  ← surfaced in Attention Feed
// released: border-left: 3px solid #059669 (green)

// Status tag in portfolio row right column:
// in-dlp: { text: '◑ In DLP', bg: '#fef3c7', color: '#92400e' }
// expired: { text: '⚠ Retention Overdue', bg: '#fee2e2', color: '#991b1b' }  ← goes in Needs Attention group
// released: { text: '✓ Fully Collected', bg: '#dcfce7', color: '#166534' }

// Bar fill color: amber / red / green matching state
// Bar width: 90% for in-dlp/expired (retention portion shown as bar color); 100% for released
```

---

### 5. Collection Tranche Row Display (per-tranche status)

The retention tranche row in the collectibles display shows a state-aware tag:
```javascript
// in-dlp:  <span class="coll-tag tag-holding">In DLP</span>
// expired: <span class="coll-tag tag-overdue">OVERDUE</span>
// released:<span class="coll-tag tag-released">Released</span>
```

## What to Avoid

- **Don't store DLP fields on the tranche object.** DLP is a project-level concept (the whole project is in DLP, not one tranche). The `is_retention: true` flag on the tranche identifies *which tranche* is the retention tranche; the DLP period and dates live on the project document.
- **Don't make DLP mandatory at tranche-setup time.** At the point a PM sets up tranches (On-going project), the DLP period may not be contractually confirmed yet. Make the DLP sub-fields optional in the tranche editor; enforce them only at the completion gate.
- **Don't calculate `dlp_expires_at` at read time.** Calculate it once when saving the completion gate and store the string. Recalculating on every read is unnecessary and fragile.
- **Don't skip the "no retention tranche" guard in the completion gate.** If the project has no retention tranche, skip the DLP step entirely. Otherwise users see a confusing DLP form for a project that has no billing holdback.
- **Don't put the "Record Release" button in plain view for non-Finance roles.** Role-gate it — only Finance should be able to record a retention release.
- **Don't allow more than one retention tranche.** The "Ret?" toggle enforces single-selection — clicking a new tranche removes the flag from the previous one. This must be enforced on save too.

## Constraints

- `collection_tranches` is an array stored directly on the project/service Firestore document — no subcollection
- Percentages must sum to exactly 100 before saving; partial saves not allowed
- `dlp_expires_at` string should be stored as YYYY-MM-DD for consistent date comparison with `new Date()`
- `retention_released_at` should be a Firestore `serverTimestamp()` when set, `null` when not yet released
- No Firestore migration needed — Firestore is schemaless; documents without DLP fields simply fall into the `active` state

## Origin

Synthesized from spikes: 034, 035, 036  
Source files available in: `sources/034-dlp-entry-placement/`, `sources/035-tranche-editor-in-detail/`, `sources/036-dlp-states-finance-bar/`
