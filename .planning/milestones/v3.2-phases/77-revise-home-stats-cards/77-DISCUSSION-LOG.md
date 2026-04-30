# Phase 77: Revise Home Stats Cards — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-23
**Phase:** 77-revise-home-stats-cards
**Areas discussed:** Procurement card metrics, Projects card metrics, Services card breakdown, Card visual style

---

## Procurement Card Metrics

| Option | Description | Selected |
|--------|-------------|----------|
| MRF status breakdown | Pending / Approved / Rejected counts | |
| Procurement workflow pipeline | Pending MRFs → Pending PRs → Active POs | ✓ |
| Single headline | Just Pending MRFs count | |

**User's choice:** Procurement-workflow view (pipeline)
**Notes:** The three stats represent sequential stages of the procurement workflow — from request to PR to PO.

---

## Projects Card Metrics

| Option | Description | Selected |
|--------|-------------|----------|
| Active count only | Single "Active Projects" number | |
| Active + Total | "4 of 7 active" | |
| Internal + Project status breakdown | Count per each status value for both fields | ✓ |

**User's choice:** Both internal status and project status stats
**Notes:** Internal Status (4 values: For Inspection, For Proposal, For Internal Approval, Ready to Submit) and Project Status (7 values: Pending Client Review, Under Client Review, Approved by Client, For Mobilization, On-going, Completed, Loss).

---

## Services Card Breakdown

| Option | Description | Selected |
|--------|-------------|----------|
| Total active only | Single active services count | |
| Split counts | One-time: N \| Recurring: N | |
| Full status breakdown with type split | Internal + project status stats, separated by one-time / recurring | ✓ |

**User's choice:** Both internal and project status stats, with separation of data from one-time and recurring
**Notes:** Same 4 internal statuses and 7 project statuses as Projects, but shown twice — once for one-time services and once for recurring services.

---

## Card Visual Style

| Option | Description | Selected |
|--------|-------------|----------|
| Nav card style | White shadow card matching Material Request / Procurement / Finance cards | ✓ |
| Compact stat row | Current flat row style, reorganized into 3 groups | |
| New distinct style | Smaller cards visually separate from nav cards | |

**User's choice:** Yes, use the nav card style (white shadow cards)
**Notes:** Stats cards form a second tier beneath the nav cards, visually consistent.

---

## Claude's Discretion

- Whether to hide zero-count status rows or show "0"
- Whether status rows use compact 2-column grid or vertical list within sections
- Whether Services card uses tabs (One-time | Recurring) or stacked sections
- Exact spacing, font-size, and color treatment within new cards

## Deferred Ideas

None.
