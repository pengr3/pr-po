/* ========================================
   SENTRY INIT — classic script, NOT an ES module (D-08)
   Loaded via a plain <script src> tag before the ESM bootstrap block.
   Deliberately contains zero import/export statements, which would be a
   syntax error for a module consumer. Houses Sentry.init() config, both
   PII-scrub hooks, the shared denylist, and the production test probe.
   See .planning/phases/114-observability-foundation-v4-3/114-CONTEXT.md
   for the full decision record (D-01..D-18).
   ======================================== */

/* ========================================
   CONSTANTS
   ======================================== */

// Public, write-only ingest key — safe in client code. A Sentry DSN
// authorizes event submission only, never dashboard read. This project
// has no .env and no server to proxy through; treating it as a secret
// would be cargo-cult.
const SENTRY_DSN = 'https://77a91db564b94b9e3ddb3106d6e6f928@o4511903390236672.ingest.us.sentry.io/4511903399673856';

// Hand-bumped at each phase close to clmc@4.3.0-p<phase>. That is an
// existing ritual in this project — every phase already ends with a docs
// commit and a deploy — and there is no build step to inject a git SHA.
const SENTRY_RELEASE = 'clmc@4.3.0-p114';

const PROD_HOST = 'clmcop.netlify.app';

/* ========================================
   ENVIRONMENT DERIVATION (D-14)
   Extends the isLocal idiom already used at app/firebase.js:59 rather
   than inventing a parallel mechanism.
   ======================================== */

const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);

// Precedence: isLocal wins first -> 'development'; exact production host
// -> 'production'; any other *.netlify.app -> 'preview'; anything else
// (most likely a future custom domain serving real users) -> 'production'
// so it lands in production views rather than a fourth bucket nobody
// looks at. Localhost deliberately still transmits (D-15) — full
// pipeline parity — and the 'development' tag is what keeps local work
// out of production views.
const SENTRY_ENVIRONMENT = isLocal
    ? 'development'
    : (window.location.hostname === PROD_HOST
        ? 'production'
        : (window.location.hostname.endsWith('.netlify.app')
            ? 'preview'
            : 'production'));

/* ========================================
   SHARED DENYLIST (D-02, D-04)
   The array is the editable source of truth; the regex is derived from it
   once at load so both scrub hooks share exactly one list — no drift
   between two hand-maintained matchers.

   `_name` (not `name`) catches supplier_name / client_name / project_name
   / item_name / requestor_name / actor_name / object_name while leaving
   Sentry's own contexts.browser.name / contexts.os.name metadata intact.

   Identifier-shaped keys (mrf_id, pr_id, po_id, project_id) are
   deliberately NOT denied — "what was it touching" is the single most
   useful fact on a Firestore error, and those are internal references,
   not financial contents. Also NOT denied: uid, email, role, department —
   identity stays in (Phase 115 opts it back in via setUser()); business
   data goes out.
   ======================================== */
const SCRUB_KEYS = [
    '_name', 'supplier', 'client', 'vendor', 'payee', 'bank', 'account',
    'iban', 'swift', 'routing', 'amount', 'total', 'price', 'cost', 'fee',
    'balance', 'payment', 'invoice', 'contract', 'proposal', 'tranche',
    'retention', 'item', 'address', 'phone', 'contact', 'justification',
    'remarks', 'description', 'notes', 'signature'
];

const SCRUB_KEY_RE = new RegExp(
    '(' + SCRUB_KEYS.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')',
    'i'
);

// Exposed so Phase 116's app/errors.js can read the same list across the
// classic-script / ES-module boundary (this file is a classic script and
// exports nothing).
window.CLMC_SCRUB_KEYS = SCRUB_KEYS;

/* ========================================
   SCRUB HELPERS
   ======================================== */

/**
 * Strip everything from the first `?` onward. Tolerates non-string input
 * by returning it unchanged.
 * D-03: Firestore's Listen channel carries gsessionid/SID auth tokens in
 * the query string — this is the single defence against that leaking into
 * a breadcrumb or event.
 * @param {*} url
 * @returns {*}
 */
function stripQuery(url) {
    if (typeof url !== 'string') return url;
    const idx = url.indexOf('?');
    return idx === -1 ? url : url.slice(0, idx);
}

/**
 * Walk a plain object/array, replacing the value of any key whose
 * lowercase form matches SCRUB_KEY_RE with the literal string
 * '[scrubbed]'. Bails out past depth 4, guards against circular
 * references with a WeakSet, leaves primitives untouched, never throws.
 * @param {*} value
 * @param {number} depth
 * @param {WeakSet} [seen]
 * @returns {*}
 */
function scrubObject(value, depth, seen) {
    try {
        if (value === null || typeof value !== 'object') return value;
        if (depth > 4) return value;
        seen = seen || new WeakSet();
        if (seen.has(value)) return value;
        seen.add(value);

        if (Array.isArray(value)) {
            return value.map(item => scrubObject(item, depth + 1, seen));
        }

        const out = {};
        for (const key of Object.keys(value)) {
            const raw = value[key];
            if (SCRUB_KEY_RE.test(key.toLowerCase())) {
                out[key] = '[scrubbed]';
            } else if (raw !== null && typeof raw === 'object') {
                out[key] = scrubObject(raw, depth + 1, seen);
            } else {
                out[key] = raw;
            }
        }
        return out;
    } catch (e) {
        return value;
    }
}

/* ========================================
   beforeBreadcrumb (D-01, D-03)
   Wrapped in try/catch — fails closed. Dropping a breadcrumb is always
   cheaper than leaking one.
   ======================================== */
function beforeBreadcrumb(breadcrumb) {
    try {
        if (breadcrumb.category === 'console') {
            // Sentry stows extra console arguments in breadcrumb.data.arguments
            // — that is where an Error, a supplier doc, or any future
            // console.error's second argument would land. Keep the message
            // (the `[Prefix] text` string carries the diagnostic value), drop
            // the data outright. One rule, no allowlist to maintain, safe
            // against console calls that do not exist yet. This is exactly
            // what degrades this project's own `[CLMC-DIAG] type`-style
            // console calls to a useful message-only breadcrumb while their
            // object payload (uid/role/status) is dropped for free.
            delete breadcrumb.data;
            return breadcrumb;
        }

        // fetch/xhr/dom/history breadcrumbs are kept (D-03) — "what was it
        // touching" is the single most useful fact on a Firestore error.
        // Query strings are stripped because Firestore's Listen channel
        // carries auth tokens there.
        if (breadcrumb.data) {
            if (typeof breadcrumb.data.url === 'string') {
                breadcrumb.data.url = stripQuery(breadcrumb.data.url);
            }
            if (typeof breadcrumb.data.from === 'string') {
                breadcrumb.data.from = stripQuery(breadcrumb.data.from);
            }
            if (typeof breadcrumb.data.to === 'string') {
                breadcrumb.data.to = stripQuery(breadcrumb.data.to);
            }
        }
        return breadcrumb;
    } catch (e) {
        return null;
    }
}

/* ========================================
   beforeSend (D-02, D-03, D-04)
   Wrapped in try/catch — fails closed. An unscrubbed event is exactly the
   outcome OBS-05 exists to prevent.
   ======================================== */
function beforeSend(event) {
    try {
        if (event.request) {
            event.request.url = stripQuery(event.request.url);
            delete event.request.query_string;
        }

        event.extra = scrubObject(event.extra, 0);

        // SDK-owned metadata carries no business data — scrubbing it would
        // destroy the SDK's own metadata that the dashboard needs.
        const RESERVED_CONTEXT_KEYS = ['browser', 'os', 'device', 'runtime', 'culture', 'trace', 'app', 'response'];
        if (event.contexts) {
            for (const key of Object.keys(event.contexts)) {
                if (RESERVED_CONTEXT_KEYS.includes(key)) continue;
                event.contexts[key] = scrubObject(event.contexts[key], 0);
            }
        }

        // event.tags / event.user are left untouched — set only by this
        // project's own code; identity attribution is Phase 115's concern
        // (D-04).
        return event;
    } catch (e) {
        return null;
    }
}

/* ========================================
   Sentry.init() — same commit as both scrub hooks above (OBS-05):
   events sent before a scrub hook exists are unrecoverable.
   ======================================== */
if (!window.Sentry || typeof window.Sentry.init !== 'function') {
    console.warn('[Sentry] SDK unavailable — error reporting disabled for this session');
} else {
    try {
        window.Sentry.init({
            dsn: SENTRY_DSN,
            release: SENTRY_RELEASE,
            environment: SENTRY_ENVIRONMENT,
            sendDefaultPii: false,
            beforeSend,
            beforeBreadcrumb
        });
    } catch (e) {
        console.error('[Sentry] init failed', e);
    }
}
