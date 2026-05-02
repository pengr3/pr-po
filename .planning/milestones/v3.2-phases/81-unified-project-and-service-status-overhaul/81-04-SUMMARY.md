# Phase 81 UAT — Plan 04 Summary

**Date:** 2026-04-27
**Plan:** 81-04 — Human UAT Checkpoint
**Approved by:** pengr3

## Results Table

| Check | Surface | Result | Notes |
|-------|---------|--------|-------|
| 1 | Projects list form | PASS | Single "Status *" dropdown with exactly 10 options (For Inspection → Loss); no Internal Status field |
| 2 | Projects list filter + table | PASS | Single Status filter and Status column; no Internal Status anywhere in UI |
| 3 | Create new project | PASS | Firestore write contains `project_status`, no `internal_status` field |
| 4 | CSV export | PASS | Header row: `Code,Name,Client,Status,Active` (5 columns) |
| 5 | Project Detail | PASS | Single Status dropdown in Status & Assignment card; saves and persists correctly |
| 6 | Legacy fallback (detail) | PASS | Legacy `project_status` values render as grey italic `(legacy)` option, selected; re-save works |
| 7 | Legacy filter optgroup | PASS | "Other (legacy)" optgroup appears when legacy values exist; filtering works correctly |
| 8 | Services list mirror | PASS | Checks 1–4 equivalent verified on #/services; serviceProjectStatus and serviceProjectStatusFilter IDs intact |
| 9 | Service Detail mirror | PASS | Checks 5–6 equivalent verified on Service Detail page |
| 10 | Home charts | PASS | 3 charts total (1 Projects + 2 Services); new color palette for 10 statuses |
| 11 | Chart label readability | PASS | All 10 labels readable at 1366×768 including long labels; canvas has hs-chart-status class at 320px |
| 12 | Edit history | PASS | Status changes read "Status: X → Y"; internal_status legacy records read "Internal Status (Legacy) changed from X to Y" |
| 13 | Console hygiene + cachedStats | PASS | Zero JS errors; cachedStats has exactly 6 keys with no legacy keys present |

## Review Fixes Verified

| REVIEWS Item | Description | Result |
|---|---|---|
| Concern 1 | Chart label readability at 1366×768 — .hs-chart-status class at 320px desktop / 360px mobile | PASS |
| Concern 2 | Legacy filter optgroup — "Other (legacy)" optgroup dynamically injected when legacy values exist | PASS |
| Concern 4 | cachedStats fresh literal — 6 keys only, no stale 8-key shape after deployment | PASS |
| Suggestion 3 | Edit history labels — "Status" for project_status, "Internal Status (Legacy)" for orphaned internal_status records | PASS |

## Defects Flagged for Follow-Up

None.

## Sign-Off

- **Approved by user:** yes
- **Date:** 2026-04-27
- **All 13 checks:** PASS
