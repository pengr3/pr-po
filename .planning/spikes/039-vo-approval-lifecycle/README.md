---
spike: 039
name: vo-approval-lifecycle
type: standard
validates: "Given a proposed VO, when it moves Draft → For Approval → Approved/Rejected with a supporting document attached, then only Approved VOs move the revised sum and each transition emits a system audit entry to the project journal"
verdict: PENDING
related: [028, 029, 037, 040]
tags: [variation-order, lifecycle, approval, attachment, audit, journal]
---

# Spike 039: VO Approval Lifecycle

## What This Validates
A VO must not move the contract value just by being typed in — it needs a controlled lifecycle with an approval gate and an audit trail, because changing the contract sum is a financially significant act. Given VO-004 ("Extend mezzanine slab", +₱260,000), when it walks Draft → For Approval → Approved (or Rejected), then: (1) the **Revised Contract Sum moves only on Approved**; (2) **approval is gated on an attached supporting document**; (3) every transition lands as a **system entry in the project journal**, reusing patterns the codebase already has.

## Research

No external dependencies — this spike deliberately reuses three proven, already-shipped patterns:

- **Attachment gate (Spikes 028/029, Phase 87.4):** the inspection-report gate and completion gate both require an attached document (link OR file: `_url`/`_kind`/`_filename`) before the status can advance, with a 3-layer gate (UI disable + hint, handler guard, firestore.rules conjunction). The VO Approve action mirrors this exactly — disabled with an amber hint until a document is attached, guarded in the handler.
- **Project journal audit (Phase 101):** `activity_entries` is an append-only subcollection rendered as a feed; edit-history and lifecycle transitions fold in as **system** entries. Phase 101 Plan 05 already emits a **NOTIF-19 cost-delta** journal entry when `contract_cost` changes (`project-detail.js` saveField block). VO approval is the natural, structured replacement for that blind cost-delta: instead of "Contract Cost 4,200,000 → 4,605,000 (System)", the feed reads "VO-004 approved — contract revised ₱4,605,000 → ₱4,865,000".
- **Lifecycle states (Spike 031):** Draft → For Approval → Approved/Rejected is a smaller mirror of the project lifecycle accordion's gate model. Rejected is a terminal branch, like Loss on the project track.

**VO fields added at this stage (extends the 037 schema):**
```javascript
{ vo_no, description, type, amount, status,
  doc_url, doc_kind, doc_filename,     // attachment (028/029 field names)
  submitted_by, submitted_at,
  approved_by, approved_at,            // set only on Approved
  rejected_reason, rejected_at }       // set only on Rejected
```

**Who approves?** Open question flagged for discuss-phase. The completion/inspection gates use `operations_user`/admin roles; VO approval likely belongs with Operations Admin (or Finance, since it moves money). Role-gating is deferred — this spike uses a generic "Ops Admin" actor.

## How to Run
```
python -m http.server 8000
# Open: http://localhost:8000/.planning/spikes/039-vo-approval-lifecycle/spike.html
```

## What to Expect
A VO-004 card with a 3-node status stepper (Draft → For Approval → Approved), an attach zone, state-dependent action buttons, a live Revised-Sum bar, and a Project Journal feed below.

Key flows:
1. **Draft → Submit for Approval** → stepper advances; feed logs "submitted for approval"; revised sum unchanged.
2. **Try to Approve with no document** → Approve is **disabled** with "⚠ Attach a supporting document to enable Approve". Attach a link/file → Approve enables; feed logs the attachment.
3. **Approve** → revised sum jumps ₱4,605,000 → ₱4,865,000 (▲ +₱260,000); feed gets a green cost-delta system entry.
4. **Reject** (instead) → prompts for a required reason; terminal Rejected state; **revised sum stays unchanged**; feed logs the reason.
5. Controls: reset to Draft, jump straight to Approved/Rejected to inspect end states.

## Observability
Log pane: `info` (transitions, blue), `gate` (blocked approve, amber), `ok` (approval + revised before→after, green), `no` (rejection / validation, red). The journal feed itself is the in-product audit trail; the log pane is the developer view of the same events.

## Investigation Trail
- Gating **Approve** (not Submit) on the attachment matches the real gates: a VO can be drafted/submitted from the field before paperwork lands, but it cannot be *approved* — and only approval touches money — without the supporting document.
- Folding approval into the existing journal feed means VOs get audit history **for free** and reuse the Phase 101 `activity_entries` writer; no new audit surface to build.
- The approved entry is styled as a cost-delta (green ₱ icon) and reads with the before→after contract values — this is strictly better than the current blind NOTIF-19 "Contract Cost old→new" line, and could *replace* it for VO-driven changes (manual `contract_cost` edits would remain the fallback path / could be locked once VOs exist).

## Results
Verdict: **PENDING** — awaiting browser review. Self-verified: gate blocks approval without attachment (UI + handler guard); only the Approved transition moves the revised sum; Rejected is terminal and leaves the sum untouched; every transition emits a journal entry. Open question for the user: should manual `contract_cost` editing be **disabled** once a project has any VOs (forcing all contract-value change through the VO flow), or stay available as an escape hatch?
