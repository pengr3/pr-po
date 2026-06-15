#!/usr/bin/env node
/* Phase 83 Plan 02 Task 2 verify — app/notifications.js shape check.
   Exits 0 on pass, 1 on fail. Prints a structured report regardless. */
const fs = require('fs');
const path = 'app/notifications.js';

let c;
try { c = fs.readFileSync(path, 'utf8'); }
catch (e) { console.error('FAIL: cannot read', path, e.message); process.exit(1); }

const exportsRequired = [
    'createNotification',
    'createNotificationForRoles',
    'NOTIFICATION_TYPES',
    'initNotifications',
    'destroyNotifications',
    'markAllNotificationsRead',
    'markNotificationRead',
    'handleNotificationClick',
    'toggleNotificationsDropdown'
];
const types = [
    'MRF_APPROVED', 'MRF_REJECTED', 'PR_REVIEW_NEEDED',
    'TR_REVIEW_NEEDED', 'RFP_REVIEW_NEEDED', 'PROJECT_STATUS_CHANGED',
    'REGISTRATION_PENDING', 'PROPOSAL_SUBMITTED', 'PROPOSAL_DECIDED'
];
const windowRegs = [
    'toggleNotificationsDropdown', 'handleNotificationClick',
    'markAllNotificationsRead', 'markNotificationRead',
    'initNotifications', 'destroyNotifications'
];

const exportOk = exportsRequired.every(e =>
    c.includes('export function ' + e) ||
    c.includes('export async function ' + e) ||
    c.includes('export const ' + e)
);
const typesOk = types.every(t => c.includes(t + ": '" + t + "'"));
const windowOk = windowRegs.every(w => c.includes('window.' + w));
const isLocalOk = c.includes('__createTestNotification') && c.includes('localhost');
const escapeOk = c.includes('escapeHTML');
const tsOk = c.includes('serverTimestamp()');
const collOk = c.includes("collection(db, 'notifications')");
const lineCount = c.split('\n').length;
const lineOk = lineCount >= 250;

const report = {
    'exports-ok': exportOk,
    'types-ok': typesOk,
    'window-regs-ok': windowOk,
    'isLocal-test-writer': isLocalOk,
    'escapeHTML-used': escapeOk,
    'serverTimestamp-on-create': tsOk,
    'addDoc-on-notifications-collection': collOk,
    'line-count': lineCount,
    'line-count-ok-(min-250)': lineOk
};
console.log(JSON.stringify(report, null, 2));

const allOk = exportOk && typesOk && windowOk && isLocalOk &&
              escapeOk && tsOk && collOk && lineOk;
process.exit(allOk ? 0 : 1);
