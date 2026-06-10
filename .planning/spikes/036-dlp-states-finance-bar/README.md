---
spike: 036
name: dlp-states-finance-bar
type: standard
validates: "Given a completed project with DLP fields saved, when the DLP period is active/expired/released, then project-detail's finance bar and the portfolio view show amber/red/green correctly"
verdict: VALIDATED ✓ — 4-state model (On-going / In-DLP amber / Expired red / Released green); stacked bar segments; DLP strip below bar; "Record Release" Finance-only action
related: [033, 034, 035]
tags: [dlp, retention, finance-bar, portfolio, ux, project-detail, display]
---

# Spike 036: DLP States in Finance Bar

## What This Validates
Given a completed project with `dlp_months`, `dlp_start_date`, `retention_percentage` saved (from Spike 034/035 entry points), when the DLP lifecycle advances (active → expired → released), then the finance bar in project-detail and the portfolio row both reflect the correct amber/red/green states — confirming the 3-state display designed in Spike 033 is buildable with real data.

## Research

### Prior art
Spike 033 (portfolio redesign) designed the DLP display states as stubs:
- **In-DLP (amber)**: amber bar + "In DLP" status, retention held
- **DLP expired (red)**: red bar + "Retention Overdue" warning, Finance action required
- **Released (green)**: green bar + "Fully Collected", 100% collected

These were designed with placeholder logic. This spike wires them to an actual data model.

### Data model needed (project document)
```javascript
{
  // Existing
  project_completed_at: timestamp,
  collection_tranches: [...],
  
  // New fields needed
  dlp_months: 12,               // from Spike 035 retention tranche
  dlp_start_date: "2026-06-10", // equals completion date unless overridden
  dlp_expires_at: "2027-06-10", // calculated: dlp_start_date + dlp_months
  retention_percentage: 10,     // % of contract held back
  retention_amount: 420000,     // calculated: contract_cost * retention_percentage / 100
  retention_released_at: null   // set by Finance when releasing
}
```

### State derivation logic
```javascript
function getDlpState(project) {
  if (!project.dlp_months || project.project_status !== 'Completed') return 'active';
  const now = Date.now();
  const expires = new Date(project.dlp_expires_at).getTime();
  if (project.retention_released_at) return 'released';
  if (now > expires) return 'expired';
  return 'in-dlp';
}
```

## How to Run
```
python -m http.server 8000
# Open: http://localhost:8000/.planning/spikes/036-dlp-states-finance-bar/spike.html
```

## What to Expect
Control bar at top with 4 state buttons. Each triggers a full re-render of:
1. **Finance bar** — background color, bar fill color, DLP strip below bar
2. **Collection tranche rows** — retention tranche shows "In DLP" / "OVERDUE" / "Released" tag
3. **Portfolio row** — left accent border color, bar fill color, status tag
4. **Project info card** — DLP Period and DLP Expires fields populate

Key flows:
- On-going → blue bar, no DLP strip
- In DLP → amber bar + amber strip "346 days remaining"
- Expired → red bar + red strip "Expired 32 days ago" + "Record Release" button
- Released → green bar, 100% fill, "Fully Collected"

## Investigation Trail
- The DLP strip below the bar works well — adds context without displacing the main contract amount display
- Stacked bar segments (blue collected + amber retention) clearly show retention is "held" not "missing"
- Portfolio row left-border accent (amber/red/green) matches the "Attention Feed" pattern from Spike 033
- The "Record Release" button on the expired state is Finance-only — should be role-gated in real implementation

## Results
Verdict: PENDING — awaiting user review.

Key finding: The 4-state model (On-going / In-DLP / Expired / Released) requires only 4 computed fields checked at render time. No listener changes needed — standard `onSnapshot` on the project document is sufficient since `retention_released_at` is set as a direct write.
