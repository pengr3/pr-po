---
status: diagnosed
phase: 40-ui-ux-revisions
source: [40-01-SUMMARY.md, 40-02-SUMMARY.md, 40-03-SUMMARY.md, 40-04-SUMMARY.md]
started: 2026-02-25T14:00:00Z
updated: 2026-02-25T14:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. MRF Form Radio Label
expected: Navigate to the MRF submission form. The request type radio buttons should show "Material/Sub Contractor" (not "Material Request") as the label for the material radio option.
result: pass

### 2. MRF Records Search by Requestor/Service Name
expected: Go to Procurement > MRF Records tab. Type a requestor's name in the search box — matching MRFs should appear. Also try typing a service name — matching service MRFs should filter correctly.
result: pass

### 3. Services Tab - No Service Type Column
expected: Navigate to Services tab. Both the Services and Recurring sub-tabs should show 7-column tables (Code, Name, Client, Internal Status, Project Status, Active, Actions). There should be no "Service Type" column. Loading and empty states should be properly aligned.
result: pass

### 4. Client Detail Modal Opens on Row Click
expected: Navigate to Clients tab. Click on any client row (not on Edit or Delete buttons). A read-only modal should appear showing client information: code, company name, contact person, and contact details.
result: pass

### 5. Client Modal Shows Linked Projects & Services
expected: In the client detail modal, there should be a "Linked Projects" section showing projects for that client with budget and contract cost, and a "Linked Services" section with the same. Project and service names should be clickable links that navigate to their detail pages.
result: pass

### 6. Client Modal - Action Buttons Don't Trigger Modal
expected: On the Clients tab, click the Edit or Delete button on a client row. The client detail modal should NOT open — only the edit/delete action should fire.
result: pass

### 7. Procurement Timeline - No Emojis and Valid Dates
expected: Go to Procurement > MRF Records, find an MRF with PRs/POs, and click the "Timeline" button. The timeline should show NO emojis anywhere. All dates should display correctly (no "Invalid Date" text). The button itself should just say "Timeline" (no emoji prefix).
result: pass

### 8. Procurement Timeline - PR to PO Grouping with Status
expected: In the procurement timeline modal, PRs should appear as parent items with their child POs nested/indented below them. Each PO should show a procurement status badge (e.g., "Pending Procurement", "Procuring", "Delivered"). TRs should appear as standalone items.
result: pass

### 9. Material Request Sub-Tab Navigation
expected: Navigate to Material Request (#/mrf-form). You should see two sub-tabs at the top: "Material Request Form" (active by default) and "My Requests". The MRF form should display normally below. Clicking "My Requests" should switch to a table view. Clicking back to "Material Request Form" should restore the form.
result: pass

### 10. My Requests Shows Current User's MRFs
expected: Click the "My Requests" sub-tab in Material Request. It should show a table of MRFs submitted by the currently logged-in user (filtered by requestor name). If you've submitted MRFs, they should appear with their ID, project/service, date, status, and urgency.
result: issue
reported: "Fail, i want it to appear exactly the same as how MRF Records appear. Basically the same view from different POVs"
severity: major

### 11. My Requests Search and Filters
expected: In the My Requests tab, use the search box to filter by MRF ID or project name. Use the status dropdown to filter by MRF status. Use the urgency dropdown to filter by urgency level. Pagination should work if there are enough records.
result: pass

## Summary

total: 11
passed: 10
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "My Requests table should mirror the full Procurement MRF Records table layout — same columns, same PR/PO sub-rows, same visual structure — just filtered to the current user's submissions"
  status: failed
  reason: "User reported: Fail, i want it to appear exactly the same as how MRF Records appear. Basically the same view from different POVs"
  severity: major
  test: 10
  root_cause: "mrf-records.js renders a simplified MRF-only table (7 columns, no sub-queries) instead of the full renderPRPORecords() pipeline from procurement.js (8 columns with async PR/PO sub-rows, computed MRF status, procurement status per PO, timeline button). Missing: calculateMRFStatus(), renderMRFStatusBadge(), per-row PR/PO getDocs queries, request_type branching, formatTimestamp import."
  artifacts:
    - path: "app/views/mrf-records.js"
      issue: "Renders simplified MRF-level table without PR/PO sub-queries or computed status"
    - path: "app/views/procurement.js"
      issue: "Contains the full renderPRPORecords() pipeline (~300 lines) that needs to be shared"
  missing:
    - "Rewrite mrf-records.js to replicate full renderPRPORecords() async pipeline with PR/PO sub-rows"
    - "Extract calculateMRFStatus() and renderMRFStatusBadge() from procurement.js into shared scope"
    - "Add formatTimestamp import to mrf-records.js"
    - "Match the 8-column table structure: MRF ID, Project, Date Needed, PRs, POs, MRF Status, Procurement Status, Actions"
    - "Use read-only PO status badges (not editable dropdown) since requestors should not update procurement status"
  debug_session: ""
