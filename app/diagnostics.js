/* ========================================
   CLIENT DIAGNOSTICS — evidence capture
   ----------------------------------------
   Passive instrumentation to capture transient auth / permission failures,
   built specifically to prove out the overnight (≈12am–6am) "access denied"
   reports that clear on refresh and leave no screenshots.

   ⚠️ CAPTURE ONLY. This module changes NO auth or permission behavior — it
   only records what already happens at each existing failure path. Removing it
   changes nothing about how the app grants or denies access.

   Sinks (in order):
     1. localStorage ring buffer  — always works, survives the user's reload.
     2. console.error [CLMC-DIAG]  — visible if the user has DevTools open.
     3. Firestore `client_errors`  — best-effort central copy so a super_admin
        can review remote users' events without touching each machine. May fail
        during the very permission blip being captured; such events stay in the
        buffer (sent:false) and are retried by flushPending() on the next load.

   Review:  super_admin → window.clmcDumpDiag()  (dumps + copies local log)
            or read the `client_errors` collection in the Firebase console.
   ======================================== */

const LS_KEY = 'clmc_diag_log';
const MAX_EVENTS = 50;          // ring-buffer cap (also bounds un-sent backlog)
const MAX_MSG = 500;            // truncate long error messages
const HIDDEN_GAP_MS = 60 * 1000; // treat >60s backgrounded as a sleep/idle gap

// ---- session-scoped context ----
const appLoadAt = Date.now();
let seq = 0;                    // monotonic id counter (avoids needing randomness)
let lastHiddenAt = null;
let lastHiddenDurationMs = null; // how long the tab was MOST-RECENTLY backgrounded
let lastOnlineEventAt = null;

function readBuffer() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; }
    catch { return []; }
}

function writeBuffer(arr) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(arr.slice(-MAX_EVENTS))); }
    catch { /* localStorage full/unavailable — ignore, console + Firestore remain */ }
}

function buildEvent(type, detail = {}) {
    const d = new Date();
    const u = (typeof window !== 'undefined' && window.getCurrentUser?.()) || null;
    const err = detail.error || null;
    const ev = {
        id: `${d.getTime()}-${++seq}`,
        ts: d.toISOString(),                 // UTC
        hour_local: d.getHours(),            // 0–23 local — confirms the 12am–6am window
        tz_offset_min: d.getTimezoneOffset(),// user's timezone (PH = -480)
        type,
        code: (err && err.code) || detail.code || null,
        message: (((err && err.message) || detail.message || '') + '').slice(0, MAX_MSG) || null,
        uid: u?.uid || null,
        email: u?.email || null,
        role: u?.role || null,
        status: u?.status || null,
        route: (typeof location !== 'undefined' && location.hash) || null,
        online: (typeof navigator !== 'undefined' ? navigator.onLine : null),
        visibility: (typeof document !== 'undefined' && document.visibilityState) || null,
        session_age_ms: d.getTime() - appLoadAt,     // long session ⇒ overnight idle
        last_hidden_ms: lastHiddenDurationMs,        // ★ smoking gun: sleep→reconnect gap
        since_online_ms: lastOnlineEventAt ? (d.getTime() - lastOnlineEventAt) : null,
        ua: ((typeof navigator !== 'undefined' && navigator.userAgent) || '').slice(0, 180),
        sent: false,
    };
    // merge extra scalar detail fields (skip the ones already handled above)
    for (const k of Object.keys(detail)) {
        if (k === 'error' || k === 'code' || k === 'message') continue;
        ev[k] = detail[k];
    }
    return ev;
}

/**
 * Record a diagnostic event. Safe to call from anywhere; never throws.
 * @param {string} type  e.g. 'auth_listener_error', 'access_denied'
 * @param {object} detail  { error?, code?, message?, ...scalars }
 */
export function logDiag(type, detail = {}) {
    let ev;
    try { ev = buildEvent(type, detail); }
    catch (e) { try { console.error('[CLMC-DIAG] build failed', e); } catch {} return; }

    // 1) always persist locally (survives the reload the user performs)
    const buf = readBuffer();
    buf.push(ev);
    writeBuffer(buf);

    // 2) console (visible if DevTools is open, as the user did before)
    try { console.error(`[CLMC-DIAG] ${type}`, ev); } catch {}

    // 3) best-effort central mirror
    mirrorToFirestore(ev);
}

async function mirrorToFirestore(ev) {
    // NEVER call logDiag() from here — a failing write must not recurse.
    if (!ev || !ev.uid) return; // no uid → create rule rejects anyway; keep it local only
    try {
        const { db, collection, addDoc, serverTimestamp } = await import('./firebase.js');
        if (!db) return;
        const { sent, ...doc } = ev;
        await addDoc(collection(db, 'client_errors'), { ...doc, server_ts: serverTimestamp() });
        markSent(ev.id);
    } catch (e) {
        // Stays in the buffer with sent:false → retried by flushPending() next load.
        try { console.warn('[CLMC-DIAG] central mirror deferred:', e?.code || e?.message || e); } catch {}
    }
}

function markSent(id) {
    const buf = readBuffer();
    const hit = buf.find(e => e && e.id === id);
    if (hit) { hit.sent = true; writeBuffer(buf); }
}

// Retry any events that couldn't reach Firestore before the last reload.
async function flushPending() {
    const pending = readBuffer().filter(e => e && e.sent === false && e.uid);
    for (const ev of pending) {
        await mirrorToFirestore(ev); // sequential + best-effort
    }
}

/**
 * Wire passive context listeners and flush any pending events.
 * Passive: records context only; takes NO auth action.
 */
export function initDiagnostics() {
    try {
        document.addEventListener('visibilitychange', () => {
            const t = Date.now();
            if (document.visibilityState === 'hidden') {
                lastHiddenAt = t;
            } else if (document.visibilityState === 'visible' && lastHiddenAt) {
                lastHiddenDurationMs = t - lastHiddenAt;
                // A long hidden gap is the classic overnight sleep→reconnect setup.
                if (lastHiddenDurationMs >= HIDDEN_GAP_MS) {
                    logDiag('resume_from_hidden', { last_hidden_ms: lastHiddenDurationMs });
                }
            }
        });
        window.addEventListener('online', () => {
            lastOnlineEventAt = Date.now();
            logDiag('network_online', {});
        });
        window.addEventListener('offline', () => {
            logDiag('network_offline', {});
        });
    } catch { /* env without these APIs — ignore */ }

    flushPending();
}

/**
 * Support/console helper: print the local diagnostic log and copy it to the
 * clipboard. Intended to be run by an admin in the affected user's browser,
 * or by any user asked to "run clmcDumpDiag() and paste the result".
 */
export function dumpDiag() {
    const buf = readBuffer();
    try { console.table(buf.map(({ ua, message, ...rest }) => rest)); } catch {}
    try { console.log('[CLMC-DIAG] full log:\n', JSON.stringify(buf, null, 2)); } catch {}
    try { navigator.clipboard?.writeText(JSON.stringify(buf, null, 2)); } catch {}
    return buf;
}

// Expose for cross-module calls (auth.js / permissions.js / router.js) and manual use.
window.logDiag = logDiag;
window.clmcDumpDiag = dumpDiag;
