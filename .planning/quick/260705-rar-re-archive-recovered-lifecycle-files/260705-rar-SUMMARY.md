---
quick_id: 260705-rar
status: executed
date: 2026-07-05
branch: v4.1
follows: quick 260705-s7c
merged_to_main: false
---

# Quick Task 260705-rar — Summary

## What changed (JS-only, both detail views)

Makes archive/recover a **toggle** — adds Re-archive to undo a Recover. Scope confirmed with
user: **re-archive only** (the archive *trigger* stays auto/DLP-based; no manual early-archive).

**`app/views/project-detail.js`** and **`app/views/service-detail.js`** (parity)
- **Refactor**: split `isLcFilesArchived` into `isLcArchiveEligible(entity)` (Completed AND
  warranty-over — the stable, monotonic test) + `isLcFilesArchived = eligible && !files_recovered`.
  `buildAttachZone` still calls `isLcFilesArchived` (unchanged behavior).
- **"Project Closed" panel** now computes `eligible` / `archived` / `recovered`:
  - `archived` (eligible & !R) → muted 📦 cells + **♻ Recover files** (unchanged).
  - `recovered` (eligible & R) → normal cells + green note + **📦 Re-archive** button (new).
- **New handler** `window.lcArchiveFiles` / `lcServiceArchiveFiles`: clears the override —
  `files_recovered=false`, `files_recovered_at=null`, `files_recovered_by=null`, `updated_at`;
  audit `LC_FILES_REARCHIVED`; permission-guarded (`canEditTab`); optimistic + rollback.
  Registered in `attachWindowFunctions`, deleted in `destroy()` (symmetric).

## No infra / rules change

`files_recovered*` were already in the projects field-mask (s7c); writing `false`/`null`
reuses those keys. Services branch is maskless. **No firestore.rules / storage.rules /
firebase.js change.** Ships via JS merge only.

## Verified (static)

- `node --check` PASS both files.
- New window fns symmetric (assign + delete + onclick = 3 each); `isLcArchiveEligible` = def + 2 uses.
- **State-machine truth table 12/12 PASS** (`scratchpad/uat_rearchive_logic.mjs`, refactored
  logic transcribed): archived/recovered/normal across every S·W·R combination, incl. the
  defensive `in-DLP + R=true → normal`, plus a consistency assert that `isLcFilesArchived`
  still equals `eligible && !R`.

## State machine

| State | Condition | Files | Action |
|-------|-----------|-------|--------|
| archived | eligible & !R | hidden 📦 | ♻ Recover → R=true |
| recovered | eligible & R | visible | 📦 Re-archive → R=false |
| normal | !eligible | visible | — |

Eligibility is monotonic (Completed terminal + DLP expiry one-way), so no state silently
leaves `recovered`; only an explicit Re-archive does. R=false ≡ R-absent (idempotent with legacy).

## Status

- Committed on `v4.1`. **NOT merged to main** (per user — held for review/UAT).
- Browser UAT pending (toggle Recover ⇄ Re-archive on a Completed past-DLP project + a service;
  confirm persistence on reload). Rules/infra already live from s7c — no deploy needed to ship.
