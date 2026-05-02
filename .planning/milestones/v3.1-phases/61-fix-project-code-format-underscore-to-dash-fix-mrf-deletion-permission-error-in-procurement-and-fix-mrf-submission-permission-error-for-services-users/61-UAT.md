---
status: complete
phase: 61-fix-project-code-format-underscore-to-dash-fix-mrf-deletion-permission-error-in-procurement-and-fix-mrf-submission-permission-error-for-services-users
source: [61-01-SUMMARY.md]
started: 2026-03-09T06:00:00Z
updated: 2026-03-09T06:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Project code uses dash format
expected: When a new project is created, its generated code uses dashes (e.g. CLMC-ACME-2026001), not underscores (CLMC_ACME_2026001).
result: pass

### 2. Service code uses dash format
expected: When a new service is created, its generated code uses dashes (e.g. CLMC-CLIENTCODE-2026001), not underscores.
result: pass

### 3. Procurement can delete MRFs
expected: A procurement user can delete an MRF from the MRF Processing tab without a FirebaseError/permission denied error. The MRF disappears from the list.
result: pass

### 4. Services user can submit MRF
expected: A services_user can submit a new MRF without a permission error. The MRF appears in the list after submission.
result: pass

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
