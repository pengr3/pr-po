---
phase: 64
slug: proof-of-procurement
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 64 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual browser testing (zero-build SPA — no automated test framework) |
| **Config file** | None |
| **Quick run command** | `python -m http.server 8000` then navigate to `#/procurement/records` |
| **Full suite command** | Same — manual walkthrough of all 4 success criteria across all views |
| **Estimated runtime** | ~5 minutes |

---

## Sampling Rate

- **After every task commit:** Smoke test: check proof indicator column in PO Tracking, click one indicator
- **After every plan wave:** Full walkthrough of success criteria for each plan's outputs
- **Before `/gsd:verify-work`:** All 4 success criteria must pass
- **Max feedback latency:** ~5 minutes (manual)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 64-01-01 | 01 | 1 | PROOF-01, PROOF-02 | manual | n/a | n/a | ⬜ pending |
| 64-01-02 | 01 | 1 | PROOF-01, PROOF-04 | manual | n/a | n/a | ⬜ pending |
| 64-02-01 | 02 | 2 | PROOF-01, PROOF-02 | manual | n/a | n/a | ⬜ pending |
| 64-02-02 | 02 | 2 | PROOF-03 | manual | n/a | n/a | ⬜ pending |
| 64-02-03 | 02 | 2 | PROOF-01–04 | manual | n/a | n/a | ⬜ pending |
| 64-03-01 | 03 | 3 | PROOF-01, PROOF-02 | manual | n/a | n/a | ⬜ pending |
| 64-03-02 | 03 | 3 | PROOF-03 | manual | n/a | n/a | ⬜ pending |
| 64-04-01 | 04 | 3 | PROOF-03 | manual | n/a | n/a | ⬜ pending |
| 64-04-02 | 04 | 3 | PROOF-01–04 | manual | n/a | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None — no test infrastructure needed; project uses manual testing exclusively.

*Existing manual testing process covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Proof URL modal appears when attaching proof to a PO | PROOF-01 | Zero-build SPA, no test framework | Navigate to `#/procurement/records`, go to PO Tracking tab, click empty circle indicator — modal appears titled "Attach Proof of Procurement" |
| Non-HTTPS URL rejected inline | PROOF-01 | Zero-build SPA | In proof modal, enter `http://` URL — inline error "URL must start with https://" appears, modal stays open |
| Valid HTTPS URL saves to Firestore | PROOF-01 | Zero-build SPA | Enter valid `https://drive.google.com/...` URL — modal closes, toast "Proof URL attached", circle turns green checkmark |
| Left-click green checkmark opens URL in new tab | PROOF-01 | Zero-build SPA | Left-click filled indicator — URL opens in new tab |
| Right-click green checkmark opens edit modal | PROOF-01 | Zero-build SPA | Right-click filled indicator — modal appears with current URL pre-filled, title "Update Proof URL" |
| Status change to Procured triggers proof modal | PROOF-02 | Zero-build SPA | Change PO status to "Procured" (material) — after confirm, proof modal appears with Skip button; click Skip — modal closes, status already changed |
| Proof update allowed at any PO status including Delivered | PROOF-02 | Zero-build SPA | Find Delivered PO, right-click proof indicator — modal opens, URL can be updated |
| Finance PO Tracking shows Proof column | PROOF-03 | Zero-build SPA | Navigate to `#/finance/purchase-orders` — Proof column appears after PO ID column with indicators per PO |
| MRF Records shows Proof column with per-PO sub-row indicators | PROOF-01 | Zero-build SPA | Navigate to `#/procurement/records` MRF Records tab — Proof column shows per-PO indicators for Material rows |
| My Requests shows Proof column | PROOF-03 | Zero-build SPA | Navigate to `#/mrf-form/my-requests` — Proof column visible between POs and MRF Status |
| Remarks-only entry shows orange dash indicator | PROOF-01 | Zero-build SPA | Open proof modal, enter remarks but no URL, save — orange circle with dash appears on indicator |
| Indicator updates immediately after save (no refresh required) | PROOF-01 | Zero-build SPA | Attach proof in MRF Records tab — indicator changes in-place to green without page reload |
| PO Timeline shows proof attached event | PROOF-04 | Zero-build SPA | Click Timeline on PO with proof — alert contains "Proof Attached: [date] — [url]"; on PO without proof — shows "Proof Attached: (none)" |

---

## Validation Sign-Off

- [ ] All tasks have manual verify instructions
- [ ] Sampling continuity: smoke test after every commit
- [ ] Wave 0: N/A
- [ ] No watch-mode flags
- [ ] Feedback latency < 5 minutes
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
