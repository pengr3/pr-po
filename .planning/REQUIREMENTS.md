# Requirements: CLMC Management Portal

**Defined:** 2026-04-28
**Milestone:** v4.0 — Procurement → Full Management Portal
**Core Value:** Projects tab must work — it's the foundation where project name and code originate, and everything in the procurement system connects to it.

This milestone transforms CLMC from a procurement-focused tool into a full management portal. It adds five major capability areas: native project management (Gantt-based), in-app notifications, manual collectibles tracking, full proposal lifecycle (with internal approval workflow + document versioning + dashboard + client log), and a Super-Admin-only Management Tab acting as the central decision-making hub.

## v4.0 Requirements

### Project Management — Gantt & Tasks (PM)

- [ ] **PM-01**: User can create tasks within a project with name, description, start date, end date, and assigned personnel
- [ ] **PM-02**: User can create task hierarchy — a task may contain subtasks (parent/child relationship), and parent task progress is rolled up from subtasks
- [ ] **PM-03**: User can set task dependencies (Finish-to-Start: Task B starts after Task A completes)
- [ ] **PM-04**: User can view all project tasks as an interactive Gantt chart (timeline visualization with bars representing task spans)
- [ ] **PM-05**: User can update task progress as a percentage complete (0–100) from both the task list and the Gantt view
- [ ] **PM-06**: User can mark any task as a milestone — Gantt displays milestones with a distinct visual marker (e.g. diamond)
- [ ] **PM-07**: System auto-calculates project overall progress from task progress weighted by duration; visible on the project detail page
- [ ] **PM-08**: User can edit task dates inline from the Gantt view (drag bar edges to resize, drag bar body to reschedule)
- [ ] **PM-09**: User can filter the Gantt view by date range and assigned personnel
- [ ] **PM-10**: System persists project tasks in Firestore (`project_tasks` collection) with project_id, task_id, parent_task_id, name, description, start_date, end_date, progress, is_milestone, dependencies array, assignees array
- [ ] **PM-11**: Firebase Security Rules enforce role-based read/write on `project_tasks` (assigned personnel + project admins read; admins + assignees write progress)

### Notification System — In-App (NOTIF)

- [ ] **NOTIF-01**: User sees a bell icon in the top navigation showing an unread notification count badge
- [ ] **NOTIF-02**: User can click the bell to open a notification dropdown listing recent notifications (last 10) with type, message, source link, and time
- [ ] **NOTIF-03**: User can click a notification in the dropdown or history page to navigate to its source record (deep link)
- [ ] **NOTIF-04**: User can mark an individual notification as read
- [ ] **NOTIF-05**: User can mark all notifications as read in one click
- [ ] **NOTIF-06**: User can open a full notification history page (paginated, 20/page) with all notifications including read items
- [ ] **NOTIF-07**: System creates a notification for the requestor when their MRF is approved or rejected
- [ ] **NOTIF-08**: System creates notifications for Finance users when a PR/TR or RFP requires their review
- [ ] **NOTIF-09**: System creates notifications for designated approvers when a proposal is submitted for internal approval
- [ ] **NOTIF-10**: System creates a notification for the proposal submitter when approval status changes (approved/rejected)
- [ ] **NOTIF-11**: System creates notifications for assigned personnel when a project's status changes (e.g. → Client Approved, → On-going, → Completed)
- [ ] **NOTIF-12**: System creates a notification for Super Admin users when a new account registration is pending approval
- [ ] **NOTIF-13**: System persists notifications in Firestore (`notifications` collection) with user_id (recipient), type, message, link, read flag, created_at; Security Rules ensure each user only reads/writes their own notifications
- [x] **NOTIF-14**: System creates a notification for all active procurement-role users when a new MRF is submitted (broadcast — message references MRF ID and project) — completed Phase 84.1 Plan 01 (2026-05-02)
- [ ] **NOTIF-15**: System creates a notification for the procurement user who created a PR when Finance approves or rejects that PR (recipient = PR `created_by`; message references PR ID and decision)
- [ ] **NOTIF-16**: System creates a notification for the procurement user who created an RFP when that RFP is marked Paid (recipient = RFP `created_by`; message references RFP ID and PO ID)
- [ ] **NOTIF-17**: System creates a notification for the procurement user who created a TR when Finance approves or rejects that TR (recipient = TR `created_by`; message references TR ID and decision)
- [x] **NOTIF-18**: System creates notifications for the MRF requestor and the procurement user who created the PO when a PO's `procurement_status` advances to `Delivered` (closes the procurement loop) — completed Phase 84.1 Plan 01 (2026-05-02)
- [ ] **NOTIF-19**: System creates notifications for assigned personnel when a project/service's Budget or Contract Cost is meaningfully changed (numeric delta non-zero); message references the field changed, old value, new value. (Projected Cost is excluded — it is a derived total of project expenses, not a user-editable field.)
- [ ] **NOTIF-20**: MRF rejection notification body (NOTIF-07 path) includes the rejection reason text entered by the rejecter, when present

### Collectibles Tracking — Manual Entry (COLL)

- [ ] **COLL-01**: User (Operations Admin / Finance) can manually create a collectible against a project with amount, due date, description, and initial status
- [ ] **COLL-02**: User can edit existing collectible entries (amount, due date, description)
- [ ] **COLL-03**: User can delete collectible entries (Operations Admin / Finance)
- [ ] **COLL-04**: User can view all collectibles in a dedicated Finance sub-tab — filterable by project, status, due date range
- [ ] **COLL-05**: User can record a payment received against a collectible (partial or full) including amount, date, method, reference
- [ ] **COLL-06**: System auto-derives collectible status from recorded payments and due date (Pending / Partially Paid / Fully Paid / Overdue) — user never manually sets status, mirroring the RFP pattern
- [ ] **COLL-07**: User can view collectibles for a specific project on the project detail page (Financial Summary card and/or Financial Breakdown modal)
- [ ] **COLL-08**: User can export the collectibles list to CSV (mirrors existing `downloadCSV` pattern)
- [ ] **COLL-09**: System persists collectibles in Firestore (`collectibles` collection) with project_id, project_code, amount, due_date, description, status, payment_records array; Security Rules restrict create/edit/delete to Operations Admin and Finance roles

### Proposal Tracking — Full Lifecycle (PROP)

- [ ] **PROP-01**: User can create a proposal record linked to a project with title, description, amount, target client, and version number (v1)
- [ ] **PROP-02**: User can submit a proposal for internal approval — project status advances to "Proposal for Internal Approval" automatically
- [ ] **PROP-03**: Designated approvers (Operations Admin / Super Admin) can approve or reject a proposal with mandatory comments — approval advances project to "Proposal Under Client Review", rejection moves it back to "For Revision"
- [ ] **PROP-04**: System maintains a per-proposal audit trail of all approval decisions (actor, timestamp, action, comment) viewable in the proposal detail
- [ ] **PROP-05**: User can upload proposal document files (PDF/docx) to Firebase Storage, attached to the proposal record
- [ ] **PROP-06**: User can upload new versions of a proposal document — prior versions remain accessible, version number auto-increments
- [ ] **PROP-07**: User can mark a proposal as sent to client and record the send date (system also captures it as an audit-trail entry)
- [ ] **PROP-08**: User can log client communications on a proposal — entries include date, type (sent / feedback received / revision requested), description, optional attachment
- [ ] **PROP-09**: User can mark a proposal as Client Approved (advances project to "Client Approved" / "For Mobilization") or Loss (advances project to "Loss")
- [ ] **PROP-10**: User can view all proposals in a dedicated dashboard inside the Management Tab — grouped by stage, with age-in-stage indicators for items needing attention
- [ ] **PROP-11**: System persists proposal records in Firestore (`proposals` collection) and proposal documents in Firebase Storage; Security Rules restrict proposal create/edit to Operations Admin + Super Admin, approve/reject to Operations Admin + Super Admin

### Management Tab — Super Admin Hub (MGMT)

- [ ] **MGMT-01**: Super Admin sees a "Management" tab in the main navigation
- [ ] **MGMT-02**: Non-Super-Admin users do not see the Management tab — navigation hidden, route blocked at the router level, Firebase Security Rules deny direct collection access
- [ ] **MGMT-03**: Management tab includes a "Proposal Approval Queue" section showing all proposals currently awaiting internal approval, sorted by oldest-first
- [ ] **MGMT-04**: Super Admin can take approval actions (approve / reject with comments) directly from the queue (mirrors PROP-03 behaviour from the queue context)
- [ ] **MGMT-05**: Management tab includes a "Create Engagement" form that auto-routes the new record to either the `projects` collection or the `services` collection (one-time vs recurring) based on the engagement type the user selects
- [ ] **MGMT-06**: Create Engagement form captures: engagement type (project / one-time service / recurring service), client (optional, supports clientless creation), name, budget, contract cost, initial assigned personnel — and writes a record in the appropriate collection following existing schema
- [ ] **MGMT-07**: Firebase Security Rules deny all Management Tab back-end operations (proposal queue actions, create-engagement writes) for non-super_admin users

## Future Requirements

### Project Management Enhancements
- **PM-FUT-01**: Per-task billable flag with auto-trigger of collectibles when task progress crosses milestone thresholds (deferred from v4.0)
- **PM-FUT-02**: ProjectLibre `.pod` file import — parse uploaded plan, render as Gantt
- **PM-FUT-03**: Resource allocation view (workload across personnel)
- **PM-FUT-04**: Critical path highlighting on Gantt
- **PM-FUT-05**: Baseline vs actual variance reporting

### Notification Enhancements
- **NOTIF-FUT-01**: Email notification channel via SendGrid/Resend (currently Out of Scope per PROJECT.md)
- **NOTIF-FUT-02**: Browser push notifications via Firebase Cloud Messaging
- **NOTIF-FUT-03**: User-configurable notification preferences (mute by type, digest mode)

### Collectibles Enhancements
- **COLL-FUT-01**: Auto-trigger collectibles when PM task progress crosses configured thresholds
- **COLL-FUT-02**: Per-client collectibles aggregation view
- **COLL-FUT-03**: Collectibles ageing report (30/60/90+ days overdue)

### Proposal Enhancements
- **PROP-FUT-01**: Multi-step approval routing (configurable approver chain per project size or amount)
- **PROP-FUT-02**: Proposal templates with pre-filled boilerplate

### Management Tab Enhancements
- **MGMT-FUT-01**: Role-configurable access via existing role-template system (replaces super_admin hard gate)
- **MGMT-FUT-02**: User registration approvals folded into Mgmt Tab (currently in Super Admin dashboard)
- **MGMT-FUT-03**: Client onboarding queue (route new clients through Mgmt Tab)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Email notifications | Already Out of Scope per PROJECT.md (security + simplicity); v4.0 in-app channel only |
| Browser push notifications (FCM) | Adds service worker + FCM infra; in-app sufficient for v4.0 |
| ProjectLibre embed/iframe | ProjectLibre is a Java desktop app — no web version exists; native Gantt is the chosen path |
| ProjectLibre `.pod` file import | Deferred to PM-FUT-02; native Gantt + manual entry is sufficient for v4.0 |
| Per-task billing / collectibles auto-trigger from PM | Deferred to v4.1+ to keep v4.0 scoped; manual collectibles entry first |
| Multi-step approval routing on proposals | Single-step (any approver in role) for v4.0; chain routing deferred |
| Mgmt Tab role-configurable access | Super Admin hard gate for v4.0; role-template integration deferred |
| User registration approvals moved to Mgmt Tab | Stays in existing Super Admin dashboard for v4.0; consolidation deferred |
| Phase 68.1 (subcon scorecard fix) | v3.2 deferred item — kept v4.0 focused on portal transformation; addressed in v4.1+ |
| Phase 70 rework (cancel-PR proper approval flow) | v3.2 deferred item — basic flow shipped in v3.2; rework deferred to v4.1+ |

## Traceability

Every active v4.0 requirement is mapped to exactly one phase. 51 requirements total → 51 mappings.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PM-01 | Phase 86 | Pending |
| PM-02 | Phase 86 | Pending |
| PM-03 | Phase 86 | Pending |
| PM-04 | Phase 86 | Pending |
| PM-05 | Phase 86 | Pending |
| PM-06 | Phase 86 | Pending |
| PM-07 | Phase 86 | Pending |
| PM-08 | Phase 86 | Pending |
| PM-09 | Phase 86 | Pending |
| PM-10 | Phase 86 | Pending |
| PM-11 | Phase 86 | Pending |
| NOTIF-01 | Phase 83 | Pending |
| NOTIF-02 | Phase 83 | Pending |
| NOTIF-03 | Phase 83 | Pending |
| NOTIF-04 | Phase 83 | Pending |
| NOTIF-05 | Phase 83 | Pending |
| NOTIF-06 | Phase 83 | Pending |
| NOTIF-07 | Phase 84 | Pending |
| NOTIF-08 | Phase 84 | Pending |
| NOTIF-09 | Phase 87 | Pending |
| NOTIF-10 | Phase 87 | Pending |
| NOTIF-11 | Phase 84 | Pending |
| NOTIF-12 | Phase 84 | Pending |
| NOTIF-13 | Phase 83 | Pending |
| NOTIF-14 | Phase 84.1 | Validated (Plan 01, 2026-05-02) |
| NOTIF-15 | Phase 84.1 | Pending |
| NOTIF-16 | Phase 84.1 | Pending |
| NOTIF-17 | Phase 84.1 | Pending |
| NOTIF-18 | Phase 84.1 | Validated (Plan 01, 2026-05-02) |
| NOTIF-19 | Phase 84.1 | Pending |
| NOTIF-20 | Phase 84.1 | Pending |
| COLL-01 | Phase 85 | Pending |
| COLL-02 | Phase 85 | Pending |
| COLL-03 | Phase 85 | Pending |
| COLL-04 | Phase 85 | Pending |
| COLL-05 | Phase 85 | Pending |
| COLL-06 | Phase 85 | Pending |
| COLL-07 | Phase 85 | Pending |
| COLL-08 | Phase 85 | Pending |
| COLL-09 | Phase 85 | Pending |
| PROP-01 | Phase 87 | Pending |
| PROP-02 | Phase 87 | Pending |
| PROP-03 | Phase 87 | Pending |
| PROP-04 | Phase 87 | Pending |
| PROP-05 | Phase 87 | Pending |
| PROP-06 | Phase 87 | Pending |
| PROP-07 | Phase 87 | Pending |
| PROP-08 | Phase 87 | Pending |
| PROP-09 | Phase 87 | Pending |
| PROP-10 | Phase 87 | Pending |
| PROP-11 | Phase 87 | Pending |
| MGMT-01 | Phase 88 | Pending |
| MGMT-02 | Phase 88 | Pending |
| MGMT-03 | Phase 89 | Pending |
| MGMT-04 | Phase 89 | Pending |
| MGMT-05 | Phase 88 | Pending |
| MGMT-06 | Phase 88 | Pending |
| MGMT-07 | Phase 88 | Pending |

**Coverage by phase:**

| Phase | Requirements | Count |
|-------|--------------|-------|
| Phase 83 — Notification System Foundation | NOTIF-01, NOTIF-02, NOTIF-03, NOTIF-04, NOTIF-05, NOTIF-06, NOTIF-13 | 7 |
| Phase 84 — Notification Triggers (Existing Events) | NOTIF-07, NOTIF-08, NOTIF-11, NOTIF-12 | 4 |
| Phase 84.1 — Procurement Notifications & Trigger Enhancements | NOTIF-14, NOTIF-15, NOTIF-16, NOTIF-17, NOTIF-18, NOTIF-19, NOTIF-20 | 7 |
| Phase 85 — Collectibles Tracking | COLL-01, COLL-02, COLL-03, COLL-04, COLL-05, COLL-06, COLL-07, COLL-08, COLL-09 | 9 |
| Phase 86 — Native Project Management & Gantt | PM-01, PM-02, PM-03, PM-04, PM-05, PM-06, PM-07, PM-08, PM-09, PM-10, PM-11 | 11 |
| Phase 87 — Proposal Lifecycle (incl. proposal-event notifications) | PROP-01..11, NOTIF-09, NOTIF-10 | 13 |
| Phase 88 — Management Tab Shell + Create Engagement | MGMT-01, MGMT-02, MGMT-05, MGMT-06, MGMT-07 | 5 |
| Phase 89 — Management Tab Proposal Approval Queue | MGMT-03, MGMT-04 | 2 |
| **Total** | | **58** |
