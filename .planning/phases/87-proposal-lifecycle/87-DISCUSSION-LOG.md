# Phase 87 Discussion Log

**Date:** 2026-05-11
**Mode:** /gsd-discuss-phase 87 (default mode, multi-select gray-area selection)

## Areas Discussed

User selected (multi-select): Phase 87/88 sequencing, Document versioning storage layout, Audit trail + client comms log shape, Approver designation model.

### 1. Phase 87 ↔ Phase 88 sequencing

**Question:** Where does the proposal dashboard live, given PROP-10 says "inside the Management Tab" (built in Phase 88)?

**Options:**
- Do Phase 88 first, then 87 (Recommended)
- Phase 87 ships a minimal Mgmt Tab shell
- Phase 87 ships under #/proposals temporarily

**Selection:** Do Phase 88 first, then 87. Cleanest, no rework. Captured as D-01.

### 2. Document versioning — scope correction

**Question (initial):** How are old versions kept in Firebase Storage? (Per-version path, single-current path, per-version + auto-archive.)

**User correction:** "my bad why are there document versioning i will not be inhousing proposal creation and storing, i will just attach links or files for review and thats it thats the proposal approval"

**Resolution:** PROP-06 (auto-incrementing versions, version retrieval) is **out of scope**. Captured as deferred. The follow-up question confirmed the simplified attachment model.

**Confirmation question:** Proposal attachment shape?

**Options:**
- Link OR single file, replaceable (Recommended)
- Link OR file + replacement audit (no version retrieval)
- Link only — no Firebase Storage at all

**Selection:** Link OR single file, replaceable. Audit log records every replacement (D-03 + D-04). Captured as D-03.

**Memory artifact:** `project_clmc_not_authoring_platform.md` recorded for future phases — CLMC tracks/approves external work; never design in-app authoring.

### 3. Audit trail + client comms log shape

**Question:** Subcollection or embedded array?

**Options:**
- Embedded arrays on the proposal doc (Recommended)
- Separate subcollections
- Embedded audit + subcollection comms (hybrid)

**Selection:** Embedded arrays. Mirrors Phase 85 Pattern 21 (denormalized doc shape). One read, simple Security Rules. Captured as D-04.

### 4. Approver designation model

**Question:** Who can approve a proposal?

**Options:**
- Role-based: any active Operations Admin or Super Admin (Recommended)
- Project-attached: specific approvers chosen per project
- Hybrid

**Selection:** Role-based only. Matches PROP-11 wording. Captured as D-05.

### 5. Loss reason capture

**Question:** When a proposal is marked Loss, capture why?

**Options:**
- Free-text reason field (Recommended)
- Dropdown of preset reasons
- No reason — just mark as Loss

**Selection:** Free-text required field; mirrored into audit_log comment. Captured as D-06.

### 6. Comms log entry attachment

**Question:** PROP-08 "optional attachment" — same model as proposal attachment?

**Options:**
- Link OR single file per entry (Recommended)
- Link only on comms entries
- Drop — comms entries are just text

**Selection:** Link OR single file per entry. Same shape as the proposal main attachment for consistency. Captured as D-07.

## Deferred Ideas

- Document version history (PROP-06 reframed) — CLMC is not an authoring platform.
- Loss reason taxonomy + analytics dashboard (v4.1+).
- Project-attached approvers (override role-based default).
- Email + browser-push notifications (already globally deferred from Phase 83).
- Cloud Functions / server-side enforcement (no server tier in this codebase).
- Multi-attachment per proposal.
- Migration to subcollections if a proposal exceeds 1 MiB.
- Sent-to-client email integration.
- Concurrent-edit conflict handling beyond last-write-wins.

## Claude's Discretion (no user decision needed)

- Per-stage dashboard layout (cards vs rows).
- Audit-log timeline visualization.
- Comms-log display order.
- `'For Mobilization'` separate auto-transition or manual.
- Storage Security Rules pattern (custom claims vs Firestore lookup).
- Loss-reason input width / placement.
- State-transition toast copy.

## Outcome

CONTEXT.md written to `.planning/phases/87-proposal-lifecycle/87-CONTEXT.md`. Phase 87 is **blocked on Phase 88 shipping first** per D-01. Recommended next step: `/gsd-discuss-phase 88`.
