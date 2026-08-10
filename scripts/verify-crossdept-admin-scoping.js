#!/usr/bin/env node
/**
 * CROSS-DEPARTMENT ADMIN SCOPING — LOGIC ASSERTION SCRIPT
 * Quick 260706-mco (mirrors quick 260627-kg0's assignment-driven model onto
 * operations_admin / services_admin).
 *
 * Executes the REAL source functions from app/utils.js and
 * app/views/procurement.js (extracted via text + brace-counting, since a
 * plain `import` is impossible — those modules reach the Firebase CDN) so
 * there is a single source of truth. No helper is re-implemented here.
 *
 * WHY EXTRACTION INSTEAD OF IMPORT:
 * app/utils.js and app/views/procurement.js import from ./firebase.js,
 * which pulls the Firebase CDN modules — not resolvable under plain Node.
 * Instead: read each file as text, locate the target function's
 * `function NAME(` declaration, brace-count from the first `{` after the
 * signature to the matching close, slice that text, strip a leading
 * `export `. This gives a standalone function-declaration string that is
 * `eval`'d to obtain a real, callable function object.
 *
 * MODULE-SCOPE CONST DEPENDENCY:
 * getAssignedProjectCodes / getAssignedServiceCodes reference a
 * module-scope role-list const declared OUTSIDE their bodies
 * (SCOPE_EXEMPT_ROLES before quick 260706-mco Task 2; PROJECT_SEE_ALL_ROLES /
 * SERVICE_SEE_ALL_ROLES after). Extracting only the function bodies would
 * throw ReferenceError on every call. To fix this name-agnostically (works
 * both before and after the Task 2 rename): scan app/utils.js for every
 * top-level `const <UPPER_SNAKE_CASE> = [ ... ];` array-literal declaration,
 * collect their source text, and eval ONE blob = (all collected consts) +
 * (the two extracted function declarations) in a single shared scope so the
 * functions close over the consts.
 *
 * PHASE 113 D-08 ADDITION — window._personnelAssignedCodes:
 * As of Phase 113, the two helpers ALSO read `window._personnelAssignedCodes`
 * (an object with `projects`/`services` string-array properties) instead of
 * the frozen `user.assigned_project_codes` / `user.assigned_service_codes`
 * fields on the stubbed user object. This is why the cache lives on `window`
 * rather than in module scope: it must be reachable from inside the
 * eval'd, extracted function bodies exactly the way `window.getCurrentUser`
 * already is. Each matrix case below sets `global.window._personnelAssignedCodes`
 * immediately before invoking the helpers, in place of the old mechanism of
 * setting `assigned_project_codes`/`assigned_service_codes` on the stub.
 *

 * USAGE:
 *   node scripts/verify-crossdept-admin-scoping.js
 *
 * EXIT CODES:
 *   0 - Full role x visibility matrix holds (all assertions passed)
 *   1 - One or more assertions failed (printed with a clear message)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

const UTILS_PATH = path.join(PROJECT_ROOT, 'app', 'utils.js');
const PROCUREMENT_PATH = path.join(PROJECT_ROOT, 'app', 'views', 'procurement.js');
const RULES_PATH = path.join(PROJECT_ROOT, 'firestore.rules');

const failures = [];

function assertEqual(actual, expected, message) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) {
        failures.push(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
    return ok;
}

// ---------------------------------------------------------------------------
// Extraction helpers — operate on raw source text, brace/bracket-counted.
// ---------------------------------------------------------------------------

/**
 * Scan `text` for every top-level `const <UPPER_SNAKE_CASE> = [ ... ];`
 * array-literal declaration and return their full source text (decl + `;`).
 * Name-agnostic: picks up SCOPE_EXEMPT_ROLES (pre-Task-2) or
 * PROJECT_SEE_ALL_ROLES / SERVICE_SEE_ALL_ROLES (post-Task-2) alike.
 */
function extractTopLevelConstArrays(text) {
    const results = [];
    const re = /^const\s+([A-Z][A-Z0-9_]*)\s*=\s*\[/gm;
    let m;
    while ((m = re.exec(text)) !== null) {
        const bracketStart = text.indexOf('[', m.index);
        let depth = 0;
        let endIdx = -1;
        for (let i = bracketStart; i < text.length; i++) {
            const ch = text[i];
            if (ch === '[') depth++;
            else if (ch === ']') {
                depth--;
                if (depth === 0) { endIdx = i; break; }
            }
        }
        if (endIdx === -1) {
            throw new Error(`Unbalanced [] while extracting const ${m[1]} from ${text === undefined ? '?' : 'source'}`);
        }
        let stop = endIdx + 1;
        if (text[stop] === ';') stop += 1;
        results.push({ name: m[1], text: text.slice(m.index, stop) });
    }
    return results;
}

/**
 * Locate `function <fnName>(` in `text`, brace-count from the first `{`
 * after the signature to the matching close, and return the full
 * declaration text (export prefix stripped).
 */
function extractFunctionSource(text, fnName) {
    const sigRe = new RegExp(`function\\s+${fnName}\\s*\\(`);
    const m = sigRe.exec(text);
    if (!m) {
        throw new Error(`Could not locate a "function ${fnName}(" declaration in source`);
    }
    let startIdx = m.index;
    const preceding = text.slice(Math.max(0, startIdx - 12), startIdx);
    const exportMatch = /export\s+$/.exec(preceding);
    if (exportMatch) startIdx -= exportMatch[0].length;

    const braceStart = text.indexOf('{', m.index);
    if (braceStart === -1) {
        throw new Error(`Could not locate opening brace for function ${fnName}`);
    }
    let depth = 0;
    let endIdx = -1;
    for (let i = braceStart; i < text.length; i++) {
        const ch = text[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) { endIdx = i; break; }
        }
    }
    if (endIdx === -1) {
        throw new Error(`Unbalanced {} while extracting function ${fnName}`);
    }
    let source = text.slice(startIdx, endIdx + 1);
    source = source.replace(/^export\s+/, '');
    return source;
}

/**
 * Build ONE eval blob = (every top-level UPPER_SNAKE_CASE const array in
 * utilsText) + (the extracted getAssignedProjectCodes / getAssignedServiceCodes
 * function declarations), eval it once in a shared function scope so the
 * functions close over the consts, and return the two real callables.
 */
function loadAssignedCodeHelpers(utilsText) {
    const constDecls = extractTopLevelConstArrays(utilsText);
    if (constDecls.length === 0) {
        throw new Error('Expected at least one top-level UPPER_SNAKE_CASE const array in app/utils.js (e.g. SCOPE_EXEMPT_ROLES / PROJECT_SEE_ALL_ROLES) — found none.');
    }
    const projFnSrc = extractFunctionSource(utilsText, 'getAssignedProjectCodes');
    const svcFnSrc = extractFunctionSource(utilsText, 'getAssignedServiceCodes');

    let capturedProjFn;
    let capturedSvcFn;
    const blob = [
        ...constDecls.map((c) => c.text),
        projFnSrc,
        svcFnSrc,
        'capturedProjFn = getAssignedProjectCodes;',
        'capturedSvcFn = getAssignedServiceCodes;'
    ].join('\n\n');

    // eslint-disable-next-line no-eval
    eval(blob);

    if (typeof capturedProjFn !== 'function' || typeof capturedSvcFn !== 'function') {
        throw new Error('Failed to capture getAssignedProjectCodes/getAssignedServiceCodes out of the eval scope.');
    }
    return { getAssignedProjectCodes: capturedProjFn, getAssignedServiceCodes: capturedSvcFn };
}

/**
 * isMrfInAssignedScope has no module-scope-const dependency (only reads
 * `window`) — extract and eval it standalone.
 */
function loadIsMrfInAssignedScope(procurementText) {
    const fnSrc = extractFunctionSource(procurementText, 'isMrfInAssignedScope');
    let captured;
    const blob = `${fnSrc}\ncaptured = isMrfInAssignedScope;`;
    // eslint-disable-next-line no-eval
    eval(blob);
    if (typeof captured !== 'function') {
        throw new Error('Failed to capture isMrfInAssignedScope out of the eval scope.');
    }
    return captured;
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

// Phase 113 D-08: stubs no longer carry assigned_project_codes/assigned_service_codes --
// those fields are frozen and deliberately no longer read by the repointed helpers. Only
// role/uid/all_projects/all_services remain (the helpers still read those).
const ROLE_STUBS = {
    operations_admin: { role: 'operations_admin', uid: 'u-opsadmin', all_projects: false },
    services_admin: { role: 'services_admin', uid: 'u-svcadmin', all_services: false },
    operations_user: { role: 'operations_user', uid: 'u-opsuser' },
    services_user: { role: 'services_user', uid: 'u-svcuser' },
    super_admin: { role: 'super_admin', uid: 'u-super' },
    finance: { role: 'finance', uid: 'u-finance' },
    procurement: { role: 'procurement', uid: 'u-procurement' }
};

const EXPECTED_SCOPES = {
    operations_admin: { projects: null, services: ['S1'] },
    services_admin: { projects: ['P1'], services: null },
    operations_user: { projects: ['P1'], services: ['S1'] },
    services_user: { projects: ['P1'], services: ['S1'] },
    super_admin: { projects: null, services: null },
    finance: { projects: null, services: null },
    procurement: { projects: null, services: null }
};

// Phase 113 D-08: the personnel-derived cache each role's stub is "populated" with for the
// matrix run below. For roles the helper short-circuits to null (before ever touching the
// cache), the values here are inert -- included anyway so isMrfInAssignedScope's Part-2 matrix
// (which DOES consult non-null scoped arrays) has consistent fixtures to work from.
const PERSONNEL_CACHE_BY_ROLE = {
    operations_admin: { projects: [], services: ['S1'] },
    services_admin: { projects: ['P1'], services: [] },
    operations_user: { projects: ['P1'], services: ['S1'] },
    services_user: { projects: ['P1'], services: ['S1'] },
    super_admin: { projects: [], services: [] },
    finance: { projects: [], services: [] },
    procurement: { projects: [], services: [] }
};

// department-keyed MRF fixtures; LEGACY has NO `department` field (legacy doc)
const MRF_SAMPLES = {
    P1: { department: 'projects', project_code: 'P1' },
    P9: { department: 'projects', project_code: 'P9' },
    codeless: { department: 'projects', project_code: '' },
    LEGACY: { project_code: 'PX' },
    S1: { department: 'services', service_code: 'S1' },
    S9: { department: 'services', service_code: 'S9' }
};

const MRF_KEYS = Object.keys(MRF_SAMPLES);

const EXPECTED_VISIBILITY = {
    operations_admin: { P1: true, P9: true, codeless: true, LEGACY: true, S1: true, S9: false },
    services_admin: { P1: true, P9: false, codeless: false, LEGACY: false, S1: true, S9: true },
    operations_user: { P1: true, P9: false, codeless: false, LEGACY: false, S1: true, S9: false },
    services_user: { P1: true, P9: false, codeless: false, LEGACY: false, S1: true, S9: false },
    super_admin: { P1: true, P9: true, codeless: true, LEGACY: true, S1: true, S9: true }
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
    const utilsText = fs.readFileSync(UTILS_PATH, 'utf8');
    const procurementText = fs.readFileSync(PROCUREMENT_PATH, 'utf8');
    const rulesText = fs.readFileSync(RULES_PATH, 'utf8');

    const { getAssignedProjectCodes, getAssignedServiceCodes } = loadAssignedCodeHelpers(utilsText);
    const isMrfInAssignedScope = loadIsMrfInAssignedScope(procurementText);

    global.window = global.window || {};

    // --- Part 1: getAssignedProjectCodes / getAssignedServiceCodes matrix ---
    console.log('=== Role x Scope-Helper Matrix ===');
    for (const roleName of Object.keys(ROLE_STUBS)) {
        const stub = ROLE_STUBS[roleName];
        global.window.getCurrentUser = () => stub;
        // Phase 113 D-08: populate the personnel-derived cache instead of setting
        // assigned_project_codes/assigned_service_codes on the stub.
        global.window._personnelAssignedCodes = PERSONNEL_CACHE_BY_ROLE[roleName];
        const projResult = getAssignedProjectCodes();
        const svcResult = getAssignedServiceCodes();
        const expected = EXPECTED_SCOPES[roleName];
        assertEqual(projResult, expected.projects, `[scope] ${roleName}.getAssignedProjectCodes()`);
        assertEqual(svcResult, expected.services, `[scope] ${roleName}.getAssignedServiceCodes()`);
        console.log(`  ${roleName.padEnd(18)} projects=${JSON.stringify(projResult).padEnd(14)} services=${JSON.stringify(svcResult)}`);
    }

    // --- Landmine assertions (explicit): role branch wins BEFORE the all_* flag is read ---
    {
        const stub = { role: 'operations_admin', all_projects: false };
        global.window.getCurrentUser = () => stub;
        global.window._personnelAssignedCodes = { projects: [], services: [] };
        assertEqual(getAssignedProjectCodes(), null, '[landmine] operations_admin with all_projects:false still returns projects=null');
    }
    {
        const stub = { role: 'services_admin', all_services: false };
        global.window.getCurrentUser = () => stub;
        global.window._personnelAssignedCodes = { projects: [], services: [] };
        assertEqual(getAssignedServiceCodes(), null, '[landmine] services_admin with all_services:false still returns services=null');
    }

    // --- Not-logged-in returns null in both (bonus coverage) ---
    {
        global.window.getCurrentUser = () => null;
        global.window._personnelAssignedCodes = undefined;
        assertEqual(getAssignedProjectCodes(), null, '[not-logged-in] getAssignedProjectCodes()');
        assertEqual(getAssignedServiceCodes(), null, '[not-logged-in] getAssignedServiceCodes()');
    }

    // --- Phase 113 D-08 fail-closed posture: an undefined cache must yield [] for a scoped
    // role, never null and never undefined. These prove the FAIL-CLOSED default the plan
    // requires -- a load-in-progress or a broken cache must never resolve to "see everything".
    {
        const stub = { role: 'services_user', uid: 'u-svcuser-failclosed' };
        global.window.getCurrentUser = () => stub;
        global.window._personnelAssignedCodes = undefined;
        assertEqual(getAssignedProjectCodes(), [], '[fail-closed] services_user projects with undefined cache returns []');
    }
    {
        const stub = { role: 'operations_user', uid: 'u-opsuser-failclosed' };
        global.window.getCurrentUser = () => stub;
        global.window._personnelAssignedCodes = undefined;
        assertEqual(getAssignedServiceCodes(), [], '[fail-closed] operations_user services with undefined cache returns []');
    }

    // --- Part 2: isMrfInAssignedScope matrix (wire the real helpers onto window) ---
    global.window.getAssignedProjectCodes = getAssignedProjectCodes;
    global.window.getAssignedServiceCodes = getAssignedServiceCodes;

    console.log('\n=== Role x MRF-Visibility Matrix ===');
    console.log(`  ${''.padEnd(18)}${MRF_KEYS.map((k) => k.padEnd(10)).join('')}`);
    for (const roleName of Object.keys(EXPECTED_VISIBILITY)) {
        const stub = ROLE_STUBS[roleName];
        global.window.getCurrentUser = () => stub;
        global.window._personnelAssignedCodes = PERSONNEL_CACHE_BY_ROLE[roleName];
        const row = [];
        for (const key of MRF_KEYS) {
            const mrf = MRF_SAMPLES[key];
            const actual = !!isMrfInAssignedScope(mrf);
            const expected = EXPECTED_VISIBILITY[roleName][key];
            assertEqual(actual, expected, `[visibility] ${roleName} x ${key}`);
            row.push(actual);
        }
        console.log(`  ${roleName.padEnd(18)}${row.map((v) => (v ? 'true' : 'false').padEnd(10)).join('')}`);
    }

    // --- Part 3: firestore.rules brace-balance guard (Task 4 cannot silently unbalance the file) ---
    const openBraces = (rulesText.match(/\{/g) || []).length;
    const closeBraces = (rulesText.match(/\}/g) || []).length;
    console.log('\n=== firestore.rules brace balance ===');
    console.log(`  { count = ${openBraces}, } count = ${closeBraces}`);
    if (openBraces !== closeBraces) {
        failures.push(`[rules] firestore.rules brace mismatch: { = ${openBraces}, } = ${closeBraces}`);
    }

    // --- Verdict ---
    if (failures.length > 0) {
        console.error('\nFAILURES:');
        for (const f of failures) console.error(`  - ${f}`);
        console.error(`\n${failures.length} assertion(s) failed.`);
        process.exitCode = 1;
        return;
    }

    console.log('\nAll assertions passed. Full role x visibility matrix holds.');
    process.exitCode = 0;
}

try {
    main();
} catch (err) {
    console.error('\nSCRIPT ERROR (extraction or setup failure — not a controlled assertion):');
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
}
