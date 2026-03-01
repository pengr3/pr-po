/**
 * FIRESTORE DATA WIPE SCRIPT
 *
 * Deletes all documents from targeted Firestore collections.
 * The users collection is NEVER touched.
 *
 * PREREQUISITES:
 *   - serviceAccountKey.json in project root (or GOOGLE_APPLICATION_CREDENTIALS env var)
 *   - Run `node scripts/backup.js` first to create a backup
 *
 * USAGE:
 *   node scripts/wipe.js --dry-run     Preview what would be deleted (safe)
 *   node scripts/wipe.js               Live wipe — requires typed confirmation
 *
 * TARGETED COLLECTIONS:
 *   mrfs, prs, pos, transport_requests, suppliers, clients,
 *   projects, services, deleted_mrfs, invitation_codes
 *
 * NOT TOUCHED:
 *   users, role_templates, deleted_users (and all other collections)
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

// Exactly these 10 — do not add users or role_templates
const WIPE_COLLECTIONS = [
    'mrfs',
    'prs',
    'pos',
    'transport_requests',
    'suppliers',
    'clients',
    'projects',
    'services',
    'deleted_mrfs',
    'invitation_codes'
];

const BATCH_SIZE = 500; // Firestore batch limit
const CONFIRMATION_WORD = 'WIPE';

// =============================================
// Firebase Admin initialization
// =============================================

function initFirebase() {
    const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
        || path.join(__dirname, '..', 'serviceAccountKey.json');

    if (!fs.existsSync(keyPath)) {
        console.error('[Wipe] ERROR: Service account key not found.');
        console.error(`[Wipe] Expected: ${keyPath}`);
        console.error('[Wipe] Download from: Firebase Console → Project Settings → Service Accounts → Generate new private key');
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
// Batched deletion helper
// =============================================

async function deleteCollectionBatched(db, collectionName, docs) {
    let deleted = 0;
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = db.batch();
        docs.slice(i, i + BATCH_SIZE).forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        deleted += Math.min(BATCH_SIZE, docs.length - i);
    }
    return deleted;
}

// =============================================
// Dry-run mode
// =============================================

async function dryRun(db) {
    console.log(`Dry Run — Firestore Wipe Preview (${PROJECT_ID})`);
    console.log('');

    let totalDocs = 0;
    let collectionsWithDocs = 0;

    for (const name of WIPE_COLLECTIONS) {
        try {
            const snapshot = await db.collection(name).get();
            const count = snapshot.size;
            console.log(`  ${name}: ${count} documents would be deleted`);
            totalDocs += count;
            if (count > 0) collectionsWithDocs++;
        } catch (err) {
            console.error(`  [ERROR] ${name}: ${err.message}`);
        }
    }

    console.log('');
    console.log(`Total: ${totalDocs} documents across ${WIPE_COLLECTIONS.length} collections`);
    console.log('Run without --dry-run to perform the actual wipe (requires confirmation).');
    process.exit(0);
}

// =============================================
// Live wipe mode
// =============================================

async function liveWipe(db) {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║              FIRESTORE DATA WIPE — LIVE MODE             ║');
    console.log('║                                                          ║');
    console.log('║  This will PERMANENTLY DELETE all documents from:        ║');
    console.log('║    mrfs, prs, pos, transport_requests, suppliers,        ║');
    console.log('║    clients, projects, services, deleted_mrfs,            ║');
    console.log('║    invitation_codes                                      ║');
    console.log('║                                                          ║');
    console.log('║  The users collection will NOT be touched.               ║');
    console.log('║                                                          ║');
    console.log('║  This action is IRREVERSIBLE. Run backup.js first.       ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('');

    // Scan phase — collect all snapshots upfront
    console.log('Scanning collections...');

    const snapshots = {};
    let totalDocs = 0;

    for (const name of WIPE_COLLECTIONS) {
        try {
            const snapshot = await db.collection(name).get();
            snapshots[name] = snapshot;
            const count = snapshot.size;
            console.log(`  ${name}: ${count} documents`);
            totalDocs += count;
        } catch (err) {
            console.error(`  [ERROR] Scanning ${name}: ${err.message}`);
            console.error('Aborting.');
            process.exit(1);
        }
    }

    console.log('');
    console.log(`Total: ${totalDocs} documents will be permanently deleted.`);
    console.log('');

    // Confirmation prompt
    const answer = await prompt(`Type "${CONFIRMATION_WORD}" to confirm deletion, or press Ctrl-C to abort:\n> `);

    if (answer !== CONFIRMATION_WORD) {
        console.log('Aborted. No data was deleted.');
        process.exit(0);
    }

    // Deletion phase
    console.log('');
    console.log('Starting wipe...');

    let totalDeleted = 0;
    let deletedBeforeFailure = 0;

    for (const name of WIPE_COLLECTIONS) {
        try {
            const snapshot = snapshots[name];
            const docs = snapshot.docs;

            if (docs.length === 0) {
                console.log(`  ${name}: 0 documents deleted`);
                continue;
            }

            const deleted = await deleteCollectionBatched(db, name, docs);
            console.log(`  ${name}: ${deleted} documents deleted`);
            totalDeleted += deleted;
            deletedBeforeFailure += deleted;
        } catch (err) {
            console.error(`  [ERROR] Deleting from ${name}: ${err.message}`);
            console.error(`  ${deletedBeforeFailure} documents were deleted before this failure.`);
            console.error('Aborting.');
            process.exit(1);
        }
    }

    console.log('');
    console.log(`Wipe complete. ${totalDeleted} total documents deleted across ${WIPE_COLLECTIONS.length} collections.`);
    process.exit(0);
}

// =============================================
// Main entry point
// =============================================

async function main() {
    const isDryRun = process.argv.includes('--dry-run');
    const db = initFirebase();
    if (isDryRun) {
        await dryRun(db);
    } else {
        await liveWipe(db);
    }
}

main().catch(err => {
    console.error('[Wipe] Fatal error:', err.message);
    process.exit(1);
});
