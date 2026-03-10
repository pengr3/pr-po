---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: PR/TR Routing Fix
status: unknown
last_updated: "2026-03-09T09:50:17.093Z"
progress:
  total_phases: 49
  completed_phases: 48
  total_plans: 130
  completed_plans: 127
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-05 after v3.1 milestone start)

**Core value:** Projects tab must work - it's the foundation where project name and code originate, and everything in the procurement system connects to it.
**Current focus:** Phase 57 complete — v3.1 shipped

## Current Position

Phase: 62.2 of 62.2 (MRF rejection timeline event) — COMPLETE
Plan: 1 of 1 in Phase 62.2 — COMPLETE
Status: Complete
Last activity: 2026-03-10 — Phase 62.2 complete — MRF rejection event in Procurement and My Requests timelines

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 146 (v1.0: 10, v2.0: 26, v2.1: 11, v2.2: 23, v2.3: 34, v2.4: 24, v2.5: 12, v3.0: 4 + 2 untracked)
- Total milestones shipped: 9

**By Milestone:**

| Milestone | Phases | Days | Avg/Phase |
|-----------|--------|------|-----------|
| v1.0 | 4 | 59 | 14.8 |
| v2.0 | 6 | 64 | 10.7 |
| v2.1 | 3 | 2 | 0.7 |
| v2.2 | 11 | 5 | 0.5 |
| v2.3 | 15 | 8 | 0.5 |
| v2.4 | 10 | 3 | 0.3 |
| v2.5 | 7 | 2 | 0.3 |
| v3.0 | 3 | 1 | 0.3 |
| Phase 057 P01 | 1 | 2 tasks | 2 files |
| Phase 58 P02 | 45s | 2 tasks | 2 files |
| Phase 59 P01 | 2min | 2 tasks | 2 files |
| Phase 59 P04 | 1 | 1 tasks | 1 files |
| Phase 59-02 P02 | 5 | 2 tasks | 2 files |
| Phase 59 P03 | 2 | 2 tasks | 2 files |
| Phase 59 P05 | 3 | 2 tasks | 2 files |
| Phase 60 P02 | 2min | 2 tasks | 1 file |
| Phase 60 P03 | 15 | 2 tasks | 1 files |
| Phase 60.1 P02 | 4min | 2 tasks | 1 files |
| Phase 61 P01 | 2 | 2 tasks | 2 files |
| Phase 60.2 P01 | 2min | 1 tasks | 1 files |
| Phase 62 P01 | 5 | 2 tasks | 3 files |
| Phase 62 P02 | 10 | 2 tasks | 2 files |
| Phase 62 P03 | 3 | 1 tasks | 1 files |
| Phase 62 P04 | 5 | 1 tasks | 1 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Phase 46: Unified project/service dropdown uses native optgroup + data-type/data-name — same pattern applies to category dropdowns
- Phase 57 (pending): "DELIVERY BY SUPPLIER" must NOT appear in `transportCategories` array so routing stays in PR path
- [Phase 057]: DELIVERY BY SUPPLIER absent from transportCategories so routing stays in PR path and triggers existing supplier-required validation
- [Phase 057]: New category options inserted between HAULING & DELIVERY and OTHERS in all dropdowns, no new logic required
- [Phase 58]: Added https://www.gstatic.com to CSP connect-src in both _headers and netlify.toml to fix Firebase SDK source map fetch CSP violations
- [Phase 58]: TR Rejected status added to canEdit checks in renderMRFDetails() and updateActionButtons() — all resubmittable MRF statuses now consistent
- [Phase 58]: PR Rejected and TR Rejected added to histStatusFilter dropdown and historicalStatuses query so Records tab fetches and filters rejected MRFs
- [Phase 59]: TR finance_status fetched from transport_requests collection per-row; not stored on mrfs document — must be fetched separately for Transport rows
- [Phase 59]: Used minmax(280px, 320px) for .dashboard-grid left panel to gain ~30px vs fixed 350px and allow shrinkage on tight viewports
- [Phase 59-02]: Submitted event uses completed (green) only when finance_status=Approved AND no rejection history — keeps non-rejected approvals as single green entry
- [Phase 59-02]: Approved PRs with rejection history emit 4 events: Submitted + Rejected + Resubmitted + Approved with POs — full audit trail visible in chronological order
- [Phase 59]: Sort state in createMRFRecordsController closure resets naturally on controller re-creation — no explicit reset code needed
- [Phase 59-03]: window._myRequestsSort wired as thin bridge to controller.sort() — consistent with existing _myRequestsFilter/Reload/ExportCSV pattern
- [Phase 59]: Cache key is mrf.id (Firestore document ID) not mrf.mrf_id — consistent with onSnapshot pattern
- [Phase 59]: Loading placeholder guarded by _subDataCache.size === 0 so only shown on cold start, not sort/filter/page
- [Phase 59.1]: Remove server-side historicalStatuses filter from loadPRPORecords — all MRFs fetched, client-side filterPRPORecords() handles filtering; reset _prpoRecordsCachedAt = 0 in saveNewMRF success path so Records tab never serves stale cache after a create
- [Phase 60]: TR rejection does NOT cascade to MRF — TRs are child records; TR outcomes fully scoped to transport_requests collection; PR rejection cascade to MRF preserved
- [Phase 60]: Prior rejection notice in Finance TR modal shown only when tr.rejection_reason is set — gives Finance context on resubmitted TRs, hidden for fresh TRs
- [Phase 60-02]: Rejected TRs filter by mrf_id presence — standalone TRs without mrf_id excluded from dedicated rejected panel
- [Phase 60-02]: resubmitRejectedTR does NOT clear rejection_reason so Finance modal shows "Previously rejected" notice on resubmitted TRs
- [Phase 60-02]: cachedRejectedTRs.length included in empty-state guard in renderMRFList so panel stays when only rejected TRs exist
- [Phase 60]: calculateSubtotal/calculateGrandTotal guards removed so they work in rejected TR panel where currentMRF is null
- [Phase 60]: saveRejectedTRChanges does not reset finance_status — only persists item edits; Resubmit button is the explicit re-queue action
- [Phase 60.1]: trDataArray cached in both _subDataCache and _prpoSubDataCache alongside trFinanceStatus; cache-hit path uses || [] fallback for backward compat
- [Phase 60.1]: displayId in renderPRPORecords and createMRFRecordsController always uses mrf.mrf_id — TR codes are in PRs column as status-badge spans, not in MRF ID column
- [Phase 60.1]: Transport badge uses span (not anchor) — no TR detail modal exists in these table views
- [Phase 60.1]: TR submission stores tr_id on MRF doc but does NOT change MRF status — MRF stays Pending after submitTransportRequest
- [Phase 60.1]: generatePRandTR sets MRF status to 'PR Submitted' not 'PR & TR Submitted' — TR outcome scoped to transport_requests
- [Phase 60.1]: renderMRFList splits arrays into pending vs rejected at top; dedicated Rejected MRFs panel for PR/TR/Finance Rejected MRFs
- [Phase 61]: services_user mrfs list rule moved to unrestricted hasRole() branch — scoped list caused generateMRFId() to fail for unscoped getDocs when any project-type MRF doc failed the per-doc check
- [Phase 61]: Dash separator in CLMC codes (CLMC-CLIENT-YYYYnnn) — range queries preserved since dash (ASCII 45) sorts before digits; deleted_mrfs create rule gets procurement alongside mrfs delete (soft-delete pattern: both operations in deleteMRF() need the role)
- [Phase 60.2]: My Requests container changed from 1200px to 1600px to match procurement.js Records tab outer wrapper — single string replacement, no structural changes needed
- [Phase 62]: All four recency sorts replaced with localeCompare — consistent alphabetical ordering across both dropdown surfaces
- [Phase 62]: Finance Project List uses where('active', '==', true) — query and where already imported, no new imports
- [Phase 62]: rejectMRF() uses updateDoc not deleteDoc — MRF preserved in Firestore with status=Rejected, rejection_reason, rejected_by, rejected_at for audit trail
- [Phase 62]: window.viewTRDetails registered from procurement.js; mrf-records.js registers viewTRDetailsLocal fallback only if window.viewTRDetails not already defined
- [Phase 62]: Finance Project List uses getDocs(collection(db, 'projects')) unfiltered — where('active', '==', true) used wrong field name and excluded inactive projects Finance needs for historical tracking
- [Phase 62]: deleteRejectedTR splices cachedRejectedTRs in-memory and calls renderMRFList() — onSnapshot listener provides eventual consistency independently

### Roadmap Evolution

- Phase 62 added: Sort project/service dropdown alphabetically, reject MRF instead of delete, TR details modal, and fix Finance project list error
- Phase 58 added: Fix TR rejection not reappearing in procurement, PR rejection hiding MRF records, and CSP header violations blocking Firebase source maps
- Phase 59 added: Improve TR display on MRF Records and My Requests, add sortable headers to My Requests, enhance Timeline lifecycle logging, and optimize workspace responsiveness for laptop screens
- Phase 60 added: Fix TR rejection independence — decouple TR status from MRF, treat TRs as child records like PRs so rejected TRs return to procurement without rejecting the whole MRF
- Phase 59.1 inserted after Phase 59: Fix MRF Records real-time rendering - new MRFs should appear instantly in all records tables (Procurement and My Requests) (URGENT)
- Phase 60.1 inserted after Phase 60: Fix TR code visibility + dedicated Rejected MRFs grouping in MRF Processing Area — TR badges in PRs column on MRF Records and My Requests, no MRF status change on TR generation, hide Procurement Status dropdown for TR rows, Rejected MRFs get own section separate from Pending (URGENT)
- Phase 61 updated: Fix project code format underscore to dash, fix MRF deletion permission error in procurement, and fix MRF submission permission error for services users
- Phase 60.2 inserted after Phase 60: Match My Requests table size and layout to MRF Records tab (URGENT)
- Phase 62.1 inserted after Phase 62: Add line item capability to rejected TRs so Procurement can adjust before resubmitting to Finance

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-09
Stopped at: Completed 60.1-01-PLAN.md — TR badge in PRs column for Transport rows in mrf-records.js and procurement.js renderPRPORecords; displayId always shows mrf_id
Resume file: None
Next action: Phase 60.1 complete — TR code visibility fixed in both table views.
