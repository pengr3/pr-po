---
phase: 81-unified-project-and-service-status-overhaul
verified: 2026-04-27T09:40:20Z
status: passed
score: 7/7 must-haves verified
re_verification: false
---

# Phase 81: Unified Project and Service Status Overhaul — Verification Report

**Phase Goal:** Replace the dual internal_status + project_status UI across all project/service views and the home dashboard with a single unified 10-option Status dropdown; drop internal_status from all writes; update edit-history labels; add chart sizing for 10-bar layouts.
**Verified:** 2026-04-27T09:40:20Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Projects list/form/filter/table/CSV use single unified Status with 10 options; no internal_status | VERIFIED | `UNIFIED_STATUS_OPTIONS` (10 entries) present; `INTERNAL_STATUS_OPTIONS`, `PROJECT_STATUS_OPTIONS`, `internalStatus`, `internalStatusFilter`, `internal_status`, `Internal Status` all absent from projects.js; CSV header is `['Code', 'Name', 'Client', 'Status', 'Active']` |
| 2 | Project Detail page shows single Status dropdown with legacy fallback | VERIFIED | `UNIFIED_STATUS_OPTIONS` present in project-detail.js; `saveField('project_status'` wired; `(legacy)` fallback option present; all legacy constants and strings absent |
| 3 | Services list/form/filter/table/CSV mirror projects.js changes | VERIFIED | `UNIFIED_STATUS_OPTIONS` present; `rebuildServiceStatusFilterOptions` present; `serviceProjectStatus` and `serviceProjectStatusFilter` IDs intact; all `internal_status` references absent; CSV header correct |
| 4 | Service Detail page shows single Status dropdown with legacy fallback | VERIFIED | `UNIFIED_STATUS_OPTIONS` present; `saveServiceField('project_status'` wired; `(legacy)` fallback present; no legacy constants |
| 5 | Home dashboard shows 3 charts total (1 Projects + 2 Services); no legacy chart containers; proper 10-bar sizing | VERIFIED | `buildStatusBreakdownContainer` called with `stat-projects-status`, `stat-services-ot-status`, `stat-services-rec-status`; `getChartSizeClass` returns `'hs-chart-status'`; `cachedStats` is 6-key literal; no legacy container ids or variable names |
| 6 | Edit history labels: project_status → 'Status'; internal_status → 'Internal Status (Legacy)' | VERIFIED | fieldLabels contains `'project_status': 'Status'` and `'internal_status': 'Internal Status (Legacy)'`; `'Project Status'` absent; no bare `'Internal Status'` string |
| 7 | styles/views.css has .hs-chart-status class at 320px desktop / 360px mobile | VERIFIED | `.hs-chart-canvas.hs-chart-status { height: 320px }` and `@media (max-width: 768px) { .hs-chart-canvas.hs-chart-status { height: 360px } }` both present |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/views/projects.js` | Single unified Status dropdown + rebuildStatusFilterOptions + no internal_status writes | VERIFIED | All 10 UNIFIED_STATUS_OPTIONS present; `rebuildStatusFilterOptions` defined and called from `renderProjectsTable`; addDoc/updateDoc payloads contain `project_status` only |
| `app/views/project-detail.js` | Single Status dropdown + legacy fallback + saveField wired | VERIFIED | UNIFIED_STATUS_OPTIONS present; `(legacy)` option pattern present; `saveField('project_status'` wired |
| `app/views/services.js` | Mirror of projects.js for Services entity | VERIFIED | UNIFIED_STATUS_OPTIONS present; `rebuildServiceStatusFilterOptions` defined and called from `renderServicesTable`; addDoc/updateDoc have `project_status` only |
| `app/views/service-detail.js` | Mirror of project-detail.js for Service entity | VERIFIED | UNIFIED_STATUS_OPTIONS present; `(legacy)` pattern present; `saveServiceField('project_status'` wired |
| `app/views/home.js` | 3 charts (stat-projects-status, stat-services-ot-status, stat-services-rec-status); fresh 6-key cachedStats; hs-chart-status class returned | VERIFIED | All 3 container ids present and wired to `renderStatusBreakdown`; cachedStats has exactly 6 keys; `getChartSizeClass` returns `'hs-chart-status'`; UNIFIED_STATUS_OPTIONS.forEach used twice in onSnapshot callbacks |
| `app/edit-history.js` | fieldLabels: project_status='Status', internal_status='Internal Status (Legacy)' | VERIFIED | Exact strings confirmed; 'Project Status' absent; bare 'Internal Status' absent |
| `styles/views.css` | .hs-chart-canvas.hs-chart-status at 320px desktop / 360px mobile | VERIFIED | Both rules present with correct heights and min-heights |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `projects.js addDoc()` | Firestore projects write | addDoc payload | WIRED | `project_status` present; `internal_status` absent from payload |
| `projects.js updateDoc()` | Firestore projects update | updateDoc payload | WIRED | `project_status` present; `internal_status` absent |
| `projects.js renderProjectsTable()` | rebuildStatusFilterOptions() | First call in function body | WIRED | `rebuildStatusFilterOptions` found in first 500 chars of function body |
| `project-detail.js saveField('project_status', ...)` | Firestore projects/{id} update | updateDoc in saveField | WIRED | `saveField('project_status'` call present in onchange handler |
| `services.js addDoc()` | Firestore services write | addDoc payload | WIRED | `project_status` present; `internal_status` absent |
| `services.js renderServicesTable()` | rebuildServiceStatusFilterOptions() | First call in function body | WIRED | `rebuildServiceStatusFilterOptions` found in first 500 chars of function body |
| `service-detail.js saveServiceField('project_status', ...)` | Firestore services/{id} update | updateDoc in saveServiceField | WIRED | `saveServiceField('project_status'` call present in onchange handler |
| `home.js loadStats() projects listener` | renderStatusBreakdown('stat-projects-status', byStatus) | onSnapshot callback | WIRED | Direct call confirmed; `cachedStats.projectsByStatus` assigned |
| `home.js loadStats() services listener` | renderStatusBreakdown for ot + rec | Two renderStatusBreakdown calls | WIRED | Both `stat-services-ot-status` and `stat-services-rec-status` calls present; cachedStats keys assigned |
| `home.js getChartSizeClass()` | .hs-chart-status CSS rule | Class string returned + applied to canvas wrapper | WIRED | `buildStatusBreakdownContainer` renders `<div class="hs-chart-canvas ${sizeClass}">` which produces `.hs-chart-canvas.hs-chart-status` matching the CSS compound selector |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `home.js projectsCardHtml()` | `cachedStats.projectsByStatus` | `onSnapshot(collection(db, 'projects'), ...)` counting by `project_status` using UNIFIED_STATUS_OPTIONS | Yes — Firestore onSnapshot callback iterates docs and increments `byStatus[d.project_status]` | FLOWING |
| `home.js servicesCardHtml()` | `cachedStats.servicesByStatusOneTime`, `cachedStats.servicesByStatusRecurring` | `onSnapshot(collection(db, 'services'), ...)` splitting by `service_type` | Yes — two counter maps populated from live Firestore data | FLOWING |
| `projects.js renderProjectsTable()` | `projectsData` (from onSnapshot) | `project_status` field read from Firestore docs | Yes — `UNIFIED_STATUS_OPTIONS.includes(v)` check gates legacy rendering | FLOWING |
| `project-detail.js` Status select | `currentProject.project_status` | Firestore project doc | Yes — renders with legacy fallback if not in UNIFIED_STATUS_OPTIONS | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED — this is a browser-based static SPA; no runnable server-side entry points to test without starting a browser. UAT was conducted by user (all 13 checks PASS per 81-04-SUMMARY.md).

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| D-01 | 81-01, 81-02, 81-03 | Reuse existing `project_status` Firestore field; drop `internal_status` from all writes | SATISFIED | addDoc/updateDoc payloads in projects.js and services.js contain `project_status` only; `internal_status` absent from all write paths |
| D-02 | 81-01, 81-02, 81-03 | 10 unified status options in UNIFIED_STATUS_OPTIONS | SATISFIED | All 10 options present in projects.js, project-detail.js, services.js, service-detail.js, home.js with exact spelling and order |
| D-03 | 81-01, 81-02 | Legacy stored values not in new list display as-is with grey italic `(legacy)` suffix; detail pages show legacy option | SATISFIED | `(legacy)` present in table cell render and detail page select; `rebuildStatusFilterOptions`/`rebuildServiceStatusFilterOptions` inject "Other (legacy)" optgroup |
| D-04 | 81-01, 81-02, 81-03 | Drop `internal_status` from all UI, validation, Firestore writes, and edit-history diffs | SATISFIED | `internal_status` absent from all 5 key files (projects.js, project-detail.js, services.js, service-detail.js, home.js) |
| D-05 | 81-03 | Collapse home dashboard to single chart per entity (3 total: 1 Projects + 2 Services); fresh cachedStats shape | SATISFIED | 3 chart containers; cachedStats is 6-key literal; no legacy 8-key shape |
| D-06 | 81-03 | edit-history.js field label for `project_status` → 'Status'; `internal_status` → 'Internal Status (Legacy)' | SATISFIED | fieldLabels confirmed; 'Project Status' absent |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

Sanity checks run:
- `internal_status` in projects.js, services.js, home.js: absent
- `INTERNAL_STATUS_OPTIONS` / `PROJECT_STATUS_OPTIONS` in all 5 files: absent
- Legacy option strings (`Pending Client Review`, `Approved by Client`, `Ready to Submit`): absent from all files (confirmed standalone "Under Client Review" in projects.js/services.js is only the substring within the valid unified option "Proposal Under Client Review")
- `byInternal`, `byProject` in home.js: absent (0 occurrences)

### Human Verification Required

Human UAT was already completed by user (pengr3) on 2026-04-27 per 81-04-SUMMARY.md. All 13 checks passed:
- Projects list form: single Status dropdown, 10 options
- Projects filter and table: single Status column, no Internal Status
- Create project Firestore write: project_status only, no internal_status
- CSV export: 5-column header with Status
- Project Detail: single Status dropdown, saves correctly
- Legacy fallback in detail: (legacy) option in grey italic, re-save works
- Legacy filter optgroup: "Other (legacy)" appears when legacy values exist
- Services list mirror: checks 1-4 equivalent on /services
- Service Detail mirror: checks 5-6 equivalent
- Home charts: 3 charts total with new color palette
- Chart label readability at 1366x768: all 10 labels readable
- Edit history: "Status: X -> Y"; legacy entries show "Internal Status (Legacy)"
- Console hygiene + cachedStats: zero JS errors; exactly 6 keys in cachedStats

### Gaps Summary

None. All must-haves verified. Phase goal achieved.

---

_Verified: 2026-04-27T09:40:20Z_
_Verifier: Claude (gsd-verifier)_
