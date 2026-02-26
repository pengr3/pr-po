---
phase: 22-bug-fixes-and-ux-improvements
plan: 01
subsystem: finance-procurement-display
tags: [bugfix, date-rendering, formatTimestamp, PO-document, finance, procurement]

dependency-graph:
  requires: [phase-18]
  provides: [fixed-po-date-rendering, blank-document-defaults]
  affects: []

tech-stack:
  added: []
  patterns:
    - "formatTimestamp for Firestore Timestamp + string date dual handling"
    - "Ternary guard before formatting functions to avoid processing empty values"

file-tracking:
  key-files:
    created: []
    modified:
      - app/views/finance.js
      - app/views/procurement.js

decisions:
  - id: "22-01-01"
    decision: "Use formatTimestamp instead of formatDate for PO date display"
    reason: "formatTimestamp handles both Firestore Timestamp objects (.toDate()) and ISO string dates, covering legacy and Phase 18 signature approval paths"
  - id: "22-01-02"
    decision: "Empty string fallback instead of hardcoded defaults for document fields"
    reason: "Blank fields communicate 'not yet filled' to users, hardcoded defaults ('As per agreement') are misleading"

metrics:
  duration: "~1 minute"
  completed: "2026-02-10"
  tasks: 2
  commits: 2
---

# Phase 22 Plan 01: PO Date Rendering & Document Defaults Summary

**Fix PO "Invalid Date" in Finance view using formatTimestamp for dual Timestamp/string handling, and remove hardcoded fallback defaults from PO document generation in both Finance and Procurement views.**

## What Was Done

### Task 1: Fix PO date rendering and sort in Finance view
- Added `formatTimestamp` to the utils.js import in finance.js (alongside existing showToast, showLoading, formatCurrency, formatDate)
- Replaced `formatDate(po.date_issued)` with `formatTimestamp(po.date_issued)` in the PO table rendering (line 2212) -- formatTimestamp handles both Firestore Timestamp objects (from Phase 18 signature approval using serverTimestamp()) and ISO string dates (from legacy path)
- Replaced simple `new Date()` sort comparator with Timestamp-aware comparator that checks for `.toDate` method before falling back to `new Date()` constructor, ensuring correct newest-first ordering across mixed date formats

### Task 2: Remove hardcoded document defaults in Finance and Procurement
- **finance.js `generatePODocument()`**: Changed fallbacks for PAYMENT_TERMS from `'As per agreement'` to `''`, CONDITION from `'Standard terms apply'` to `''`, and DELIVERY_DATE from `formatDocumentDate('TBD')` to `''` with ternary guard
- **procurement.js `generatePODocument()`**: Applied identical changes -- same three fields, same empty string fallbacks, same ternary guard for delivery_date
- The delivery_date uses a ternary (`po.delivery_date ? formatDocumentDate(po.delivery_date) : ''`) instead of `||` because `formatDocumentDate('')` would produce an unwanted formatted output

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| 22-01-01 | formatTimestamp over formatDate for PO dates | Handles both Firestore Timestamp and string dates from different creation paths |
| 22-01-02 | Empty string fallback for document fields | Blank fields are honest; hardcoded defaults mislead users into thinking values were set |

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Checklist

- [x] formatTimestamp imported in finance.js
- [x] PO date column uses formatTimestamp instead of formatDate
- [x] PO sort comparator handles Timestamp objects with .toDate() check
- [x] finance.js PAYMENT_TERMS falls back to empty string
- [x] finance.js CONDITION falls back to empty string
- [x] finance.js DELIVERY_DATE uses ternary guard with empty string
- [x] procurement.js PAYMENT_TERMS falls back to empty string
- [x] procurement.js CONDITION falls back to empty string
- [x] procurement.js DELIVERY_DATE uses ternary guard with empty string

## Commits

| Hash | Message |
|------|---------|
| 5ecd69a | fix(22-01): fix PO date rendering and sort in Finance view |
| 2b2fce2 | fix(22-01): remove hardcoded document defaults in Finance and Procurement |
