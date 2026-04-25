# Phase 78: Allow Creating Projects Without a Client - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-25
**Phase:** 78-allow-creating-projects-without-a-client-defer-project-code-issuance-until-client-is-assigned
**Areas discussed:** Procurement gating, Identifier + backfill, Code-issuance trigger, List/dropdown display, Client reassignment

---

## Gray Areas Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Procurement gating | Can MRFs / PRs / POs / RFPs be created against a clientless (no-code) project? | ✓ |
| Code-issuance trigger | Auto on client assignment vs explicit button vs auto with confirmation modal | ✓ |
| Identifier + display while clientless | Doc ID vs PENDING-{n} vs project_name; URL routing fallback | ✓ |
| Client reassignment after code | Lock after issuance vs always editable vs short window | ✓ |

**User's choice:** All four areas

---

## Procurement Gating

| Option | Description | Selected |
|--------|-------------|----------|
| Block until client + code (Recommended) | Clientless projects exist but cannot back any procurement; excluded from MRF dropdown | |
| Allow procurement, code is purely cosmetic | All procurement allowed; major denormalization changes; backfill problem | ✓ |
| Allow MRFs only, block POs | Hybrid — MRFs flow but POs blocked until code | |

**User's choice:** Allow procurement
**Notes:** "MRFs for projects without client will only most likely include transportation requests for the transportation to the place, so I think we shall allow procurement." → Drives the TR-for-site-visit use case as the primary procurement path on clientless projects.

| Option | Description | Selected |
|--------|-------------|----------|
| Full editing allowed (Recommended) | All project fields editable on clientless projects; only procurement-code logic gated | ✓ |
| Limit to status + minimal fields | Restrict personnel / budget / contract cost until client assigned | |

**User's choice:** Full editing allowed (Recommended)

---

## Identifier + Backfill

| Option | Description | Selected |
|--------|-------------|----------|
| Firestore project doc ID (Recommended) | Doc ID is the stable backbone; project_code denormalized when available; URL routing falls back to doc ID | ✓ |
| Placeholder code 'PENDING-{n}' | Generate a temp code, replace at issuance — requires migration of every denormalized field | |
| Project name as soft key | Use project_name as linkage — risk of orphaning records if renamed | |

**User's choice:** Firestore project doc ID (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Backfill project_code on all child records (Recommended) | One-pass batched update writes new project_code/client_code onto every linked MRF/PR/PO/TR/RFP at issuance | ✓ |
| Leave child records untouched | Add fallback display logic everywhere project_code is read | |
| Backfill only forward-looking (no historical) | Future records get the code; pre-issuance ones stay with temp identifier | |

**User's choice:** Backfill project_code on all child records (Recommended)

---

## Code-Issuance Trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Automatic on client assignment (Recommended) | Save commits → generateProjectCode runs → child records backfilled. No extra button. | |
| Explicit 'Issue Code' button | User picks client + saves; project_code stays empty until they click 'Issue Code' | |
| Automatic, with a confirmation modal first | Modal shows the about-to-be-generated code and the count of records affected; user confirms | ✓ |

**User's choice:** Automatic, with a confirmation modal first
**Notes:** Friction is intentional at this single irreversible moment — modal must clearly show new code + count of records affected by backfill.

---

## List / Dropdown Display

| Option | Description | Selected |
|--------|-------------|----------|
| List shows them; MRF dropdown shows them with 'No code' label (Recommended) | Em-dash in Code column; MRF dropdown labels clientless projects "(No code yet)" so TRs can be filed | ✓ |
| List shows them; MRF dropdown hides them | Conflicts with TR-for-site-visit need | |
| Hide them from list filter by default | Default view shows only coded projects; toggle to reveal clientless | |

**User's choice:** List shows them; MRF dropdown shows them with 'No code' label (Recommended)

---

## Client Reassignment After Code

| Option | Description | Selected |
|--------|-------------|----------|
| Lock after issuance — same as today (Recommended) | Once code generated, client_id/client_code/project_code lock back into saveField rejection list | ✓ |
| Keep client editable forever | Each client change regenerates code + re-runs backfill — significant complexity | |
| Editable for a short window, then lock | Time-based rule — hard to communicate | |

**User's choice:** Lock after issuance — same as today (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — small 'No Code' chip on the project name (Recommended) | Subtle gray chip on project name in list / detail / dropdown | |
| No marker — em-dash in the Code column is enough | Clean, but easier to miss outside the Projects list | ✓ |

**User's choice:** No marker — em-dash in the Code column is enough

---

## Claude's Discretion

- Exact copy of confirmation modal (heading, body, button labels)
- Whether the "(No code yet)" label appears beyond the MRF dropdown
- Em-dash character vs `--` vs empty cell
- Backfill batch organization (per-collection writeBatch vs combined)
- Edit-history `field` naming for the issuance event

---

## Deferred Ideas

- Lead-stage pipeline UI (separate Leads tab) — own phase
- Client reassignment with re-backfill — explicitly rejected
- Manual code override before issuance — not raised
- Visual badge for clientless projects — explicitly rejected
- Phase 68.1 subcon cost fix — unchanged, separate phase
