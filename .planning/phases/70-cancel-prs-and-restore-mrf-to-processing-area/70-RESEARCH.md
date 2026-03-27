# Phase 70: Cancel PRs and Restore MRF to Processing Area - Research

**Researched:** 2026-03-27
**Domain:** MRF state machine, PR lifecycle management, Firestore multi-document write patterns
**Confidence:** HIGH

## Summary

Phase 70 enables procurement users to cancel all Pending PRs linked to an MRF and restore the MRF to the active processing list so items can be revised and re-submitted. This is a gap in the current workflow: once "Generate PR" is clicked, the MRF status becomes `PR Generated`, which removes it from the Procurement processing panel (that panel only shows `Pending`, `In Progress`, `Rejected`, `PR Rejected`, `TR Rejected`, `Finance Rejected`). If the procurement officer needs to revise items before Finance reviews, they currently have no way to pull the MRF back for editing without deleting it entirely.

The feature is semantically a "take back" action — it deletes all PRs whose `finance_status` is still `Pending` (i.e., not yet reviewed by Finance), and reverts the MRF `status` to `In Progress` so it re-appears in the processing panel with its items editable. PRs that are already `Approved` or `Rejected` cannot be cancelled this way; if any exist, the action must be blocked or require a partial cancel path.

The "restore to processing area" part means reverting MRF status to a value in the `loadMRFs` filter set: `['Pending', 'In Progress', 'Rejected', 'PR Rejected', 'TR Rejected', 'Finance Rejected']`. The correct target status is `In Progress` — matching the `saveProgress()` path — because items already exist.

**Primary recommendation:** Add a "Cancel PRs" button in the MRF detail action bar that deletes Pending PRs for the MRF and sets MRF status to `In Progress`, with a guard that blocks the action if any PR is already Finance Approved.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Firebase Firestore v10 | 10.7.1 (CDN) | Read existing PRs and update MRF + PR docs | Already in use; `getDocs`, `deleteDoc`, `updateDoc` from `../firebase.js` |
| Pure JavaScript ES6 | N/A | UI and logic | Project constraint — no framework |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `showToast` / `showLoading` | N/A (utils.js) | User feedback during async ops | All async Firestore paths |
| `window.canEditTab` | N/A (auth module) | Permission guard | Required on all mutation functions |

**No new libraries needed.** All functionality uses existing imports already in `procurement.js`.

## Architecture Patterns

### Where the Feature Lives

The cancel/restore action belongs entirely in `procurement.js` in the MRF Management tab (left panel MRF list + right panel MRF details).

### MRF State Machine (Current)

```
Pending  ──saveProgress()──► In Progress
Pending  ──generatePR()──────► PR Generated   ← MRF EXITS processing panel
In Progress ──generatePR()──► PR Generated   ← MRF EXITS processing panel
PR Rejected ──generatePR()──► PR Generated   ← Resubmit path
PR Generated ──[Finance approves]──► Finance Approved
PR Generated ──[Finance rejects PR]──► PR Rejected  ← re-enters panel
```

Processing panel `loadMRFs` query filter (line 1837):
```javascript
const statuses = ['Pending', 'In Progress', 'Rejected', 'PR Rejected', 'TR Rejected', 'Finance Rejected'];
```

`PR Generated` is NOT in this list. Once PRs are generated the MRF disappears from the panel.

### canEdit Status Check (Current)

The "Generate PR" button only shows when (line 2568, 2875):
```javascript
const canEdit = mrf.status === 'Pending' || mrf.status === 'In Progress' || mrf.status === 'PR Rejected';
```

After "Cancel PRs" restores status to `In Progress`, the "Generate PR" button will automatically re-appear — no additional UI changes needed for that.

### Recommended Pattern: cancelPRs() Function

```javascript
// procurement.js — follows same permission + guard pattern as rejectMRF()
async function cancelPRs() {
    if (window.canEditTab?.('procurement') === false) {
        showToast('You do not have permission to edit procurement data', 'error');
        return;
    }
    if (!currentMRF) return;

    // Fetch linked PRs
    const prsRef = collection(db, 'prs');
    const q = query(prsRef, where('mrf_id', '==', currentMRF.mrf_id));
    const snapshot = await getDocs(q);

    const pendingPRs = [];
    const blockers = [];  // Approved PRs that prevent cancel

    snapshot.forEach((docSnap) => {
        const pr = { id: docSnap.id, ...docSnap.data() };
        if (pr.finance_status === 'Approved') {
            blockers.push(pr.pr_id);
        } else if (pr.finance_status === 'Pending') {
            pendingPRs.push(pr);
        }
        // Rejected PRs: already cleaned by generatePR() re-run, safe to ignore
    });

    if (blockers.length > 0) {
        showToast(`Cannot cancel: PR(s) already approved by Finance: ${blockers.join(', ')}`, 'error');
        return;
    }

    if (pendingPRs.length === 0) {
        showToast('No pending PRs to cancel.', 'warning');
        return;
    }

    const confirmed = confirm(
        `Cancel ${pendingPRs.length} PR(s) and restore MRF "${currentMRF.mrf_id}" to processing?\n\n` +
        `PRs to cancel: ${pendingPRs.map(p => p.pr_id).join(', ')}\n\n` +
        `The MRF will return to "In Progress" so you can revise and re-submit.`
    );
    if (!confirmed) return;

    showLoading(true);
    try {
        // Delete pending PRs
        for (const pr of pendingPRs) {
            await deleteDoc(doc(db, 'prs', pr.id));
        }

        // Restore MRF to processing area
        await updateDoc(doc(db, 'mrfs', currentMRF.id), {
            status: 'In Progress',
            pr_ids: [],
            updated_at: new Date().toISOString()
        });

        // Reset detail panel — MRF will re-appear in list via onSnapshot
        currentMRF = null;
        const mrfDetails = document.getElementById('mrfDetails');
        if (mrfDetails) {
            mrfDetails.innerHTML = `<div style="text-align: center; padding: 3rem; color: #999;">
                MRF restored to processing. Select it from the list to edit.
            </div>`;
        }
        showToast('PRs cancelled. MRF restored to processing area.', 'success');
    } catch (error) {
        console.error('[Procurement] Error cancelling PRs:', error);
        showToast('Failed to cancel PRs: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}
```

### Where the Button Appears

The cancel button should appear in the dynamic `mrfActionsEl` block rendered by `updateMRFActionButtons()` (line ~2870). It should be visible only when `mrf.status === 'PR Generated'` — the exact condition where cancel is relevant.

The existing `renderExistingMRFActions()` function (line ~2565) handles the panel on the left-side action bar. Both locations need the button.

Pattern from existing buttons (line 2579):
```javascript
if (mrf.status === 'PR Generated') {
    buttons += ' <button class="btn btn-warning" onclick="window.cancelPRs()">&#8635; Cancel PRs</button>';
}
```

### Window Function Registration

Follows existing pattern in `attachWindowFunctions()` (line 1141):
```javascript
window.cancelPRs = cancelPRs;
```

And cleanup in `destroy()` (line ~1706):
```javascript
delete window.cancelPRs;
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Permission check | Custom role check | `window.canEditTab?.('procurement')` | Already wired to role system |
| Optimistic update | Manual DOM update | Let `onSnapshot` re-render after Firestore write | MRF list uses real-time listener; status change auto-updates list |
| PR count verification | Re-query after delete | Trust getDocs result; verify in confirm dialog | getDocs is point-in-time; show PR IDs to user before deletion |

## Common Pitfalls

### Pitfall 1: MRF With Mixed PR Finance Statuses
**What goes wrong:** MRF has some PRs Finance-approved, some still Pending. Cancelling Pending PRs while leaving Approved PRs creates an inconsistent state where `PR Generated` MRF has some orphaned Approved PRs but no Pending ones.
**Why it happens:** generatePR() can create one PR per supplier; Finance can approve them individually.
**How to avoid:** Block the cancel action entirely if ANY PR is `finance_status: 'Approved'`. Surface the blocker PR IDs in the error message. The user must coordinate with Finance to void the approved POs before cancelling.
**Warning signs:** `blockers.length > 0` check catches this.

### Pitfall 2: Rejected PRs Left Orphaned
**What goes wrong:** Rejected PRs (finance_status='Rejected') still linked to MRF when cancel runs. They are not deleted by cancelPRs() because they aren't 'Pending'. On re-submit via generatePR(), Case 1 logic reuses the rejected PR ID, so they'll be cleaned up automatically — no special handling needed.
**How to avoid:** Only delete `finance_status === 'Pending'` PRs. Rejected ones are handled by the existing generatePR() resubmit path.

### Pitfall 3: `loadMRFs` onSnapshot Does Not Include `PR Generated`
**What goes wrong:** Developer assumes the MRF will immediately appear in the list after status reverts to `In Progress`. It will — because `In Progress` IS in the filter. But if the status was accidentally set to something outside the filter (e.g., a typo), the MRF would disappear from both views.
**How to avoid:** Confirm the target status is exactly `'In Progress'` — it is in the filter (line 1837).

### Pitfall 4: pr_ids Array on MRF Not Cleared
**What goes wrong:** After cancelling PRs, the MRF document still has `pr_ids: ['PR_2026_03-001-SUPPLIER']`. If the list is displayed anywhere (timeline, records), stale PR IDs reference deleted documents.
**How to avoid:** Set `pr_ids: []` in the updateDoc call on the MRF.

### Pitfall 5: Cancelling PRs That Have POs
**What goes wrong:** If Finance has already approved a PR and a PO was generated, those POs would be orphaned by PR deletion.
**Why it happens:** `approvePRWithSignature()` creates PO documents linked to the PR. Deleting the PR doesn't delete the PO.
**How to avoid:** The `blockers` check (Approved PRs) catches this because a PR becomes `finance_status: 'Approved'` when Finance processes it, which is the same step that creates the PO. No PR can have a PO without being Approved first.

### Pitfall 6: Button Appearing in Wrong Context
**What goes wrong:** Cancel PRs button appears on an MRF with status `Pending` (before any PR was generated) or `Finance Approved` (after Finance approved).
**How to avoid:** Gate the button strictly on `mrf.status === 'PR Generated'`. Check both `renderExistingMRFActions()` (panel left sidebar) and `updateMRFActionButtons()` (inline edit panel).

## Code Examples

### Verified Status Filter (procurement.js line 1837)
```javascript
// Source: procurement.js loadMRFs()
const statuses = ['Pending', 'In Progress', 'Rejected', 'PR Rejected', 'TR Rejected', 'Finance Rejected'];
const q = query(mrfsRef, where('status', 'in', statuses));
```
`In Progress` is the target restoration status — confirmed in filter.

### Verified generatePR() MRF Update (procurement.js line 5402)
```javascript
// Source: procurement.js generatePR()
await updateDoc(mrfRef, {
    status: 'PR Generated',
    pr_ids: generatedPRIds,
    items_json: JSON.stringify(prItems),
    updated_at: new Date().toISOString(),
    pr_rejection_reason: null,
    rejected_pr_id: null,
    is_rejected: false
});
```
The cancel action is the inverse of this — clear `pr_ids`, revert `status` to `In Progress`.

### Verified canEdit Check (procurement.js line 2875)
```javascript
// Source: procurement.js updateMRFActionButtons()
const canEdit = currentMRF.status === 'Pending' || currentMRF.status === 'In Progress' || currentMRF.status === 'PR Rejected';
```
After cancel restores `In Progress`, `canEdit` becomes true and "Generate PR" reappears automatically.

### Verified PR Delete Permission (firestore.rules line 282)
```javascript
// Source: firestore.rules prs collection
allow delete: if hasRole(['super_admin', 'operations_admin', 'procurement']);
```
Procurement role CAN delete PRs — no rules change needed.

### Verified MRF Update Permission (firestore.rules line 255)
```javascript
// Source: firestore.rules mrfs collection
allow update: if hasRole(['super_admin', 'operations_admin', 'services_admin', 'finance', 'procurement']);
```
Procurement role CAN update MRF documents — no rules change needed.

## State of the Art

| Scenario | Current Behavior | After Phase 70 |
|----------|-----------------|----------------|
| PR generated but needs revision | User must delete entire MRF and re-create | Cancel PRs, MRF returns to In Progress for editing |
| Resubmit after cancel | Not possible without delete | Click "Generate PR" again after editing items |
| Finance already approved | Delete warning shows | Blocked — error shown, Finance must be involved |

## Open Questions

1. **Should Rejected PRs also be deleted during cancel?**
   - What we know: Rejected PRs (`finance_status: 'Rejected'`) are already handled by `generatePR()` Case 1 (reuses the PR ID, resets to Pending) — they don't need to be deleted for re-generation to work.
   - What's unclear: Whether leaving orphaned Rejected PRs after a cancel-without-resubmit confuses Finance Payables or other views.
   - Recommendation: Delete Rejected PRs too during cancel, since they're stale and the re-submit path creates them fresh anyway. This keeps the MRF doc clean.

2. **Should the button appear in the left-panel (renderExistingMRFActions) or right-panel (updateMRFActionButtons) or both?**
   - What we know: The right-panel `updateMRFActionButtons()` fires when the MRF is selected from the list. The left-panel button area is shown via `renderExistingMRFActions()` for already-open MRF views.
   - Recommendation: Add to `updateMRFActionButtons()` which is the primary action bar rendered when selecting an MRF. This is sufficient; `renderExistingMRFActions()` is secondary (tab-reenter scenario).

3. **What happens to the `_prpoSubDataCache` after cancel?**
   - What we know: The MRF Records tab caches sub-data per `mrf.id`. After cancelling PRs, the cache for that MRF is stale (still shows old PR data).
   - Recommendation: The cache is invalidated on next `loadPRPORecords()` call (`_prpoSubDataCache = new Map()` on line 3933). Since the Records tab is a separate tab with its own load cycle, no extra invalidation is needed. No action required.

## Environment Availability

Step 2.6: SKIPPED — no external dependencies. This is a pure code change to `procurement.js` using existing Firebase Firestore SDK already in the browser.

## Validation Architecture

`nyquist_validation` key absent from `.planning/config.json` — treat as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual browser testing (no automated test framework — per CLAUDE.md: "No build, test, or lint commands") |
| Config file | none |
| Quick run command | `python -m http.server 8000` then manual UAT in browser |
| Full suite command | Same — manual only |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CANPR-01 | Cancel button visible only on PR Generated MRFs | manual | n/a | n/a |
| CANPR-02 | Pending PRs are deleted from Firestore | manual | n/a | n/a |
| CANPR-03 | MRF status restored to In Progress and re-appears in list | manual | n/a | n/a |
| CANPR-04 | Action blocked when any PR is Finance Approved | manual | n/a | n/a |
| CANPR-05 | Generate PR button reappears after cancel | manual | n/a | n/a |

### Sampling Rate
- **Per task commit:** Manual smoke test — generate PRs, cancel, verify MRF re-appears in list
- **Per wave merge:** Full UAT across all MRF statuses to verify no regressions
- **Phase gate:** All CANPR-0X behaviors verified before `/gsd:verify-work`

### Wave 0 Gaps
None — no test infrastructure to create. Manual-only project.

## Sources

### Primary (HIGH confidence)
- `app/views/procurement.js` — `loadMRFs()` (line 1826), `generatePR()` (line 5160), `rejectMRF()` (line 3551), `updateMRFActionButtons()` (line ~2860), `attachWindowFunctions()` (line 1141), `destroy()` (line ~1700)
- `firestore.rules` — prs collection delete permission (line 282), mrfs collection update permission (line 255)
- `CLAUDE.md` — Project constraints, window function patterns, Firebase listener management

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — Phase 60 context explaining why TR rejection no longer cascades to MRF status (relevant precedent for scoped status handling)
- `.planning/ROADMAP.md` — Phase 70 goal description

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — existing imports, no new dependencies
- Architecture: HIGH — verified against live source code, exact line numbers cited
- Pitfalls: HIGH — derived from direct reading of generatePR(), approvePRWithSignature(), and firestore.rules
- Permission model: HIGH — firestore.rules verified, procurement role can delete prs and update mrfs

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable codebase, no fast-moving external dependencies)

## Project Constraints (from CLAUDE.md)

All directives that apply to Phase 70 planning:

- **No build system:** Pure JavaScript ES6 modules, no compile step, no test runner
- **Window functions required:** Any function called from `onclick` HTML must be assigned to `window.cancelPRs = cancelPRs` in `attachWindowFunctions()` and deleted in `destroy()`
- **Listener management:** No new Firestore listeners needed for this phase — `cancelPRs` uses one-time `getDocs` (not `onSnapshot`)
- **DOM selectors:** Use `document.getElementById()` with known stable IDs (`mrfActions`, `mrfDetails`)
- **Status matching is case-sensitive:** `'In Progress'`, `'PR Generated'` must match exactly
- **Firebase Firestore v10 CDN imports:** All Firestore functions imported from `../firebase.js`; do not import directly from SDK URLs
- **No staging environment:** Changes go straight to production Firebase
- **Security rules:** No changes needed — procurement role already has prs delete and mrfs update permissions
- **Deployment:** `git push` to branch, Netlify auto-deploys
