#!/usr/bin/env node
/* Phase 83 Plan 04 Task 1 verify — app/views/notifications.js history page shape.
   Exits 0 on pass, 1 on fail. */
const fs = require('fs');
const path = 'app/views/notifications.js';

let c;
try { c = fs.readFileSync(path, 'utf8'); }
catch (e) { console.error('FAIL: cannot read', path, e.message); process.exit(1); }

const checks = {
    'has-render-export':
        c.includes('export function render') ||
        c.includes('export async function render'),
    'has-init-export':
        c.includes('export async function init') ||
        c.includes('export function init'),
    'has-destroy-export':
        c.includes('export async function destroy') ||
        c.includes('export function destroy'),
    'imports-startAfter': c.includes('startAfter'),
    'imports-from-firebase': c.includes("from '../firebase.js'"),
    'page-size-20':
        c.includes('PAGE_SIZE = 20') ||
        c.includes('PAGE_SIZE=20') ||
        c.includes('limit(20)'),
    'sets-page-title':
        c.includes('document.title') &&
        c.includes('Notifications | CLMC Operations'),
    'where-user-id-scope': c.includes("where('user_id', '=="),
    'orderBy-created-at-desc': c.includes("orderBy('created_at', 'desc')"),
    'uses-escapeHTML': c.includes('escapeHTML'),
    'newer-older-buttons':
        c.includes('notifNewerBtn') && c.includes('notifOlderBtn'),
    'cursor-stack':
        c.includes('cursorStack') ||
        c.includes('pageStack') ||
        c.includes('cursor_stack'),
    'cost-comment-O(N)-reads':
        /O\(N\).*read|cursor.*tradeoff|re-walk.*page 1|D-10/i.test(c),
    'defensive-runtime-check-handleNotificationClick':
        c.includes('window.handleNotificationClick') &&
        /not loaded|onclick handlers will fail|notifications\.js not loaded/.test(c)
};

console.log(JSON.stringify(checks, null, 2));

const allOk = Object.values(checks).every(Boolean);
process.exit(allOk ? 0 : 1);
