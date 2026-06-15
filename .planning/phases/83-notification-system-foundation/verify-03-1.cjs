#!/usr/bin/env node
/* Phase 83 Plan 03 Task 1 verify — index.html bell markup placement.
   Asserts:
     - All required notif IDs present
     - Bell wrapper appears EXACTLY ONCE
     - Bell wrapper precedes <div class="nav-links"> in source order
     - Bell wrapper is NOT inside the mobile drawer (#mobileNavMenu)
   Exits 0 on pass, 1 on fail. */
const fs = require('fs');
const c = fs.readFileSync('index.html', 'utf8');

function count(re) {
    return (c.match(re) || []).length;
}

const idsRequired = [
    'id="notifBellWrap"',
    'id="notifBell"',
    'id="notifBadge"',
    'id="notifDropdownMenu"',
    'id="notifDropdownRows"',
    'id="notifMarkAllBtn"'
];
const ids = Object.fromEntries(idsRequired.map(id => [id, c.includes(id)]));

// Bell wrapper exactly once
const bellWrapCount = count(/id="notifBellWrap"/g);

// Navigation link wrapper present
const navLinksIdx = c.indexOf('class="nav-links"');
const bellIdx = c.indexOf('id="notifBellWrap"');
const bellBeforeNavLinks = bellIdx >= 0 && navLinksIdx >= 0 && bellIdx < navLinksIdx;

// Bell wrapper NOT inside mobile drawer
const drawerStart = c.indexOf('id="mobileNavMenu"');
let drawerEnd = -1;
if (drawerStart >= 0) {
    // Find the matching closing tag for mobileNavMenu — naive but workable:
    // mobileNavMenu is a <div> open. Find next </nav> which encloses it, OR seek to next top-level closer.
    // Conservative bound: take 2000 chars after drawerStart.
    drawerEnd = drawerStart + 2000;
}
const bellInsideDrawer = drawerStart >= 0 && bellIdx >= drawerStart && bellIdx <= drawerEnd;

// Has view-all link to history page
const viewAllLink = c.includes('href="#/notifications"');

// Has correct onclicks
const onclickToggle = c.includes('toggleNotificationsDropdown');
const onclickMarkAll = c.includes('markAllNotificationsRead');

const report = {
    ...ids,
    'bell-wrapper-count-(exactly-1)': bellWrapCount,
    'bell-wrapper-precedes-nav-links': bellBeforeNavLinks,
    'bell-NOT-inside-mobile-drawer': !bellInsideDrawer,
    'view-all-link-present': viewAllLink,
    'onclick-toggle-present': onclickToggle,
    'onclick-markall-present': onclickMarkAll
};
console.log(JSON.stringify(report, null, 2));

const allOk =
    idsRequired.every(id => ids[id]) &&
    bellWrapCount === 1 &&
    bellBeforeNavLinks &&
    !bellInsideDrawer &&
    viewAllLink &&
    onclickToggle &&
    onclickMarkAll;
process.exit(allOk ? 0 : 1);
