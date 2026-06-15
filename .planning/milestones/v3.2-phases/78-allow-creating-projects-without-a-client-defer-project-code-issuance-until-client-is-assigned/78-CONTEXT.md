# Phase 78: Allow Creating Projects Without a Client - Context

**Gathered:** 2026-04-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Loosen the project-create constraint so a project can be saved without a client. Defer `project_code` generation (which today depends on `client_code` to produce `CLMC_CLIENT_YYYY###`) until a client is later assigned. The system must handle "no client / no code yet" projects in every place project_code is read or written: project list, project detail, MRF project dropdown, MRF/PR/PO/TR/RFP linkage, edit history, financial summary, RFP queries.

Out of scope: a separate "leads" pipeline UI, restructuring `client_code`/`project_code` formats, changing how services are coded, allowing client reassignment after a code has been issued.

</domain>

<decisions>
## Implementation Decisions

### Procurement gating (clientless projects)
- **D-01:** Procurement (MRFs / PRs / POs / TRs / RFPs) **is allowed** against clientless projects. Driving use case: Transport Requests for site visits / inspections during the lead stage, before a client is locked in.
- **D-02:** Clientless projects appear in the MRF project dropdown with a "(No code yet)" label appended after the project name so requestors can select them.
- **D-03:** Full editing of project fields (name, internal status, project status, personnel, budget, contract cost, location, active flag) is permitted on clientless projects — only the client field is the gate that triggers code issuance.

### Identifier + backfill
- **D-04:** Firestore project document ID is the stable identifier procurement records key off when no `project_code` exists yet. New procurement records on a clientless project store `project_id` (Firestore doc ID); `project_code` is denormalized as null/empty until issuance.
- **D-05:** When a client is assigned and the code is issued, the system runs a one-pass batched update across all linked MRFs / PRs / POs / TRs / RFPs (found via the stable `project_id`) writing the newly-generated `project_code` and `client_code` onto each child record. After backfill, downstream queries that key off `project_code` (RFP lookups, financial summary, exports) operate normally.
- **D-06:** URL routing for clientless projects falls back to the Firestore doc ID when `project_code` is missing — `#/projects/detail/{doc_id}` — so deep links work pre- and post-issuance. (Implementation note: `project-detail.js:118` looks up by `project_code`; needs an else-branch lookup by doc ID.)

### Code-issuance trigger
- **D-07:** Code generation is **automatic on client assignment**, but gated by a confirmation modal shown before the write commits. Modal text references the about-to-be-generated code and the count of existing procurement records that will be backfilled (e.g. "This will generate CLMC-CLIENT-2026-### and apply it to N existing records. Continue?"). User confirms or cancels.
- **D-08:** Edit history records the issuance as a single combined event capturing both `client_code` and `project_code` going from null to their new values, plus a count of child records touched by the backfill.

### List / dropdown display
- **D-09:** In the Projects list, clientless projects show an em-dash (`—`) in the Code column and the Client column. No special row styling, no badge, no chip — em-dash in Code is the sole visual cue.
- **D-10:** In the MRF project dropdown, clientless projects appear with an appended "(No code yet)" suffix on the displayed label. Sorting / grouping is unchanged from today.
- **D-11:** Existing list filters (Internal Status / Project Status / Client / Search by code or name) work as-is; clientless projects with empty client_id simply don't match the Client filter.

### Client reassignment after issuance
- **D-12:** Once a code is issued, `client_id`, `client_code`, and `project_code` lock back into the existing locked-fields list (`project-detail.js:598`) and saveField rejects edits — matching today's behavior. To correct a wrong client, user must delete the project and recreate. No second-backfill pathway.

### Claude's Discretion
- Exact copy of the confirmation modal (heading, body, button labels)
- Whether the "(No code yet)" label is on the dropdown only or also applied to project name displays elsewhere — Claude picks consistent placement during planning
- Em-dash character vs `--` vs an empty cell for the Code column display
- Whether the backfill batch is one Firestore writeBatch per collection (MRFs / PRs / POs / TRs / RFPs) or one combined batch (Firestore batch limit is 500 writes — plan accordingly)
- Edit-history `field` naming for the combined issuance event (e.g. `client_assigned`, `code_issued`, or two parallel rows)

### Folded Todos
None — todo match returned zero results.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs / ADRs exist for this phase — requirements are fully captured in decisions above. The roadmap entry (`.planning/ROADMAP.md` §"Phase 78") is the only upstream reference and contains only the high-level goal.

### Codebase references that constrain this phase
- `app/utils.js:213` — `generateProjectCode(clientCode)` — must accept null clientCode (skip / return null) until client is assigned; called by issuance flow.
- `app/views/projects.js:609` — `addProject()` — required-field guard currently rejects empty `clientId`; must be relaxed.
- `app/views/projects.js:887` — projects table render — Code / Client column rendering needs em-dash fallback.
- `app/views/project-detail.js:118` — project-by-`project_code` lookup — needs doc-ID fallback for clientless projects.
- `app/views/project-detail.js:598` — locked-fields list (`project_code`, `client_id`, `client_code`) — must conditionally allow `client_id` / `client_code` write when `project_code` is empty (one-time issuance).
- `app/views/project-detail.js:689-692` — RFP query keyed off `project_code` — handles empty code by skipping (already does); behavior preserved post-backfill.
- `app/views/mrf-form.js` — project dropdown population — must include clientless projects with "(No code yet)" label.
- MRF form save-handlers (denormalize `project_code` + `project_name`) — must store `project_id` as stable backbone; emit empty `project_code` when source project is clientless.
- `firestore.rules` — `projects` collection rules must allow create with empty `client_id` / `client_code` for `super_admin` and `operations_admin` roles (today's permission scope).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `generateProjectCode(clientCode, year)` in `app/utils.js:213` — already centralized and queries both `projects` and `services` collections for max sequence number. Trivial to defer-call once client lands.
- `recordEditHistory(projectId, action, changes)` in `app/edit-history.js` — used by every project edit; the issuance event uses the same path.
- `syncPersonnelToAssignments(projectCode, oldUserIds, newUserIds)` in `app/utils.js` — fire-and-forget assignment sync; for clientless projects, called with empty/null projectCode (must early-return safely — already does at line 644).
- Confirmation modal pattern — `confirm()` dialogs already used throughout (`projects.js:1122`, `1147`); a richer overlay modal exists in `proof-modal.js` for the "showing N records" body text. Either is acceptable.
- Firestore `writeBatch` — already imported in several view files for batched updates.

### Established Patterns
- `project_code` denormalized on every child record (MRF, PR, PO, TR, RFP) to avoid joins — must continue post-backfill.
- Locked-field guard via array check at top of `saveField` — extension point for the conditional-unlock rule.
- Status badges on rows use `.status-badge` (`approved` / `rejected`) — no new badge class needed for em-dash display.
- Firestore doc ID as stable identifier is already used in some lookups (`projects.js:909`, `project-detail.js:118`'s document lookup); promotes naturally to procurement linkage.

### Integration Points
- Project create form (`projects.js`) — relax client requirement, persist project doc with `client_id: null`.
- Project detail (`project-detail.js`) — render conditional client-select control when `client_code` is empty; on save, run confirmation modal → `generateProjectCode` → batched backfill across child collections → write project doc.
- MRF form project dropdown (`mrf-form.js`) — include clientless projects with appended "(No code yet)" label.
- MRF/PR/PO/TR/RFP save handlers — store `project_id` (Firestore project doc ID) on every new procurement record (probably already happening for some — verify during planning).
- Firestore Security Rules — relax `projects` create to allow null `client_id`.

</code_context>

<specifics>
## Specific Ideas

- "MRFs for projects without a client will only most likely include transportation requests for the transportation to the place" — confirms TR-for-site-visit as the primary use case; planning should treat TR support as the priority procurement path even though all paths are technically allowed.
- The confirmation modal at code-issuance time is the user's chosen friction point — it's the single moment users see the irreversible action, so the message should clearly state both the new code and the count of records about to be backfilled.

</specifics>

<deferred>
## Deferred Ideas

- Lead-stage pipeline UI (separate "Leads" tab, kanban, qualification scoring) — out of scope; this phase only loosens the existing Projects flow.
- Allowing client reassignment after code issuance with backfill-on-change — explicitly rejected (D-12). Could be a future phase if real-world friction emerges.
- Editable code (manual override of CLMC-CLIENT-YYYY### before issuance) — not raised; assumed locked to `generateProjectCode` formula.
- Visual badge / chip marking clientless projects in the list / detail header — explicitly rejected in favor of em-dash-only.
- Phase 68.1 subcon cost fix — separate phase, untouched.

### Reviewed Todos (not folded)
None — todo cross-reference returned zero matches.

</deferred>

---

*Phase: 78-allow-creating-projects-without-a-client-defer-project-code-issuance-until-client-is-assigned*
*Context gathered: 2026-04-25*
