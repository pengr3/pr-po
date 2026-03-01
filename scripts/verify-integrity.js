#!/usr/bin/env node
/**
 * FIRESTORE DATA INTEGRITY VERIFICATION SCRIPT
 *
 * Checks all Firestore collections for referential integrity violations
 * and schema inconsistencies. Used before data migrations to understand
 * current data state, and after imports to validate correctness.
 *
 * USAGE:
 *   node scripts/verify-integrity.js
 *   node scripts/verify-integrity.js --json
 *
 * PREREQUISITES:
 *   - Firebase Admin SDK: npm install firebase-admin
 *   - Service account key file at ./serviceAccountKey.json
 *     OR set GOOGLE_APPLICATION_CREDENTIALS env var to key file path
 *
 * EXIT CODES:
 *   0 - No errors (warnings and info are OK)
 *   1 - One or more referential integrity errors found
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const path = require('path');

// ---------------------------------------------------------------------------
// CLI flags — parse FIRST so --help works without credentials
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const JSON_MODE = args.includes('--json');
const SHOW_HELP  = args.includes('--help') || args.includes('-h');

if (SHOW_HELP) {
    console.log(`
verify-integrity.js — Firestore data integrity check for clmc-procurement

USAGE:
  node scripts/verify-integrity.js [--json]

OPTIONS:
  --json    Output results as JSON instead of human-readable text
  --help    Show this help message

PREREQUISITES:
  npm install firebase-admin
  Place serviceAccountKey.json in project root, OR set
  GOOGLE_APPLICATION_CREDENTIALS env var to the key file path.

EXIT CODES:
  0  No errors (warnings and info are acceptable)
  1  One or more referential integrity errors found
`);
    process.exit(0);
}

// ---------------------------------------------------------------------------
// Firebase Admin SDK initialisation
// ---------------------------------------------------------------------------

let admin;
try {
    admin = require('firebase-admin');
} catch (err) {
    console.error('ERROR: firebase-admin package not found.');
    console.error('       Run: npm install firebase-admin');
    process.exit(1);
}

// Resolve path to project root (scripts/ is one level below root)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : path.join(projectRoot, 'serviceAccountKey.json');

let serviceAccount;
try {
    serviceAccount = require(keyPath);
} catch (err) {
    console.error(`ERROR: Service account key not found at: ${keyPath}`);
    console.error('       Download from Firebase Console > Project Settings > Service Accounts');
    console.error('       Or set GOOGLE_APPLICATION_CREDENTIALS env var to the key file path');
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'clmc-procurement'
});

const db = admin.firestore();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLLECTIONS = [
    'mrfs',
    'prs',
    'pos',
    'transport_requests',
    'suppliers',
    'projects',
    'services',
    'users',
    'clients',
    'role_templates',
    'invitation_codes',
    'deleted_mrfs',
    'deleted_users'
];

const VALID_MRF_STATUSES            = new Set(['Pending', 'Approved', 'Rejected']);
const VALID_FINANCE_STATUSES        = new Set(['Pending', 'Approved', 'Rejected']);
const VALID_PO_STATUSES             = new Set(['Pending Procurement', 'Procuring', 'Procured', 'Delivered']);
const VALID_PROJECT_SERVICE_STATUSES = new Set(['active', 'inactive']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch all documents from a Firestore collection.
 * Returns { docs, count, error }
 */
async function fetchCollection(name) {
    try {
        const snapshot = await db.collection(name).get();
        const docs = [];
        snapshot.forEach(doc => docs.push({ _id: doc.id, ...doc.data() }));
        return { docs, count: docs.length, error: null };
    } catch (err) {
        return { docs: [], count: 0, error: err.message };
    }
}

/**
 * Try JSON.parse; return { ok: boolean }
 */
function tryParse(str) {
    try {
        JSON.parse(str);
        return { ok: true };
    } catch {
        return { ok: false };
    }
}

// ---------------------------------------------------------------------------
// Main verification logic
// ---------------------------------------------------------------------------

async function runVerification() {
    const results = {
        collections: {},
        errors:   [],   // referential integrity violations
        warnings: [],   // schema inconsistencies
        info:     [],   // orphan / informational
        summary:  {
            errors:       0,
            warnings:     0,
            info:         0,
            fetchErrors:  [],
            status:       'ALL CLEAR'
        }
    };

    // -----------------------------------------------------------------------
    // Step 1: Load all collections
    // -----------------------------------------------------------------------

    const data = {};

    for (const name of COLLECTIONS) {
        const result = await fetchCollection(name);
        data[name] = result.docs;
        results.collections[name] = result.count;
        if (result.error) {
            results.summary.fetchErrors.push(
                `Could not fetch collection '${name}': ${result.error}`
            );
        }
    }

    // -----------------------------------------------------------------------
    // Step 2: Build lookup maps
    // -----------------------------------------------------------------------

    // Include deleted_mrfs so refs to them are not reported as false positives
    const mrfIds = new Set([
        ...data.mrfs.map(d => d.mrf_id).filter(Boolean),
        ...data.deleted_mrfs.map(d => d.mrf_id).filter(Boolean)
    ]);

    const prIds         = new Set(data.prs.map(d => d.pr_id).filter(Boolean));
    const supplierNames = new Set(data.suppliers.map(d => d.supplier_name).filter(Boolean));
    const projectCodes  = new Set(data.projects.map(d => d.project_code).filter(Boolean));
    const serviceCodes  = new Set(data.services.map(d => d.service_code).filter(Boolean));

    // mrf_id → [pr_ids] — used for orphan detection
    const mrfToPrs = {};
    for (const pr of data.prs) {
        if (pr.mrf_id) {
            if (!mrfToPrs[pr.mrf_id]) mrfToPrs[pr.mrf_id] = [];
            mrfToPrs[pr.mrf_id].push(pr.pr_id);
        }
    }

    // pr_id → [po_ids] — used for orphan detection
    const prToPos = {};
    for (const po of data.pos) {
        if (po.pr_id) {
            if (!prToPos[po.pr_id]) prToPos[po.pr_id] = [];
            prToPos[po.pr_id].push(po.po_id);
        }
    }

    // -----------------------------------------------------------------------
    // Step 3: Referential integrity checks (ERRORS)
    // -----------------------------------------------------------------------

    // PRs referencing nonexistent MRFs
    for (const pr of data.prs) {
        const id = pr.pr_id || pr._id;
        if (pr.mrf_id && !mrfIds.has(pr.mrf_id)) {
            results.errors.push(
                `PR ${id} references MRF ${pr.mrf_id} which does not exist`
            );
        }
    }

    // POs referencing nonexistent PRs or MRFs
    for (const po of data.pos) {
        const id = po.po_id || po._id;
        if (po.pr_id && !prIds.has(po.pr_id)) {
            results.errors.push(
                `PO ${id} references PR ${po.pr_id} which does not exist`
            );
        }
        if (po.mrf_id && !mrfIds.has(po.mrf_id)) {
            results.errors.push(
                `PO ${id} references MRF ${po.mrf_id} which does not exist`
            );
        }
    }

    // TRs referencing nonexistent MRFs
    for (const tr of data.transport_requests) {
        const id = tr.tr_id || tr._id;
        if (tr.mrf_id && !mrfIds.has(tr.mrf_id)) {
            results.errors.push(
                `TR ${id} references MRF ${tr.mrf_id} which does not exist`
            );
        }
    }

    // Supplier references — WARNING (supplier may have been intentionally deleted)
    for (const pr of data.prs) {
        const id = pr.pr_id || pr._id;
        if (pr.supplier_name && !supplierNames.has(pr.supplier_name)) {
            results.warnings.push(
                `PR ${id} references supplier '${pr.supplier_name}' which is not in the suppliers collection`
            );
        }
    }
    for (const po of data.pos) {
        const id = po.po_id || po._id;
        if (po.supplier_name && !supplierNames.has(po.supplier_name)) {
            results.warnings.push(
                `PO ${id} references supplier '${po.supplier_name}' which is not in the suppliers collection`
            );
        }
    }
    for (const tr of data.transport_requests) {
        const id = tr.tr_id || tr._id;
        if (tr.supplier_name && !supplierNames.has(tr.supplier_name)) {
            results.warnings.push(
                `TR ${id} references supplier '${tr.supplier_name}' which is not in the suppliers collection`
            );
        }
    }

    // MRF project_code / service_code references — WARNING (legacy data may not have these)
    for (const mrf of data.mrfs) {
        const id = mrf.mrf_id || mrf._id;
        if (mrf.project_code && !projectCodes.has(mrf.project_code)) {
            results.warnings.push(
                `MRF ${id} references project_code '${mrf.project_code}' which does not exist in projects`
            );
        }
        if (mrf.service_code && !serviceCodes.has(mrf.service_code)) {
            results.warnings.push(
                `MRF ${id} references service_code '${mrf.service_code}' which does not exist in services`
            );
        }
    }

    // -----------------------------------------------------------------------
    // Step 4: Schema consistency checks (WARNINGS)
    // -----------------------------------------------------------------------

    // MRFs
    for (const mrf of data.mrfs) {
        const id = mrf.mrf_id || mrf._id;
        for (const field of ['mrf_id', 'status', 'items_json']) {
            if (mrf[field] === undefined || mrf[field] === null || mrf[field] === '') {
                results.warnings.push(`MRF ${id} missing required field: ${field}`);
            }
        }
        if (mrf.status && !VALID_MRF_STATUSES.has(mrf.status)) {
            results.warnings.push(
                `MRF ${id} has invalid status: "${mrf.status}" (expected: Pending | Approved | Rejected)`
            );
        }
        if (mrf.items_json != null && !tryParse(mrf.items_json).ok) {
            results.warnings.push(`MRF ${id} has items_json that fails JSON.parse()`);
        }
    }

    // PRs
    for (const pr of data.prs) {
        const id = pr.pr_id || pr._id;
        for (const field of ['pr_id', 'mrf_id', 'supplier_name', 'finance_status', 'items_json']) {
            if (pr[field] === undefined || pr[field] === null || pr[field] === '') {
                results.warnings.push(`PR ${id} missing required field: ${field}`);
            }
        }
        if (pr.finance_status && !VALID_FINANCE_STATUSES.has(pr.finance_status)) {
            results.warnings.push(
                `PR ${id} has invalid finance_status: "${pr.finance_status}" (expected: Pending | Approved | Rejected)`
            );
        }
        if (pr.items_json != null && !tryParse(pr.items_json).ok) {
            results.warnings.push(`PR ${id} has items_json that fails JSON.parse()`);
        }
    }

    // POs
    for (const po of data.pos) {
        const id = po.po_id || po._id;
        for (const field of ['po_id', 'pr_id', 'mrf_id', 'procurement_status']) {
            if (po[field] === undefined || po[field] === null || po[field] === '') {
                results.warnings.push(`PO ${id} missing required field: ${field}`);
            }
        }
        if (po.procurement_status && !VALID_PO_STATUSES.has(po.procurement_status)) {
            results.warnings.push(
                `PO ${id} has invalid procurement_status: "${po.procurement_status}" ` +
                `(expected: Pending Procurement | Procuring | Procured | Delivered)`
            );
        }
    }

    // TRs
    for (const tr of data.transport_requests) {
        const id = tr.tr_id || tr._id;
        for (const field of ['tr_id', 'mrf_id', 'finance_status']) {
            if (tr[field] === undefined || tr[field] === null || tr[field] === '') {
                results.warnings.push(`TR ${id} missing required field: ${field}`);
            }
        }
        if (tr.finance_status && !VALID_FINANCE_STATUSES.has(tr.finance_status)) {
            results.warnings.push(
                `TR ${id} has invalid finance_status: "${tr.finance_status}" (expected: Pending | Approved | Rejected)`
            );
        }
    }

    // Projects
    for (const proj of data.projects) {
        const id = proj.project_code || proj._id;
        for (const field of ['project_code', 'project_name', 'status']) {
            if (proj[field] === undefined || proj[field] === null || proj[field] === '') {
                results.warnings.push(`Project ${id} missing required field: ${field}`);
            }
        }
        if (proj.status && !VALID_PROJECT_SERVICE_STATUSES.has(proj.status)) {
            results.warnings.push(
                `Project ${id} has invalid status: "${proj.status}" (expected: active | inactive)`
            );
        }
    }

    // Services
    for (const svc of data.services) {
        const id = svc.service_code || svc._id;
        for (const field of ['service_code', 'service_name', 'status']) {
            if (svc[field] === undefined || svc[field] === null || svc[field] === '') {
                results.warnings.push(`Service ${id} missing required field: ${field}`);
            }
        }
        if (svc.status && !VALID_PROJECT_SERVICE_STATUSES.has(svc.status)) {
            results.warnings.push(
                `Service ${id} has invalid status: "${svc.status}" (expected: active | inactive)`
            );
        }
    }

    // Users
    for (const user of data.users) {
        const id = user.email || user._id;
        if (!user.email) {
            results.warnings.push(`User ${user._id} is missing required field: email`);
        }
        if (!user.role) {
            results.warnings.push(`User ${id} is missing required field: role`);
        }
        if (!user.status) {
            results.warnings.push(`User ${id} is missing required field: status`);
        }
    }

    // -----------------------------------------------------------------------
    // Step 5: Orphan detection (INFO)
    // -----------------------------------------------------------------------

    // Approved MRFs with no PRs
    for (const mrf of data.mrfs) {
        const id = mrf.mrf_id || mrf._id;
        if (mrf.status === 'Approved') {
            const prs = mrfToPrs[id] || [];
            if (prs.length === 0) {
                results.info.push(`MRF ${id} is Approved but has no PRs generated`);
            }
        }
    }

    // Finance-Approved PRs with no POs
    for (const pr of data.prs) {
        const id = pr.pr_id || pr._id;
        if (pr.finance_status === 'Approved') {
            const pos = prToPos[id] || [];
            if (pos.length === 0) {
                results.info.push(`PR ${id} is finance-Approved but has no POs created`);
            }
        }
    }

    // -----------------------------------------------------------------------
    // Step 6: Compile summary
    // -----------------------------------------------------------------------

    results.summary.errors   = results.errors.length;
    results.summary.warnings = results.warnings.length;
    results.summary.info     = results.info.length;
    results.summary.status   = results.errors.length > 0
        ? 'ISSUES FOUND — review errors above'
        : 'ALL CLEAR — no integrity issues found';

    return results;
}

// ---------------------------------------------------------------------------
// Output formatters
// ---------------------------------------------------------------------------

function printHumanReadable(results) {
    const LINE = '='.repeat(50);
    const SUB  = '-'.repeat(50);

    console.log(`\nData Integrity Verification — clmc-procurement`);
    console.log(LINE);

    // Collections loaded
    console.log('\nCollections loaded:');
    for (const [name, count] of Object.entries(results.collections)) {
        console.log(`  ${name}: ${count} document${count !== 1 ? 's' : ''}`);
    }

    if (results.summary.fetchErrors.length > 0) {
        console.log('\nCollection fetch errors:');
        for (const e of results.summary.fetchErrors) {
            console.log(`  [ERROR] ${e}`);
        }
    }

    // Referential Integrity section
    console.log('\nReferential Integrity');
    console.log(SUB);
    if (results.errors.length === 0) {
        console.log('  No referential integrity errors.');
    } else {
        for (const msg of results.errors) {
            console.log(`  [ERROR] ${msg}`);
        }
    }
    // Supplier and project_code/service_code warnings belong under ref-integrity
    const refWarnings = results.warnings.filter(w =>
        w.includes('references supplier') ||
        w.includes('references project_code') ||
        w.includes('references service_code')
    );
    for (const msg of refWarnings) {
        console.log(`  [WARN]  ${msg}`);
    }

    // Schema Consistency section
    console.log('\nSchema Consistency');
    console.log(SUB);
    const schemaWarnings = results.warnings.filter(w =>
        !w.includes('references supplier') &&
        !w.includes('references project_code') &&
        !w.includes('references service_code')
    );
    if (schemaWarnings.length === 0) {
        console.log('  No schema consistency issues.');
    } else {
        for (const msg of schemaWarnings) {
            console.log(`  [WARN]  ${msg}`);
        }
    }

    // Orphan Detection section
    console.log('\nOrphan Detection');
    console.log(SUB);
    if (results.info.length === 0) {
        console.log('  No orphaned records detected.');
    } else {
        for (const msg of results.info) {
            console.log(`  [INFO]  ${msg}`);
        }
    }

    // Summary section
    console.log('\nSummary');
    console.log(SUB);
    console.log(`  Errors:   ${results.summary.errors} (referential integrity violations)`);
    console.log(`  Warnings: ${results.summary.warnings} (schema inconsistencies)`);
    console.log(`  Info:     ${results.summary.info} (informational / orphaned records)`);
    console.log('');
    console.log(`  Status: ${results.summary.status}`);
    console.log('');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

(async () => {
    try {
        const results = await runVerification();

        if (JSON_MODE) {
            console.log(JSON.stringify(results, null, 2));
        } else {
            printHumanReadable(results);
        }

        // Exit 1 if any referential integrity errors found
        process.exit(results.summary.errors > 0 ? 1 : 0);
    } catch (err) {
        if (JSON_MODE) {
            console.log(JSON.stringify({ fatal: err.message }, null, 2));
        } else {
            console.error('\nFATAL ERROR:', err.message);
            console.error(err.stack);
        }
        process.exit(1);
    }
})();
