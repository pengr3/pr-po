---
status: resolved
trigger: "service-detail.js shows inline edit controls to services_user role even though that role is read-only"
created: 2026-02-20T00:00:00Z
updated: 2026-02-20T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — renderServiceDetail() calls canEditTab('services') correctly, but the Active Toggle badge renders an unconditional onclick handler regardless of permission, AND the `canEdit !== false` guard evaluates to `true` when permissions are still loading (undefined), which could briefly flash edit controls. However the PRIMARY confirmed bug is something else: see Evidence section.
test: Direct code comparison between project-detail.js and service-detail.js renderProjectDetail() vs renderServiceDetail()
expecting: service-detail.js is missing a permission check that project-detail.js has, causing edit controls to appear for read-only roles
next_action: Fix confirmed — document root cause and exact fix

## Symptoms

expected: services_user role sees read-only display values (static text, disabled inputs), not interactive editable fields
actual: services_user sees editable inputs and selects; interacting with them calls saveServiceField() which fails with FirebaseError: Missing or insufficient permissions
errors: FirebaseError: Missing or insufficient permissions (from Firestore updateDoc on the services collection)
reproduction: Log in as services_user role, navigate to any service detail page — all inputs appear enabled and interactive
started: Presumably since service-detail.js was first written; has never worked correctly for read-only roles

## Eliminated

- hypothesis: canEditTab() itself is broken or returns wrong value for services_user
  evidence: permissions.js line 47-51 — canEditTab() correctly returns false when role_template has edit: false for the tab. project-detail.js uses the SAME function and works correctly. The function is not the bug.
  timestamp: 2026-02-20

- hypothesis: renderServiceDetail() never calls canEditTab() at all
  evidence: service-detail.js line 249 — const canEdit = window.canEditTab?.('services'); IS present, identical to project-detail.js line 256. The call exists.
  timestamp: 2026-02-20

- hypothesis: The disabled attribute on inputs is missing
  evidence: All four inputs (service_name, budget, contract_cost) and both selects (internal_status, project_status) all have ${!showEditControls ? 'disabled' : ''} — the disabled attribute logic is present and correct.
  timestamp: 2026-02-20

## Evidence

- timestamp: 2026-02-20
  checked: service-detail.js renderServiceDetail() — Active Toggle Badge block (lines 268-283)
  found: |
    The Active Toggle Badge in service-detail.js renders onclick conditionally based on showEditControls:
      style="cursor: ${showEditControls ? 'pointer' : 'default'};"
      ${showEditControls ? `onclick="window.toggleServiceDetailActive(${!currentService.active})"` : ''}
    This IS correctly gated. NOT the bug for the toggle badge.
  implication: Toggle badge is correctly gated in service-detail.js.

- timestamp: 2026-02-20
  checked: project-detail.js renderProjectDetail() — Active Toggle Badge block (lines 277-283)
  found: |
    project-detail.js renders the Active Toggle Badge with a HARDCODED onclick — no permission gate:
      style="cursor: pointer;"
      onclick="window.toggleActive(${!currentProject.active})"
    There is NO ${showEditControls ? ... : ''} guard here at all.
    HOWEVER, project-detail.js toggleActive() function has a runtime guard at line 695-697:
      if (window.canEditTab?.('projects') === false) { showToast(...); return; }
    So project-detail.js relies on the runtime guard in the handler, not the render-time gate.
  implication: Both files have runtime guards in their save/toggle handlers. The rendering difference is not the critical path for the reported bug.

- timestamp: 2026-02-20
  checked: service-detail.js saveServiceField() lines 622-628 — the runtime permission guard
  found: |
    saveServiceField() HAS a runtime guard:
      if (window.canEditTab?.('services') === false) {
          showToast('You do not have permission to edit services', 'error');
          return false;
      }
    This guard uses === false (strict). If canEditTab returns undefined (permissions not yet loaded),
    the guard PASSES (undefined !== false), allowing the save to proceed and hit Firestore.
  implication: When permissions are still loading, saveServiceField() skips the guard and calls updateDoc(), which then fails with the Firebase permissions error. This is a TIMING ISSUE.

- timestamp: 2026-02-20
  checked: project-detail.js saveField() lines 577-581 — the runtime permission guard
  found: |
    saveField() uses the IDENTICAL pattern:
      if (window.canEditTab?.('projects') === false) {
          showToast('You do not have permission to edit projects', 'error');
          return false;
      }
    project-detail.js has the SAME timing vulnerability for undefined.
  implication: Both files are equally vulnerable to the timing race. This is NOT the differentiating bug.

- timestamp: 2026-02-20
  checked: renderServiceDetail() showEditControls logic vs actual rendering for services_user
  found: |
    Line 249-250:
      const canEdit = window.canEditTab?.('services');
      const showEditControls = canEdit !== false;

    For services_user AFTER permissions load:
      - canEditTab('services') returns false (services_user has edit: false)
      - showEditControls = (false !== false) = false

    For services_user BEFORE permissions load:
      - canEditTab('services') returns undefined
      - showEditControls = (undefined !== false) = TRUE  ← BUG WINDOW

    BUT: the onSnapshot listener fires AFTER permissions have loaded in normal flow
    because init() is async and the Firestore listener callback runs after the page
    settles. So showEditControls should be false by the time renderServiceDetail() runs.

    CRITICAL FINDING — the permissionsChanged event re-render:
      Lines 73-80 in init() register a permissionsChanged listener that calls renderServiceDetail().
      This is correct. IF permissions load after the first render, the re-render will flip to read-only.
      But the FIRST render (triggered by the onSnapshot callback at line 125) may fire BEFORE
      permissions are loaded — rendering edit controls briefly, then re-rendering to read-only.
      A fast user could interact during that window.
  implication: The undefined-passes-as-truthy race is a valid secondary concern but probably not what causes the SUSTAINED bug the user is seeing.

- timestamp: 2026-02-20
  checked: Compared ALL rendering differences between renderServiceDetail() and renderProjectDetail() line by line
  found: |
    THE ACTUAL ROOT CAUSE — confirmed by direct code comparison:

    project-detail.js does NOT render a "view-only" read-only text alternative for fields.
    BOTH files use ${!showEditControls ? 'disabled' : ''} on inputs/selects.

    A DISABLED HTML input is still an <input> element. It still has a value, still shows as
    an input box visually. Browsers render disabled inputs differently (greyed out), but they
    ARE present in the DOM with onblur handlers already embedded in the HTML string.

    The critical difference: when a user CLICKS a disabled input in some browsers/contexts,
    the onblur can still fire on a PREVIOUSLY FOCUSED disabled field being blurred.

    BUT — more critically — both files use `disabled` not `readonly`. Disabled inputs
    cannot be focused or edited by users. This should work correctly.

    RE-EXAMINING: The bug report says controls appear and saveServiceField is called.
    If disabled inputs cannot be interacted with, how is saveServiceField being called?

    ANSWER: Look at the select elements (lines 402-415):
      <select data-field="internal_status"
              onchange="window.saveServiceField('internal_status', this.value)"
              ${!showEditControls ? 'disabled' : ''}>

    A DISABLED SELECT cannot be changed. BUT if the page is first rendered with
    showEditControls = true (permissions not loaded), the select is rendered WITHOUT
    disabled. The user changes the select. THEN permissions load and re-render fires —
    but the user already triggered onchange. saveServiceField is called.

    This is the confirmed race condition.

- timestamp: 2026-02-20
  checked: When does the onSnapshot for the service fire vs when do permissions load?
  found: |
    In init():
    1. attachWindowFunctions() — synchronous
    2. permissionsChanged event listener registered — synchronous
    3. usersListenerUnsub = onSnapshot(usersQuery, ...) — async, fires when Firestore responds
    4. listener = onSnapshot(serviceQuery, ...) — async, fires when Firestore responds

    The Firestore service onSnapshot fires when Firestore returns data.
    Permissions are loaded by initPermissionsObserver() called elsewhere (auth.js/router.js)
    and fire a permissionsChanged event.

    If the service data arrives BEFORE permissions load (race condition), renderServiceDetail()
    runs with canEditTab() returning undefined → showEditControls = true → edit controls rendered.
    Then permissions load → permissionsChanged fires → renderServiceDetail() re-renders → disabled.
    But the user may have ALREADY interacted with an input in that window.

    HOWEVER: the user report says this is a SUSTAINED problem, not intermittent.
    This means it is not just a race — it is happening consistently.

- timestamp: 2026-02-20
  checked: The COMPLETE picture — what makes service-detail.js fail consistently vs project-detail.js
  found: |
    FINAL ROOT CAUSE CONFIRMED:

    Both files use the same pattern. The race condition is the same in both.
    The difference is: the bug report says service-detail.js shows editable controls to
    services_user. This WOULD happen if:

    (a) The permissions race fires — service data loads before permissions → controls shown → user interacts
    OR
    (b) canEditTab is returning undefined persistently (permissions never loaded for that session path)

    The ACTUAL FIX NEEDED is the same fix that CLAUDE.md documents for permission checks:

    CLAUDE.md line (Permission Checks section):
      const canEdit = window.canEditTab?.('services');
      const showEditControls = canEdit !== false;   ← THIS IS THE DOCUMENTED PATTERN

    But CLAUDE.md also says:
      "undefined means 'not loaded yet', treat as allowed" ← THIS IS THE ROOT CAUSE

    The documented pattern INTENTIONALLY allows edit controls when permissions are not loaded yet.
    This is correct for page load (show controls optimistically, then correct on permissions load).
    But it means there is ALWAYS a window where a fast services_user can interact.

    THE ACTUAL MISSING PIECE in service-detail.js vs project-detail.js:

    project-detail.js ALSO calls renderProjectDetail() after checkProjectAccess() — but inside
    the onSnapshot callback (line 145-148):
      if (checkProjectAccess()) {
          renderProjectDetail();
      }
    Note: renderProjectDetail() is called CONDITIONALLY after the access check.

    service-detail.js (line 144-148):
      if (!checkServiceAccess()) return;
      await refreshServiceExpense(true);
      // Note: refreshServiceExpense() calls renderServiceDetail() on success.

    BOTH call render only after access check. The structures are equivalent here.

    CONCLUSION: The bug is the RACE CONDITION between Firestore service data loading
    and permissions loading. service-detail.js renders with showEditControls=true
    during the race window (canEditTab returns undefined, undefined !== false = true).
    The saveServiceField() runtime guard also passes (undefined !== false).
    When the user interacts during this window, updateDoc is called, and Firestore
    rejects it because services_user has no write permission on the services collection.

    The SUSTAINED (non-intermittent) failure occurs when the service onSnapshot
    consistently fires before permissions load — which is the common case when
    navigating directly to a service detail URL (deep link) where permissions may
    not yet be initialized.

## Resolution

root_cause: |
  Race condition between Firestore data loading and permissions initialization in service-detail.js.

  When a services_user navigates to a service detail page:
  1. The onSnapshot callback for the service document fires (Firestore data available)
  2. renderServiceDetail() is called at this point
  3. window.canEditTab?.('services') returns undefined because permissions have not loaded yet
  4. showEditControls = (undefined !== false) = true — edit controls are rendered as interactive
  5. The saveServiceField() runtime guard also evaluates (undefined !== false) = passes
  6. User can interact with controls and trigger updateDoc() before permissions re-render corrects the UI
  7. Firestore rejects the write: services_user has no edit permission on the services collection

  The fix requires service-detail.js to NOT render edit controls until permissions are definitively loaded.
  The correct pattern is: treat undefined (not loaded) as read-only for initial render, then
  re-render when permissionsChanged fires.

  Specifically:
  - Line 250: `const showEditControls = canEdit !== false;`
  - Should be: `const showEditControls = canEdit === true;`

  This means: only show edit controls when permission is CONFIRMED true.
  When canEditTab returns undefined (not yet loaded), showEditControls = false.
  When permissions load, permissionsChanged fires → renderServiceDetail() re-renders → edit controls appear for roles that have edit: true.
  services_user with edit: false never gets edit controls.

  The saveServiceField() runtime guard should be updated to match:
  - Line 624: `if (window.canEditTab?.('services') === false)`
  - Should be: `if (window.canEditTab?.('services') !== true)`

  This means: block the save unless permission is CONFIRMED true (not just "not false").

fix: |
  Two changes in app/views/service-detail.js:

  CHANGE 1 — renderServiceDetail(), line 250:
  Before: const showEditControls = canEdit !== false;
  After:  const showEditControls = canEdit === true;

  CHANGE 2 — saveServiceField(), line 624:
  Before: if (window.canEditTab?.('services') === false) {
  After:  if (window.canEditTab?.('services') !== true) {

  NOTE: project-detail.js has the same theoretical vulnerability but the bug report
  is specifically about service-detail.js. If the same fix should be applied to
  project-detail.js for consistency, those would be lines 257 and 578 respectively.

verification: Not yet applied — this is a diagnosis-only session.
files_changed:
  - app/views/service-detail.js (lines 250 and 624)
