---
status: partial
phase: 91-navigation-restructuring-mrf-into-procurement-my-requests-fi
source: [91-VERIFICATION.md]
started: 2026-05-13T00:00:00.000Z
updated: 2026-05-13T00:00:00.000Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Request sub-tab render and submission
expected: After deploy and forceReseedRoleTemplates(), visiting #/procurement/request renders the MRF form; submitting creates an MRF with requestor_user_id populated
result: [pending]

### 2. Finance role DOM gating
expected: After forceReseedRoleTemplates() runs, a finance-role user sees no Request anchor and no MRF Records anchor in the Procurement tab row
result: [pending]

### 3. My Requests filter behavior
expected: Selecting "My Requests" in the Records tab dept dropdown narrows the table to only MRFs the current user submitted (requestor_user_id matches uid); selecting other filter values restores full/scoped view
result: [pending]

### 4. #/mrf-form redirect
expected: Visiting #/mrf-form in the browser redirects to #/procurement/request without a flash or error
result: [pending]

### 5. forceReseedRoleTemplates() + verifyRoleTemplates()
expected: Running window.forceReseedRoleTemplates() then window.verifyRoleTemplates() in the browser console returns { valid: true, errors: [] } confirming all 7 roles have all 4 new sub-tab keys in Firestore
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
