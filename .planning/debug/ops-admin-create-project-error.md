---
status: verifying
trigger: "Operations Admin role encounters an error when trying to create a new project"
created: 2026-04-27T00:00:00Z
updated: 2026-04-27T00:01:00Z
---

## Current Focus

hypothesis: CONFIRMED — generateProjectCode() queries services collection (list), but operations_admin is missing from services list rule → permission-denied → addProject() catches error → "Failed to create project"
test: Fixed by adding operations_admin to services get and list rules in firestore.rules
expecting: Operations Admin can now create projects without error
next_action: Await human verification in production/dev

## Symptoms

expected: Operations Admin should be able to create a new project successfully
actual: An error occurs during project creation — "Failed to create project" toast shown
errors: Firebase permission-denied on services collection list query inside generateProjectCode()
reproduction: Log in as Operations Admin → navigate to project creation → attempt to create a project → error occurs
started: Reported as current issue (v3.3)

## Eliminated

- hypothesis: Firestore rules for projects collection block operations_admin
  evidence: firestore.rules line 195 — operations_admin is in the projects create rule. Not the issue.
  timestamp: 2026-04-27T00:00:30Z

- hypothesis: JS-level role guard in toggleAddProjectForm/addProject blocks operations_admin
  evidence: projects.js lines 572 and 618 — guard explicitly checks user.role === 'operations_admin' and allows them through. canEditTab check uses === false strict equality so undefined (not loaded) is treated as allowed. Not the issue.
  timestamp: 2026-04-27T00:00:45Z

## Evidence

- timestamp: 2026-04-27T00:00:10Z
  checked: firestore.rules — projects collection rules (lines 190-215)
  found: operations_admin is in create, update, delete rules for projects. No issue here.
  implication: The blocking is not in the projects collection rules.

- timestamp: 2026-04-27T00:00:20Z
  checked: projects.js addProject() function (lines 609-720)
  found: After role checks pass, calls generateProjectCode(clientCode) from utils.js
  implication: generateProjectCode is in the call path and could throw.

- timestamp: 2026-04-27T00:00:30Z
  checked: utils.js generateProjectCode() (lines 213-253)
  found: Queries BOTH collections in parallel — getDocs(query(collection(db, 'projects'), ...)) AND getDocs(query(collection(db, 'services'), ...)). The services query is a list operation.
  implication: If operations_admin cannot list services, this throws permission-denied, which propagates up.

- timestamp: 2026-04-27T00:00:40Z
  checked: firestore.rules — services collection rules (lines 386-416, before fix)
  found: services list rule only allows: super_admin, services_admin, finance, procurement + services_user scoped. operations_admin is NOT listed.
  implication: CONFIRMED ROOT CAUSE. Operations Admin fails on the services list query inside generateProjectCode().

- timestamp: 2026-04-27T00:00:50Z
  checked: services get rule (line 389, before fix)
  found: services get rule also excludes operations_admin (only super_admin, services_admin, services_user, finance, procurement).
  implication: Both get and list need operations_admin added for completeness.

## Resolution

root_cause: generateProjectCode() in utils.js queries both the projects and services collections in parallel to find the max sequence number and avoid code collisions (CODE-01 design). The services collection Firestore security rules did not include operations_admin in the list (or get) rules. This caused a permission-denied error that propagated out of generateProjectCode(), was caught by addProject(), and surfaced as "Failed to create project".

fix: Added operations_admin to services collection get and list rules in firestore.rules.
  - get rule: added operations_admin alongside super_admin, services_admin, services_user, finance, procurement
  - list rule: added operations_admin alongside super_admin, services_admin, finance, procurement
  - Write rules (create/update/delete) are unchanged — operations_admin cannot write to services.

verification: Awaiting human verification in production (deploy firestore.rules, then test project creation as Operations Admin).

files_changed:
  - firestore.rules (services collection get and list rules)
