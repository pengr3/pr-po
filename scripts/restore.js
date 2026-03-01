/**
 * FIRESTORE RESTORE SCRIPT
 *
 * Re-imports JSON backup files (created by scripts/backup.js) into Firestore.
 * Uses Firebase Admin SDK — NOT the browser Firebase SDK.
 *
 * PREREQUISITES:
 *   1. Download service account key from Firebase Console:
 *      Firebase Console → Project Settings → Service Accounts → Generate new private key
 *   2. Save as serviceAccountKey.json in the project root (already .gitignored)
 *      OR set GOOGLE_APPLICATION_CREDENTIALS env var pointing to the key file
 *   3. Run: npm install (firebase-admin is listed in devDependencies)
 *
 * USAGE:
 *   node scripts/restore.js <backup-directory> [options]
 *
 *   Examples:
 *     node scripts/restore.js backups/2026-03-01T120000 --dry-run
 *     node scripts/restore.js backups/2026-03-01T120000
 *     node scripts/restore.js backups/2026-03-01T120000 --collections projects,services
 *
 * OPTIONS:
 *   --dry-run                  List what would be imported without writing
 *   --collections <list>       Comma-separated collection names to restore (default: all)
 *   --help, -h                 Show this help message
 *
 * JSON FORMAT CONTRACT (produced by backup.js):
 *   Regular collections: [{ "_id": "docId", ...fields }]
 *   Subcollections:      [{ "_id": "docId", "_parentId": "parentDocId", ...fields }]
 *   Timestamps:          { "__type": "timestamp", "value": "2026-03-01T12:00:00.000Z" }
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

// Maximum documents per Firestore batch write
const BATCH_SIZE = 500;

// Known subcollection file patterns: filename stem → { parent, child }
// These filenames are produced by backup.js and must match exactly.
const SUBCOLLECTION_MAP = {
    'projects_edit_history': { parent: 'projects', child: 'edit_history' },
    'services_edit_history': { parent: 'services', child: 'edit_history' }
};

// =============================================
// Firebase Admin initialization
// =============================================

function initFirebase() {
    const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, '..', 'serviceAccountKey.json');

    if (!fs.existsSync(keyPath)) {
        console.error('[Restore] ERROR: Service account key not found.');
        console.error(`[Restore] Expected: ${keyPath}`);
        console.error('[Restore] Download from: Firebase Console → Project Settings → Service Accounts → Generate new private key');
        console.error('[Restore] Or set GOOGLE_APPLICATION_CREDENTIALS env var to point to your key file.');
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
// Timestamp deserialization
// =============================================

/**
 * Recursively deserialize Timestamp markers back to Firestore Timestamps.
 * Reverses what backup.js serializeValue() does.
 *
 * @param {*} value - Any value from the JSON backup file
 * @returns {*} - Value with Timestamps restored
 */
function deserializeValue(value) {
    if (value === null || value === undefined) {
        return value;
    }

    // Timestamp marker: { __type: "timestamp", value: "ISO8601" }
    if (
        typeof value === 'object' &&
        !Array.isArray(value) &&
        value.__type === 'timestamp' &&
        typeof value.value === 'string'
    ) {
        return admin.firestore.Timestamp.fromDate(new Date(value.value));
    }

    // Array: recurse
    if (Array.isArray(value)) {
        return value.map(deserializeValue);
    }

    // Object: recurse into each field
    if (typeof value === 'object') {
        const result = {};
        for (const [k, v] of Object.entries(value)) {
            result[k] = deserializeValue(v);
        }
        return result;
    }

    // Primitive
    return value;
}

/**
 * Prepare a document record from the backup JSON for Firestore write.
 * Strips _id and _parentId meta-fields, deserializes Timestamps.
 *
 * @param {Object} record - Raw record from backup JSON
 * @returns {Object} - Clean data payload for Firestore set()
 */
function prepareDocData(record) {
    const data = {};
    for (const [k, v] of Object.entries(record)) {
        if (k === '_id' || k === '_parentId') continue;
        data[k] = deserializeValue(v);
    }
    return data;
}

// =============================================
// Batch write helper
// =============================================

/**
 * Write documents in batches of BATCH_SIZE (Firestore limit is 500 per batch).
 *
 * @param {Object} db - Firestore instance
 * @param {Array<{ref: Object, data: Object}>} writes
 * @returns {Promise<{written: number, failed: number, errors: string[]}>}
 */
async function writeBatches(db, writes) {
    let written = 0;
    let failed = 0;
    const errors = [];

    for (let i = 0; i < writes.length; i += BATCH_SIZE) {
        const chunk = writes.slice(i, i + BATCH_SIZE);
        const batch = db.batch();

        for (const { ref, data } of chunk) {
            batch.set(ref, data);
        }

        try {
            await batch.commit();
            written += chunk.length;
        } catch (err) {
            // If batch fails, report each document in the chunk as failed
            failed += chunk.length;
            errors.push(`Batch [${i}–${i + chunk.length - 1}]: ${err.message}`);
        }
    }

    return { written, failed, errors };
}

// =============================================
// File parsing
// =============================================

/**
 * Parse a backup JSON file. Returns { records, error }.
 */
function parseBackupFile(filePath) {
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const records = JSON.parse(raw);
        if (!Array.isArray(records)) {
            return { records: null, error: 'File does not contain a JSON array' };
        }
        return { records, error: null };
    } catch (err) {
        return { records: null, error: err.message };
    }
}

/**
 * Classify a JSON file as top-level collection or subcollection.
 *
 * @param {string} stem - File name without extension (e.g., "projects_edit_history")
 * @returns {{ type: 'subcollection', parent: string, child: string } | { type: 'collection', name: string }}
 */
function classifyFile(stem) {
    if (SUBCOLLECTION_MAP[stem]) {
        return { type: 'subcollection', ...SUBCOLLECTION_MAP[stem] };
    }
    return { type: 'collection', name: stem };
}

// =============================================
// User confirmation
// =============================================

/**
 * Prompt user to type "RESTORE" to confirm destructive operation.
 * Resolves to true if confirmed, false if not.
 */
function promptConfirmation(backupDir, totalDocs, fileCount) {
    return new Promise(resolve => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        console.log('');
        console.log('WARNING: This will overwrite existing documents in Firestore.');
        console.log(`Backup: ${backupDir} (${totalDocs} documents across ${fileCount} files)`);
        console.log('');

        rl.question('Type "RESTORE" to confirm: ', answer => {
            rl.close();
            resolve(answer.trim() === 'RESTORE');
        });
    });
}

// =============================================
// Main
// =============================================

async function main() {
    const args = process.argv.slice(2);

    // --help flag or no args
    if (args.includes('--help') || args.includes('-h') || args.length === 0) {
        console.log('Firestore Restore Script');
        console.log('');
        console.log('USAGE:');
        console.log('  node scripts/restore.js <backup-directory> [options]');
        console.log('');
        console.log('OPTIONS:');
        console.log('  --dry-run                  List what would be imported (no writes)');
        console.log('  --collections <list>       Comma-separated names to restore (default: all)');
        console.log('  --help, -h                 Show this help message');
        console.log('');
        console.log('EXAMPLES:');
        console.log('  node scripts/restore.js backups/2026-03-01T120000 --dry-run');
        console.log('  node scripts/restore.js backups/2026-03-01T120000');
        console.log('  node scripts/restore.js backups/2026-03-01T120000 --collections projects,services');
        console.log('');
        console.log('PREREQUISITES:');
        console.log('  Service account key at ./serviceAccountKey.json');
        console.log('  Or set GOOGLE_APPLICATION_CREDENTIALS env var');
        process.exit(0);
    }

    // Parse backup directory (first positional arg)
    const backupDir = path.resolve(args[0]);

    // Parse flags
    const isDryRun = args.includes('--dry-run');

    let collectionsFilter = null;
    const collectionsIdx = args.indexOf('--collections');
    if (collectionsIdx !== -1 && args[collectionsIdx + 1]) {
        collectionsFilter = args[collectionsIdx + 1].split(',').map(s => s.trim()).filter(Boolean);
    }

    // Validate backup directory
    if (!fs.existsSync(backupDir)) {
        console.error(`[Restore] ERROR: Backup directory not found: ${backupDir}`);
        process.exit(1);
    }

    const jsonFiles = fs.readdirSync(backupDir)
        .filter(f => f.endsWith('.json'))
        .sort();

    if (jsonFiles.length === 0) {
        console.error(`[Restore] ERROR: No JSON files found in: ${backupDir}`);
        process.exit(1);
    }

    // Apply collection filter if provided
    let filesToProcess = jsonFiles;
    if (collectionsFilter) {
        filesToProcess = jsonFiles.filter(f => {
            const stem = path.basename(f, '.json');
            const cls = classifyFile(stem);
            if (cls.type === 'subcollection') {
                return collectionsFilter.includes(cls.parent) || collectionsFilter.includes(`${cls.parent}_${cls.child}`);
            }
            return collectionsFilter.includes(cls.name);
        });

        if (filesToProcess.length === 0) {
            console.error(`[Restore] ERROR: No matching files for collections: ${collectionsFilter.join(', ')}`);
            process.exit(1);
        }
    }

    // Parse all files and count totals
    const fileData = [];
    let totalDocs = 0;
    let parseErrors = 0;

    for (const fileName of filesToProcess) {
        const filePath = path.join(backupDir, fileName);
        const stem = path.basename(fileName, '.json');
        const classification = classifyFile(stem);
        const { records, error } = parseBackupFile(filePath);

        if (error) {
            console.warn(`[Restore] WARNING: Skipping ${fileName} — parse error: ${error}`);
            parseErrors++;
            continue;
        }

        fileData.push({ fileName, stem, filePath, classification, records });
        totalDocs += records.length;
    }

    // Dry-run mode: list files and exit
    if (isDryRun) {
        console.log('DRY RUN — no data will be written');
        console.log('');

        for (const { fileName, records } of fileData) {
            console.log(`  ${fileName}: ${records.length} document${records.length !== 1 ? 's' : ''} would be restored`);
        }

        console.log('');
        console.log(`Total: ${totalDocs} documents across ${fileData.length} files`);

        if (parseErrors > 0) {
            console.warn(`\n[WARNING] ${parseErrors} file(s) could not be parsed and were skipped.`);
        }

        process.exit(0);
    }

    // Live restore: require confirmation
    const confirmed = await promptConfirmation(backupDir, totalDocs, fileData.length);
    if (!confirmed) {
        console.log('\n[Restore] Cancelled — no data was written.');
        process.exit(0);
    }

    console.log('');
    console.log(`Restoring from: ${backupDir}`);
    console.log('');

    const db = initFirebase();
    let grandTotalWritten = 0;
    let grandTotalFailed = 0;
    let hasError = false;

    // Process each file
    for (const { fileName, classification, records } of fileData) {
        if (records.length === 0) {
            console.log(`  ${fileName}: 0 documents (skipped)`);
            continue;
        }

        // Build write operations
        const writes = [];
        for (const record of records) {
            const docId = record._id;
            if (!docId) {
                console.warn(`  [WARN] ${fileName}: record missing _id, skipping`);
                continue;
            }

            let ref;
            try {
                if (classification.type === 'subcollection') {
                    const parentId = record._parentId;
                    if (!parentId) {
                        console.warn(`  [WARN] ${fileName}: subcollection record missing _parentId (doc: ${docId}), skipping`);
                        continue;
                    }
                    ref = db.collection(classification.parent).doc(parentId).collection(classification.child).doc(docId);
                } else {
                    ref = db.collection(classification.name).doc(docId);
                }
            } catch (err) {
                console.warn(`  [WARN] ${fileName}: could not build ref for doc ${docId}: ${err.message}`);
                continue;
            }

            const data = prepareDocData(record);
            writes.push({ ref, data });
        }

        // Execute batched writes
        try {
            const { written, failed, errors } = await writeBatches(db, writes);
            grandTotalWritten += written;
            grandTotalFailed += failed;

            if (failed > 0) {
                hasError = true;
                console.error(`  [ERROR] ${fileName}: ${written} written, ${failed} FAILED`);
                errors.forEach(e => console.error(`    ${e}`));
            } else {
                console.log(`  ${fileName}: ${written} document${written !== 1 ? 's' : ''} restored`);
            }
        } catch (err) {
            console.error(`  [ERROR] ${fileName}: ${err.message}`);
            hasError = true;
        }
    }

    console.log('');
    console.log(`Restore complete: ${grandTotalWritten} documents written`);

    if (grandTotalFailed > 0) {
        console.error(`[ERROR] ${grandTotalFailed} documents failed to write — see errors above.`);
    }

    if (parseErrors > 0) {
        console.warn(`[WARNING] ${parseErrors} file(s) could not be parsed and were skipped.`);
    }

    if (hasError || grandTotalFailed > 0) {
        process.exit(1);
    }

    process.exit(0);
}

main().catch(err => {
    console.error('[Restore] Fatal error:', err.message);
    process.exit(1);
});
