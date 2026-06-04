# Phase 99: Billing Request Flow — Context

**Gathered:** 2026-06-04
**Status:** Ready for planning
**Source:** spike-024 (VALIDATED) + plan-phase scope decisions 2026-06-04

<domain>
## Phase Boundary

Let a **project-assigned user** (`operations_user`, who lacks `hasCollectibleWriteAuthority()`)
submit a **billing request** with supporting document links from the Project Detail page.
Finance sees pending requests inline in the Collectibles tab and either:
- **Approve** → pre-fills the existing Create-Collectible modal (Finance still sets due date + submits), OR
- **Reject** → with a required reason, surfaced back to the submitter.

This keeps Finance in control of actual billing (collectible creation) while removing the manual
hand-off. The project user never gains collectible write authority — `billing_requests` is their surface.

**What this phase delivers:**
1. New `billing_requests` Firestore collection + Security Rules (rules ship BEFORE/with first JS write).
2. Project Detail: an "↑ Initiate Billing →" **footer link** at the bottom of the Collectibles
   group in the Financial Summary card → opens a billing-request modal.
3. Billing-request modal: tranche picker → billing-type pills (auto-hinted, overrideable) →
   document-link field(s) (count varies by type) → optional notes → Submit.
4. Project Detail: a compact status list of the project's own billing requests
   (pending / approved / rejected + reason) so the submitter sees outcomes.
5. Finance > Collectibles tab: a collapsible blue **"Pending Billing Requests"** banner ABOVE the
   Collectibles table — auto-appears when requests are pending, collapses/disappears when empty.
6. Banner rows: project, tranche, amount, doc links, submitter name + date, Approve / Reject buttons.
7. Approve → `openCreateCollectibleModal('projects:CODE:TRANCHE_INDEX')` (preselectKey extended to
   encode tranche_index) + mark request approved on both sides.
8. Reject → required reason → mark request rejected on both sides.
9. Notification fan-out: submit → Finance role; approve/reject → submitter. Fire-and-forget (try/catch).

**Out of scope (deferred — see Deferred Ideas):**
- Per-tranche Billed/Unbilled/Pending status ROWS in project detail (spike prototyped, deferred this phase).
- Firebase Storage file uploads (URL/link only — avoids Blaze plan).

</domain>

<decisions>
## Implementation Decisions

### Scope (plan-phase decision 2026-06-04)
- **D-01 [LOCKED]** Project Detail surface = **Option C, footer link only** ("↑ Initiate Billing →").
  Per-tranche status rows are DEFERRED. Zero card expansion, minimal footprint.
- **D-02 [LOCKED]** UI contract = the spike-024 prototypes (`index.html`, `finance-queue.html`) ARE the
  validated visual reference. No separate UI-SPEC. Match their look/interactions.
- **D-03 [LOCKED]** Research = skip formal RESEARCH.md; pattern-mapper maps new code to existing analogs.

### New collection: `billing_requests`
- **D-04 [LOCKED]** Firestore schema (frozen/denormalized fields at submission):
  ```
  billing_requests/{id}:
    project_code: string          // e.g. 'CLMC-ACME-001'
    project_name: string
    tranche_index: number         // position in collection_tranches[]
    tranche_label: string         // frozen at submission
    tranche_percentage: number    // frozen at submission
    amount_requested: number      // contract_cost * percentage / 100 (computed at submit)
    billing_type: 'progress' | 'completion' | 'other'
    documents: [{ key, label, url }]   // count per billing_type
    notes: string                 // optional
    status: 'pending' | 'approved' | 'rejected'
    requested_by_uid: string
    requested_by_name: string
    requested_at: Timestamp        // serverTimestamp
    reviewed_by: string            // set on approve/reject
    reviewed_at: Timestamp         // set on approve/reject
    rejection_reason: string       // set on reject only
  ```
- **D-05 [LOCKED]** Status strings are case-sensitive exact: `'pending'` / `'approved'` / `'rejected'`
  (lowercase, matching the spike schema — distinct from the Title-Case collectible statuses).
- **D-06 [LOCKED]** `amount_requested` computed at submit as `(tranche_percentage/100) * contract_cost`,
  mirroring `submitCollectible()` math (finance.js:1838-1839). Denormalized + frozen.

### Billing type + document requirements
- **D-07 [LOCKED]** Billing type chosen via **pill UI** (Progress / Completion / Other). Auto-HINT from
  tranche label (label contains "completion"/"final" → pre-select Completion; contains "progress" →
  pre-select Progress), but ALWAYS user-overrideable. Type is user intent, not inferred from label.
- **D-08 [LOCKED]** Document requirements by type (validation blocks Submit until all required links filled):
  | Billing type | Documents required |
  |--------------|--------------------|
  | progress     | Progress Report (1 link) |
  | completion   | COC + Completion Report (2 links) |
  | other        | Supporting Document (1 link) |
- **D-09 [LOCKED]** Documents are **URL/link only** (Google Drive, SharePoint, etc.) — NO Firebase
  Storage uploads (avoids Blaze plan). Each doc = `{ key, label, url }`.

### Approve bridge
- **D-10 [LOCKED]** Approve calls the EXISTING `openCreateCollectibleModal(preselectKey)`. Extend the
  preselectKey parser (finance.js:1620-1624) to accept a THIRD segment: `'projects:CODE:TRANCHE_INDEX'`.
  After `_refreshCreateCollTrancheDropdown()` runs, set `#createCollTranche.value = trancheIndex` so the
  tranche is pre-selected. Backward compatible — 2-segment keys still work (tranche segment optional).
- **D-11 [LOCKED]** Edge: the tranche dropdown DISABLES already-billed indexes (D-12 1:1 dedup,
  finance.js:1766-1777). If the requested tranche already has a collectible, the pre-selected option is
  disabled — Finance sees it can't be re-billed. Plan must handle gracefully (e.g. surface a hint;
  do NOT silently leave an invalid selection). Approve still opens the modal; Finance decides.
- **D-12 [LOCKED]** Approve marks the request `approved` (set `status`, `reviewed_by`, `reviewed_at`).
  Approving the billing request and creating the collectible are SEPARATE actions — approving pre-fills
  the modal; Finance still completes collectible creation. (Approve does not auto-create the collectible.)

### Reject
- **D-13 [LOCKED]** Reject requires a non-empty reason. Set `status='rejected'`, `rejection_reason`,
  `reviewed_by`, `reviewed_at`. Reason is visible on BOTH the Finance banner and the project-detail
  status list.

### Finance queue surface
- **D-14 [LOCKED]** Option A — collapsible blue banner ABOVE the existing Collectibles table in the
  Finance Collectibles sub-tab. Auto-appears when ≥1 pending request; collapses/disappears when empty.
  Real-time via onSnapshot on `billing_requests` where `status == 'pending'`.

### Project Detail surface
- **D-15 [LOCKED]** Footer link sits at the bottom of the Collectibles group inside the Financial Summary
  card (project-detail.js ~line 534-547 region). Below it, a compact list of THIS project's billing
  requests with status (pending/approved/rejected + reason). The footer link + modal are visible to
  project-assigned users (operations_user) who can't reach Finance.

### Security Rules (CLAUDE.md new-collection protocol — rules FIRST)
- **D-16 [LOCKED]** Add a `match /billing_requests/{id}` block to firestore.rules in the SAME COMMIT as
  the first JS write (mirrors collectibles at firestore.rules:514, Phase 85 D-24 protocol).
  - `read`: active users (Finance banner + project-detail status list both read).
  - `create`: active users (operations_user is the intended creator; they lack collectible authority).
  - `update`: Finance / operations_admin / super_admin (status transitions: approve/reject).
  - `delete`: Finance / operations_admin / super_admin (or omit if no delete path needed).
  - Use existing `isActiveUser()` / `hasRole([...])` helpers (see collectibles block as the analog).

### Notifications
- **D-17 [LOCKED]** On submit → notify Finance role (new MRF-style fan-out via the existing
  notification infra). On approve/reject → notify the submitter (`requested_by_uid`). All calls
  wrapped in try/catch (fire-and-forget, Phase 83 D-03 / Phase 84.1 pattern). A new
  `NOTIFICATION_TYPES` entry (e.g. `BILLING_REQUEST_SUBMITTED`, `BILLING_REQUEST_DECIDED`) follows the
  Phase 95 TYPE_META anatomy (icon SVG, action_required, target_route). Confirm exact type set during plan.

### SPA conventions (CLAUDE.md — MANDATORY)
- **D-18** All `onclick` handlers attached to `window.*` in `init()`, deleted in `destroy()`.
- **D-19** All user-supplied strings (notes, doc labels/urls, names, rejection reason) escaped via
  `escapeHTML()` on render. Doc URL links: `target="_blank" rel="noopener noreferrer"`.
- **D-20** Listeners pushed to the module `listeners` array; unsubscribed in `destroy()`.
- **D-21** Status NEVER inferred case-insensitively — exact-match `'pending'`/`'approved'`/`'rejected'`.

### Claude's Discretion (planner/executor choices)
- Exact modal markup + CSS (match spike prototype visual language; reuse existing modal/pill/banner styles).
- Exact notification type names + copy templates (follow Phase 95 anatomy).
- Whether billing-request reads use a dedicated onSnapshot or piggyback existing collectibles listeners.
- Module placement of new functions (finance.js for the banner/approve/reject; project-detail.js for
  footer link + modal + status list; a shared `app/billing-requests.js` helper module is acceptable if
  it reduces duplication of schema/validation logic).
- Project-scoped billing-request ID strategy (Firestore auto-id is acceptable — no human-readable ID
  requirement in the spike schema; `addDoc` auto-id is fine).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spike design contract (the locked design + visual reference)
- `.planning/spikes/024-billing-request-flow/README.md` — full design rationale, schema, build targets, validated decisions table
- `.planning/spikes/024-billing-request-flow/index.html` — Project Detail surface prototype (footer link + modal)
- `.planning/spikes/024-billing-request-flow/finance-queue.html` — Finance banner (Option A) prototype
- `.planning/spikes/024-billing-request-flow/.continue-here.md` — required-reading list + remaining-work summary

### Integration anchors (existing code to extend/reuse)
- `app/views/finance.js:1595-1598` — `hasCollectibleWriteAuthority()` (the gate operations_user fails)
- `app/views/finance.js:1611-1681` — `openCreateCollectibleModal(preselectKey)` (extend preselectKey for tranche_index per D-10)
- `app/views/finance.js:1620-1624` — preselectKey parser (`'projects:CODE'` split → add 3rd `:INDEX` segment)
- `app/views/finance.js:1711-1789` — `_refreshCreateCollTrancheDropdown()` (D-12 dedup disables billed indexes — D-11 edge)
- `app/views/finance.js:1799-1839` — `submitCollectible()` (amount math + denormalized-freeze pattern to mirror for D-06)
- `app/views/project-detail.js:534-547` — Collectibles group in Financial Summary card (footer link goes here, D-15)
- `firestore.rules:504-525` — `collectibles` match block (analog for the new `billing_requests` block, D-16)

### Project conventions
- `CLAUDE.md` — "Add New Collection or Tab" (rules-first protocol), SPA patterns (window fns, listeners, destroy), case-sensitive status matching, `escapeHTML` usage
- Notification infra: existing `NOTIFICATION_TYPES` / `createNotification*` helpers + Phase 95 TYPE_META anatomy (icon SVG, action_required, target_route) — pattern-mapper to locate exact module/anchors

</canonical_refs>

<specifics>
## Specific Ideas

- The footer link copy is literally "↑ Initiate Billing →" (spike Option C).
- The Finance banner header is "Pending Billing Requests" (spike Option A), blue accent.
- Billing-type pills order: Progress / Completion / Other.
- Completion billing requires TWO links labeled "COC" and "Completion Report".
- Approve flow = pre-fill only; Finance still sets Due Date and clicks Create Collectible (existing modal).

</specifics>

<deferred>
## Deferred Ideas

- **Per-tranche status rows** in project detail (Billed/Unbilled/Pending, green-tint billed, per-row
  "Bill" shortcut). spike-024 prototyped them; deferred to keep Phase 99 to the validated minimal
  Option C footer-link surface. Candidate for a follow-up phase.
- **Firebase Storage uploads** for documents (requires Blaze plan). URL/link only this phase.

</deferred>

---

*Phase: 99-billing-request-flow*
*Context synthesized 2026-06-04 from spike-024 (VALIDATED) + plan-phase scope decisions*
