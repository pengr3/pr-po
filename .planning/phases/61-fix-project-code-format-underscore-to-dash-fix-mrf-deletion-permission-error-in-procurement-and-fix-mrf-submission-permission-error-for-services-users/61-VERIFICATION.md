---
phase: 61-fix-project-code-format-underscore-to-dash-fix-mrf-deletion-permission-error-in-procurement-and-fix-mrf-submission-permission-error-for-services-users
verified: 2026-03-09T06:10:00Z
status: passed
score: 4/4 must-haves verified
re_verification: false
---

# Phase 61: Fix Project Code Format, MRF Deletion Permission, MRF Submission Permission — Verification Report

**Phase Goal:** Fix three bugs: (1) project/service code format should use dashes not underscores, (2) procurement role can delete MRFs, (3) services_user can submit MRFs without permission errors.
**Verified:** 2026-03-09T06:10:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | New project codes generate as CLMC-CLIENT-YYYYnnn (dash separators, not underscore) | VERIFIED | `generateProjectCode()` in `app/utils.js` uses `CLMC-${clientCode}-${currentYear}...` for rangeMin, rangeMax, codeRegex, and return value. Zero `CLMC_` occurrences remain. |
| 2 | New service codes generate as CLMC-CLIENT-YYYYnnn (dash separators, not underscore) | VERIFIED | `generateServiceCode()` in `app/utils.js` uses identical dash pattern. Same four change points: rangeMin, rangeMax, codeRegex, return value. |
| 3 | Procurement user can delete an MRF without a Firebase permission error | VERIFIED | `firestore.rules` line 258: `allow delete: if hasRole(['super_admin', 'operations_admin', 'procurement'])`. Line 354: `allow create: if hasRole(['super_admin', 'operations_admin', 'procurement'])` on `deleted_mrfs` — both operations in `deleteMRF()` are covered. |
| 4 | Services user can submit an MRF from the MRF form without a Firebase permission error | VERIFIED | `firestore.rules` line 247: `services_user` added to unrestricted `hasRole(...)` branch of the mrfs list rule. The per-doc scoped branch (`isAssignedToService`) is no longer applied to `services_user`, unblocking the unscoped `getDocs(collection(db, 'mrfs'))` call in `generateMRFId()`. |

**Score:** 4/4 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/utils.js` | generateProjectCode and generateServiceCode using CLMC- format | VERIFIED | 12 occurrences of `CLMC-` confirmed; 0 occurrences of `CLMC_`. Both functions updated at rangeMin, rangeMax, codeRegex, and return value. JSDoc examples also updated. Commit `3733e3d`. |
| `firestore.rules` | mrfs delete and deleted_mrfs create rules include procurement; mrfs list includes services_user unrestricted | VERIFIED | mrfs delete rule (line 258) includes procurement. deleted_mrfs create rule (line 354) includes procurement. mrfs list rule (line 247) includes services_user in unrestricted hasRole() branch with explanatory comment. Commit `3c90be3`. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `app/utils.js generateProjectCode/generateServiceCode` | Firestore projects/services collections | Range query on project_code/service_code using `>= rangeMin` and `<= rangeMax` | WIRED | Range bounds at lines 216-217 and 292-293 use `CLMC-${clientCode}-${currentYear}000/999`. `where('project_code', '>=', rangeMin)` and `'<='` confirmed at lines 224-225 and 300-301. |
| `firestore.rules mrfs delete` | procurement role | `hasRole(['super_admin', 'operations_admin', 'procurement'])` | WIRED | Confirmed at line 258. Comment on line 257 also updated to reflect three roles. |
| `firestore.rules mrfs list` | services_user (unrestricted) | `hasRole([..., 'services_user', ...])` without per-doc isAssignedToService restriction | WIRED | Confirmed at line 247. services_user is inside the `hasRole([...])` branch; the scoped `isAssignedToService` branch is restricted to `operations_user` only. Explanatory comment at lines 241-245 explains the rationale. |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CODE-FMT-01 | 61-01-PLAN.md | Project/service code format: dash separators (CLMC-CLIENT-YYYYnnn) | SATISFIED | Both functions in utils.js confirmed using dash format |
| PERM-DEL-01 | 61-01-PLAN.md | Procurement role can delete MRFs | SATISFIED | mrfs delete + deleted_mrfs create rules both include procurement |
| PERM-SUB-01 | 61-01-PLAN.md | services_user can submit MRFs without permission error | SATISFIED | mrfs list rule now includes services_user in unrestricted branch |

**Note on requirement IDs:** CODE-FMT-01, PERM-DEL-01, and PERM-SUB-01 are defined in the phase PLAN frontmatter but do not appear in `.planning/REQUIREMENTS.md`. REQUIREMENTS.md covers the v3.1 milestone requirements (PRTR-01 through PRTR-04) and does not register these phase-internal bug-fix IDs. This is expected — the REQUIREMENTS.md scope is milestone-level, not exhaustive of every bugfix. No orphaned requirements were found.

---

### Anti-Patterns Found

None. Scanned `app/utils.js` and `firestore.rules` for TODO, FIXME, HACK, placeholder, empty implementations. No anti-patterns detected.

---

### Human Verification Required

The following items require manual testing after `firebase deploy --only firestore:rules` is run in production:

**1. Procurement MRF Deletion**

**Test:** Log in as a procurement-role user. Navigate to Procurement tab. Select any MRF and click Delete MRF, then confirm the deletion.
**Expected:** MRF is removed from the list without any `FirebaseError: Missing or insufficient permissions` in the browser console.
**Why human:** Firebase Security Rules only take effect after deployment. Code-level verification confirms the rule text is correct, but the deployed rules are what Firestore actually enforces.

**2. Services User MRF Submission**

**Test:** Log in as a services_user. Navigate to the MRF Form tab. Fill out the form selecting an assigned service. Submit the form.
**Expected:** MRF is created successfully without any `FirebaseError: Missing or insufficient permissions` in the browser console.
**Why human:** Same Firebase deployment dependency. Also verifies that `generateMRFId()` unscoped `getDocs` call completes without error, which requires the live rules.

**3. Operations Admin Project Code Format**

**Test:** Log in as operations_admin or super_admin. Create a new project. Inspect the generated project_code value in Firestore or the UI.
**Expected:** Code is formatted as `CLMC-CLIENTCODE-2026001` (dashes) not `CLMC_CLIENTCODE_2026001` (underscores).
**Why human:** Code generation runs against the live Firestore database and depends on the current year and existing document sequence numbers.

---

### Gaps Summary

No gaps. All four observable truths are verified. All artifacts are substantive and correctly wired. Both commits (`3733e3d`, `3c90be3`) exist in git history and affect the correct files.

The only outstanding item is the Firebase Security Rules deployment (`firebase deploy --only firestore:rules`), which is an operational step outside the scope of code verification. The SUMMARY documents this requirement explicitly.

---

_Verified: 2026-03-09T06:10:00Z_
_Verifier: Claude (gsd-verifier)_
