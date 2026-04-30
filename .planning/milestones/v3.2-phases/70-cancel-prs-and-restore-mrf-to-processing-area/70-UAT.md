---
status: complete
phase: 70-cancel-prs-and-restore-mrf-to-processing-area
source: 70-01-PLAN.md
started: 2026-03-28T00:00:00Z
updated: 2026-03-28T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Context menu on right-click MRF ID
expected: Right-click any MRF ID cell in MRF Records shows a context menu at cursor position
result: pass

### 2. Cancel MRF option for cancellable MRFs
expected: Right-click an MRF with PR Generated / PR Submitted / Finance Approved / PO Issued status shows "Cancel MRF" in red text
result: pass

### 3. No actions for non-cancellable MRFs
expected: Right-click a Rejected MRF shows "No actions available" grayed out
result: pass

### 4. Simple cancel — no POs
expected: Click "Cancel MRF" on an MRF with PRs/TRs but no POs → confirm dialog → PRs and TRs deleted → MRF status becomes In Progress → MRF appears in MRF Processing left panel
result: pass

### 5. Block — POs with payments
expected: Click "Cancel MRF" on an MRF where a PO has any recorded payment → error toast naming the PO → nothing deleted
result: pass

### 6. Block — POs in procurement progress
expected: Click "Cancel MRF" on an MRF where a PO is Procuring/Procured/Delivered → error toast "PO(s) already in procurement progress" → nothing deleted
result: pass

### 7. Force-recall — POs at Pending Procurement (no payments)
expected: Click "Cancel MRF" on an MRF with POs at Pending Procurement and no payments → confirm dialog showing PO/PR/TR counts → POs set to Cancelled, PRs/TRs deleted, MRF restored to In Progress
result: pass

### 8. TR-type MRF cancel (edge case)
expected: Right-click MRF-2026-010 (Transport Request with PR + TR) → "Cancel MRF" appears → cancel works and deletes both PR and TR
result: pass

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
