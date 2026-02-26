---
status: resolved
trigger: "services_user gets HTTP 403 Forbidden when service-detail.js calls getAggregateFromServer on the prs collection filtered by service_code"
created: 2026-02-20T00:00:00Z
updated: 2026-02-20T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — prs collection list rule omits services_user entirely; Firestore aggregation queries require list permission; services_user therefore cannot run getAggregateFromServer on prs
test: Read firestore.rules prs match block; read service-detail.js refreshServiceExpense; verify no guard skips aggregation for services_user
expecting: prs list rule has no services_user branch; project-detail.js has same gap but operations_user is also excluded (less visible); fix is to add services_user branch to prs (and pos) list rules AND add a try/catch no-op guard in service-detail.js so failures are silent
next_action: DONE — root cause confirmed with three independent evidence entries

## Symptoms

expected: services_user opens service detail page, expense totals (PR Total / PO Total) display correctly with zero console errors
actual: Console floods with 403 Forbidden on every onSnapshot fire (every service document update). Error is FirebaseError: Missing or insufficient permissions on runAggregationQuery against prs collection. Page renders with zeroed expense values instead of real data.
errors: |
  POST https://firestore.googleapis.com/v1/projects/clmc-procurement/databases/(default)/documents:runAggregationQuery 403 (Forbidden)
  FirebaseError: Missing or insufficient permissions
  Triggered from refreshServiceExpense in service-detail.js:770
reproduction: |
  1. Log in as services_user assigned to service CLMC_TEST_2026008
  2. Navigate to that service's detail page
  3. Open browser DevTools → Console
  4. Observe 403 errors repeating on every Firestore snapshot update
started: Present since SERV-11 (Phase 33) shipped — expense aggregation was added without updating firestore.rules for services_user

## Eliminated

- hypothesis: Bug is in expense-modal.js (showServiceExpenseBreakdownModal)
  evidence: expense-modal.js uses getDocs (list/get), not getAggregateFromServer. The 403 is explicitly on runAggregationQuery endpoint, not on getDocs. expense-modal.js is only invoked when user manually clicks the expense amount — it is NOT triggered on page load or on every snapshot. The flooding pattern proves the source is refreshServiceExpense, not the modal.
  timestamp: 2026-02-20

- hypothesis: services_user has list access on prs but aggregation requires a separate rule
  evidence: Firestore aggregation queries (count, sum) evaluate against the same list permission as getDocs. There is no separate "aggregate" rule in Firestore Security Rules. The 403 is because list permission itself is denied for services_user on prs. Confirmed by reading the Firestore documentation behavior: runAggregationQuery uses the list rule path.
  timestamp: 2026-02-20

- hypothesis: The problem is only in service-detail.js and not a rules gap
  evidence: firestore.rules prs list block (line 200-203) explicitly lists only: super_admin, operations_admin, services_admin, finance, procurement, and operations_user (project-scoped). services_user is entirely absent. This is a rules omission, not just a code-side oversight. Both a rules fix and a code-side guard are needed.
  timestamp: 2026-02-20

## Evidence

- timestamp: 2026-02-20
  checked: firestore.rules — prs match block (lines 195-213)
  found: |
    allow list: if isActiveUser() && (
      hasRole(['super_admin', 'operations_admin', 'services_admin', 'finance', 'procurement']) ||
      (isRole('operations_user') && isLegacyOrAssigned(resource.data.project_code))
    );

    services_user is NOT listed. There is no branch for:
      (isRole('services_user') && isAssignedToService(resource.data.service_code))
    Compare to mrfs list rule (lines 176-180) and transport_requests list rule (lines 246-249)
    which DO include the services_user branch. The prs (and pos) rules were never updated.
  implication: Any query against prs by services_user — including getAggregateFromServer — will receive 403. This is the direct cause of the error.

- timestamp: 2026-02-20
  checked: firestore.rules — pos match block (lines 218-236)
  found: |
    allow list: if isActiveUser() && (
      hasRole(['super_admin', 'operations_admin', 'services_admin', 'finance', 'procurement']) ||
      (isRole('operations_user') && isLegacyOrAssigned(resource.data.project_code))
    );

    services_user is ALSO missing from pos list rule. refreshServiceExpense runs
    getAggregateFromServer on both prs AND pos. The pos aggregation at line 780 will
    also fail with 403, though it fires after the prs failure (line 770 throws first
    in the try block, so pos failure may be masked). Both rules need the same fix.
  implication: Even after fixing prs, pos aggregation will also 403. Both collections need the same services_user branch added.

- timestamp: 2026-02-20
  checked: service-detail.js — onSnapshot callback (line 125) → refreshServiceExpense call (line 146)
  found: |
    The onSnapshot listener fires every time the service document changes in Firestore.
    Each fire calls refreshServiceExpense(true) (silent=true). refreshServiceExpense
    unconditionally runs three getAggregateFromServer calls (mrfs, prs, pos) with no
    role check. The catch block at line 797-800 catches the 403 silently but:
      1. It still hits Firestore, generating a real 403 HTTP response each time
      2. console.error('[ServiceDetail] Expense aggregation failed:', error) still fires
      3. Any Firestore document update (including by other users editing the service)
         re-triggers the snapshot, which re-triggers the 403, causing the "flood"
    The silent=true parameter suppresses the showToast but NOT the console.error or
    the network round-trip.
  implication: The flooding is caused by the combination of: (a) onSnapshot triggering on every service doc change, (b) refreshServiceExpense having no role guard, (c) the 403 being caught and logged each time. Fix requires both the rules fix AND a role-awareness guard in refreshServiceExpense.

- timestamp: 2026-02-20
  checked: project-detail.js — refreshExpense function (lines 643-690); roles that use project-detail.js
  found: |
    project-detail.js has the same pattern: getAggregateFromServer on pos and
    transport_requests without any role guard. However:
    - operations_user IS included in pos list rule (line 225)
    - operations_user IS included in transport_requests list rule (line 247-248)
    So project-detail.js does NOT hit this bug because operations_user has list access
    on both pos and transport_requests. The services symmetry was broken when prs/pos
    list rules were NOT updated to include services_user.
  implication: The asymmetry between the two departments' rules coverage is the root cause. mrfs and transport_requests got services_user coverage; prs and pos did not.

- timestamp: 2026-02-20
  checked: REQUIREMENTS.md — SERV-11, ROLE-02, ROLE-06, SEC-03
  found: |
    SERV-11: "Service detail page includes expense breakdown (MRFs/PRs/POs linked to service)" — marked Complete.
    ROLE-06: "services_user sees only assigned services" — implies read-scoped access to expense data.
    SEC-03: "services_user can read only assigned services" — the services collection rule is correct.
    The requirements state services_user SHOULD see expense totals. There is no requirement
    that services_user be blocked from reading prs/pos data for their assigned services.
    The omission from prs/pos list rules is a defect, not an intentional design decision.
  implication: services_user SHOULD be able to read prs and pos for their assigned services (by service_code). The fix is unambiguously correct to add.

## Resolution

root_cause: |
  DUAL ROOT CAUSE (both must be fixed):

  1. FIRESTORE RULES OMISSION (primary):
     The `prs` and `pos` collections' `list` rules do not include a `services_user` branch.
     Compare to `mrfs` (line 179) and `transport_requests` (line 249) which both have:
       (isRole('services_user') && isAssignedToService(resource.data.service_code))
     The prs and pos rules were not updated when SERV-11 shipped. Firestore's
     runAggregationQuery evaluates the list rule — no list access = 403.

  2. NO ROLE GUARD IN refreshServiceExpense (secondary / defense-in-depth):
     refreshServiceExpense() runs aggregations unconditionally on every snapshot update.
     There is no check like `if (window.canReadTab?.('services') === false) return;`
     before the Firestore calls. This causes the 403 to be triggered and logged on
     every document change rather than being avoided entirely.
     Note: project-detail.js has the same absence of a guard, but it is not affected
     because operations_user already has list access on pos and transport_requests.

fix: |
  Fix 1 — firestore.rules: Add services_user branch to prs AND pos list rules.

  In the prs match block, change:
    allow list: if isActiveUser() && (
      hasRole(['super_admin', 'operations_admin', 'services_admin', 'finance', 'procurement']) ||
      (isRole('operations_user') && isLegacyOrAssigned(resource.data.project_code))
    );
  To:
    allow list: if isActiveUser() && (
      hasRole(['super_admin', 'operations_admin', 'services_admin', 'finance', 'procurement']) ||
      (isRole('operations_user') && isLegacyOrAssigned(resource.data.project_code)) ||
      (isRole('services_user') && isAssignedToService(resource.data.service_code))
    );

  Apply the IDENTICAL change to the pos match block list rule.

  Fix 2 — service-detail.js refreshServiceExpense (defense-in-depth):
  Add a permission check guard at the top of refreshServiceExpense(), before the
  Firestore calls. If canReadTab('services') is explicitly false, skip aggregation
  and render with zeroed values. This prevents the 403 flood if rules ever regress.

  NOTE: Fix 1 alone fully resolves the 403. Fix 2 is defense-in-depth.
  The expense-modal.js (showServiceExpenseBreakdownModal) also queries prs and pos
  using getDocs — it will ALSO fail with 403 for services_user once the user clicks
  "View Breakdown". The same rules fix resolves both.

verification: |
  Not yet applied — this is a diagnosis-only session.

  To verify after fix:
  1. Deploy updated firestore.rules
  2. Log in as services_user assigned to a service that has linked PRs/POs
  3. Navigate to that service's detail page
  4. Confirm: expense totals show real values (not zeros or dashes)
  5. Confirm: zero 403 errors in browser DevTools Console
  6. Confirm: expense breakdown modal (click amount) also loads correctly
  7. Confirm: super_admin and services_admin expense display unchanged (no regression)

files_changed: []

## Notes

The comment in firestore.rules at line 199 reads:
  "// List: cross-dept roles unrestricted; operations_user project-scoped; services_admin unrestricted (tracks their MRFs)"
This comment was written before services_user expense viewing was a requirement (SERV-11).
The comment is itself evidence of the oversight — it mentions services_admin but not services_user
for prs/pos, while the equivalent mrfs comment (line 175) correctly documents both.

The isAssignedToService() helper function (lines 52-55) already exists and is correctly
used in mrfs and transport_requests list rules. Using it in prs/pos list rules is
consistent with the existing pattern — no new helper needed.
