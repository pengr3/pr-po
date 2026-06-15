# Root Cause Report — MRF Records: operation_user sees all MRFs

## Hypothesis

`loadPRPORecords` and its re-filter helpers filter the Records tab using only `getAssignedProjectCodes()`,
which returns `null` (no filter) for every role except `operations_user` — meaning `services_user` MRFs
are never scoped — and even for `operations_user` the filter only checks `mrf.project_code`, so service-type
MRFs (which carry `service_code`, not `project_code`) always pass the filter and are always visible.

## Evidence

| # | File | Line | Observation |
|---|------|------|-------------|
| 1 | `app/utils.js` | 264–273 | `getAssignedProjectCodes()` returns `null` ("no filter") for every role except `operations_user` (hard check: `user.role !== 'operations_user'`). For `services_user` it always returns `null`. |
| 2 | `app/utils.js` | 340–348 | `getAssignedServiceCodes()` is the parallel function for `services_user`, but it is **never imported or called** anywhere inside `procurement.js`. |
| 3 | `app/views/procurement.js` | 5062–5068 | `loadPRPORecords` (fresh-fetch path) calls only `getAssignedProjectCodes()`. When non-null it filters `!mrf.project_code \|\| assignedCodes.includes(mrf.project_code)`. No service_code check exists. |
| 4 | `app/views/procurement.js` | 5007–5014 | Cache-hit path in `loadPRPORecords` applies the same `getAssignedProjectCodes()` filter — still no service scope. |
| 5 | `app/views/procurement.js` | 2764–2774 | `reFilterAndRenderPRPORecords()` (called on `assignmentsChanged` event) uses only `getAssignedProjectCodes()` — no service_code filter. |
| 6 | `app/views/mrf-form.js` | 1711–1719 | MRF documents written for project-type requests store `project_code`; those written for service-type requests store `service_code` (and `project_code` is set to `''`). The two fields are mutually exclusive on any given MRF document. |
| 7 | `app/views/procurement.js` | 5062–5067 | The filter predicate `!mrf.project_code \|\| assignedCodes.includes(mrf.project_code)` evaluates to `true` for every service-type MRF because `mrf.project_code` is `''` (falsy), so the `!mrf.project_code` guard short-circuits — **all service-type MRFs pass the filter unconditionally**. |
| 8 | `app/views/procurement.js` | 2671–2679 | The MRF Management tab has the same logic gap: the same `getAssignedProjectCodes()` + `!mrf.project_code` guard is used, so an `operations_user` also sees service-type MRFs that belong to entirely different services. |
| 9 | `app/utils.js` | 267 | `getAssignedProjectCodes()` returns `null` for `services_user` (line 267: only `operations_user` is scoped), so the filter block `if (assignedCodes !== null)` is never entered for `services_user` — the Records tab shows them all MRFs regardless of service assignment. |

## Root Cause

There are two distinct gaps, both in the Records tab and in the MRF Management tab:

**Gap A — `operations_user` sees service-type MRFs it should not see.**
`loadPRPORecords` and `reFilterAndRenderPRPORecords` filter using `getAssignedProjectCodes()` and the
predicate `!mrf.project_code || assignedCodes.includes(mrf.project_code)`. Because service-type MRFs
store `project_code: ''` (an empty string, which is falsy), the guard `!mrf.project_code` is always
`true` for those documents, so they all pass the filter. An `operations_user` who should only see
their assigned projects ends up seeing every service-type MRF in the system.

**Gap B — `services_user` sees ALL MRFs (reported symptom).**
`getAssignedProjectCodes()` returns `null` for every role except `operations_user` (line 267 of utils.js).
Because `services_user` is not `operations_user`, `getAssignedProjectCodes()` always returns `null`, the
`if (assignedCodes !== null)` block is never entered, and `allPRPORecords` is left unfiltered. There is no
corresponding call to `getAssignedServiceCodes()` anywhere in `procurement.js`, so the service-scope logic
that exists for other views (services.js, mrf-form.js, service-detail.js) is entirely absent from the
Records tab.

## services_user gap

**Same structural gap, different missing function.** The filter in the Records tab is built only around
`getAssignedProjectCodes()`. `getAssignedServiceCodes()` (utils.js:340) is the correct counterpart for
`services_user` and is used correctly in `services.js`, `mrf-form.js`, and `service-detail.js` — but it is
never called in `procurement.js`. As a result `services_user` sees every MRF in the system (project-type
and service-type alike), with zero filtering applied.

## Affected Files

- `app/views/procurement.js:5062–5068` — `loadPRPORecords`, fresh-fetch filter block (primary fix point)
- `app/views/procurement.js:5007–5014` — `loadPRPORecords`, cache-hit re-filter block
- `app/views/procurement.js:2764–2774` — `reFilterAndRenderPRPORecords` (assignmentsChanged handler)
- `app/views/procurement.js:2671–2679` — MRF Management tab `loadMRFs` onSnapshot (same dual gap)
- `app/views/procurement.js:2741–2745` — `reFilterAndRenderMRFs` (MRF Management assignmentsChanged handler)

## Recommended Fix (no code)

Three coordinated changes are needed, applied consistently across all five filter call-sites listed above:

1. **Add a `services_user` filter branch alongside the existing `operations_user` branch.**
   At each call-site, after the existing `getAssignedProjectCodes()` check, add an equivalent check using
   `getAssignedServiceCodes()`. When that returns a non-null array, filter MRFs to those whose `service_code`
   is in the returned array (or whose `service_code` is empty/absent, as the legacy-data defensive guard).

2. **Fix the `operations_user` predicate so service-type MRFs are excluded.**
   The current guard `!mrf.project_code` passes all service-type MRFs because `project_code` is `''`.
   The predicate should be tightened: an `operations_user` should only see MRFs whose `request_type` is
   not `'service'` AND whose `project_code` is in their assigned list (plus the legacy no-code guard).
   Alternatively, explicitly exclude service-type MRFs when filtering for `operations_user` (they have no
   project assignment to match against).

3. **Apply the same fixes to both the Records tab and the MRF Management tab** (the Management tab has
   an identical logical structure and the same two gaps).
