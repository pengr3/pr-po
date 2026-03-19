---
phase: quick
plan: 260319-gkf
type: execute
wave: 1
depends_on: []
files_modified: [app/views/procurement.js]
autonomous: true
requirements: [QUICK-rfp-fill-colors]

must_haves:
  truths:
    - "No RFPs fill uses the same red palette as rejected status badges"
    - "Partially paid fill uses the same amber/warning palette as pending status badges"
    - "Fully paid fill uses the same green palette as approved status badges"
  artifacts:
    - path: "app/views/procurement.js"
      provides: "getPOPaymentFill with badge-aligned colors"
      contains: "getPOPaymentFill"
  key_links:
    - from: "getPOPaymentFill"
      to: "status-badge CSS variables"
      via: "matching hex values from components.css"
      pattern: "#721c24|#155724|#856404"
---

<objective>
Align the PO ID cell payment fill colors in getPOPaymentFill() with the status badge color palette used throughout the app.

Purpose: Currently the fill uses Google-brand colors (#ea4335 red, #fbbc04 yellow, #34a853 green) which clash with the status badge palette (danger: #721c24/#f8d7da, warning: #856404/#fff3cd, success: #155724/#d4edda). Matching these creates visual consistency.

Output: Updated getPOPaymentFill() function using badge-palette colors.
</objective>

<execution_context>
@C:/Users/Admin/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Admin/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@app/views/procurement.js

<interfaces>
<!-- Current getPOPaymentFill at line 260 returns { pct, color, opacity, tooltip } -->
<!-- Fill is rendered as background color with opacity on a div inside PO ID cells -->
<!-- Used at line 3984 (MRF Records PO column) and line 5311 (PO Tracking table) -->

Current fill colors (to be replaced):
- No RFPs:       color: '#ea4335', opacity: 0.20
- Fully paid:    color: '#34a853', opacity: 0.35
- Partially paid: color: '#fbbc04', opacity: 0.35

Target palette (from CSS variables in styles/main.css and components.css):
- Danger/Rejected:  bg: #f8d7da, text: #721c24  (--danger-light, --danger-dark)
- Success/Approved:  bg: #d4edda, text: #155724  (--success-light, --success-dark)
- Warning/Pending:   bg: #fff3cd, text: #856404  (--warning-light, --warning-dark)

The fill div uses `background: {color}; opacity: {opacity}` to create a translucent wash.
To match the badge look, use the badge background colors (the light variants) at higher opacity
so the resulting fill closely resembles the badge backgrounds.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update getPOPaymentFill color values to match status badge palette</name>
  <files>app/views/procurement.js</files>
  <action>
In `getPOPaymentFill()` (line 260), update the three return statements to use the status badge background colors (the light variants) at appropriate opacity so the cell fill visually matches the badge look:

1. **No RFPs (line 263):** Change from `color: '#ea4335', opacity: 0.20` to `color: '#f8d7da', opacity: 0.7`. This uses the danger-light background at 70% opacity, producing a soft pink wash matching rejected badges.

2. **Fully paid (line 280):** Change from `color: '#34a853', opacity: 0.35` to `color: '#d4edda', opacity: 0.7`. This uses the success-light background at 70% opacity, producing a soft green wash matching approved badges.

3. **Partially paid (line 286):** Change from `color: '#fbbc04', opacity: 0.35` to `color: '#fff3cd', opacity: 0.7`. This uses the warning-light background at 70% opacity, producing a soft amber wash matching pending badges.

Do NOT change the pct, tooltip, or any other logic. Only the `color` and `opacity` values in the three return objects.
  </action>
  <verify>
    <automated>grep -n "f8d7da\|d4edda\|fff3cd" app/views/procurement.js | head -5</automated>
  </verify>
  <done>All three fill states use badge-palette background colors: #f8d7da (no RFPs/danger), #d4edda (fully paid/success), #fff3cd (partially paid/warning). The old Google-brand colors (#ea4335, #34a853, #fbbc04) no longer appear in getPOPaymentFill.</done>
</task>

</tasks>

<verification>
- Open the app, navigate to PO Tracking table (or MRF Records with POs visible)
- PO cells with no RFPs show a soft pink/red fill matching rejected badge backgrounds
- PO cells partially paid show a soft amber fill matching pending badge backgrounds
- PO cells fully paid show a soft green fill matching approved badge backgrounds
- Fill colors are visually consistent with status badges elsewhere in the UI
</verification>

<success_criteria>
getPOPaymentFill returns badge-palette colors for all three states. No functional changes to percentage calculation, tooltip content, or fill width logic.
</success_criteria>

<output>
After completion, create `.planning/quick/260319-gkf-improve-rfp-payment-fill-progress-bar-co/260319-gkf-SUMMARY.md`
</output>
