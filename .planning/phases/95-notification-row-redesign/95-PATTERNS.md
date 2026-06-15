# Phase 95: Notification Row Redesign — Pattern Map

**Mapped:** 2026-05-26
**Files analyzed:** 12 files to modify + 1 CSS file to extend
**Analogs found:** 13 / 13

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `app/notifications.js` — `TYPE_META` extension | config/enum | transform | `app/notifications.js` TYPE_META itself (lines 72–91) | self-extension |
| `app/notifications.js` — `renderDropdownRows()` | renderer | transform | spike 006 `renderAfter()` (spike.html lines 369–418) | exact (CSS class map) |
| `app/notifications.js` — `createNotification()` sig | utility | request-response | `excludeActor` param addition in same file (line 595) | exact |
| `app/notifications.js` — `createNotificationForRoles()` sig | utility | request-response | `excludeActor` addition (line 533) | exact |
| `app/notifications.js` — `createNotificationForUsers()` sig | utility | request-response | `excludeActor` addition (line 595) | exact |
| `styles/components.css` — new `.na-*` rules | style | — | `styles/components.css` `.notif-row*` block (lines 1922–2059) | role-match |
| `app/proposal-modal.js` (lines 990, 1157) | write site | request-response | `app/views/procurement.js` generatePR notification (lines 6652–6663) | exact |
| `app/views/finance.js` (lines 505, 1816, 5231, 5409, 5576, 5627) | write site | request-response | `app/views/finance.js` line 505 call itself as reference | exact |
| `app/views/home.js` (line 422) | write site | request-response | `app/proposal-modal.js` line 1157 | exact |
| `app/views/mrf-form.js` (line 1738) | write site | request-response | `app/views/procurement.js` line 4295 | exact |
| `app/views/procurement.js` (all 12 call sites) | write site | request-response | its own existing calls as reference | self-extension |
| `app/views/project-detail.js` (lines 838, 859) | write site | request-response | `app/views/service-detail.js` lines 797, 808 | exact |
| `app/views/service-detail.js` (lines 797, 808) | write site | request-response | `app/views/project-detail.js` lines 838, 859 | exact |
| `app/views/register.js` (line 276) | write site | request-response | `app/views/procurement.js` line 4295 | exact |

---

## Pattern Assignments

### `app/notifications.js` — TYPE_META extension (config, 16 types → add `action_required` + `target_route`)

**Analog:** `app/notifications.js` existing TYPE_META (lines 72–91)

**Current TYPE_META structure** (lines 72–91):
```javascript
export const TYPE_META = {
    MRF_APPROVED: { label: 'MRF Approved', icon: svg('...'), color: '#059669' },
    MRF_REJECTED: { label: 'MRF Rejected', icon: svg('...'), color: '#ef4444' },
    // ...
};
```

**New fields per entry — copy verbatim from spike 007 content matrix** (spike.html lines 285–447):

| Type | `action_required` | `target_route` |
|---|---|---|
| `MRF_SUBMITTED` | `false` | `'#/procurement/mrfs'` |
| `MRF_APPROVED` | `false` | `'#/procurement/records'` |
| `MRF_REJECTED` | `false` | `'#/procurement/records'` |
| `PR_REVIEW_NEEDED` | `true` | `'#/finance'` |
| `PR_DECIDED` | `false` | `'#/procurement/records'` |
| `TR_REVIEW_NEEDED` | `true` | `'#/finance'` |
| `TR_DECIDED` | `false` | `'#/procurement/records'` |
| `RFP_REVIEW_NEEDED` | `true` | `'#/finance'` |
| `RFP_PAID` | `false` | `'#/procurement/records'` |
| `PO_DELIVERED` | `false` | `'#/procurement/records'` |
| `PROPOSAL_SUBMITTED` | `true` | `'#/proposals'` |
| `PROPOSAL_DECIDED` | `false` | `'#/proposals'` |
| `PROJECT_STATUS_CHANGED` | `false` | `'#/projects'` |
| `PROJECT_COST_CHANGED` | `false` | `'#/projects'` |
| `REGISTRATION_PENDING` | `true` | `'#/admin?section=user-management'` |
| `COLLECTIBLE_CREATED` | `false` | `'#/finance'` |

**Pattern to follow — add alongside existing keys, do NOT break existing `label`/`icon`/`color`:**
```javascript
MRF_APPROVED: {
    label: 'MRF Approved',
    icon: svg('...'),       // unchanged
    color: '#059669',       // unchanged
    action_required: false, // NEW
    target_route: '#/procurement/records' // NEW
},
PR_REVIEW_NEEDED: {
    label: 'PR Review Needed',
    icon: svg('...'),
    color: '#f59e0b',
    action_required: true,  // NEW — action chip will render
    target_route: '#/finance' // NEW
},
```

---

### `app/notifications.js` — `renderDropdownRows()` (renderer, transform)

**Analog:** Spike 006 `renderAfter()` function (spike.html lines 369–418) — this is the canonical HTML the planner must reproduce.

**Key differences from current implementation:**

Current (lines 186–211): renders `.notif-row-body` > `.notif-row-content` > `.notif-row-message` (blob) + `.notif-row-time`.

New: replaces `.notif-row-content` interior with `.na-body` containing three structured sub-lines.

**HTML structure to produce** (from spike 006, lines 382–414):
```javascript
// Line 1: event title + optional action chip + relative time
const chip = meta.action_required
    ? `<span class="na-chip">● Action needed</span>`
    : '';
const l1 = `<div class="na-l1">
    <span class="na-event">${escapeHTML(meta.label)}</span>
    ${chip}
    <span class="na-time" title="${absTime}">${timeStr}</span>
</div>`;

// Line 2: objectId · objectName
const safeTargetId  = escapeHTML(n.target_id  || '');
const safeObjName   = escapeHTML(n.object_name || '');
const l2 = (safeTargetId || safeObjName) ? `<div class="na-l2">
    <span class="na-obj-id">${safeTargetId}</span>
    ${safeObjName ? `<span class="na-sep">·</span><span class="na-obj-name">${safeObjName}</span>` : ''}
</div>` : '';

// Line 3: actor — omit entirely when actor_name is "System" or absent
const safeActor = escapeHTML(n.actor_name || '');
const l3 = (safeActor && safeActor !== 'System')
    ? `<div class="na-l3">by ${safeActor}</div>`
    : '';
```

**Outer row structure** — keep `.notif-row` wrapper and `.notif-type-badge` intact; replace `.notif-row-body`/`.notif-row-content`/`.notif-row-message` with `.na-body`:
```javascript
return `
    <div class="notif-row${unreadClass}" role="menuitem">
        <div class="notif-row-body" onclick="handleNotificationClick('${safeId}')" title="${safeLink}">
            <span class="notif-type-badge"
                  style="background:${meta.color}15;color:${meta.color};"
                  title="${meta.label}">
                ${meta.icon}
            </span>
            <div class="na-body">
                ${l1}${l2}${l3}
            </div>
        </div>
        ${isUnread ? `<button class="notif-row-read-btn"
                onclick="event.stopPropagation(); markNotificationRead('${safeId}')"
                title="Mark as read">✓</button>` : ''}
    </div>`;
```

**escapeHTML rule** (from comment at line 159 + existing pattern lines 187–192):
- `meta.label` is project-controlled (from TYPE_META), not user input — but still escape for consistency
- `n.target_id`, `n.object_name`, `n.actor_name` are user-supplied strings → ALWAYS wrap in `escapeHTML()`
- `n.id`, `n.link` → already escaped via `safeId` / `safeLink` in existing code — keep those variables

**Navigation upgrade:** `handleNotificationClick` currently reads `cached?.link`. After this phase, also fall back to `TYPE_META[cached?.type]?.target_route` if `cached?.link` is absent (defensive graceful fallback, not a refactor of stored links).

---

### `app/notifications.js` — `createNotification()`, `createNotificationForRoles()`, `createNotificationForUsers()` (utility, request-response)

**Analog for optional param addition:** `excludeActor` was added to `createNotificationForUsers` at line 595 — default value keeps all existing callers unbroken.

**Pattern to copy** (lines 533, 595):
```javascript
// Before (existing):
export async function createNotification({ user_id, type, message, link, source_collection = '', source_id = '' })

// After (add two optional params with defaults):
export async function createNotification({
    user_id, type, message, link,
    source_collection = '',
    source_id = '',
    object_name = '',   // NEW — human-readable label for target doc
    actor_name = ''     // NEW — displayName of who triggered the event
})
```

**Firestore write extension** — add to the `addDoc` payload object (line 491–502):
```javascript
const ref = await addDoc(collection(db, 'notifications'), {
    user_id,
    type,
    message,
    link,
    source_collection,
    source_id,
    object_name,   // NEW
    actor_name,    // NEW
    actor_id: actor?.uid ?? null,
    read: false,
    read_at: null,
    created_at: serverTimestamp()
});
```

**Same extension for `createNotificationForRoles`** — add to destructured params with `object_name = '', actor_name = ''` defaults, then add both to `batch.set(newRef, { ... })` payload (lines 549–568).

**Same extension for `createNotificationForUsers`** — add to destructured params with defaults, then add both to `batch.set(newRef, { ... })` payload (lines 619–635).

**Backward compatibility rule:** Because all three new params have `= ''` defaults, every existing caller continues to work without modification until updated in this phase.

---

### `styles/components.css` — new `.na-*` CSS rules

**Analog:** Existing `.notif-row*` block (lines 1922–2059) — same file, same section, same design tokens.

**Placement:** Append immediately after the `.notif-row-time` rule (after line 2018) and before `.notif-row-mark-read`. Group under a comment block matching the existing section header style.

**CSS to add** — taken directly from spike 006 spike.html (lines 90–148):

```css
/* ─── Notification row anatomy (Phase 95) ─── */

.na-body {
    flex: 1;
    min-width: 0;
}

/* Line 1 */
.na-l1 {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-bottom: 2px;
}

.na-event {
    font-size: 13px;
    font-weight: 600;
    color: #1e293b;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.na-chip {
    font-size: 10px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 3px;
    background: #fef3c7;
    color: #92400e;
    border: 1px solid #fcd34d;
    white-space: nowrap;
    flex-shrink: 0;
}

.na-time {
    font-size: 11px;
    color: #64748b;
    white-space: nowrap;
    flex-shrink: 0;
}

/* Line 2 */
.na-l2 {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 2px;
}

.na-obj-id {
    font-size: 11px;
    font-weight: 700;
    color: #1a73e8;
    font-family: 'Consolas', monospace;
    white-space: nowrap;
    flex-shrink: 0;
}

.na-sep {
    font-size: 11px;
    color: #cbd5e1;
    flex-shrink: 0;
}

.na-obj-name {
    font-size: 11px;
    color: #334155;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* Line 3 */
.na-l3 {
    font-size: 11px;
    color: #64748b;
}
```

**Design token alignment:** All color values match the design system defined in CLAUDE.md (`#1a73e8` primary, `#1e293b` text, `#64748b` muted, `#e2e8f0` borders).

**The `.notif-row-message` rule** (lines 2000–2011) becomes dead CSS after this phase but should be left in place — it may still apply to legacy notification docs that have no `target_id`/`object_name`.

---

### Write site — `app/proposal-modal.js` (lines 990, 1157)

**Analog:** `app/views/procurement.js` generatePR approval notification (lines 6652–6663) — same `createNotification` call shape, same fire-and-forget try/catch wrapper.

**Context variables already present at each call site:**

Line 990 (`PROPOSAL_SUBMITTED`, fan-out via `createNotificationForRoles`):
- `proposal.title` → `object_name`
- `actorName` (already computed at line 988: `actor?.full_name || 'Unknown'`) → `actor_name`

```javascript
await createNotificationForRoles({
    roles: ['super_admin', 'operations_admin'],
    type: NOTIFICATION_TYPES.PROPOSAL_SUBMITTED,
    message: `Proposal ${proposal.title} submitted for approval by ${actorName}`,
    link: `#/proposals?id=${proposal.proposal_id}`,
    source_collection: 'proposals',
    source_id: proposal.proposal_id,
    object_name: proposal.title,          // NEW
    actor_name: actorName,                // NEW (already in scope)
    excludeActor: true
});
```

Line 1157 (`PROPOSAL_DECIDED`, single recipient via `createNotification`):
- `proposal.title` → `object_name`
- Actor: `window.getCurrentUser?.()?.full_name || 'System'` → `actor_name`

```javascript
await createNotification({
    user_id: proposal.created_by,
    type: NOTIFICATION_TYPES.PROPOSAL_DECIDED,
    message: `Proposal "${proposal.title}" ${actionVerb}: ${excerpt}`,
    link: `#/proposals?id=${proposal.proposal_id}`,
    source_collection: 'proposals',
    source_id: proposal.proposal_id,
    object_name: proposal.title,          // NEW
    actor_name: window.getCurrentUser?.()?.full_name || 'System' // NEW
});
```

---

### Write site — `app/views/finance.js` (6 call sites)

**Analog:** Same file's own call pattern at line 505 (RFP_PAID).

**Context for each site:**

**Line 505** (`RFP_PAID` — `createNotification`):
- `rfp.rfp_id` → target ID is already `source_id`; `object_name` = supplier name from RFP
- `rfp.supplier_name` → `object_name`
- Actor: `window.getCurrentUser?.()?.displayName || window.getCurrentUser?.()?.full_name || 'System'` → `actor_name`

```javascript
await createNotification({
    user_id: rfp.rfp_creator_user_id,
    type: NOTIFICATION_TYPES.RFP_PAID,
    message: `RFP ${rfp.rfp_id} for PO ${rfp.po_id || rfp.tr_id || ''} has been marked Paid`,
    link: '#/finance/payables',
    source_collection: 'rfps',
    source_id: rfp.rfp_id || '',
    object_name: rfp.supplier_name || '',   // NEW
    actor_name: window.getCurrentUser?.()?.full_name || 'System' // NEW
});
```

**Line 1816** (`COLLECTIBLE_CREATED` — `createNotificationForRoles`):
- `targetName` already computed at line 1814: `collDoc.project_name || collDoc.service_name`
- `object_name: targetName`
- `actor_name: window.getCurrentUser?.()?.full_name || 'System'`

**Line 5231** (`PR_DECIDED` approve — `createNotification`):
- `pr.pr_id` is already `source_id`; the human name is the project name on the linked MRF.
- The MRF project name is not in scope here. Use `pr.mrf_id` as the `object_name` fallback (the PR's MRF reference), since `pr.project_name` is not guaranteed on PR docs. The actor is the Finance user: `window.getCurrentUser?.()?.full_name || 'Finance User'`

```javascript
await createNotification({
    user_id: pr.pr_creator_user_id,
    type: NOTIFICATION_TYPES.PR_DECIDED,
    message: `PR ${pr.pr_id} has been Approved by Finance`,
    link: '#/procurement/records',
    source_collection: 'prs',
    source_id: pr.pr_id || '',
    object_name: pr.mrf_id || '',          // NEW — best available name context
    actor_name: window.getCurrentUser?.()?.full_name || 'System' // NEW
});
```

**Line 5409** (`TR_DECIDED` approve — `createNotification`): mirror line 5231 pattern; use `tr.mrf_id` as `object_name`.

**Line 5576** (`TR_DECIDED` reject — `createNotification`): same as 5409; `request.mrf_id` as `object_name`.

**Line 5627** (`PR_DECIDED` reject — `createNotification`): same as 5231; `request.mrf_id` as `object_name`.

---

### Write site — `app/views/home.js` (line 422)

**Analog:** `app/proposal-modal.js` line 1157 — identical notification type (`PROPOSAL_DECIDED`).

- `proposal.title` → `object_name`
- Actor: `window.getCurrentUser?.()?.full_name || 'System'` → `actor_name`

```javascript
await createNotification({
    user_id: proposal.created_by,
    type: NOTIFICATION_TYPES.PROPOSAL_DECIDED,
    message: `Proposal "${proposal.title}" ${actionVerb}: ${excerpt}`,
    link: `#/`,
    source_collection: 'proposals',
    source_id: proposal.proposal_id,
    object_name: proposal.title,            // NEW
    actor_name: window.getCurrentUser?.()?.full_name || 'System' // NEW
});
```

---

### Write site — `app/views/mrf-form.js` (line 1738)

**Analog:** `app/views/procurement.js` line 4295 — identical `createNotificationForRoles` call for `MRF_SUBMITTED`.

Context already in scope at line 1737: `projectOrServiceLabel = mrfDoc.project_name || mrfDoc.service_name || 'Unknown'`

```javascript
await createNotificationForRoles({
    roles: ['procurement'],
    type: NOTIFICATION_TYPES.MRF_SUBMITTED,
    message: `New MRF ${mrfId} for ${projectOrServiceLabel} needs processing`,
    link: '#/procurement/mrfs',
    source_collection: 'mrfs',
    source_id: mrfId,
    object_name: projectOrServiceLabel,    // NEW — already computed above
    actor_name: window.getCurrentUser?.()?.full_name || 'System', // NEW
    excludeActor: true
});
```

---

### Write site — `app/views/procurement.js` (12 call sites)

**Analog:** The file's own existing calls as self-extension.

**Per-site object_name sources:**

| Line | Type | `object_name` source | `actor_name` source |
|---|---|---|---|
| 1636 | `RFP_REVIEW_NEEDED` | `po.supplier_name` | `window.getCurrentUser?.()?.full_name \|\| 'System'` |
| 1749 | `RFP_REVIEW_NEEDED` | `tr.supplier_name` | same |
| 1844 | `RFP_REVIEW_NEEDED` | `po.supplier_name` | same |
| 4295 | `MRF_SUBMITTED` | `projectOrServiceLabel` (line 4294) | same |
| 4678 | `MRF_REJECTED` | `rejectedMrfSnap.project_name \|\| ''` | same |
| 6353 | `TR_REVIEW_NEEDED` | `mrfData.project_name \|\| ''` | same |
| 6652 | `MRF_APPROVED` | `mrfData.project_name \|\| ''` | same |
| 6668 | `PR_REVIEW_NEEDED` | `mrfData.project_name \|\| ''` | same |
| 7025 | `MRF_APPROVED` | `mrfData.project_name \|\| ''` | same |
| 7041 | `PR_REVIEW_NEEDED` | `mrfData.project_name \|\| ''` | same |
| 7053 | `TR_REVIEW_NEEDED` | `mrfData.project_name \|\| ''` | same |
| 7656 | `PO_DELIVERED` | `poDataFresh.supplier_name \|\| ''` | `'System'` (automated status update) |

**Representative pattern** (line 6652 as canonical example):
```javascript
await createNotification({
    user_id: requestorUid,
    type: NOTIFICATION_TYPES.MRF_APPROVED,
    message: `Your MRF ${mrfData.mrf_id} has been approved${firstPrId ? ` — ${firstPrId} created` : ''}`,
    link: '#/procurement/records',
    source_collection: 'mrfs',
    source_id: mrfData.mrf_id,
    object_name: mrfData.project_name || '',          // NEW
    actor_name: window.getCurrentUser?.()?.full_name || 'System' // NEW
});
```

**Line 7656 (PO_DELIVERED) — System actor pattern:**
```javascript
await createNotificationForUsers({
    user_ids: recipients,
    type: NOTIFICATION_TYPES.PO_DELIVERED,
    message: `PO ${poDataFresh.po_id} for MRF ${poDataFresh.mrf_id || ''} has been Delivered`,
    link: '#/procurement/records',
    source_collection: 'pos',
    source_id: poDataFresh.po_id || '',
    object_name: poDataFresh.supplier_name || '',    // NEW
    actor_name: 'System',                            // NEW — automated status change
    excludeActor: true
});
```

---

### Write site — `app/views/project-detail.js` (lines 838, 859)

**Analog:** `app/views/service-detail.js` lines 797, 808 — paired twins, mirror each other.

Note: these two call sites use `.catch()` chaining (fire-and-forget without await), not the try/catch wrapper. The new params slot in the same way.

**Line 838** (`PROJECT_STATUS_CHANGED`):
- `currentProject.project_name` → `object_name`
- `window.getCurrentUser?.()?.full_name || 'System'` → `actor_name`

```javascript
createNotificationForUsers({
    user_ids: recipients,
    type: NOTIFICATION_TYPES.PROJECT_STATUS_CHANGED,
    message: `Project "${currentProject.project_name}" status changed to: ${valueToSave}`,
    link: projectLink,
    source_collection: 'projects',
    source_id: currentProject.project_code || currentProject.id,
    object_name: currentProject.project_name || '',   // NEW
    actor_name: window.getCurrentUser?.()?.full_name || 'System' // NEW
}).catch(err => console.error('[ProjectDetail] NOTIF-11 notification failed:', err));
```

**Line 859** (`PROJECT_COST_CHANGED`): identical pattern; same `object_name` and `actor_name` sources.

---

### Write site — `app/views/service-detail.js` (lines 797, 808)

**Analog:** `app/views/project-detail.js` lines 838, 859.

- `notifServiceName` (already computed before line 797) → `object_name`
- `window.getCurrentUser?.()?.full_name || 'System'` → `actor_name`

```javascript
createNotificationForUsers({
    user_ids: notifRecipients,
    type: NOTIFICATION_TYPES.PROJECT_STATUS_CHANGED,
    message: `Service "${notifServiceName}" status changed to: ${valueToSave}`,
    link: notifServiceLink,
    source_collection: 'services',
    source_id: notifSourceId,
    object_name: notifServiceName || '',   // NEW
    actor_name: window.getCurrentUser?.()?.full_name || 'System' // NEW
}).catch(err => console.error('[ServiceDetail] NOTIF-11 notification failed:', err));
```

---

### Write site — `app/views/register.js` (line 276)

**Analog:** `app/views/mrf-form.js` line 1738 — fan-out via `createNotificationForRoles`.

Context at line 276: `fullName` (line ~248), `email` (line ~245), `userId` (line ~260) all in scope.

```javascript
await createNotificationForRoles({
    roles: ['super_admin'],
    type: NOTIFICATION_TYPES.REGISTRATION_PENDING,
    message: `New account pending approval: ${fullName} (${email})`,
    link: '#/admin?section=user-management',
    source_collection: 'users',
    source_id: userId,
    object_name: email || '',     // NEW — email is the best identifier for a new user
    actor_name: 'System',         // NEW — registration is a self-service system event
    excludeActor: false
});
```

---

## Shared Patterns

### 1. Optional param backward-compat extension
**Source:** `app/notifications.js` — `createNotificationForUsers()` signature (line 595), which added `excludeActor = false` in Phase 83.1 without breaking any callers.
**Apply to:** All three `createNotification*` function signatures.
```javascript
// Pattern: destructure with `= ''` default — existing callers need no changes
export async function createNotification({
    user_id, type, message, link,
    source_collection = '',
    source_id = '',
    object_name = '',  // new optional — callers that omit get ''
    actor_name = ''    // new optional — callers that omit get ''
})
```

### 2. escapeHTML on every user-supplied string in HTML rendering
**Source:** `app/notifications.js` renderDropdownRows (lines 159, 187–192) + `app/utils.js` escapeHTML (lines 17–25).
**Apply to:** `n.target_id`, `n.object_name`, `n.actor_name` in the new `renderDropdownRows` output.
```javascript
// Rule from line 159 comment: "ALWAYS use escapeHTML on any user-controlled string"
const safeTargetId = escapeHTML(n.target_id  || '');
const safeObjName  = escapeHTML(n.object_name || '');
const safeActor    = escapeHTML(n.actor_name  || '');
// meta.label comes from TYPE_META (project-controlled), but escape for defense-in-depth
```

### 3. Fire-and-forget try/catch wrapper (most call sites)
**Source:** `app/views/procurement.js` lines 6647–6663 (canonical example).
**Apply to:** All `createNotification*` calls at write sites; a notification failure must never block the action.
```javascript
try {
    await createNotification({ ... object_name: '...', actor_name: '...' });
} catch (notifErr) {
    console.error('[ModuleName] NOTIF-XX description failed:', notifErr);
}
```

### 4. Fire-and-forget `.catch()` pattern (project-detail / service-detail)
**Source:** `app/views/project-detail.js` line 845; `app/views/service-detail.js` line 804.
**Apply to:** The two project-detail and two service-detail call sites that already use this pattern — keep `.catch()` form, just add new params inline.
```javascript
createNotificationForUsers({ ..., object_name: '...', actor_name: '...' })
    .catch(err => console.error('[ModuleName] NOTIF-XX failed:', err));
```

### 5. actor_name source pattern
**Source:** `app/proposal-modal.js` lines 988–989 (actor resolution before notification call).
**Apply to:** All write sites. Standard pattern:
```javascript
// For human-triggered actions:
actor_name: window.getCurrentUser?.()?.full_name || 'System'

// For automated/system events (PO_DELIVERED, PROJECT_COST_CHANGED, COLLECTIBLE_CREATED, REGISTRATION_PENDING):
actor_name: 'System'
```

### 6. CSS section comment header convention
**Source:** `styles/components.css` line 1792:
```css
/* ========================================
   NOTIFICATIONS BELL + DROPDOWN — Phase 83 (D-01 / D-02)
   ...
   ======================================== */
```
**Apply to:** New `.na-*` CSS block header — use same format, reference Phase 95.

---

## No Analog Found

None. Every file has a direct analog in the codebase. The spike files (006 and 007) provide the validated HTML/CSS prototype for the new row anatomy.

---

## Metadata

**Analog search scope:** `app/notifications.js`, `app/utils.js`, `app/views/finance.js`, `app/views/procurement.js`, `app/views/project-detail.js`, `app/views/service-detail.js`, `app/proposal-modal.js`, `app/views/home.js`, `app/views/mrf-form.js`, `app/views/register.js`, `styles/components.css`, `.planning/spikes/006-*`, `.planning/spikes/007-*`
**Files scanned:** 13 source files + 2 spike HTML files
**Pattern extraction date:** 2026-05-26
