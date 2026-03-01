---
status: diagnosed
trigger: "Department badges rendered as inline <span> elements inside table cells are causing row height distortion and vertical misalignment across Finance and Procurement tables."
created: 2026-02-19T00:00:00Z
updated: 2026-02-19T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — display:flex on <td> breaks table layout model causing row height distortion
test: static code analysis of badge HTML, td inline styles, and CSS vertical-align rules
expecting: no fix applied — diagnosis only
next_action: return ROOT CAUSE FOUND

## Symptoms

expected: All table rows have uniform height; badge cells align vertically with sibling cells
actual: Rows containing the dept badge appear taller or crooked compared to badge-free rows
errors: none (visual/layout regression only)
reproduction: Open Finance > Pending Approvals or Procurement > PO Tracking; compare rows with "Services" vs "Projects" badges
started: after getDeptBadgeHTML() was introduced in v2.3

## Eliminated

- hypothesis: badge <span> itself is block-level
  evidence: span is inline by default; no display property is set on the span itself
  timestamp: 2026-02-19

- hypothesis: badge font-size or padding alone causes height increase
  evidence: other badge spans in the same rows (urgency, status) use identical padding (0.25rem 0.5rem) and font-size (0.75rem) without any distortion — the SUBCON badge in procurement.js line 3831 uses the same inline span pattern but lives inside a plain <td> with no display:flex and causes no distortion
  timestamp: 2026-02-19

## Evidence

- timestamp: 2026-02-19
  checked: finance.js getDeptBadgeHTML() — line 52-58
  found: |
    <span style="background:${bg};color:${color};padding:2px 7px;border-radius:4px;
    font-size:0.7rem;font-weight:600;white-space:nowrap;">${label}</span>
    No display, no vertical-align, no line-height set on the span.
  implication: span renders as inline; height is controlled by line-height of its container

- timestamp: 2026-02-19
  checked: procurement.js getDeptBadgeHTML() — line 33-39
  found: Identical inline style string to finance.js version
  implication: same root cause applies to both files

- timestamp: 2026-02-19
  checked: finance.js table cell usage — lines 1194, 1247, 2082
  found: |
    <td style="display:flex;align-items:center;gap:6px;">${getDeptBadgeHTML(...)} ${getMRFLabel(...)}</td>
    The <td> itself is set to display:flex.
  implication: CRITICAL — applying display:flex to a <td> removes it from the browser's table layout
    algorithm. The td is no longer a table cell but a flex container. The browser can no longer
    participate in row-height synchronisation with its sibling <td>s. The flex container sizes itself
    to its content (badge + label text), which may differ from the implicit height the other cells
    compute. This causes the row to render with mismatched heights or the affected cell to overflow
    its natural table height, visually "pushing" the row taller or producing vertical misalignment.

- timestamp: 2026-02-19
  checked: procurement.js table cell usage — line 3833
  found: |
    <td style="display:flex;align-items:center;gap:6px;">${getDeptBadgeHTML(po)} ${getMRFLabel(po)}</td>
    Same display:flex pattern on <td>.
  implication: same root cause in procurement PO Tracking table

- timestamp: 2026-02-19
  checked: styles/components.css — global td rule (line 429-433)
  found: |
    td {
        padding: 0.75rem 1rem;
        border-bottom: 1px solid var(--gray-200);
        font-size: 0.875rem;
    }
    NO vertical-align set on global td rule.
  implication: without vertical-align:middle on td, inline content defaults to baseline alignment,
    compounding the flex-on-td distortion for any cell that doesn't use display:flex

- timestamp: 2026-02-19
  checked: styles/views.css — vertical-align occurrences
  found: |
    .items-table td { vertical-align: middle; }  (line 217)
    .permission-matrix td { vertical-align: middle; } (line 1097)
    .permission-matrix th { vertical-align: middle; } (line 1122)
    Finance/Procurement tables do NOT use .items-table or .permission-matrix classes —
    they use generic <table> with no scoping class that sets vertical-align.
  implication: the Finance and Procurement table <td>s have no vertical-align rule at all,
    so they inherit the browser default (baseline), making any inline-block or flex child
    more likely to cause visible misalignment relative to adjacent cells

## Resolution

root_cause: |
  Two compounding problems:

  PRIMARY — display:flex on <td> (lines 1194, 1247, 2082 in finance.js; line 3833 in procurement.js):
    The badge cell is written as <td style="display:flex;align-items:center;gap:6px;">.
    Setting display:flex on a table cell overrides its display:table-cell computed value.
    This breaks the table row's shared-height algorithm: the flex td sizes independently
    from its siblings, causing that row to appear taller or misaligned.

  SECONDARY — no vertical-align on global td (components.css line 429):
    The global td rule omits vertical-align. Browser default is baseline, so even without
    the flex override, badge rows that are slightly taller than text-only rows will look crooked
    because sibling cells baseline-align against each other rather than center-aligning.

fix: NOT APPLIED (diagnose-only mode)
  Minimal fix needed:
    1. Remove display:flex from all four badge <td> elements. Instead, wrap the badge and
       label in an inner <span> or <div> and apply display:flex there, OR simply let them
       sit as inline elements (the badge is white-space:nowrap so it won't wrap) and add
       a non-breaking space between them.
    2. Add vertical-align:middle to the badge <span> itself so it aligns with surrounding
       text correctly within the cell (same as the SUBCON badge pattern already in use).
    3. Optionally add vertical-align:middle to the global td rule in components.css to
       prevent this class of bug in future table rows.

verification: n/a — diagnose only
files_changed: []
