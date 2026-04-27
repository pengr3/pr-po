/**
 * FIRESTORE DATA IMPORT SCRIPT
 *
 * Imports clients, projects, and services from CSV files into Firestore.
 * Validates all data before writing — nothing is committed until everything passes.
 *
 * PREREQUISITES:
 *   - serviceAccountKey.json in project root (or GOOGLE_APPLICATION_CREDENTIALS env var)
 *   - Run `node scripts/wipe.js` first to clear test data
 *   - CSV files exported from Excel (UTF-8 encoding)
 *
 * USAGE:
 *   node scripts/import.js --clients clients.csv --projects projects.csv --services services.csv --dry-run
 *   node scripts/import.js --clients clients.csv --projects projects.csv --services services.csv
 *   node scripts/import.js --clients clients.csv          # Import only clients
 *   node scripts/import.js --projects projects.csv        # Import only projects (clients must exist in Firestore)
 *
 * OPTIONS:
 *   --clients <file>    CSV file for clients collection
 *   --projects <file>   CSV file for projects collection
 *   --services <file>   CSV file for services collection
 *   --dry-run           Validate and preview without writing to Firestore
 *   --help              Show this help message
 */

import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// =============================================
// Configuration
// =============================================

const PROJECT_ID = 'clmc-procurement';
const BATCH_SIZE = 500;
const CONFIRMATION_WORD = 'IMPORT';

// =============================================
// Firebase Admin initialization
// =============================================

function initFirebase() {
    const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
        || path.join(__dirname, '..', 'serviceAccountKey.json');

    if (!fs.existsSync(keyPath)) {
        console.error('[Import] ERROR: Service account key not found.');
        console.error(`[Import] Expected: ${keyPath}`);
        console.error('[Import] Download from: Firebase Console → Project Settings → Service Accounts → Generate new private key');
        process.exit(1);
    }

    const serviceAccount = require(keyPath);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: PROJECT_ID
    });

    return admin.firestore();
}

// =============================================
// Readline prompt helper
// =============================================

function prompt(question) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

// =============================================
// CLI argument parsing
// =============================================

function parseArgs(argv) {
    const args = {
        clients: null,
        projects: null,
        services: null,
        dryRun: false,
        skipDuplicates: false
    };

    if (argv.includes('--help')) {
        printHelp();
        process.exit(0);
    }

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--clients' && argv[i + 1]) {
            args.clients = argv[++i];
        } else if (arg === '--projects' && argv[i + 1]) {
            args.projects = argv[++i];
        } else if (arg === '--services' && argv[i + 1]) {
            args.services = argv[++i];
        } else if (arg === '--dry-run') {
            args.dryRun = true;
        } else if (arg === '--skip-duplicates') {
            args.skipDuplicates = true;
        }
    }

    if (!args.clients && !args.projects && !args.services) {
        console.error('[Import] ERROR: No CSV files specified.');
        console.error('[Import] Use --clients, --projects, or --services to specify CSV files.');
        console.error('[Import] Run with --help for usage information.');
        process.exit(1);
    }

    return args;
}

function printHelp() {
    console.log(`
FIRESTORE DATA IMPORT SCRIPT

Imports clients, projects, and services from CSV files into Firestore.
Validates all data before writing — nothing is committed until everything passes.

PREREQUISITES:
  - serviceAccountKey.json in project root (or GOOGLE_APPLICATION_CREDENTIALS env var)
  - Run \`node scripts/wipe.js\` first to clear test data
  - CSV files exported from Excel (UTF-8 encoding)

USAGE:
  node scripts/import.js --clients clients.csv --projects projects.csv --services services.csv --dry-run
  node scripts/import.js --clients clients.csv --projects projects.csv --services services.csv
  node scripts/import.js --clients clients.csv          # Import only clients
  node scripts/import.js --projects projects.csv        # Import only projects (clients must exist in Firestore)

OPTIONS:
  --clients <file>      CSV file for clients collection
  --projects <file>     CSV file for projects collection
  --services <file>     CSV file for services collection
  --dry-run             Validate and preview without writing to Firestore
  --skip-duplicates     Warn and skip records already in Firestore (default: abort)
  --help                Show this help message
`);
}

// =============================================
// CSV Parsing
// =============================================

/**
 * Normalize a CSV/TSV header string to a Firestore-friendly field name.
 * e.g. "Client Code" → "client_code", "Company Name" → "company_name"
 */
function normalizeHeader(header) {
    return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

/**
 * Parse a CSV or TSV file and return headers + row objects.
 * Auto-detects delimiter (tab vs comma) from the header line.
 * Handles multiline quoted fields (newlines inside quotes become spaces).
 * Each row object has normalized header keys and a _rowNum property.
 */
function parseCSV(filePath) {
    if (!fs.existsSync(filePath)) {
        console.error(`[Import] ERROR: File not found: ${filePath}`);
        process.exit(1);
    }

    let content = fs.readFileSync(filePath, 'utf8');

    // Strip BOM (common in Excel CSV exports)
    if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
    }

    // Auto-detect delimiter from header line
    const firstLineEnd = content.indexOf('\n');
    const firstLine = content.substring(0, firstLineEnd === -1 ? content.length : firstLineEnd);
    const delimiter = firstLine.includes('\t') ? '\t' : ',';

    // Parse all records character-by-character (handles multiline quoted fields)
    const records = [];
    let current = '';
    let inQuotes = false;
    let row = [];

    for (let i = 0; i < content.length; i++) {
        const ch = content[i];

        if (ch === '"') {
            if (inQuotes && content[i + 1] === '"') {
                current += '"'; // escaped quote
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === delimiter && !inQuotes) {
            row.push(current.trim());
            current = '';
        } else if (ch === '\r' && !inQuotes) {
            if (content[i + 1] === '\n') i++; // skip \r\n
            row.push(current.trim());
            current = '';
            if (row.some(v => v !== '')) {
                records.push(row);
            }
            row = [];
        } else if (ch === '\n' && !inQuotes) {
            row.push(current.trim());
            current = '';
            if (row.some(v => v !== '')) {
                records.push(row);
            }
            row = [];
        } else if ((ch === '\r' || ch === '\n') && inQuotes) {
            // Newline inside quoted field → collapse to space
            if (ch === '\r' && content[i + 1] === '\n') i++;
            current += ' ';
        } else {
            current += ch;
        }
    }

    // Flush last row
    row.push(current.trim());
    if (row.some(v => v !== '')) {
        records.push(row);
    }

    if (records.length < 2) {
        console.error(`[Import] ERROR: ${filePath} has no data rows (only header or empty).`);
        process.exit(1);
    }

    const headers = records[0].map(normalizeHeader);
    console.log(`[Import]   Format: ${delimiter === '\t' ? 'TSV (tab-separated)' : 'CSV (comma-separated)'}`);
    console.log(`[Import]   Columns: ${headers.join(', ')}`);

    const rows = [];
    for (let i = 1; i < records.length; i++) {
        const values = records[i];
        const rowObj = { _rowNum: i };
        headers.forEach((header, idx) => {
            rowObj[header] = values[idx] !== undefined ? values[idx] : '';
        });
        rows.push(rowObj);
    }

    return { headers, rows };
}

// =============================================
// Validation helpers
// =============================================

/**
 * Derive 'active' boolean from status-related CSV columns.
 * Checks 'status' first, then 'internal_status'. Defaults to true.
 */
function deriveActive(row) {
    if (row.status !== undefined && row.status !== '') {
        return row.status.toLowerCase() !== 'inactive';
    }
    if (row.internal_status !== undefined && row.internal_status !== '') {
        return row.internal_status.toLowerCase() !== 'inactive';
    }
    return true;
}

/**
 * Parse a numeric value from a CSV field. Returns null if empty or not a valid number.
 */
function parseNumber(value) {
    if (value === undefined || value === null || value.toString().trim() === '') return null;
    const cleaned = value.toString().replace(/[₱$€£¥,\s]/g, ''); // Remove currency symbols, commas, spaces
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
}

// =============================================
// Validate clients
// =============================================

function validateClients(rows) {
    const errors = [];
    const valid = [];
    const seenCodes = new Map(); // client_code → first rowNum

    for (const row of rows) {
        let rowErrors = false;

        // Check required fields
        if (!row.client_code || row.client_code.trim() === '') {
            errors.push(`Row ${row._rowNum}: missing required field 'client_code'`);
            rowErrors = true;
        }
        if (!row.client_name || row.client_name.trim() === '') {
            errors.push(`Row ${row._rowNum}: missing required field 'client_name' (Company Name)`);
            rowErrors = true;
        }

        // Check for duplicate client_code within CSV
        if (row.client_code && row.client_code.trim() !== '') {
            const code = row.client_code.trim();
            if (seenCodes.has(code)) {
                errors.push(`Row ${row._rowNum}: duplicate client_code '${code}' (first seen at row ${seenCodes.get(code)})`);
                rowErrors = true;
            } else {
                seenCodes.set(code, row._rowNum);
            }
        }

        if (!rowErrors) {
            valid.push({
                client_code: row.client_code.trim(),
                company_name: row.client_name.trim(),  // CSV "CLIENT NAME" → Firestore "company_name"
                contact_person: '',
                contact_details: '',
                created_at: new Date().toISOString()
            });
        }
    }

    return { valid, errors };
}

// =============================================
// Validate projects
// =============================================

function validateProjects(rows, validClientCodes) {
    const errors = [];
    const valid = [];
    const seenCodes = new Map(); // project_code → first rowNum

    for (const row of rows) {
        let rowErrors = false;

        // Check required fields
        if (!row.project_code || row.project_code.trim() === '') {
            errors.push(`Row ${row._rowNum}: missing required field 'project_code'`);
            rowErrors = true;
        }
        if (!row.project_name || row.project_name.trim() === '') {
            errors.push(`Row ${row._rowNum}: missing required field 'project_name'`);
            rowErrors = true;
        }
        if (!row.client_code || row.client_code.trim() === '') {
            errors.push(`Row ${row._rowNum}: missing required field 'client_code'`);
            rowErrors = true;
        }

        // Check for duplicate project_code within CSV
        if (row.project_code && row.project_code.trim() !== '') {
            const code = row.project_code.trim();
            if (seenCodes.has(code)) {
                errors.push(`Row ${row._rowNum}: duplicate project_code '${code}' (first seen at row ${seenCodes.get(code)})`);
                rowErrors = true;
            } else {
                seenCodes.set(code, row._rowNum);
            }
        }

        // Check client_code reference
        if (row.client_code && row.client_code.trim() !== '') {
            const clientCode = row.client_code.trim();
            if (!validClientCodes.has(clientCode)) {
                errors.push(`Row ${row._rowNum}: client_code '${clientCode}' not found in clients data`);
                rowErrors = true;
            }
        }

        if (!rowErrors) {
            const active = deriveActive(row);
            valid.push({
                project_code: row.project_code.trim(),
                project_name: row.project_name.trim(),
                client_id: '',  // placeholder — filled during write phase after clients are imported
                client_code: row.client_code.trim(),
                client_name: row.client_name ? row.client_name.trim() : '',
                internal_status: row.proposal_status_internal ? row.proposal_status_internal.trim() : '',
                project_status: row.project_status ? row.project_status.trim() : 'Ongoing',
                budget: parseNumber(row.budget),
                expense: parseNumber(row.expense),
                location: row.location ? row.location.trim() || null : null,
                remarks: row.remarks ? row.remarks.trim() : '',
                date_started: row.date_started ? row.date_started.trim() : '',
                date_completed: row.date_completed ? row.date_completed.trim() : '',
                personnel_user_ids: [],
                personnel_names: [],
                personnel_user_id: null,
                personnel_name: null,
                personnel: null,
                active: active,
                created_at: new Date().toISOString()
            });
        }
    }

    return { valid, errors };
}

// =============================================
// Validate services
// =============================================

function validateServices(rows, validClientCodes) {
    const errors = [];
    const valid = [];
    const seenCodes = new Map(); // service_code → first rowNum

    // Services CSV uses same headers as projects:
    // PROJECT CODE → service_code, PROJECT NAME → service_name
    for (const row of rows) {
        let rowErrors = false;

        // Check required fields (mapped from project columns)
        if (!row.project_code || row.project_code.trim() === '') {
            errors.push(`Row ${row._rowNum}: missing required field 'project_code' (used as service_code)`);
            rowErrors = true;
        }
        if (!row.project_name || row.project_name.trim() === '') {
            errors.push(`Row ${row._rowNum}: missing required field 'project_name' (used as service_name)`);
            rowErrors = true;
        }
        if (!row.client_code || row.client_code.trim() === '') {
            errors.push(`Row ${row._rowNum}: missing required field 'client_code'`);
            rowErrors = true;
        }

        // Check for duplicate service_code within CSV
        if (row.project_code && row.project_code.trim() !== '') {
            const code = row.project_code.trim();
            if (seenCodes.has(code)) {
                errors.push(`Row ${row._rowNum}: duplicate service code '${code}' (first seen at row ${seenCodes.get(code)})`);
                rowErrors = true;
            } else {
                seenCodes.set(code, row._rowNum);
            }
        }

        // Check client_code reference
        if (row.client_code && row.client_code.trim() !== '') {
            const clientCode = row.client_code.trim();
            if (!validClientCodes.has(clientCode)) {
                errors.push(`Row ${row._rowNum}: client_code '${clientCode}' not found in clients data`);
                rowErrors = true;
            }
        }

        if (!rowErrors) {
            const active = deriveActive(row);
            valid.push({
                service_code: row.project_code.trim(),   // PROJECT CODE → service_code
                service_name: row.project_name.trim(),   // PROJECT NAME → service_name
                service_type: row.service_type ? row.service_type.trim().toLowerCase() : 'one-time',
                client_id: '',  // placeholder — filled during write phase
                client_code: row.client_code.trim(),
                client_name: row.client_name ? row.client_name.trim() : '',
                internal_status: 'Ready to Submit',
                date_of_proposal_sent: row.date_of_proposal_sent ? row.date_of_proposal_sent.trim() : '',
                project_status: row.project_status ? row.project_status.trim() : 'Ongoing',
                budget: parseNumber(row.budget),
                expense: parseNumber(row.expense),
                location: row.location ? row.location.trim() || null : null,
                remarks: row.remarks ? row.remarks.trim() : '',
                date_started: row.date_started ? row.date_started.trim() : '',
                date_completed: row.date_completed ? row.date_completed.trim() : '',
                personnel_user_ids: [],
                personnel_names: [],
                personnel_user_id: null,
                personnel_name: null,
                personnel: null,
                active: active,
                created_at: new Date().toISOString()
            });
        }
    }

    return { valid, errors };
}

// =============================================
// Firestore duplicate check
// =============================================

/**
 * Check if any of the given codes already exist in a Firestore collection.
 * Returns an array of codes that already exist.
 */
async function checkFirestoreDuplicates(db, collectionName, codeField, codes) {
    const snapshot = await db.collection(collectionName).get();
    const existingCodes = new Set();
    snapshot.forEach(doc => {
        const val = doc.data()[codeField];
        if (val) existingCodes.add(val);
    });

    return codes.filter(code => existingCodes.has(code));
}

// =============================================
// Client ID resolution
// =============================================

/**
 * Build a Map of client_code → Firestore doc ID from the clients collection.
 */
async function buildClientCodeToIdMap(db) {
    const snapshot = await db.collection('clients').get();
    const map = new Map();
    snapshot.forEach(doc => {
        const clientCode = doc.data().client_code;
        if (clientCode) {
            map.set(clientCode, doc.id);
        }
    });
    return map;
}

// =============================================
// Batched write helper
// =============================================

/**
 * Write records to Firestore in batches of BATCH_SIZE.
 * Optionally resolves client_id from clientCodeToIdMap before writing.
 */
async function batchWrite(db, collectionName, records, clientCodeToIdMap = null) {
    let written = 0;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = db.batch();
        const chunk = records.slice(i, i + BATCH_SIZE);

        for (const record of chunk) {
            const ref = db.collection(collectionName).doc();
            const data = { ...record };

            // Resolve client_id if a map is provided
            if (clientCodeToIdMap !== null) {
                const clientId = clientCodeToIdMap.get(data.client_code);
                if (!clientId) {
                    console.error(`[Import] ERROR: Cannot resolve client_id for client_code '${data.client_code}'. Aborting.`);
                    process.exit(1);
                }
                data.client_id = clientId;
            }

            batch.set(ref, data);
        }

        await batch.commit();
        written += chunk.length;
    }
    return written;
}

// =============================================
// Output formatting
// =============================================

function printSummary(args, clientRecords, projectRecords, serviceRecords) {
    console.log('');
    console.log('═══════════════════════════════════════════════');
    console.log('  DRY RUN — Import Preview (clmc-procurement)');
    console.log('═══════════════════════════════════════════════');
    console.log('');

    let total = 0;

    if (args.clients && clientRecords) {
        const sample = clientRecords.slice(0, 3);
        console.log(`Clients (from ${path.basename(args.clients)}):`);
        console.log(`  Records to import: ${clientRecords.length}`);
        if (sample.length > 0) {
            console.log('  Sample (first 3):');
            sample.forEach((r, idx) => {
                console.log(`    ${idx + 1}. ${r.client_code} — ${r.company_name}`);
            });
        }
        total += clientRecords.length;
        console.log('');
    }

    if (args.projects && projectRecords) {
        const sample = projectRecords.slice(0, 3);
        console.log(`Projects (from ${path.basename(args.projects)}):`);
        console.log(`  Records to import: ${projectRecords.length}`);
        if (sample.length > 0) {
            console.log('  Sample (first 3):');
            sample.forEach((r, idx) => {
                console.log(`    ${idx + 1}. ${r.project_code} — ${r.project_name} (client: ${r.client_code})`);
            });
        }
        total += projectRecords.length;
        console.log('');
    }

    if (args.services && serviceRecords) {
        const sample = serviceRecords.slice(0, 3);
        console.log(`Services (from ${path.basename(args.services)}):`);
        console.log(`  Records to import: ${serviceRecords.length}`);
        if (sample.length > 0) {
            console.log('  Sample (first 3):');
            sample.forEach((r, idx) => {
                console.log(`    ${idx + 1}. ${r.service_code} — ${r.service_name} (client: ${r.client_code})`);
            });
        }
        total += serviceRecords.length;
        console.log('');
    }

    const collectionCount = [args.clients, args.projects, args.services].filter(Boolean).length;
    console.log(`Total: ${total} records across ${collectionCount} collection${collectionCount !== 1 ? 's' : ''}`);
    console.log('');
}

function printValidationErrors(allErrors) {
    console.log('');
    console.log('═══════════════════════════════════════════════');
    console.log('  VALIDATION FAILED');
    console.log('═══════════════════════════════════════════════');
    console.log('');

    for (const [source, errors] of Object.entries(allErrors)) {
        if (errors.length > 0) {
            console.log(`Errors in ${source}:`);
            errors.forEach(err => console.log(`  ${err}`));
            console.log('');
        }
    }

    const totalErrors = Object.values(allErrors).reduce((sum, errs) => sum + errs.length, 0);
    console.log(`${totalErrors} error(s) found. No data was written to Firestore.`);
}

// =============================================
// Main entry point
// =============================================

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const db = initFirebase();

    console.log(`[Import] Starting import for project: ${PROJECT_ID}`);
    if (args.dryRun) {
        console.log('[Import] Mode: DRY RUN (no data will be written)');
    } else {
        console.log('[Import] Mode: LIVE IMPORT');
    }
    console.log('');

    // -----------------------------------------------
    // Phase 1: Parse CSV files
    // -----------------------------------------------

    let clientRows = null;
    let projectRows = null;
    let serviceRows = null;

    if (args.clients) {
        console.log(`[Import] Parsing ${args.clients}...`);
        const parsed = parseCSV(args.clients);
        clientRows = parsed.rows;
        console.log(`[Import]   ${clientRows.length} data rows found`);
    }

    if (args.projects) {
        console.log(`[Import] Parsing ${args.projects}...`);
        const parsed = parseCSV(args.projects);
        projectRows = parsed.rows;
        console.log(`[Import]   ${projectRows.length} data rows found`);
    }

    if (args.services) {
        console.log(`[Import] Parsing ${args.services}...`);
        const parsed = parseCSV(args.services);
        serviceRows = parsed.rows;
        console.log(`[Import]   ${serviceRows.length} data rows found`);
    }

    console.log('');

    // -----------------------------------------------
    // Phase 2 & 3: Validate + cross-validate
    // -----------------------------------------------

    // Build validClientCodes Set = codes from CSV + codes already in Firestore
    const validClientCodes = new Set();

    if (clientRows) {
        // Add client codes from CSV
        for (const row of clientRows) {
            if (row.client_code && row.client_code.trim()) {
                validClientCodes.add(row.client_code.trim());
            }
        }
    }

    // Always fetch existing client codes from Firestore for cross-validation
    // (needed when importing projects/services without a clients CSV)
    console.log('[Import] Fetching existing client codes from Firestore...');
    try {
        const clientsSnapshot = await db.collection('clients').get();
        clientsSnapshot.forEach(doc => {
            const code = doc.data().client_code;
            if (code) validClientCodes.add(code);
        });
        console.log(`[Import]   ${clientsSnapshot.size} existing client(s) in Firestore`);
    } catch (err) {
        console.error(`[Import] ERROR: Could not fetch clients from Firestore: ${err.message}`);
        process.exit(1);
    }
    console.log('');

    // Run validation for each provided collection
    let clientRecords = null;
    let projectRecords = null;
    let serviceRecords = null;

    const allErrors = {};

    if (clientRows) {
        console.log('[Import] Validating clients...');
        const result = validateClients(clientRows);
        clientRecords = result.valid;
        if (result.errors.length > 0) {
            allErrors[path.basename(args.clients)] = result.errors;
        }
        console.log(`[Import]   ${clientRecords.length} valid, ${result.errors.length} errors`);
    }

    if (projectRows) {
        console.log('[Import] Validating projects...');
        const result = validateProjects(projectRows, validClientCodes);
        projectRecords = result.valid;
        if (result.errors.length > 0) {
            allErrors[path.basename(args.projects)] = result.errors;
        }
        console.log(`[Import]   ${projectRecords.length} valid, ${result.errors.length} errors`);
    }

    if (serviceRows) {
        console.log('[Import] Validating services...');
        const result = validateServices(serviceRows, validClientCodes);
        serviceRecords = result.valid;
        if (result.errors.length > 0) {
            allErrors[path.basename(args.services)] = result.errors;
        }
        console.log(`[Import]   ${serviceRecords.length} valid, ${result.errors.length} errors`);
    }

    console.log('');

    // -----------------------------------------------
    // Phase 4: Check Firestore for duplicate codes
    // -----------------------------------------------

    console.log('[Import] Checking Firestore for duplicate codes...');

    if (clientRecords && clientRecords.length > 0) {
        const codes = clientRecords.map(r => r.client_code);
        const dupes = await checkFirestoreDuplicates(db, 'clients', 'client_code', codes);
        if (dupes.length > 0) {
            if (args.skipDuplicates) {
                console.log(`[Import]   clients: ${dupes.length} duplicate(s) SKIPPED: ${dupes.join(', ')}`);
                clientRecords = clientRecords.filter(r => !dupes.includes(r.client_code));
            } else {
                const key = args.clients ? path.basename(args.clients) : 'clients';
                allErrors[key] = allErrors[key] || [];
                allErrors[key].push(`Firestore already contains clients with client_code: ${dupes.join(', ')}`);
                console.log(`[Import]   clients: ${dupes.length} duplicate(s) found in Firestore`);
            }
        } else {
            console.log(`[Import]   clients: no duplicates`);
        }
    }

    if (projectRecords && projectRecords.length > 0) {
        const codes = projectRecords.map(r => r.project_code);
        const dupes = await checkFirestoreDuplicates(db, 'projects', 'project_code', codes);
        if (dupes.length > 0) {
            if (args.skipDuplicates) {
                console.log(`[Import]   projects: ${dupes.length} duplicate(s) SKIPPED: ${dupes.join(', ')}`);
                projectRecords = projectRecords.filter(r => !dupes.includes(r.project_code));
            } else {
                const key = args.projects ? path.basename(args.projects) : 'projects';
                allErrors[key] = allErrors[key] || [];
                allErrors[key].push(`Firestore already contains projects with project_code: ${dupes.join(', ')}`);
                console.log(`[Import]   projects: ${dupes.length} duplicate(s) found in Firestore`);
            }
        } else {
            console.log(`[Import]   projects: no duplicates`);
        }
    }

    if (serviceRecords && serviceRecords.length > 0) {
        const codes = serviceRecords.map(r => r.service_code);
        const dupes = await checkFirestoreDuplicates(db, 'services', 'service_code', codes);
        if (dupes.length > 0) {
            if (args.skipDuplicates) {
                console.log(`[Import]   services: ${dupes.length} duplicate(s) SKIPPED: ${dupes.join(', ')}`);
                serviceRecords = serviceRecords.filter(r => !dupes.includes(r.service_code));
            } else {
                const key = args.services ? path.basename(args.services) : 'services';
                allErrors[key] = allErrors[key] || [];
                allErrors[key].push(`Firestore already contains services with service_code: ${dupes.join(', ')}`);
                console.log(`[Import]   services: ${dupes.length} duplicate(s) found in Firestore`);
            }
        } else {
            console.log(`[Import]   services: no duplicates`);
        }
    }

    console.log('');

    // -----------------------------------------------
    // Phase 5: Fail if any errors
    // -----------------------------------------------

    const hasErrors = Object.values(allErrors).some(errs => errs.length > 0);
    if (hasErrors) {
        printValidationErrors(allErrors);
        process.exit(1);
    }

    // -----------------------------------------------
    // Phase 6: Dry-run output OR confirmation + write
    // -----------------------------------------------

    printSummary(args, clientRecords, projectRecords, serviceRecords);

    if (args.dryRun) {
        console.log('✓ All validation passed. Run without --dry-run to import.');
        process.exit(0);
    }

    // Live import: confirmation gate
    const answer = await prompt(`Type "${CONFIRMATION_WORD}" to confirm, or press Ctrl-C to abort:\n> `);

    if (answer !== CONFIRMATION_WORD) {
        console.log('Aborted. No data was written.');
        process.exit(0);
    }

    console.log('');
    console.log('[Import] Starting import...');

    let clientsWritten = 0;
    let projectsWritten = 0;
    let servicesWritten = 0;

    // Write clients first
    if (clientRecords && clientRecords.length > 0) {
        console.log(`[Import] Writing ${clientRecords.length} client(s)...`);
        clientsWritten = await batchWrite(db, 'clients', clientRecords, null);
        console.log(`[Import]   ${clientsWritten} client(s) written`);
    }

    // Build client_code → doc.id map (after clients are committed)
    let clientCodeToIdMap = new Map();
    if ((projectRecords && projectRecords.length > 0) || (serviceRecords && serviceRecords.length > 0)) {
        console.log('[Import] Resolving client IDs...');
        clientCodeToIdMap = await buildClientCodeToIdMap(db);
        console.log(`[Import]   ${clientCodeToIdMap.size} client(s) mapped`);
    }

    // Write projects
    if (projectRecords && projectRecords.length > 0) {
        console.log(`[Import] Writing ${projectRecords.length} project(s)...`);
        projectsWritten = await batchWrite(db, 'projects', projectRecords, clientCodeToIdMap);
        console.log(`[Import]   ${projectsWritten} project(s) written`);
    }

    // Write services
    if (serviceRecords && serviceRecords.length > 0) {
        console.log(`[Import] Writing ${serviceRecords.length} service(s)...`);
        servicesWritten = await batchWrite(db, 'services', serviceRecords, clientCodeToIdMap);
        console.log(`[Import]   ${servicesWritten} service(s) written`);
    }

    const totalWritten = clientsWritten + projectsWritten + servicesWritten;
    console.log('');
    console.log('Import complete:');
    if (args.clients) console.log(`  Clients: ${clientsWritten} records written`);
    if (args.projects) console.log(`  Projects: ${projectsWritten} records written`);
    if (args.services) console.log(`  Services: ${servicesWritten} records written`);
    console.log(`  Total: ${totalWritten} records written to Firestore`);

    process.exit(0);
}

main().catch(err => {
    console.error('[Import] Fatal error:', err.message);
    process.exit(1);
});
