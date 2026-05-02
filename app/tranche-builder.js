/* ========================================
   SHARED TRANCHE BUILDER (Phase 85)
   Used by: app/views/projects.js (Plan 03 collection_tranches editor),
            app/views/services.js (Plan 04 collection_tranches editor),
            app/views/finance.js (Plan 05 create-collectible modal — read-only display
                                   of project's existing tranches via dropdown).

   Lifted from app/views/procurement.js lines 76-183 (Phase 65 PO tranche-builder).
   Parameter renamed from the original PO-id parameter to `scopeKey` so multiple
   builder instances can coexist on the same page without DOM ID collisions
   (e.g. `projectForm`, `serviceForm_SVC-CLMC-001`, `collModal_PROJECT-CLMC-ACME-001`).

   Existing procurement.js helpers are NOT removed in this phase — refactoring
   PO tranches to use this module is deferred to v4.1+ to keep Phase 85 scope
   tight (no procurement.js diff outside Plan 05).

   SECURITY (T-85.2-01, T-85.2-02):
   - All user-controlled tranche labels are passed through escapeHTML before
     HTML interpolation (XSS mitigation).
   - scopeKey is supplied by callers (Plan 03/04/05), never from user input.
     Callers MUST pass canonical IDs (project doc IDs, service codes); if a
     future caller passes user-controlled data here, this becomes HIGH severity.
   ======================================== */

import { escapeHTML } from './utils.js';

/**
 * Render the HTML for a tranche-builder UI.
 * @param {Array<{label:string, percentage:number}>} tranches - Initial tranches (may be empty)
 * @param {string} scopeKey - Unique key for DOM IDs (e.g. 'projectForm', 'collModal_X')
 * @returns {string} HTML string
 */
export function renderTrancheBuilder(tranches, scopeKey) {
    const safeTranches = Array.isArray(tranches) && tranches.length > 0
        ? tranches
        : [{ label: '', percentage: 0 }];

    const rows = safeTranches.map((t) => `
        <div class="tranche-row" style="display:flex;gap:5px;align-items:center;margin-bottom:3px;">
            <input type="text" class="form-control tranche-label" placeholder="Label" value="${escapeHTML(t.label || '')}"
                   style="flex:1 1 auto;padding:0.25rem 0.4rem;border:1px solid #cbd5e1;border-radius:4px;font-size:0.8125rem;"
                   oninput="window.recalculateTranches('${scopeKey}')">
            <input type="number" class="form-control tranche-pct" placeholder="%" value="${t.percentage || 0}"
                   min="0" max="100" step="0.01"
                   style="flex:0 0 56px;padding:0.25rem 0.4rem;border:1px solid #cbd5e1;border-radius:4px;font-size:0.8125rem;text-align:right;"
                   oninput="window.recalculateTranches('${scopeKey}')">
            <span style="flex:0 0 auto;font-size:0.75rem;color:#94a3b8;">%</span>
            <button type="button" aria-label="Remove tranche"
                    onclick="window.removeTranche(this, '${scopeKey}')"
                    style="flex:0 0 auto;width:20px;height:20px;padding:0;border:1px solid #cbd5e1;border-radius:3px;cursor:pointer;background:#fff;font-size:0.8rem;line-height:1;color:#94a3b8;"
                    ${safeTranches.length === 1 ? 'disabled' : ''}>&times;</button>
        </div>
    `).join('');

    const initialTotal = safeTranches.reduce((s, t) => s + (parseFloat(t.percentage) || 0), 0);
    const totalColor = Math.abs(initialTotal - 100) < 0.01 ? '#059669' : '#ef4444';

    return `
        <div id="trancheBuilder_${scopeKey}">
            ${rows}
            <button type="button" class="btn btn-outline btn-sm"
                    onclick="window.addTranche('${scopeKey}')"
                    style="margin-top:3px;padding:0.2rem 0.55rem;font-size:0.78rem;">+ Add Tranche</button>
        </div>
        <div id="trancheTotal_${scopeKey}" style="font-size:0.78rem;font-weight:600;margin-top:3px;color:${totalColor};">
            Total: <span id="trancheTotalValue_${scopeKey}">${initialTotal.toFixed(2).replace(/\.?0+$/, '')}</span>% / 100%
        </div>
    `;
}

/**
 * Read all tranches from the DOM for a given scopeKey.
 * @param {string} scopeKey
 * @returns {Array<{label:string, percentage:number}>}
 */
export function readTranchesFromDOM(scopeKey) {
    const wrapper = document.getElementById(`trancheBuilder_${scopeKey}`);
    if (!wrapper) return [];
    const rows = wrapper.querySelectorAll('.tranche-row');
    const result = [];
    rows.forEach(row => {
        const label = row.querySelector('.tranche-label')?.value?.trim() || '';
        const pctRaw = row.querySelector('.tranche-pct')?.value;
        const percentage = pctRaw === '' || pctRaw == null ? 0 : parseFloat(pctRaw);
        result.push({ label, percentage: isNaN(percentage) ? 0 : percentage });
    });
    return result;
}

/**
 * Recalculate the running-total badge for a given scopeKey.
 * Sum=100 → green; otherwise → red.
 * @param {string} scopeKey
 */
export function recalculateTranches(scopeKey) {
    const tranches = readTranchesFromDOM(scopeKey);
    const total = tranches.reduce((s, t) => s + (parseFloat(t.percentage) || 0), 0);
    const totalEl = document.getElementById(`trancheTotal_${scopeKey}`);
    const valueEl = document.getElementById(`trancheTotalValue_${scopeKey}`);
    if (valueEl) valueEl.textContent = total.toFixed(2).replace(/\.?0+$/, '');
    if (totalEl) totalEl.style.color = Math.abs(total - 100) < 0.01 ? '#059669' : '#ef4444';
}

/**
 * Append a new blank tranche row.
 * @param {string} scopeKey
 */
export function addTranche(scopeKey) {
    const wrapper = document.getElementById(`trancheBuilder_${scopeKey}`);
    if (!wrapper) return;
    const addButton = wrapper.querySelector('button.btn-outline');
    const newRow = document.createElement('div');
    newRow.className = 'tranche-row';
    newRow.style.cssText = 'display:flex;gap:5px;align-items:center;margin-bottom:3px;';
    newRow.innerHTML = `
        <input type="text" class="form-control tranche-label" placeholder="Label" value=""
               style="flex:1 1 auto;padding:0.25rem 0.4rem;border:1px solid #cbd5e1;border-radius:4px;font-size:0.8125rem;"
               oninput="window.recalculateTranches('${scopeKey}')">
        <input type="number" class="form-control tranche-pct" placeholder="%" value="0"
               min="0" max="100" step="0.01"
               style="flex:0 0 56px;padding:0.25rem 0.4rem;border:1px solid #cbd5e1;border-radius:4px;font-size:0.8125rem;text-align:right;"
               oninput="window.recalculateTranches('${scopeKey}')">
        <span style="flex:0 0 auto;font-size:0.75rem;color:#94a3b8;">%</span>
        <button type="button" aria-label="Remove tranche"
                onclick="window.removeTranche(this, '${scopeKey}')"
                style="flex:0 0 auto;width:20px;height:20px;padding:0;border:1px solid #cbd5e1;border-radius:3px;cursor:pointer;background:#fff;font-size:0.8rem;line-height:1;color:#94a3b8;">&times;</button>
    `;
    wrapper.insertBefore(newRow, addButton);
    // Re-enable any disabled remove buttons (now there are 2+ rows)
    wrapper.querySelectorAll('.tranche-row button').forEach(btn => { btn.disabled = false; });
    recalculateTranches(scopeKey);
}

/**
 * Remove a tranche row.
 * @param {HTMLElement} button - The clicked remove button
 * @param {string} scopeKey
 */
export function removeTranche(button, scopeKey) {
    const row = button.closest('.tranche-row');
    if (!row) return;
    const wrapper = document.getElementById(`trancheBuilder_${scopeKey}`);
    if (!wrapper) return;
    const allRows = wrapper.querySelectorAll('.tranche-row');
    if (allRows.length <= 1) return; // never remove the last row
    row.remove();
    // If only one row remains, disable its remove button
    const remaining = wrapper.querySelectorAll('.tranche-row');
    if (remaining.length === 1) {
        const btn = remaining[0].querySelector('button');
        if (btn) btn.disabled = true;
    }
    recalculateTranches(scopeKey);
}
