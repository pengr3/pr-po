---
status: passed
phase: 104-service-detail-parity
source: [104-VERIFICATION.md]
started: 2026-06-13
updated: 2026-06-13
---

## Current Test

[complete — all 12 items approved by the operator on clmc-procurement-dev, 2026-06-13, after the DEV rules deploy]

## Prerequisite (done)

DEV rules deployed: `firebase deploy --only firestore:rules --project dev` — confirmed by operator ("deployed").

## Tests

### 1. Lifecycle accordion replaces the status dropdown (D-01/D-02)
expected: "Project Lifecycle" accordion above the cards; Card 3 shows a read-only status pill (no dropdown); works for one-time and recurring.
result: passed

### 2. Lifecycle gates advance status + stamp the clock (D-04/D-06)
expected: gate Advance moves status + updates accordion/pill; button disabled until doc attached; Completion enabled only for services_admin/super_admin.
result: passed

### 3. Gate writes audit + activity + last_activity_at (D-12/D-14)
expected: advancing a gate posts a system Activity Feed entry; no console errors.
result: passed

### 4. Completion gate DLP capture only with a retention tranche (D-07)
expected: DLP fieldset shown only when a retention tranche exists; completion captures DLP fields only then.
result: passed

### 5. Draft-status service renders cleanly (D-05)
expected: Draft detail page renders without errors; defers to proposal/Draft funnel.
result: passed

### 6. Activity Journal panel — visibility gate (D-10/D-11)
expected: hidden before For Mobilization & for Loss; visible+writeable at For Mobilization/On-going; read-only at Completed.
result: passed

### 7. Journal writes — post / progress / issue (D-10/D-12)
expected: post/progress/issue persist live; resolve requires a note + posts system entry; reopen posts entry; contract/budget edit posts a cost-change entry.
result: passed

### 8. DLP finance bar — 4 states (D-07/D-08)
expected: amber in-dlp / red expired / green released / plain utilization for non-completed.
result: passed

### 9. Inline tranche editor + Ret? toggle (D-07)
expected: editor opens (admin/assigned), Ret? flags one retention tranche, 100% total + labels required, save writes collection_tranches.
result: passed

### 10. Finance-only Record Release (D-15)
expected: only Finance sees Record Release; click writes retention_released_at + flips bar green; non-Finance has no button + rules-rejected.
result: passed

### 11. PO-Delivered posts to the owning service journal (D-12)
expected: marking a non-subcon PO (service_code MRF) Delivered posts a system entry to that service's Feed; status update never blocked.
result: passed

### 12. One-time On-going quiet signal; recurring stays quiet (D-13)
expected: one-time On-going shows 🟠 >7d / 🔴 >14d on last_activity_at; recurring stays On Track.
result: passed

## Summary

total: 12
passed: 12
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

None — all items passed.
