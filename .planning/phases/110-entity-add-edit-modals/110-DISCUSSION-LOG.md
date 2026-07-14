# Phase 110: Entity Add/Edit Modals - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-14
**Phase:** 110-entity-add-edit-modals
**Areas discussed:** Modal foundation, Validation UX, Dismiss behavior, Add/Edit consolidation, Add permission gating, Type-lock, Client fields

---

## Gray-area selection

User selected all four presented areas to discuss: **Modal build pattern, Validation UX, Dismiss behavior, Add-form scope.**

---

## Modal foundation

| Option | Description | Selected |
|--------|-------------|----------|
| proposal-modal.js style | `.modal` + `display:flex` module convention with a create/edit mode flag; the dominant, battle-tested pattern; closest analog to "one modal, add + pre-filled edit". | ✓ |
| components.js createModal() | The literal `createModal` + `openModal`/`closeModal` helper (`.active` toggle). Matches roadmap wording but used in only one place; no create/edit plumbing. | |
| You decide | Claude picks during planning. | |

**User's choice:** proposal-modal.js style
**Notes:** Both use the same shared `.modal` CSS; the decision is the JS convention. MODAL-07's "reuse components.js pattern" satisfied via the shared CSS class contract.

---

## Validation UX

| Option | Description | Selected |
|--------|-------------|----------|
| Keep toast-based | Reuse existing `showToast` validation on submit — the checks already in add/save handlers. Zero new UX surface, consistent app-wide. | ✓ |
| Inline field errors | Red per-field error text under inputs. More polished, but a new pattern not used elsewhere. | |
| You decide | Claude chooses during planning. | |

**User's choice:** Keep toast-based

---

## Dismiss behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Free close, no guard | Backdrop-click, ✕, and Esc all close immediately; save auto-closes + toasts. Matches every existing modal. | ✓ |
| Confirm-if-dirty | If fields changed, backdrop/Esc close asks "Discard changes?" first. Safer for the rich Project form, but new behavior. | |
| You decide | Claude chooses during planning. | |

**User's choice:** Free close, no guard
**Notes:** Esc-to-close is required by MODAL-07 and is a new addition (Esc handling is per-view today, not centralized).

---

## Add-form scope (initial)

| Option | Description | Selected |
|--------|-------------|----------|
| Wrap as-is, keep separate | Wrap the existing full inline Add form in a modal; keep the two creation paths distinct (New Engagement = proposal-first; Add = direct record). *(Claude's recommendation.)* | |
| Consolidate into New Engagement | Point "Add Project/Service" at the existing New Engagement modal instead of wrapping the inline form. Bigger change; flagged as potential scope change. | ✓ |
| You decide | Claude chooses during planning. | |

**User's choice:** Consolidate into New Engagement
**Notes:** User chose the larger change over Claude's "wrap as-is" recommendation. Triggered a deep-dive into `engagement-create.js`, which surfaced that New Engagement is create-only, Draft-first, has no status picker / tranche editor, and requires personnel — different from the inline Add form.

---

## Consolidation shape (deep-dive)

| Option | Description | Selected |
|--------|-------------|----------|
| New Engagement + edit modal | Add opens the existing New Engagement modal as-is (Draft default, status/tranches later); Edit gets its own dedicated pre-filled modal. Least risk; removes redundant create path. | ✓ |
| Extend New Engagement to edit | Grow `engagement-create.js` into one add+edit modal with status picker + tranche editor + edit mode. Fully unified but bigger; touches the shared module home.js depends on. | |
| Wrap inline form instead | Revert to wrapping the inline Add form (status + tranches intact) for symmetric Add/Edit; keeps two create paths. | |

**User's choice:** New Engagement + edit modal
**Notes:** Accepts that new projects/services start as Draft with no status/tranche entry at creation (set later via the edit modal / detail page).

---

## Add permission gating

| Option | Description | Selected |
|--------|-------------|----------|
| Gate to engagement roles | Hide "Add Project/Service" outside super_admin/operations_admin/services_admin — matches the modal (which only renders a role-scoped type form for those roles). Non-admin tab-editors lose list-Add, keep detail-page editing. | ✓ |
| Flag as research gap | Have the researcher map live role-template grants vs the 3 engagement roles and recommend at planning. | |
| You decide | Claude picks the default, documents for research. | |

**User's choice:** Gate to engagement roles
**Notes:** Concrete finding — New Engagement CTA gated to a fixed 3-role list (`home.js:63`); inline Add gated by `canEditTab` (role-template-driven). Accepted behavior change.

---

## Type-lock behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-select + lock to context | "Add Project" opens with Project selected and the type control hidden/disabled; "Add Service" locked to Service. | ✓ |
| Pre-select, keep switchable | Preselect the type but let the user switch (e.g. super_admin flips Project→Service). | |
| You decide | Claude chooses the default. | |

**User's choice:** Pre-select + lock to context
**Notes:** Mainly affects super_admin (sees both types); the other two engagement roles are already single-type.

---

## Client fields

| Option | Description | Selected |
|--------|-------------|----------|
| Keep current 5 fields | Straight port of Client Code / Company / Contact / Phone / Email + existing validation into one modal, pre-filled for edit. | ✓ |
| Revisit fields | Add/remove/reorder something. | |
| You decide | Keep current unless something obvious comes up. | |

**User's choice:** Keep current 5 fields
**Notes:** Client is not an engagement, so consolidation does not apply — Client gets its own dedicated Add+Edit modal, replacing both the inline add-form and the inline-row edit.

---

## Claude's Discretion

- Module layout (shared entity-modal module vs. per-entity), location of the extracted "open New Engagement" helper, internal naming.
- Whether the Project/Service edit modal is a new module or extends an existing one (must not destabilize `engagement-create.js`).

## Deferred Ideas

- Inline field-level validation errors (deferred in favor of toast-based, D-02).
- Confirm-if-dirty close guard (deferred in favor of free close, D-03).
- Full unification of New Engagement into one add+edit modal (deferred in favor of a separate edit modal).
- Permission-model rework for non-engagement roles with tab-edit (out of scope; D-05 accepts the behavior change).
