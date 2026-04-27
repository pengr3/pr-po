# Phase 81: Unified Project and Service Status Overhaul - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-27
**Phase:** 81-unified-project-and-service-status-overhaul
**Areas discussed:** New field name, Legacy data handling, Home dashboard, Field cleanup, History label

---

## New Field Name

| Option | Description | Selected |
|--------|-------------|----------|
| project_status | Already exists on both collections — repurpose with new options. Less writing needed for new creates. | ✓ |
| status | Clean, short. Different collection from MRFs so no real clash. | |
| workflow_status | Most semantically precise. New field name — all existing docs need migration or fallback logic. | |

**User's choice:** project_status
**Notes:** Reuse existing field name to minimize migration work. Both projects and services collections already have this field.

---

## Legacy Data Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Read-time fallback | Display old values as-is; user re-selects on next edit. No migration script. Old internal_status ignored. | ✓ |
| Migration script | One-time JS snippet run from browser console; maps old values to closest new options. | |
| Accept blank | Old values outside new list show blank. Simple but confusing. | |

**User's choice:** Read-time fallback
**Notes:** No migration needed. Old `project_status` values not in the new 10-option list are displayed as legacy text. Old `internal_status` field simply orphaned in Firestore.

---

## Home Dashboard

| Option | Description | Selected |
|--------|-------------|----------|
| One chart per entity | Replace two-section layout with single chart per entity type using new 10-option list. | ✓ |
| Remove status charts | Drop status breakdown entirely; just show totals. | |
| Keep both sections | Both chart sections read from project_status — visually redundant. | |

**User's choice:** One chart per entity
**Notes:** Projects Status chart + Services Status chart, each showing the 10 unified options.

---

## Field Cleanup (internal_status)

| Option | Description | Selected |
|--------|-------------|----------|
| Orphan it | Don't write to internal_status in new saves/edits. Old docs retain it but UI ignores it. | ✓ |
| Null it out | Write internal_status: null (deleteField) on every save/edit. Keeps Firestore clean. | |

**User's choice:** Orphan it
**Notes:** Minimal code change. No deleteField() import needed. internal_status stays in old docs but is never read or written by the new UI.

---

## Edit History Label

| Option | Description | Selected |
|--------|-------------|----------|
| Status | Simple. Edit log reads: "Status changed from X to Y." | ✓ |
| Project/Service Status | More descriptive but verbose and not contextual. | |

**User's choice:** Status
**Notes:** Update `project_status` label in edit-history.js to 'Status'. Remove `internal_status` entry entirely since that field will no longer be written.

---

## Claude's Discretion

- Visual treatment for legacy project_status values not in the new list
- Whether to use a single flat filter dropdown or grouped UI for the 10 options

## Deferred Ideas

None.
