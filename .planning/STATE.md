# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-05)

**Core value:** Projects tab must work - it's the foundation where project name and code originate, and everything in the procurement system connects to it.
**Current focus:** Phase 18 gap closure (v2.2 Workflow & UX Enhancements)

## Current Position

**Milestone:** v2.2 Workflow & UX Enhancements
Phase: 18 of 19 (Finance Workflow & Expense Reporting)
Plan: 5 of 5 in phase (including gap closure plans 04 and 05)
Status: Phase 18 gap closure complete (all 5 plans done)
Last activity: 2026-02-08 - Completed 18-04-PLAN.md (PR approval modal + TR signature removal)

Progress: [███████████████████████████████████████████████░] 98% (58/59 estimated plans across all milestones)

## Performance Metrics

**Velocity:**
- Total plans completed: 47 (v1.0: 10 plans, v2.0: 17 plans, v2.1: 9 plans, v2.2: 11 plans)
- v1.0 milestone: 10 plans completed in 59 days
- v2.0 milestone: 17 plans completed in 64 days
- v2.1 milestone: 9 plans completed in 2 days (2026-02-05 to 2026-02-06)
- v2.2 milestone: 7 plans completed (in progress)
- Average: ~2.5 plans per week

**By Milestone:**

| Milestone | Phases | Plans | Duration | Avg/Plan |
|-----------|--------|-------|----------|----------|
| v1.0 Projects | 4 | 10 | 59 days | 5.9 days |
| v2.0 Auth | 6 | 17 | 64 days | 3.8 days |
| v2.1 Refinement | 3 | 9 | 2 days | 0.2 days |
| v2.2 Enhancements | 5 | 11 | 2 days | 0.18 days |

**Recent Trend:**
- v2.1 dramatically improved velocity (0.2 days/plan vs 3.8 in v2.0)
- Phase 11 (2 plans) completed in <1 day (Security Rules fixes)
- Phase 12 (2 plans) completed in <1 day (Window function lifecycle)
- Phase 13 (5 plans) completed in 2 days (Finance dashboard features)
- Bug fix milestones execute faster than feature milestones

*Updated after v2.2 roadmap creation (2026-02-06)*

## Accumulated Context

### Decisions

Recent decisions affecting current work (see PROJECT.md for full log):

- v2.0: Firebase Security Rules server-side enforcement required (client-side can be bypassed)
- v2.0: Real-time permission updates via Firestore listeners (no logout needed for permission changes)
- v2.0: Minimum 2 Super Admin safeguard prevents system lockout
- v2.0: Two-step deletion (deactivate first) for reversible actions
- v2.1 (11-01): Follow projects collection pattern for clients Security Rules (consistency across admin-managed collections)
- v2.1 (11-02): Use Firestore 'in' operator for multi-role queries instead of client-side filtering (more efficient, follows best practices)
- v2.1 (12-01): attachWindowFunctions() pattern prevents window function lifecycle bugs (router skips destroy on tab switch)
- v2.1 (12-02): AbortController pattern for event listeners (single abort() call, prevents memory leaks, idempotent)
- v2.1 (13-01): Use getAggregateFromServer for dashboard totals (1 read per 1000 entries vs 1 per PO, cost-efficient)
- v2.1 (13-01): Manual refresh button for aggregation instead of real-time listener (Firebase doesn't support real-time aggregation queries)
- v2.1 (13-02): Server-side aggregation for supplier purchase history (efficient for suppliers with many POs)
- v2.1 (13-02): Inline clickable supplier names in PR-PO records (maintains compact layout, easy drill-down)
- v2.1 (13-03): Timeline component reuse for audit trails (DRY principle, consistent visual presentation across app)
- v2.1 (13-03): Multi-collection audit trail queries by common identifier (mrf_id) for complete procurement workflow visibility
- v2.1 (13-05): Move supplier purchase history to Supplier Management tab as primary access point (matches user expectations, feature in logical location)
- v2.2 (15-01): Use readonly (not disabled) for auto-populated form fields (ensures value submits with form)
- v2.2 (15-01): Auto-populate user identity fields in init(), resetForm(), and post-submission (persistent across all form lifecycle events)
- v2.2 (15-02): Personnel field required for new project creation (enforces accountability)
- v2.2 (15-02): Store both personnel_user_id and personnel_name (denormalization avoids extra lookups, historical record)
- v2.2 (15-02): Migrate-on-edit strategy for personnel field (incremental data migration preserves backward compatibility)
- v2.2 (16-01): Plain text display for locked fields instead of disabled inputs (cleaner UI, more obvious fields are truly locked)
- v2.2 (16-01): Manual refresh button for expense calculation (follows Phase 13 pattern, Firebase doesn't support real-time aggregation)
- v2.2 (16-01): Confirmation only for deactivation, not activation (destructive action requires confirmation)
- v2.2 (17-01): Follow Phase 15 denormalization pattern for PR creator attribution (pr_creator_user_id + pr_creator_name for audit trail without lookup overhead)
- v2.2 (17-01): Use serverTimestamp() for created_at instead of client-side Date() (clock-skew protection and millisecond precision)
- v2.2 (17-02): MRF Records tab name centers view on MRF as source of truth (not PR-PO relationships)
- v2.2 (17-03): Color-coded status badges for instant workflow visibility (red/yellow/green pattern from Phase 16)
- v2.2 (17-03): Dual timestamp strategy maintains backward compatibility (_at fields with serverTimestamp, preserve legacy _date fields)
- v2.2 (17-04): Single canonical access point for related data (supplier purchase history only in Supplier Management tab, not scattered across views)
- v2.2 (17-02): Table column order follows workflow logic (MRF → PRs → POs → Status → Actions)
- v2.2 (17-02): Remove redundant columns when functionality exists elsewhere (PO Timeline column removed, timeline button remains in Actions)
- v2.2 (17-01): Display 'Unknown User' for backward compatibility with old PRs without pr_creator_name field
- v2.2 (17-03): Color-coded status badges (red/yellow/green) provide at-a-glance workflow progress visibility
- v2.2 (17-03): Calculate MRF status from PR/PO arrays (not denormalized field) for real-time accuracy
- v2.2 (17-03): Dual timestamp strategy for PO status updates (_at fields with serverTimestamp + _date fields for backward compatibility)
- v2.2 (17-04): Single access point for supplier purchase history (Supplier Management tab only, removes inline links from MRF Records)
- v2.2 (17-05): Gap closure approach - extend existing patterns to edge cases (rejected PR update, approved PR merge) rather than rewrite
- v2.2 (17-05): PR creator overwrites on update/merge (shows "who prepared this version", not "original creator")
- v2.2 (17-06): Place modals at container level not nested in sections (CSS parent display:none overrides child display:flex from .modal.active)
- v2.2 (18-01): Use signature_pad v5.0.3 via CDN for canvas-based signature capture (industry standard, zero dependencies, touch/stylus/mouse support)
- v2.2 (18-01): Store signature as base64 PNG data URL in Firestore documents (simple, small size, no separate file upload)
- v2.2 (18-01): New WithSignature function variants alongside legacy approve functions (backward compatibility)
- v2.2 (18-01): Separate generatePOsForPRWithSignature preserves existing PO ID format while adding signature and attribution
- v2.2 (18-02): Two-column signature layout (Prepared by left, Approved by right) for PO and PR document templates
- v2.2 (18-02): Use finance_approver_name (Phase 18-01) with fallback to legacy finance_approver field for backward compatibility
- v2.2 (18-02): PR creator name (pr_creator_name from Phase 17) displayed in both document header and signature section
- v2.2 (18-02): Conditional signature image rendering (base64 image when available, empty placeholder when not)
- v2.2 (18-03): Remove Historical Data tab (was placeholder, Project List provides actual analytics)
- v2.2 (18-03): Include approved TRs in project expense totals alongside POs for complete cost picture
- v2.2 (18-03): Separate aggregation queries for materials (non-subcon POs), subcon POs, and approved TRs
- v2.2 (18-03): Scorecard layout for expense breakdown modal (budget/remaining + categories + total)
- v2.2 (18-05): Save dynamic PO fields (payment_terms, condition, delivery_date) to Firestore before document generation for persistence
- v2.2 (18-05): PO document shows only "Approved by" section (procurement team does not sign POs)
- v2.2 (18-05): PR document shows only "Prepared by" as plain text (no signature images, no Approved by section)
- v2.2 (18-04): Separate approval modal for PR signature capture (review and approval are distinct steps)
- v2.2 (18-04): TR approval uses simple confirm dialog with no signature capture

### Pending Todos

**Future Enhancement (beyond v2.2 scope):**
- Multi-user personnel assignment with chip/tag UI - Transform personnel field from single-select to multi-select. Selected users appear as removable chips/pills (delete whole name, not character-by-character). Common pattern used in email recipients, tag inputs. Requires UI component work + schema change (personnel_user_ids array instead of single ID). User feedback from Phase 15 UAT.

### Blockers/Concerns

**Known from v2.0:**
- Role template seeding requires manual browser console step (one-time, 5 minutes)
- First Super Admin requires manual Firestore document edit (one-time, 2 minutes)
- Firestore 'in' query limited to 10 items (project assignments use client-side filtering)

**v2.1 Focus Areas:**
- ✅ Security Rules missing admin bypass logic (Phase 11) - COMPLETE
- ✅ Window function lifecycle management in finance.js (Phase 12) - COMPLETE
- ✅ Financial aggregation cost concerns (Phase 13) - COMPLETE (getAggregateFromServer implemented)

**v2.1 Testing Notes:**
- Firebase emulator required for Security Rules tests
- Test suites added in Phase 11 (11-01: 8 clients tests, 11-02: 3 assignment tests)
- Requires manual setup: firebase-tools, emulator start, npm test
- All tests follow @firebase/rules-unit-testing pattern from Phase 8

## Session Continuity

Last session: 2026-02-08 (Phase 18 gap closure - plans 04 and 05)
Stopped at: Phase 18 gap closure complete - all 5 plans executed. Plans 04 (approval modal) and 05 (document templates) close UAT issues.
Resume file: None
Next action: Phase 19 (Navigation Consolidation)
