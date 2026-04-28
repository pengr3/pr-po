---
phase: 82-add-delete-button-for-rejected-mrfs-to-enable-cleanup-like-rejected-trs
verified: 2026-04-28T00:00:00Z
status: human_needed
score: 11/11 must-haves structurally verified; 3/11 require browser smoke-test
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Click a soft-rejected MRF (status === 'Rejected') in MRF Processing left panel and confirm the 🗑️ Delete MRF button renders red (btn-danger) at the right end of the action-button row, after the Reject MRF button"
    expected: "Button renders alongside 💾 Save and ✕ Reject MRF; clicking it opens a native confirm() dialog whose first line reads 'Delete rejected MRF MRF-YYYY-NNN?' and whose second line reads 'This will permanently delete the MRF and N linked PR(s), N PO(s), N TR(s). This cannot be undone.' with the actual cascade counts substituted"
    why_human: "Button visibility, ordering, and styling are visual; confirm() is a native browser dialog whose contents cannot be inspected without executing the page in a real browser session"
  - test: "With a rejected MRF still selected, edit any line item field (change a category dropdown or click 'Add Line Item') and confirm the 🗑️ Delete MRF button is still present after the action-buttons re-render"
    expected: "Button remains visible after every category change / line-item add / save (validates dual-site render — site #2 in updateActionButtons at line 3452-3454)"
    why_human: "DOM mutation triggered by user interaction is observable only at runtime; static grep cannot prove the button does not flicker/disappear when updateActionButtons() rewrites mrfActionsEl.innerHTML"
  - test: "Click 🗑️ Delete MRF, click OK in the confirm dialog, then verify in Firebase console that (a) the MRF doc is gone from `mrfs`, (b) every PR/PO/TR doc with mrf_id matching the deleted MRF is also gone, (c) NO new doc was added to `deleted_mrfs`. Confirm the details panel resets to the 'Select an MRF...' placeholder and a success toast 'MRF MRF-YYYY-NNN deleted (N PR / N PO / N TR cascaded).' appears"
    expected: "Cascade completes children-first (prs → pos → transport_requests → mrfs). MRF disappears from left panel via onSnapshot refresh. Toast confirms counts. deleted_mrfs collection unchanged."
    why_human: "Verifying actual Firestore mutations requires live Firebase access (no staging environment per CLAUDE.md). The cascade ordering, deletion of children, and absence of an audit-row write must all be confirmed against the live database."
  - test: "Click an MRF with status === 'PR Rejected' (or 'TR Rejected' / 'Finance Rejected'). Then change a line-item category. Verify the Delete MRF button does NOT appear at either initial render OR after the re-render"
    expected: "Button absent for all three non-soft-rejected statuses, both before and after any line-item interaction (D-03 eligibility enforced at both render sites)"
    why_human: "Negative-presence testing across multiple statuses requires manually selecting MRFs of each status; not feasible to confirm without live data and browser interaction"
  - test: "Sign in as a user without procurement edit permission (e.g., finance role). If a Rejected MRF is selectable in MRF Processing, click 🗑️ Delete MRF"
    expected: "A toast 'You do not have permission to edit procurement data' appears; no Firestore deletion runs"
    why_human: "Permission gate runtime behaviour depends on the live `window.canEditTab` resolver bound to the signed-in user's role; cannot be exercised statically"
---

# Phase 82: Add Delete Button for Rejected MRFs Verification Report

**Phase Goal:** Add a "Delete MRF" cleanup button to the rejected-MRF details view in MRF Processing (`app/views/procurement.js`), eligible only when `currentMRF.status === 'Rejected'`. The button mirrors the existing "Delete TR" lightweight UX (single confirm() → permanent delete → toast) but cascades to linked PRs, POs, and TRs by `mrf_id`. No reason prompt. No `deleted_mrfs` audit row.
**Verified:** 2026-04-28
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | Rejected MRF (status==='Rejected') in MRF Processing shows Delete MRF button | ✓ VERIFIED (static) / ? human (visual) | Site #1 at procurement.js:3104-3106 (gated on `mrf.status === 'Rejected'`); Site #2 at procurement.js:3452-3454 (gated on `currentMRF.status === 'Rejected'`); both append `🗑️ Delete MRF` btn-danger button |
| 2   | Clicking Delete MRF shows single confirm() with MRF ID + cascade counts | ✓ VERIFIED (code) / ? human (runtime) | Lines 2948-2953 build literal `Delete rejected MRF ${mrfId}?\n\nThis will permanently delete the MRF and ${prCount} linked PR(s), ${poCount} PO(s), ${trCount} TR(s). This cannot be undone.` and pass to `confirm()` at line 2953 |
| 3   | Confirming permanently deletes all linked prs/pos/transport_requests then the MRF | ✓ VERIFIED (code) / ? human (Firestore) | Lines 2959-2970 implement children-first cascade: `for (prDoc of prSnapshot.docs) deleteDoc(doc(db,'prs',...))` → same for `pos` → same for `transport_requests` → `deleteDoc(doc(db,'mrfs',mrfDocId))` |
| 4   | On success, details panel resets to placeholder, currentMRF clears, success toast appears | ✓ VERIFIED (code) / ? human (UI) | Lines 2972-2989: `currentMRF = null`, `mrfDetails.innerHTML = '...Select an MRF...'`, `mrfActionsEl.innerHTML = '...Save Progress...'`, `showToast('MRF ${mrfId} deleted (...)', 'success')` |
| 5   | Users without procurement edit permission see permission-denied toast and cascade does not run | ✓ VERIFIED | Lines 2907-2911: `if (window.canEditTab?.('procurement') === false) { showToast('You do not have permission to edit procurement data', 'error'); return; }` — verbatim copy of saveRejectedTRChanges pattern |
| 6   | MRFs with 'PR Rejected' / 'TR Rejected' / 'Finance Rejected' do NOT show Delete MRF button | ✓ VERIFIED | Both render-site gates use `=== 'Rejected'` exact match (lines 3104 and 3452); no other rejection variant appears in any Delete MRF eligibility expression. Defense-in-depth gate at line 2919 also uses `!== 'Rejected'` |
| 7   | No write to deleted_mrfs collection (D-01) | ✓ VERIFIED | `awk 'NR>=2906 && NR<=2996' app/views/procurement.js \| grep -c "deleted_mrfs"` returns 0 |
| 8   | No reason prompt() (D-01) | ✓ VERIFIED | `awk 'NR>=2906 && NR<=2996' app/views/procurement.js \| grep -c "prompt("` returns 0 |
| 9   | Legacy deleteMRF() at procurement.js:3913 (was 3790, shifted +123) remains untouched and unwired | ✓ VERIFIED | `git diff 5b1beef..HEAD -- app/views/procurement.js --stat` reports `123 insertions(+), 0 deletions`. Legacy block opens identically (`async function deleteMRF()` → `if (window.canEditTab?.('procurement') === false)`) at the new offset, and still contains `deletion_reason` (line 4041) and `addDoc(deletedMrfsRef` (line 4085) |
| 10  | Delete MRF button NOT in mrf-records.js or mrf-form.js (D-02) | ✓ VERIFIED | `grep "deleteRejectedMRF" app/views/mrf-records.js` → 0 matches; `grep "deleteRejectedMRF" app/views/mrf-form.js` → 0 matches |
| 11  | Delete MRF button persists across line-item edits / category changes / save operations | ✓ VERIFIED (static) / ? human (runtime) | `updateActionButtons()` at procurement.js:3452-3454 appends the button on every re-render (mirrors the Reject MRF append at line 3445), so the unconditional `mrfActionsEl.innerHTML = buttons` at line 3458-3459 cannot wipe it out |

**Score:** 11/11 truths structurally verified via grep / Read; 3 of those (truths 1, 2, 11 in their dynamic aspects + truths 3 and 4 in their Firestore/UI aspects) flagged for human smoke-test confirmation per the plan's `<verification>` checklist.

### Required Artifacts

| Artifact                  | Expected                                                              | Status     | Details |
| ------------------------- | --------------------------------------------------------------------- | ---------- | ------- |
| `app/views/procurement.js` | deleteRejectedMRF function + dual-site button render + window registration + destroy cleanup | ✓ VERIFIED | All 4 components present at expected sites: function at line 2906, site #1 at line 3104-3106, site #2 at line 3452-3454, registration at line 1618, cleanup at line 2163 |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| renderMRFDetails action-buttons block (procurement.js:3083-3110) | window.deleteRejectedMRF(mrf.id) | onclick handler on conditionally-rendered button (initial render path) | ✓ WIRED | Line 3105: `buttons += ` <button ... onclick="window.deleteRejectedMRF('${mrf.id}')" ...>🗑️ Delete MRF</button>``; preceded by gate `if (mrf.status === 'Rejected')` at line 3104 |
| updateActionButtons() (procurement.js:3447-3454) | window.deleteRejectedMRF(currentMRF.id) | onclick handler on conditionally-rendered button (re-render path; mirrors Reject MRF append) | ✓ WIRED | Line 3453: `buttons += ` <button ... onclick="window.deleteRejectedMRF('${currentMRF.id}')" ...>🗑️ Delete MRF</button>``; preceded by gate `if (currentMRF.status === 'Rejected')` at line 3452 |
| attachWindowFunctions block (procurement.js:1611-1618) | deleteRejectedMRF function | window.deleteRejectedMRF assignment | ✓ WIRED | Line 1618: `window.deleteRejectedMRF = deleteRejectedMRF;` (immediately after the existing Rejected TR Functions block, with a "Phase 82 — Rejected MRF Cleanup" comment header) |
| destroy() block (procurement.js:2163) | global cleanup | delete window.deleteRejectedMRF | ✓ WIRED | Line 2163: `delete window.deleteRejectedMRF; // Phase 82` (immediately after the existing `delete window.deleteRejectedTR;`) |
| deleteRejectedMRF cascade | Firestore prs + pos + transport_requests collections | getDocs(query(collection(db, X), where('mrf_id','==',mrfId))) then deleteDoc loop | ✓ WIRED | Lines 2932-2937 query all three child collections by `mrf_id`; lines 2959-2967 deleteDoc each child in cascade order; line 2970 deletes the MRF doc last |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| deleteRejectedMRF function | currentMRF (module-scoped) | Set by selectMRF (existing code), populated from `cachedAllMRFs` which is fed by `onSnapshot(collection(db, 'mrfs'), ...)` listener at module init | ✓ Yes (live Firestore data) | ✓ FLOWING |
| deleteRejectedMRF cascade prep | prSnapshot/poSnapshot/trSnapshot | `await getDocs(query(...))` against live `prs`/`pos`/`transport_requests` Firestore collections | ✓ Yes (live query results) | ✓ FLOWING |
| Site #1 render | mrf parameter | Passed by renderMRFDetails caller — populated from currentMRF / a freshly fetched MRF doc | ✓ Yes | ✓ FLOWING |
| Site #2 render | currentMRF.id, currentMRF.status | Module-scoped state set by selectMRF flow | ✓ Yes | ✓ FLOWING |

No hardcoded empty arrays / static returns / disconnected props detected. The new function reads live Firestore via `getDocs` and writes live Firestore via `deleteDoc`. Cascade counts in the confirm dialog are derived from `prSnapshot.size` / `poSnapshot.size` / `trSnapshot.size`, not hardcoded.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| n/a | n/a | This is a static SPA with no build/test/lint commands per CLAUDE.md ("No build, test, or lint commands - zero-build static website"). All behavioral verification (button render, confirm dialog content, cascade execution against Firestore, UI reset, permission gate) requires browser session against live Firebase. | ? SKIP (no runnable entry points) |

Static behavioral checks completed via grep (see Truths table). Runtime behavioral checks routed to human_verification block.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| n/a | 82-01-PLAN.md (`requirements: []`) | Phase 82 has no formal REQ-IDs in REQUIREMENTS.md per plan frontmatter — phase scoped via 82-CONTEXT.md decisions D-01 through D-05 (per planning_context "none — TBD in roadmap") | ✓ N/A | Plan frontmatter `requirements: []`. ROADMAP.md entry at line 709 confirms: "tracked as decisions in 82-CONTEXT.md (no formal requirement IDs)". REQUIREMENTS.md was not searched for orphans because Phase 82 explicitly has no formal IDs. |

Decision-level coverage (substituting for REQ-IDs):

| Decision | Description | Status | Evidence |
| -------- | ----------- | ------ | -------- |
| D-01 | Lightweight delete semantics (single confirm with cascade counts; NO reason prompt; NO deleted_mrfs audit row) | ✓ SATISFIED | 0 `addDoc`, 0 `prompt(`, 0 `deleted_mrfs` references inside deleteRejectedMRF body (lines 2906-2996) |
| D-02 | Single discoverable location (MRF Processing only; not in mrf-records.js or mrf-form.js) | ✓ SATISFIED | 0 `deleteRejectedMRF` references in mrf-records.js and mrf-form.js |
| D-03 | Strict eligibility (literal status === 'Rejected' only) | ✓ SATISFIED | All three Phase-82 gates use `=== 'Rejected'` / `!== 'Rejected'`; lines 3104, 3452 (render gates) and 2919 (defense-in-depth). 'PR Rejected' / 'TR Rejected' / 'Finance Rejected' references at lines 2255/2372/2495/2496/3086/3428/3925 are pre-existing left-panel grouping & canEdit logic — unrelated to the Delete MRF gate |
| D-04 | Permission gate (canEditTab procurement) | ✓ SATISFIED | Lines 2907-2911 contain verbatim copy of saveRejectedTRChanges pattern |
| D-05 | Children-first cascade with counted confirm | ✓ SATISFIED | Lines 2932-2940 count all three child collections; lines 2948-2953 surface counts in confirm; lines 2959-2970 cascade in order prs → pos → transport_requests → mrfs |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | — | — | — | No blocker, warning, or info-level anti-patterns detected in the inserted code. Function uses real Firestore reads/writes, no TODO/FIXME, no console.log placeholders, no `return null` stubs, no hardcoded empty arrays. The legacy `deleteMRF()` (untouched) retains its existing audit-row machinery — which is intentional per Phase 82 scope (legacy stays as dead-but-correct code per CONTEXT.md) and not a Phase 82 gap. |

### Human Verification Required

See `human_verification` block in YAML frontmatter for full structured list of 5 smoke tests. Summary:

1. **Visual button presence + dialog text** — Click rejected MRF, observe button render and confirm dialog contents (truths 1 + 2)
2. **Re-render persistence** — Edit a line item with rejected MRF selected, verify button survives the re-render (truth 11 dynamic aspect)
3. **End-to-end cascade against live Firebase** — Confirm delete; verify MRF + child docs gone, no `deleted_mrfs` row written, toast appears, panel resets (truths 3 + 4 + 7)
4. **Negative eligibility** — Select 'PR Rejected' / 'TR Rejected' / 'Finance Rejected' MRFs and verify button is absent at both initial render and after a line-item edit (truth 6 dynamic aspect)
5. **Permission gate runtime** — Sign in as non-procurement role, attempt delete, verify permission-denied toast (truth 5 dynamic aspect)

These tests cannot be automated within this verification pass because the project has no build/test/lint pipeline and the only "runtime" is a live Firebase session.

### Gaps Summary

No structural gaps. All must-haves from the plan frontmatter are present in `app/views/procurement.js` at the expected line numbers. The plan was implemented additively (123 insertions, 0 deletions across 3 atomic commits 89d24e9 → 5536cad → dfa883e), legacy `deleteMRF()` is byte-for-byte unchanged, and zero references to `deleteRejectedMRF` leaked into other view files (D-02 enforced).

The 5 human-verification items are all "happy-path/UI-render-confirmation" smoke tests that require a live browser + Firebase session and cannot be confirmed by static analysis alone. They are not gaps — they are residual confidence checks that the plan itself flagged as required (see plan `<verification>` block, items 1-11).

---

_Verified: 2026-04-28_
_Verifier: Claude (gsd-verifier)_
