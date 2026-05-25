/* ========================================
   UPDATE CHECK MODULE — Phase 94 (UPD-01..04)
   Self-contained ETag/Last-Modified HEAD-poll update detector.
   Zero imports — no Firebase, no router, no utils.

   Usage (index.html boot script):
     import { startUpdateCheck } from './app/update-check.js';
     startUpdateCheck(); // call once after initRouter()

   Registers window.dismissUpdateBanner for the Dismiss button.
   "Refresh Now" uses inline onclick="window.location.reload()".
   ======================================== */

/* ── Module-scope state ── */
let baseline = null;       // First observed version signal (ETag or Last-Modified).
let pollTimer = null;      // setInterval handle — null means not yet started.

const POLL_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes per Spike 001.

/* ── Private: fetch one HEAD response and return the version signal ── */
async function getVersionSignal() {
    try {
        const response = await fetch('/index.html', { method: 'HEAD', cache: 'no-store' });
        return response.headers.get('ETag') || response.headers.get('Last-Modified') || null;
    } catch (err) {
        console.warn('[UpdateCheck] poll failed', err);
        return null;
    }
}

/* ── Private: show the update strip banner ── */
function showUpdateBanner() {
    const slot = document.getElementById('updateStripSlot');
    if (slot) slot.classList.add('open');
    console.log('[UpdateCheck] new version detected');
}

/* ── Private: single poll tick ── */
async function poll() {
    // Skip polls while the tab is hidden — do NOT clear the interval.
    if (document.visibilityState !== 'visible') return;

    const signal = await getVersionSignal();

    // Failed poll or server returned no usable header — do nothing.
    if (signal === null) return;

    if (baseline === null) {
        // First successful poll — capture baseline; never show banner on this tick.
        baseline = signal;
        return;
    }

    if (signal !== baseline) {
        // Version changed since baseline was captured.
        // Do NOT update baseline — user is still running the old version.
        // Banner re-appears on every subsequent poll until they reload.
        showUpdateBanner();
    }
}

/* ── Public: start the update-check lifecycle (idempotent) ── */
export function startUpdateCheck() {
    // Guard: prevent double-start if called more than once.
    if (pollTimer !== null) return;

    // Register the Dismiss button's window function.
    // Dismiss hides the banner but does NOT reset baseline —
    // a later detected change will re-show it.
    window.dismissUpdateBanner = function () {
        const slot = document.getElementById('updateStripSlot');
        if (slot) slot.classList.remove('open');
    };

    // Fire one immediate poll (fire-and-forget) to capture the baseline on load.
    poll();

    // Then repeat every 30 minutes.
    pollTimer = setInterval(poll, POLL_INTERVAL_MS);
}
