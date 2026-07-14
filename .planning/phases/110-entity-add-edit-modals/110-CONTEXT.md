# Phase 110: Entity Add/Edit Modals - Context

**Gathered:** 2026-07-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Convert **Add** and **list-Edit** for **Client, Project, and Service** from the inline `.add-form` toggle to proper modals. Detail-page inline auto-save (`project-detail.js`, `service-detail.js`) is explicitly **OUT of scope — unchanged** (MODAL-07).

**Scope clarification — intentional reinterpretation of MODAL-03/05 (not scope creep):**
The roadmap goal reads "wrap the inline add-form in a modal." During discussion the user chose to **consolidate** project/service creation instead: "Add Project" / "Add Service" reuse the **existing "New Engagement" modal** rather than wrapping the inline form (see D-04). This removes the redundant second create path. It still satisfies "Add opens a modal" — it just reuses the engagement modal the app already has. This deviation is deliberate and approved; downstream agents should treat D-04/D-05 as the source of truth over the literal ROADMAP wording.
</domain>

<decisions>
## Implementation Decisions

### Modal Foundation
- **D-01:** Build the entity modals on the **`proposal-modal.js` convention** — a dedicated module using `.modal` + inline `style="display:flex"` with a `create | edit` mode flag, on the shared `.modal` / `.modal-content` / `.modal-header` CSS in `styles/components.css`. Do **NOT** use the thin `components.js` `createModal()` / `openModal()` helper (the `.active`-toggle path): it's used in only one place (`proof-modal.js`) and lacks create/edit plumbing. `proposal-modal.js` already solves the exact "one modal, add + pre-filled edit" problem.
  - MODAL-07's "reuse the shared `components.js` pattern" is satisfied via the shared `.modal` CSS class contract; the **JS** convention follows the dominant `proposal-modal.js` style.

### Validation
- **D-02:** Keep the **existing toast-based validation** (`showToast` on submit) — the exact checks already in `addClient`/`addProject`/`addService`/`saveEdit` (required fields, duplicate-code, phone-or-email, valid email). **No inline field-level error UI** (a new pattern, not used elsewhere yet).

### Dismiss / Close Behavior
- **D-03:** **Free close** — backdrop-click, ✕, and **Esc** all close immediately. Esc-to-close is a NEW behavior added per MODAL-07 (Esc handling is per-view today, not centralized). **No confirm-if-dirty guard.** Successful save auto-closes the modal + shows the success toast (current behavior preserved).

### Project/Service Add — Consolidation
- **D-04:** "Add Project" / "Add Service" **open the existing New Engagement modal** (`renderEngagementForm` / `initEngagementForm`, currently launched by `home.js` `window.ccOpenNewProposal`) — **NOT** a wrapper around the inline `#addProjectForm` / `#addServiceForm`. The inline add-forms and their toggle window functions are **removed**.
  - **Accepted consequences:** new projects/services start as **Draft** (proposal lifecycle), with **no status picker** and **no tranche editor** at creation (status + tranches are set afterward via the detail page or the edit modal). Personnel remains **required** (New Engagement's existing rule).
  - **Type radios: pre-selected AND locked to the launching list's context** — "Add Project" opens with `type=project` and the type control hidden/disabled; "Add Service" → `type=service` locked. (Primarily affects `super_admin`, who otherwise sees both types; the other two engagement roles are already single-type.)
- **D-05 — Add gating:** Gate the "Add Project/Service" buttons to the **engagement roles** (`super_admin`, `operations_admin`, `services_admin` — `home.js` `getHomeSubTabConfig().canEngagements`, line ~63), because the New Engagement modal only renders a usable, role-scoped type form for those roles.
  - **Behavior change (accepted):** any non-admin role currently granted `canEditTab('projects'/'services')` **loses list-Add**, but **keeps detail-page editing**. No modal role-scoping rework in this phase.

### Project/Service Edit
- **D-06:** list-Edit for Project/Service opens a **new dedicated, pre-filled edit modal** (New Engagement is create-only, so it cannot serve edit). Fields mirror the current edit path: client, name, location, **status**, budget, contract cost, **collection tranches**, personnel — pre-filled from the record; writes via `updateDoc` (not `createEngagement`). This replaces the current mechanism where `editProject` / `editService` reuse the inline add-form (flip title + submit handler).

### Client Add/Edit
- **D-07:** Client gets its **own dedicated Add + Edit modal** (single modal, `create | edit` mode, pre-filled for edit) — replaces **BOTH** the inline `#addClientForm` **and** the current **inline-row edit** (row → `<input>`s with Save/Cancel). Consolidation does **not** apply to Client (a client is not an engagement). Fields unchanged: Client Code, Company Name, Contact Person, Phone, Email; validation unchanged (code/company/contact required, at least one of phone/email, valid email format).

### Unchanged (hard constraint)
- Detail-page inline auto-save in `project-detail.js` and `service-detail.js` stays **exactly** as-is (MODAL-07). This phase must not touch those editing paths.

### Claude's Discretion
- Module layout (one shared entity-modal module vs. per-entity modules), where the extracted "open New Engagement" helper lives so both `home.js` and the lists can call it, and internal naming — planner/researcher decide.
- Whether the Project/Service edit modal is its own module or extends an existing one — planner decides, but it **must not destabilize `engagement-create.js`** (which `home.js` `+ New Engagement` depends on).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap / Requirements
- `.planning/ROADMAP.md` § "Phase 110: Entity Add/Edit Modals" — goal, success criteria, dependency note (MODAL-* must land before MOBILE-07 in Phase 111).
- `.planning/REQUIREMENTS.md` MODAL-01…MODAL-07 — the 7 requirements this phase delivers.

### Shared modal pattern + CSS
- `app/proposal-modal.js` — **the chosen analog** (D-01): dedicated modal module with `createModalMode = 'create' | 'edit'`, `openEditProposalModal` pre-fill, `.modal` + `display:flex` convention. Model the entity modals on this.
- `app/components.js` § "MODAL COMPONENT" (`createModal` / `openModal` / `closeModal`) — defines the `.modal` class contract + `closeModal` semantics. NOT the chosen JS convention, but `closeModal` may still be reused.
- `styles/components.css` § `.modal` / `.modal.active` / `.modal-content` / `.modal-header` / `.modal-close` (~line 764+) and § `.add-form` (~line 497 — the pattern being retired; leave the CSS, it may still be referenced).

### Consolidation target (Project/Service Add)
- `app/engagement-create.js` — `createEngagement()` (shared create primitive, writes the full project/service doc), `renderEngagementForm(role)` / `initEngagementForm()` / `destroyEngagementForm()` (New Engagement form UI + lifecycle + role-scoped type options), `submitNewEngagement()` (Draft-only create, personnel required).
- `app/views/home.js` § `window.ccOpenNewProposal` / `ccCloseNewProposal` (~line 1285) — the existing window-style modal wrapper for the engagement form; `getHomeSubTabConfig().canEngagements` (~line 63) — the 3-role gate reused by D-05.

### Current inline forms being converted / removed
- `app/views/clients.js` — `#addClientForm` (add), `editClient` / `saveEdit` / `cancelEdit` (inline-row edit), `addClient`, `toggleAddClientForm`, validation. 5 fields.
- `app/views/projects.js` — `#addProjectForm` (add+edit reuse), `editProject` (~1228), `addProject`, `saveEdit`, `toggleAddProjectForm`, `renderTrancheBuilder`, personnel pills (`renderPills` / `selectedPersonnel`), `UNIFIED_STATUS_OPTIONS`.
- `app/views/services.js` — `#addServiceForm` (add+edit reuse), `editService`, `addService`, `saveEdit`, `toggleAddServiceForm` — mirror of projects.
- `app/permissions.js` § `canEditTab(tabId)` (line 54) — the OLD Add gating (role-template-driven); being swapped for `canEngagements` on the Add buttons (D-05).

### Established conventions
- `CLAUDE.md` § "UI Design System" (Modals: window-style, blur backdrop, centered), § "Window Functions for Event Handlers", § "View Module Structure (render/init/destroy + cleanup)".
- `Skill("spike-findings-pr-po")` — project patterns / landmines (auto-loads during implementation).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`app/proposal-modal.js`** — closest analog for a `create | edit` modal with pre-fill; copy its structure (mode flag, open/close, `escapeHTML` on all user strings, `.modal` + `display:flex`, backdrop-click + ✕ close).
- **`app/engagement-create.js`** — reused wholesale for Project/Service **Add** (the modal already exists via `home.js`). Only new work: expose its open-logic to the lists + support the locked type.
- **`renderTrancheBuilder()`** (tranche editor) + personnel-pill helpers — reused by the Project/Service **edit** modal (D-06).
- **`showToast` / `showLoading`** — validation + progress feedback (keep, per D-02).
- **`escapeHTML` (`utils.js`)** — MUST wrap all user strings in modal HTML (established XSS pattern; every existing modal does this).

### Established Patterns
- Window functions for `onclick` + `destroy()` cleanup (delete window fns, unsubscribe listeners) — the entity modals + their init/destroy must follow this (see any view's render/init/destroy).
- `.modal` + `display:flex` + backdrop-click-to-close + `.modal-close` ✕ is the **dominant** real modal pattern (`proposal-modal.js`, `finance.js`, `procurement.js`, `home.js`). Blur backdrop already lives in `.modal` CSS.
- Two project/service creation paths currently both call `createEngagement()`; this phase removes the inline one, leaving New Engagement as the single create path.

### Integration Points
- The extracted "open New Engagement" function must be callable from `projects.js` and `services.js` (today only `home.js` calls it). It must accept a **locked type** and preserve the form's role-scoping/lifecycle (`initEngagementForm` / `destroyEngagementForm`).
- Removing `#addProjectForm` / `#addServiceForm` + the `toggle*` / `editProject` / `editService` window fns: **check for other callers first** (e.g., `home.js` feed deep-links dispatch via `dl.handler` — verify none reference these entity add/edit fns).
- Permission gate swap: Add buttons move from `canEditTab` → `canEngagements` (D-05) — verify no other UI/state assumes the old gate.
</code_context>

<specifics>
## Specific Ideas

- Model the Project/Service **edit** modal and the **Client** Add/Edit modal directly on `app/proposal-modal.js`'s create/edit structure.
- Type control on the consolidated Add is **hidden/disabled** (not merely pre-selected) when launched from a type-specific list.
- The consolidated Add deliberately accepts a lighter create (Draft, no status/tranches) — those are filled in immediately after via the edit modal / detail page. Downstream agents should not "helpfully" re-add status/tranche fields to the New Engagement form.
</specifics>

<deferred>
## Deferred Ideas

- **Inline field-level validation errors** (red text under fields) — considered for the modals, deferred in favor of existing toast-based validation (D-02). Possible future polish pass.
- **Confirm-if-dirty guard** on modal close — considered for the rich Project/Service edit form, deferred (D-03 chose free close). Revisit if users report lost input.
- **Full unification of New Engagement into one add+edit modal** (extend `engagement-create.js` with an edit mode + status/tranche fields) — considered as the consolidation shape, deferred in favor of a separate edit modal (keeps the shared engagement module stable).
- **Permission-model rework** so non-engagement roles with tab-edit can Add via a role-scoped modal — out of scope; D-05 accepts the behavior change (those roles retain detail-page editing).

None of these are blockers.
</deferred>

---

*Phase: 110-entity-add-edit-modals*
*Context gathered: 2026-07-14*
