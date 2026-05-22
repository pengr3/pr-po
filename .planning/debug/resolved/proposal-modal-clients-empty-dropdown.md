---
slug: proposal-modal-clients-empty-dropdown
status: resolved
created: 2026-05-22
updated: 2026-05-22
symptom: "New Proposal modal — Target Client dropdown shows only (none); no client options appear"
root_cause: "clients collection documents do not have an `active` field, but the query filtered by where('active', '==', true) — Firestore silently returns no results for documents missing the field"
fix_commit: 4a83731
---

## Symptom

New Proposal modal opened from project-detail (`#/projects/detail/CLMC-SPI-2026003`). Target Client dropdown showed only `(none)` despite clients existing in the Clients tab.

## Investigation

1. Firestore security rules for `clients` — `allow read: if isActiveUser()` — not the cause.
2. `_loadModalDropdownData()` queries: `getDocs(query(collection(db, 'clients'), where('active', '==', true)))` — ran without error (no console output), returned zero docs.
3. `clients.js` `addDoc` block — saves `client_code`, `company_name`, `contact_person`, `contact_details`, `created_at`. **No `active` field written.**
4. Firestore `where('active', '==', true)` on documents without the field = empty result set (expected Firestore behavior — missing field ≠ false).

## Root Cause

The `active` filter was copied from other collection patterns (suppliers, projects) without verifying the `clients` schema. The `clients` collection has no soft-delete mechanism and no `active` field — all documents are active by definition.

## Fix

Removed `where('active', '==', true)` from two call sites:
- `app/proposal-modal.js` — `_loadModalDropdownData()`
- `app/engagement-create.js` — clients `onSnapshot` listener

## Also Fixed in Same Session

- **Export missing** (`proposal-modal.js` line 665): `openCreateProposalModal` was not exported — caused `SyntaxError` in both `project-detail.js` and `service-detail.js` import statements. Added `export` keyword.
- **CR-3**: `closeProposalModal()` deleted `window.openCreateProposalModal` — broke Start Proposal CTA after any detail modal close. Removed from register (line 1637) and delete (line 1674) blocks.
