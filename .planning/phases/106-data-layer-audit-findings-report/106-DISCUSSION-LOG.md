# Phase 106: Data-Layer Audit — Findings Report - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-09
**Phase:** 106-data-layer-audit-findings-report
**Areas discussed:** Verification depth, Report format & IDs, Severity rubric, Audit scope boundary

---

## Verification depth

### Q1 — What does the audit DO about real production data?
| Option | Description | Selected |
|--------|-------------|----------|
| Static + read-only drift check | Static code audit as core; ALSO minimally extend verify-integrity.js with the drift-across-chain check (read-only) and run it so the report cites actual counts | ✓ |
| Static + run script as-is | Static audit + run existing verify-integrity.js unchanged for a real-data baseline; note drift-chain + v4.0 as gaps | |
| Static-only (defer all live checks) | Pure code audit; flag where drift/orphans COULD occur; defer all live-data measurement + script work to Phase 112 | |

**User's choice:** Static + read-only drift check
**Notes:** Makes AUDIT-02 genuinely "verified against data," not just code-reasoned.

### Q2 — Which environment(s) for the reported numbers?
| Option | Description | Selected |
|--------|-------------|----------|
| Dev to validate, prod for numbers | Validate extended script on dev first, then run read-only against prod for reported numbers | ✓ |
| Prod only (read-only) | Point straight at prod (read-only); fewer steps, no dev dry-run | |
| Dev only | Never point at prod; report dev counts, note they may not match prod | |

**User's choice:** Dev to validate, prod for numbers
**Notes:** Prod is the system of record — that's where drift actually matters. All runs read-only `.get()`.

### Q3 — How far should the verify-integrity.js extension go?
| Option | Description | Selected |
|--------|-------------|----------|
| Drift-chain + RFP only | Add only the denormalized-drift check across MRF→PR→PO→TR→RFP; v4.0 collections static + flagged for Phase 112 | ✓ |
| Drift-chain + v4.0 live checks | Also extend live script with ref/orphan checks for v4.0 collections now | |
| You decide the boundary | Claude picks the pragmatic line and documents it | |

**User's choice:** Drift-chain + RFP only
**Notes:** Keeps this a "report" phase, not a scripting project. Existing live ref/schema/orphan checks over the core 13 collections still run.

---

## Report format & IDs

### Q1 — How should the findings report be structured?
| Option | Description | Selected |
|--------|-------------|----------|
| One ranked report + summary table | Single 106-FINDINGS.md, findings High→Low, category-tagged, summary table on top as the Phase 112 index | ✓ |
| Split file per category | Separate docs per category; easier to divide writing, no single ranked view | |
| Report + machine-readable JSON index | Single report PLUS separate findings.json for programmatic parsing | |

**User's choice:** One ranked report + summary table
**Notes:** One place, whole picture visible; summary table doubles as the index.

### Q2 — How rich should each finding entry be?
| Option | Description | Selected |
|--------|-------------|----------|
| Rich schema + stable IDs | F-00N id, severity, category, collection(s), file:line, impact, recommendation, handling, target phase | ✓ |
| Lean entries | Just severity + description + file location | |
| You decide the schema | Claude picks the field set | |

**User's choice:** Rich schema + stable IDs
**Notes:** Stable IDs let Phase 112 cite each finding directly; Low findings flow straight onto the deferral list (AUDIT-06).

---

## Severity rubric

### Q1 — Does the impact-first rubric match, or escalate certain classes?
| Option | Description | Selected |
|--------|-------------|----------|
| Yes — impact-first as shown | Correctness/security = High; leaks/error-gaps/efficiency = Medium; caching/scale-only/cosmetic = Low | ✓ |
| Also escalate silent write failures & leaks to High | Promote any unguarded write path + any confirmed listener leak to High | |
| Let me adjust specific placements | User reclassifies specific classes | |

**User's choice:** Yes — impact-first as shown
**Notes:** Calibrated to current data volumes; "High" means users see wrong data or data is exposed.

---

## Audit scope boundary

### Q1 — What's the audit surface?
| Option | Description | Selected |
|--------|-------------|----------|
| Whole app/ SDK layer + rules | Every app/*.js + app/views/*.js touching Firestore + firestore.rules; all collections incl. v4.0; exclude archive/, worktrees/, scripts/ | ✓ |
| app/views/*.js only | Restrict to view files; misses modals/notifications/auth/permissions/utils | |
| You decide the boundary | Claude picks and documents | |

**User's choice:** Whole app/ SDK layer + rules
**Notes:** Confirmed exclusions: archive/ (reference-only), .claude/worktrees/ (dupes), node scripts/ (verify-integrity.js is tooling we extend, not audited as app code).

---

## Claude's Discretion

- HOW the audit is produced (single-pass vs. fan-out per view/category), exact inspection technique, and precise inventory format — planner/researcher decide. Depth expectation set to exhaustive call-site coverage over the agreed surface.
- Whether Phase 106 pre-seeds the Phase 112 deferral list vs. 112 extracting Low findings from 106-FINDINGS.md — default: report is source of truth, 112 extracts.

## Deferred Ideas

- Live drift/orphan measurement for v4.0 collections → Phase 112.
- Remediation/backfill of any findings → Phase 112 (AUDIT-06/07), review-gated, dry-run + typed confirmation.
- Structural CONCERNS.md items beyond the data layer (window-global pollution, monolith split, no-build reconsideration, XSS/DOMPurify, CSP hardening) → out of milestone; note only if they surface as data-layer findings.
