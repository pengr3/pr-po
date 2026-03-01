/**
 * FIRESTORE BACKUP EXPORT SCRIPT
 *
 * Exports all Firestore collections to timestamped JSON files.
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
 *   node scripts/backup.js
 *   node scripts/backup.js --output backups/my-custom-dir
 *
 * OUTPUT:
 *   Creates backups/YYYY-MM-DDTHHMMSS/ with one JSON file per collection.
 *   Subcollections: projects_edit_history.json, services_edit_history.json
 *   Each document serialized as: { "_id": "docId", ...fields }
 *   Subcollection entries also include: { "_parentId": "parentDocId", ... }
 *   Firestore Timestamps serialized as: { "__type": "timestamp", "value": "ISO8601" }
 */

import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// =============================================
// Configuration
// =============================================

const PROJECT_ID = 'clmc-procurement';

// Top-level collections to export
const COLLECTIONS = [
    'users',
    'role_templates',
    'invitation_codes',
    'projects',
    'clients',
    'mrfs',
    'prs',
    'pos',
    'transport_requests',
    'suppliers',
    'deleted_mrfs',
    'deleted_users',
    'services'
];

// Subcollections: { parent: collection name, child: subcollection name }
const SUBCOLLECTIONS = [
    { parent: 'projects', child: 'edit_history' },
    { parent: 'services', child: 'edit_history' }
];

// =============================================
// Firebase Admin initialization
// =============================================

function initFirebase() {
    const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, '..', 'serviceAccountKey.json');

    if (!fs.existsSync(keyPath)) {
        console.error('[Backup] ERROR: Service account key not found.');
        console.error(`[Backup] Expected: ${keyPath}`);
        console.error('[Backup] Download from: Firebase Console → Project Settings → Service Accounts → Generate new private key');
        console.error('[Backup] Or set GOOGLE_APPLICATION_CREDENTIALS env var to point to your key file.');
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
// Timestamp serialization
// =============================================

/**
 * Recursively serialize Firestore Timestamps to a portable JSON format.
 * Also handles arrays and nested objects.
 *
 * @param {*} value - Any Firestore field value
 * @returns {*} - Serialized value safe for JSON.stringify
 */
function serializeValue(value) {
    if (value === null || value === undefined) {
        return value;
    }

    // Firestore Timestamp (has toDate() method and _seconds/_nanoseconds)
    if (value && typeof value === 'object' && typeof value.toDate === 'function') {
        return {
            __type: 'timestamp',
            value: value.toDate().toISOString()
        };
    }

    // Array: recurse into each element
    if (Array.isArray(value)) {
        return value.map(serializeValue);
    }

    // Plain object: recurse into each field
    if (typeof value === 'object') {
        const result = {};
        for (const [k, v] of Object.entries(value)) {
            result[k] = serializeValue(v);
        }
        return result;
    }

    // Primitive (string, number, boolean)
    return value;
}

/**
 * Serialize a Firestore document's data, returning a plain object
 * with all Timestamps converted.
 *
 * @param {string} id - Document ID
 * @param {Object} data - Raw Firestore document data
 * @param {Object} [extras] - Extra fields to merge (e.g., _parentId)
 * @returns {Object}
 */
function serializeDoc(id, data, extras = {}) {
    const serialized = { _id: id };
    for (const [k, v] of Object.entries(data)) {
        serialized[k] = serializeValue(v);
    }
    return { ...serialized, ...extras };
}

// =============================================
// Export helpers
// =============================================

/**
 * Export a top-level collection to a JSON file.
 * Returns { name, count, filePath, rawDocs } — rawDocs used for subcollection fetch.
 */
async function exportCollection(db, collectionName, outputDir) {
    const snapshot = await db.collection(collectionName).get();
    const docs = [];

    snapshot.forEach(docSnap => {
        docs.push(serializeDoc(docSnap.id, docSnap.data()));
    });

    const filePath = path.join(outputDir, `${collectionName}.json`);
    fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf8');

    return { name: collectionName, count: docs.length, filePath, rawDocs: snapshot.docs };
}

/**
 * Export a subcollection across all parent documents.
 * File name format: {parent}_{child}.json
 * Each entry includes _parentId for restore mapping.
 */
async function exportSubcollection(db, parentName, childName, parentDocs, outputDir) {
    const allDocs = [];

    for (const parentDoc of parentDocs) {
        const childSnapshot = await parentDoc.ref.collection(childName).get();
        childSnapshot.forEach(childSnap => {
            allDocs.push(serializeDoc(childSnap.id, childSnap.data(), { _parentId: parentDoc.id }));
        });
    }

    const fileName = `${parentName}_${childName}.json`;
    const filePath = path.join(outputDir, fileName);
    fs.writeFileSync(filePath, JSON.stringify(allDocs, null, 2), 'utf8');

    return { name: `${parentName}/${childName}`, count: allDocs.length, filePath };
}

// =============================================
// Main
// =============================================

async function main() {
    const args = process.argv.slice(2);

    // --help flag
    if (args.includes('--help') || args.includes('-h')) {
        console.log('Firestore Backup Export Script');
        console.log('');
        console.log('USAGE:');
        console.log('  node scripts/backup.js [--output <dir>]');
        console.log('');
        console.log('OPTIONS:');
        console.log('  --output <dir>    Custom output directory (default: backups/TIMESTAMP)');
        console.log('  --help, -h        Show this help message');
        console.log('');
        console.log('PREREQUISITES:');
        console.log('  Service account key at ./serviceAccountKey.json');
        console.log('  Or set GOOGLE_APPLICATION_CREDENTIALS env var');
        process.exit(0);
    }

    // --output flag
    let outputDir;
    const outputIdx = args.indexOf('--output');
    if (outputIdx !== -1 && args[outputIdx + 1]) {
        outputDir = args[outputIdx + 1];
    } else {
        // Timestamped directory: backups/2026-03-01T120000
        const now = new Date();
        const iso = now.toISOString(); // "2026-03-01T12:00:00.000Z"
        // Extract parts: YYYY-MM-DD and HHMMSS
        const datePart = iso.slice(0, 10);   // "2026-03-01"
        const timePart = iso.slice(11, 19).replace(/:/g, ''); // "120000"
        const formatted = `${datePart}T${timePart}`;
        outputDir = path.join(process.cwd(), 'backups', formatted);
    }

    // Create output directory
    fs.mkdirSync(outputDir, { recursive: true });

    console.log(`Backing up Firestore (${PROJECT_ID})...`);
    console.log('');

    const db = initFirebase();

    let totalDocs = 0;
    let hasError = false;
    const parentDocCache = {}; // store raw snapshot docs for subcollection use

    // Export top-level collections
    for (const collectionName of COLLECTIONS) {
        try {
            const result = await exportCollection(db, collectionName, outputDir);
            console.log(`  ${result.name}: ${result.count} document${result.count !== 1 ? 's' : ''} → ${result.filePath}`);
            totalDocs += result.count;
            parentDocCache[collectionName] = result.rawDocs;
        } catch (err) {
            console.error(`  [ERROR] ${collectionName}: ${err.message}`);
            hasError = true;
        }
    }

    console.log('');

    // Export subcollections
    for (const { parent, child } of SUBCOLLECTIONS) {
        try {
            const parentDocs = parentDocCache[parent] || [];
            const result = await exportSubcollection(db, parent, child, parentDocs, outputDir);
            console.log(`  ${result.name}: ${result.count} document${result.count !== 1 ? 's' : ''} → ${result.filePath}`);
            totalDocs += result.count;
        } catch (err) {
            console.error(`  [ERROR] ${parent}/${child}: ${err.message}`);
            hasError = true;
        }
    }

    console.log('');
    console.log(`Backup complete: ${COLLECTIONS.length} collections + ${SUBCOLLECTIONS.length} subcollections, ${totalDocs} total documents`);
    console.log(`Output: ${outputDir}`);

    if (hasError) {
        console.error('\n[WARNING] Some collections failed to export. Check errors above.');
        process.exit(1);
    }

    process.exit(0);
}

main().catch(err => {
    console.error('[Backup] Fatal error:', err.message);
    process.exit(1);
});
