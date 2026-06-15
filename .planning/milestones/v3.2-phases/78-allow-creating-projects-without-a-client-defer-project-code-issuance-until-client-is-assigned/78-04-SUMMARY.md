---
plan: 78-04
phase: 78-allow-creating-projects-without-a-client-defer-project-code-issuance-until-client-is-assigned
status: complete
completed: 2026-04-27T05:59:31Z
tasks_completed: 3
tasks_total: 3
---

# Plan 78-04 Summary — Manual UAT + Pre-flight Index Check

## What was done

Task 0 (auto): Verified Firestore index coverage for `project_id` queries on all 5 target collections.
Task 1 (auto): Deployed updated `firestore.rules` (with Phase 78 D-01 and D-12 markers) to production Firebase (`clmc-procurement-dev`).
Task 2 (checkpoint): Manual 13-step UAT by tester on production Firebase — approved.

Note: A bug was caught and fixed during UAT setup — `<select id="projectClient">` still had the HTML `required` attribute, causing browser-level form blocking before the JS handler ran. Fixed by removing `required` and updating label to indicate optional. Commit: `74d0b8d`.

---

## Firestore Index Coverage Check (REVIEWS.md HIGH concern)

- `firestore.indexes.json` exists: **yes**
- `project_id` fieldOverride entries on mrfs/prs/pos/transport_requests/rfps: **0 (none)**
- Auto-indexing in effect for `project_id` queries: **yes**
- File modified: **no**

Outcome: All 5 `where('project_id', '==', projectId)` queries in `runCodeIssuance` will succeed at runtime. No blocking exemption found. REVIEWS.md HIGH concern closed.

---

## 13-Step UAT Results

| Step | Description | Result |
|------|-------------|--------|
| 1 | Add Project with no client → toast includes "(no code yet)" | ✓ Pass |
| 2 | Firestore doc has `client_id: null`, `client_code: null`, `project_code: null`, `active: true` | ✓ Pass |
| 3 | Projects list shows em-dash in Code and Client columns | ✓ Pass |
| 4 | Clicking clientless row routes to `#/projects/detail/{doc_id}` | ✓ Pass |
| 5 | Procurement Create MRF dropdown shows `Phase78 UAT Test (No code yet)` | ✓ Pass |
| 6 | MRF submitted against clientless project succeeds | ✓ Pass |
| 7 | MRF Firestore doc has `project_id`, `project_code: ""`, `project_name` | ✓ Pass |
| 8 | Project detail shows editable client picker with "Assign & Issue Code" button | ✓ Pass |
| 9a | Confirmation modal shows code preview + per-collection counts | ✓ Pass |
| 9b | DevTools Console — no `failed-precondition` / index errors | ✓ Pass |
| 10 | "Confirm & Issue" → toast with code, URL redirects to canonical code URL | ✓ Pass |
| 11 | Firestore: `is_issued: true`, children backfilled, edit history entry present | ✓ Pass |
| 12 | `window.saveField('client_id', 'something-else')` → `[ProjectDetail] Attempted to edit locked field: client_id` | ✓ Pass |
| 13 | Direct `updateDoc` bypass → `permission-denied: Missing or insufficient permissions` | ✓ Pass |

**Overall: 13/13 PASS — approved**

## Tester
pengr3 — 2026-04-27

## Self-Check: PASSED
