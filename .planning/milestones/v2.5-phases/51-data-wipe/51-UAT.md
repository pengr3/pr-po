---
status: complete
phase: 51-data-wipe
source: 51-01-SUMMARY.md
started: 2026-03-01T11:30:00Z
updated: 2026-03-01T12:06:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Dry-run mode shows document counts
expected: Run `node scripts/wipe.js --dry-run` in terminal. Script connects to Firestore and prints a per-collection count of documents that would be deleted for each of the 10 targeted collections, followed by a total count. No data is actually deleted — all collections remain unchanged after the command finishes.
result: pass

### 2. Live mode shows warning and confirmation prompt
expected: Run `node scripts/wipe.js` (without --dry-run). Script prints a warning banner, scans all 10 collections with per-collection counts, then prompts you to type the exact word "WIPE" before proceeding. Do NOT type WIPE yet — just confirm the warning and prompt appear.
result: pass

### 3. Wrong confirmation aborts safely
expected: At the "WIPE" prompt from test 2, type something other than WIPE (e.g., "no" or just press Enter). Script prints "Aborted. No data was deleted." and exits cleanly. No data is deleted.
result: pass

### 4. Users collection is excluded
expected: Review the output from dry-run (test 1). Confirm that "users" does NOT appear in the list of collections being scanned/counted. Only these 10 should appear: mrfs, prs, pos, transport_requests, suppliers, clients, projects, services, deleted_mrfs, invitation_codes.
result: pass

### 5. Confirmed wipe deletes all targeted data
expected: Run `node scripts/wipe.js`, type "WIPE" at the prompt. Script deletes all documents from the 10 targeted collections and prints deletion progress/confirmation. After completion, run `node scripts/wipe.js --dry-run` again to confirm all 10 collections show 0 documents.
result: pass

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
