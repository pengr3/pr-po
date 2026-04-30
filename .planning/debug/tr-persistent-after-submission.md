---
status: verifying
trigger: "TR remains visible in the Pending TR list after it has been submitted to Finance"
created: 2026-04-27T00:00:00.000Z
updated: 2026-04-27T00:00:00.000Z
---

## Current Focus

hypothesis: submitTransportRequest() never sets MRF status to 'TR Submitted', so the service MRF stays at 'Pending' and remains in the pending list indefinitely.
test: Read loadMRFs() query filter vs submitTransportRequest() MRF update payload
expecting: Confirmed — fix applied by adding `status: 'TR Submitted'` to the MRF updateDoc call
next_action: human verification

## Symptoms

expected: After a TR is submitted to Finance, it should be removed from the Pending Transportation Requests list in the Procurement MRF management tab.
actual: The TR persists in the Pending list even after successful submission to Finance. The TR does appear on the Finance side (workflow is functional), but the service MRF still shows as pending in Procurement.
errors: No error message — just incorrect UI state (stale record shown).
reproduction: Submit a TR through the procurement workflow (service-type MRF). Navigate back to Procurement MRFs tab. The service MRF remains in the "Pending Transportation Requests" list.
started: Believed to originate in v3.2 or earlier — possibly since the TR flow was introduced.

## Eliminated

- hypothesis: Finance view query is wrong (e.g. wrong field name)
  evidence: finance.js line 3013 correctly queries `where('finance_status', '==', 'Pending')` with onSnapshot — any status change would auto-remove from list
  timestamp: 2026-04-27

- hypothesis: TR document is created with wrong finance_status value
  evidence: procurement.js line 5533: `finance_status: 'Pending'` — correct initial value for a newly submitted TR
  timestamp: 2026-04-27

## Evidence

- timestamp: 2026-04-27
  checked: finance.js loadApprovalData() — Transport Request listener setup
  found: onSnapshot query at line 3013: `query(trsRef, where('finance_status', '==', 'Pending'))`. Reactive — would auto-remove any TR whose finance_status changes away from 'Pending'.
  implication: Finance tab works correctly. The bug is not here.

- timestamp: 2026-04-27
  checked: procurement.js submitTransportRequest() — MRF update after TR creation (lines 5538-5544)
  found: The function creates the TR document (addDoc) with `finance_status: 'Pending'` and then calls updateDoc on the MRF with ONLY `tr_id`, `items_json`, `updated_at`. Status field is NOT updated. Comment reads: "do NOT change MRF status (TR actions are scoped to transport_requests)".
  implication: Service MRF retains status 'Pending' after TR submission — root cause confirmed.

- timestamp: 2026-04-27
  checked: procurement.js loadMRFs() query filter (line 2248)
  found: `const statuses = ['Pending', 'In Progress', 'Rejected', 'PR Rejected', 'TR Rejected', 'Finance Rejected']`. 'TR Submitted' is NOT in this list.
  implication: If MRF status is set to 'TR Submitted', it will automatically drop out of the onSnapshot query results and disappear from the pending list.

- timestamp: 2026-04-27
  checked: renderMRFList() isRejectedStatus filter (line 2365) and pendingTransportMRFs filter (line 2370)
  found: pendingTransportMRFs = transportMRFs.filter(m => !isRejectedStatus(m.status)). Since 'Pending' is not a rejected status, submitted service MRFs appear here indefinitely.
  implication: The pending list for transport MRFs has no mechanism to remove an MRF after TR submission without a status change.

- timestamp: 2026-04-27
  checked: Records tab status handling (procurement.js line 4883)
  found: `else if (mrf.status === 'TR Submitted')` is already handled in the Records tab rendering — it shows 'For Approval' in the status display.
  implication: 'TR Submitted' is a valid, pre-existing status value. Safe to set.

- timestamp: 2026-04-27
  checked: Status dropdown option (line 1866)
  found: `<option value="TR Submitted">TR Submitted</option>` — already exists in filter UI.
  implication: 'TR Submitted' is a recognized status throughout the app.

## Resolution

root_cause: submitTransportRequest() (procurement.js ~line 5538) explicitly avoided updating the MRF status when creating a TR, leaving service MRFs stuck at 'Pending' status. The loadMRFs() Firestore query only fetches MRFs with statuses in ['Pending', 'In Progress', 'Rejected', 'PR Rejected', 'TR Rejected', 'Finance Rejected']. Since 'TR Submitted' is not in that list, setting MRF status to 'TR Submitted' on submission makes the MRF automatically drop out of the pending panel via onSnapshot.

fix: Added `status: 'TR Submitted'` to the updateDoc call in submitTransportRequest() (procurement.js ~line 5540). Changed the comment to accurately reflect the new behavior. One-line addition.

verification: pending human confirm

files_changed:
  - app/views/procurement.js
