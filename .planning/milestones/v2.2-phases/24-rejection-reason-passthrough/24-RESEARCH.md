# Phase 24: PR/TR Rejection Reason Passthrough - Research

**Researched:** 2026-02-10
**Domain:** Firestore field name mismatch / data passthrough bug
**Confidence:** HIGH

## Summary

This phase addresses a field-name mismatch bug between the Finance rejection flow (writer) and the Procurement MRF Processing view (reader). The Finance view (`finance.js`) writes the rejection reason to the MRF document using the field name `rejection_reason`, but the Procurement view (`procurement.js`) reads from `mrf.pr_rejection_reason`. Since the field `pr_rejection_reason` is never written by the current finance code, it is always `undefined`, causing the fallback text "No reason provided" to display.

The old archive version (`archive/finance.html`) correctly wrote BOTH `pr_rejection_reason` and `rejection_reason` to the MRF document. When `finance.js` was refactored/rewritten for the SPA, the `pr_rejection_reason` field write was dropped, breaking the passthrough.

Additionally, there is a secondary gap: TR rejections set MRF status to `'TR Rejected'`, but procurement.js only checks for `mrf.status === 'PR Rejected'` when rendering rejection cards. TR-rejected MRFs are queried (they're included in `loadMRFs` via the `'Finance Rejected'` status... wait, actually `'TR Rejected'` is NOT in the query statuses), so TR-rejected MRFs may not even appear in the MRF list at all.

**Primary recommendation:** Fix the field name mismatch by having `finance.js` write `pr_rejection_reason` to the MRF document (matching what `procurement.js` reads), and also handle TR rejection display symmetrically.

## Root Cause Analysis

### The Bug: Field Name Mismatch

**Finance.js writes (PR rejection, line 1874-1879):**
```javascript
await updateDoc(doc(db, 'mrfs', mrfDoc.id), {
    status: 'PR Rejected',
    rejected_pr_id: request.pr_id,
    rejection_reason: reason,      // <-- writes "rejection_reason"
    is_rejected: true,
    updated_at: new Date().toISOString()
});
```

**Procurement.js reads (line 768 and 824):**
```javascript
${mrf.pr_rejection_reason || 'No reason provided'}
//       ^^^^^^^^^^^^^^^^^^ reads "pr_rejection_reason" -- NEVER WRITTEN
```

**Archive/finance.html wrote correctly (line 2640-2641):**
```javascript
pr_rejection_reason: reason,  // Store rejection comments (use pr_rejection_reason for consistency)
rejection_reason: reason,     // Also store in rejection_reason for backward compatibility
```

The archive version wrote BOTH field names. The SPA rewrite dropped `pr_rejection_reason`.

### Secondary Issue: TR Rejection Not Fully Handled

**Finance.js TR rejection sets MRF status to `'TR Rejected'` (line 1850):**
```javascript
await updateDoc(doc(db, 'mrfs', mrfDoc.id), {
    status: 'TR Rejected',
    rejection_reason: reason,
    updated_at: new Date().toISOString()
});
```

**Problems with TR rejection:**
1. `loadMRFs()` queries statuses `['Pending', 'In Progress', 'PR Rejected', 'Finance Rejected']` -- `'TR Rejected'` is NOT in this list, so TR-rejected MRFs disappear from the procurement view entirely
2. The MRF card rendering only checks `mrf.status === 'PR Rejected'` for rejection styling (line 731, 796)
3. No `is_rejected: true` flag is set for TR rejections (unlike PR rejections)
4. No `rejected_tr_id` is stored on the MRF (unlike the archive version which stored it)

### Tertiary Issue: Hardcoded Rejector Name

Both PR and TR rejection in `finance.js` hardcode `rejected_by: 'Ma. Thea Angela R. Lacsamana'` instead of using `currentUser` like the approval flow does. This should be updated to use the current user's identity.

## Affected Files

| File | Role | Lines | What Needs Changing |
|------|------|-------|---------------------|
| `app/views/finance.js` | Writer (rejection) | 1829-1893 | `submitRejection()` - add `pr_rejection_reason` field to MRF write; fix TR rejection MRF fields; use `currentUser` for `rejected_by` |
| `app/views/procurement.js` | Reader (display) | 619, 731, 768, 796, 824 | `loadMRFs()` query - add `'TR Rejected'`; card rendering - handle TR rejection display |

## Architecture Patterns

### Current Rejection Flow (PR)

```
1. Finance user clicks "Reject" on PR review modal
2. rejectPR() opens rejection modal with textarea
3. submitRejection() captures reason text
4. Writes to `prs` collection:
   - finance_status: 'Rejected'
   - rejection_reason: reason
   - rejected_at, rejected_by
5. Writes to `mrfs` collection:
   - status: 'PR Rejected'
   - rejected_pr_id: request.pr_id
   - rejection_reason: reason        <-- FIELD NAME BUG (missing pr_rejection_reason)
   - is_rejected: true
6. Procurement view queries MRFs with status 'PR Rejected'
7. Card renders with mrf.pr_rejection_reason  <-- READS WRONG FIELD
```

### Current Rejection Flow (TR)

```
1. Finance user clicks "Reject" on TR review modal
2. Same rejectPR() -> submitRejection() flow
3. Writes to `transport_requests` collection:
   - finance_status: 'Rejected'
   - rejection_reason: reason
   - rejected_at, rejected_by
4. Writes to `mrfs` collection:
   - status: 'TR Rejected'           <-- NOT IN QUERY FILTER
   - rejection_reason: reason         <-- FIELD NAME BUG (missing pr_rejection_reason)
   - (missing: is_rejected: true)     <-- NOT SET
   - (missing: rejected_tr_id)        <-- NOT SET
5. Procurement loadMRFs() does NOT query 'TR Rejected' status
6. TR-rejected MRFs are invisible to procurement
```

### PR Re-generation (Already Working)

When procurement regenerates PRs after rejection (lines 3039-3199, 3336-3514):
- Finds rejected PRs for the MRF
- Reuses rejected PR IDs (updates them back to Pending)
- Clears rejection fields: `pr_rejection_reason: null, rejected_pr_id: null, is_rejected: false`
- This clearing code already references `pr_rejection_reason`, confirming it's the expected field name

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Field name consistency | New abstraction layer | Simple field addition to existing write | Only 2 writes need fixing |
| Rejection reason display | Custom notification system | Existing card rendering with correct field | Already has UI, just wrong field name |

## Common Pitfalls

### Pitfall 1: Only Fixing One Side
**What goes wrong:** Fixing only finance.js (writer) or only procurement.js (reader) but not both
**Why it happens:** The fix seems simple so you might only change one file
**How to avoid:** Fix the writer (finance.js) to write the correct field AND verify the reader matches. Best approach: write BOTH `rejection_reason` and `pr_rejection_reason` for backward compatibility with any existing data.

### Pitfall 2: Forgetting Existing Rejected MRFs
**What goes wrong:** MRFs that were already rejected before the fix have `rejection_reason` but not `pr_rejection_reason`
**How to avoid:** The reader in procurement.js should fall back: `mrf.pr_rejection_reason || mrf.rejection_reason || 'No reason provided'`. This handles both old and new data.

### Pitfall 3: TR Rejection Status Not in Query
**What goes wrong:** After fixing field names, TR rejections still invisible because `'TR Rejected'` is not in the loadMRFs query
**How to avoid:** Add `'TR Rejected'` to the statuses array on line 619 of procurement.js

### Pitfall 4: TR Rejection Card Styling Missing
**What goes wrong:** TR-rejected MRFs show up in list but without the red border/rejection styling
**Why:** Card rendering only checks `mrf.status === 'PR Rejected'`, not `'TR Rejected'`
**How to avoid:** Update the isRejected check to: `const isRejected = mrf.status === 'PR Rejected' || mrf.status === 'TR Rejected';`

### Pitfall 5: Hardcoded Rejector Name
**What goes wrong:** `rejected_by` always says 'Ma. Thea Angela R. Lacsamana' regardless of who actually rejected
**How to avoid:** Use `currentUser.full_name || currentUser.email || 'Finance User'` like the approval flow does

## Code Examples

### Fix 1: finance.js - submitRejection() PR path (line ~1874)
```javascript
// Current (broken):
await updateDoc(doc(db, 'mrfs', mrfDoc.id), {
    status: 'PR Rejected',
    rejected_pr_id: request.pr_id,
    rejection_reason: reason,
    is_rejected: true,
    updated_at: new Date().toISOString()
});

// Fixed (add pr_rejection_reason + user attribution):
const currentUser = window.getCurrentUser();
await updateDoc(doc(db, 'mrfs', mrfDoc.id), {
    status: 'PR Rejected',
    rejected_pr_id: request.pr_id,
    pr_rejection_reason: reason,   // Field procurement.js reads
    rejection_reason: reason,       // Backward compatibility
    is_rejected: true,
    rejected_by: currentUser?.full_name || currentUser?.email || 'Finance User',
    updated_at: new Date().toISOString()
});
```

### Fix 2: finance.js - submitRejection() TR path (line ~1849)
```javascript
// Current (broken):
await updateDoc(doc(db, 'mrfs', mrfDoc.id), {
    status: 'TR Rejected',
    rejection_reason: reason,
    updated_at: new Date().toISOString()
});

// Fixed (add pr_rejection_reason + missing fields):
const currentUser = window.getCurrentUser();
await updateDoc(doc(db, 'mrfs', mrfDoc.id), {
    status: 'TR Rejected',
    rejected_tr_id: request.tr_id || request.pr_id,
    pr_rejection_reason: reason,   // Field procurement.js reads
    rejection_reason: reason,       // Backward compatibility
    is_rejected: true,
    rejected_by: currentUser?.full_name || currentUser?.email || 'Finance User',
    updated_at: new Date().toISOString()
});
```

### Fix 3: procurement.js - loadMRFs() query (line 619)
```javascript
// Current:
const statuses = ['Pending', 'In Progress', 'PR Rejected', 'Finance Rejected'];

// Fixed:
const statuses = ['Pending', 'In Progress', 'PR Rejected', 'TR Rejected', 'Finance Rejected'];
```

### Fix 4: procurement.js - card rendering (lines 731, 796)
```javascript
// Current:
const isRejected = mrf.status === 'PR Rejected';

// Fixed:
const isRejected = mrf.status === 'PR Rejected' || mrf.status === 'TR Rejected';
```

### Fix 5: procurement.js - rejection reason display (lines 768, 824)
```javascript
// Current:
${mrf.pr_rejection_reason || 'No reason provided'}

// Fixed (handles both old and new data):
${mrf.pr_rejection_reason || mrf.rejection_reason || 'No reason provided'}
```

### Fix 6: finance.js - PR/TR rejection rejected_by (lines 1839, 1864)
```javascript
// Current (hardcoded):
rejected_by: 'Ma. Thea Angela R. Lacsamana'

// Fixed (dynamic user attribution):
rejected_by: currentUser?.full_name || currentUser?.email || 'Finance User',
rejected_by_user_id: currentUser?.uid
```

## State of the Art

| Old Approach (archive/finance.html) | Current Approach (finance.js SPA) | When Changed | Impact |
|--------------------------------------|-----------------------------------|--------------|--------|
| Wrote BOTH `pr_rejection_reason` AND `rejection_reason` to MRF | Only writes `rejection_reason` to MRF | During SPA migration | Broke rejection reason display |
| Set `is_rejected: true` for both PR and TR rejections | Only sets `is_rejected` for PR rejections | During SPA migration | TR rejections have incomplete flags |
| Stored `rejected_tr_id` for TR rejections | Does not store `rejected_tr_id` | During SPA migration | Can't identify which TR was rejected |

## Scope Assessment

This is a small, focused bug fix with well-defined changes:

- **2 files** need modification: `finance.js` and `procurement.js`
- **~6 specific code locations** need changes
- **Zero new UI** required (existing rejection display already works, just reads wrong field)
- **No new Firestore collections or indexes** needed
- **Backward compatible** with existing data if reader falls back to both field names

## Open Questions

1. **Existing rejected MRFs in production:**
   - What we know: MRFs rejected before this fix have `rejection_reason` but not `pr_rejection_reason`
   - Recommendation: The fallback chain `mrf.pr_rejection_reason || mrf.rejection_reason || 'No reason provided'` handles this gracefully without data migration

2. **Should `'Finance Rejected'` be a real status?**
   - What we know: It's in the loadMRFs query (line 619) but no code currently sets this status
   - What's unclear: Whether this was intended for a different workflow
   - Recommendation: Leave it in the query but don't add it to this phase's scope

3. **Should rejected MRFs show the rejector's name?**
   - What we know: The `rejected_by` field is written but never displayed in procurement view
   - Recommendation: Could be added to the rejection reason display for context, but keep scope minimal

## Sources

### Primary (HIGH confidence)
- `app/views/finance.js` lines 1807-1893 - Current rejection write code (direct code inspection)
- `app/views/procurement.js` lines 619, 725-835 - Current rejection read/display code (direct code inspection)
- `archive/finance.html` lines 2600-2660 - Original correct implementation (direct code inspection)

### Secondary (HIGH confidence)
- `app/views/procurement.js` lines 3160-3199, 3495-3514 - PR regeneration clears `pr_rejection_reason` field (confirms expected field name)

## Metadata

**Confidence breakdown:**
- Root cause: HIGH - Direct code inspection confirms field name mismatch with certainty
- Fix approach: HIGH - Archive code shows the original working pattern
- TR rejection gap: HIGH - Direct code inspection confirms missing status in query
- Scope: HIGH - All affected code locations identified through grep

**Research date:** 2026-02-10
**Valid until:** Indefinite (bug fix research, not library-dependent)
