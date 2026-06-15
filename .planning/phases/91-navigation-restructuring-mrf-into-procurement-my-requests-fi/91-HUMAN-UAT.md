---
status: passed
phase: 91-navigation-restructuring-mrf-into-procurement-my-requests-fi
source: [91-VERIFICATION.md]
started: 2026-05-13T00:00:00.000Z
updated: 2026-05-13T00:00:00.000Z
---

## Current Test

All tests passed.

## Tests

### 1. Request sub-tab render and submission
expected: After deploy and forceReseedRoleTemplates(), visiting #/procurement/request renders the MRF form; submitting creates an MRF with requestor_user_id populated
result: pass

### 2. Finance role DOM gating
expected: After forceReseedRoleTemplates() runs, a finance-role user sees no Request anchor and no MRF Records anchor in the Procurement tab row
result: pass — all 4 sub-tab anchors absent from DOM; finance sees view-only notice from mrf-form (no sub-tab nav rendered)

### 3. My Requests filter behavior
expected: Selecting "My Requests" in the Records tab dept dropdown narrows the table to only MRFs the current user submitted (requestor_user_id matches uid); selecting other filter values restores full/scoped view
result: pass

### 4. #/mrf-form redirect
expected: Visiting #/mrf-form in the browser redirects to #/procurement/request without a flash or error
result: pass

### 5. forceReseedRoleTemplates() + verifyRoleTemplates()
expected: Running window.forceReseedRoleTemplates() then window.verifyRoleTemplates() in the browser console returns { valid: true, errors: [] } confirming all 7 roles have all 4 new sub-tab keys in Firestore
result: pass — { valid: true, errors: [] } confirmed

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
