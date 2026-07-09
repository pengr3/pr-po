# 106 Data-Layer Audit — Read-Only Data-Pass Results

> ## ⛔ PROD RUN PENDING — numbers to be filled from `node scripts/verify-integrity.js --json`
>
> **The read-only data pass has NOT yet executed.** No Firebase service-account key
> is present in this repository, so the extended `verify-integrity.js` could not
> connect to either `clmc-procurement-dev` (validation) or `clmc-procurement`
> (prod numbers). Every data section below is a **placeholder** awaiting a run —
> **no numbers have been invented.**
>
> This file is intentionally committed in its pending state so the gap is
> **visible and tracked**, not silently skipped. Plan 07 (`106-FINDINGS.md`)
> MUST NOT cite numbers from this file until the sections below are filled from
> a real run.
>
> **Checkpoint status:** `checkpoint:human-action` (Plan 106-01, Task 2 gate) is
> **OUTSTANDING** — a human with the service-account key must run the two
> commands in [How to fill this in](#how-to-fill-this-in) and paste the output.

---

## Why this is pending (observed evidence)

The executor extended the script (Task 1, committed) and then **attempted the dev
validation run once**. It failed with a missing-credentials error — captured
verbatim below as proof the block is real, not assumed:

Command attempted:

```bash
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.dev.json \
  node scripts/verify-integrity.js --project clmc-procurement-dev --json
```

Observed output:

```
ERROR: Service account key not found at: C:\Users\franc\dev\projects\pr-po\serviceAccountKey.dev.json
       Download from Firebase Console > Project Settings > Service Accounts
       Or set GOOGLE_APPLICATION_CREDENTIALS env var to the key file path
```

Repo check (both key files absent):

```
$ ls -la serviceAccountKey.dev.json serviceAccountKey.json
ls: cannot access 'serviceAccountKey.dev.json': No such file or directory
ls: cannot access 'serviceAccountKey.json': No such file or directory
```

The script exited before any Firestore access — it is fully **read-only** and
performed **no** database operation. Nothing was read from or written to any
project.

---

## How to fill this in

A human holding the Firebase service-account key(s) runs these two commands from
the repo root and pastes the JSON output into the corresponding sections below.
Both are **read-only** (`.get()` only — they write nothing to either database).

**1. DEV validation run** (D-05 — validate the extended script against a real DB
first; dev may be sparse/stale, this only proves the script is valid):

```bash
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.dev.json \
  node scripts/verify-integrity.js --project clmc-procurement-dev --json
```

Expected: completes without a stack trace. Record a one-line "dev ran clean"
confirmation in Run Metadata.

**2. PROD numbers run** (the system of record — the numbers that go into the
report). Requires `./serviceAccountKey.json`; defaults to `projectId`
`clmc-procurement`:

```bash
node scripts/verify-integrity.js --json
```

Then transcribe: the `collections` counts, the full `errors`, `warnings`,
`info`, and `drift` arrays, and the `summary` block into the sections below,
and flip the PENDING banner off.

---

## Run Metadata

| Field | Value |
|-------|-------|
| Date of run | **PENDING** (not yet run) |
| Dev project id | `clmc-procurement-dev` — validation: **PENDING** (target for the dev-first D-05 validation run) |
| Prod project id | `clmc-procurement` — the system of record for the reported numbers |
| Script | `scripts/verify-integrity.js` (extended in 106-01: `checkDenormDrift` + `--project` flag) |
| Access mode | **read-only** — `db.collection(name).get()` only; zero writes (T-106-01) |
| Blocker | No `serviceAccountKey.json` / `serviceAccountKey.dev.json` in repo (see evidence above) |

---

## Collection Document Counts (prod)

**PENDING** — fill each count from the prod run's `collections` block (D-03).
The extended fetch covers the existing 13 collections **plus `rfps`** (added in
106-01 for the drift chain's RFP tail):

| Collection | Doc count |
|------------|-----------|
| mrfs | PENDING |
| prs | PENDING |
| pos | PENDING |
| transport_requests | PENDING |
| rfps | PENDING |
| suppliers | PENDING |
| projects | PENDING |
| services | PENDING |
| users | PENDING |
| clients | PENDING |
| role_templates | PENDING |
| invitation_codes | PENDING |
| deleted_mrfs | PENDING |
| deleted_users | PENDING |

---

## Referential Integrity Errors

**PENDING** — paste the prod `errors` array verbatim here, with its count.

If the run returns 0, state: "0 — no dangling PR→MRF / PO→PR / PO→MRF / TR→MRF
references."

- Count: **PENDING**
- Errors: **PENDING**

---

## Schema & Reference Warnings

**PENDING** — record the prod `warnings` count and a categorized digest:

- Total warnings: **PENDING**
- Missing-required-field warnings: **PENDING**
- Invalid-status warnings (MRF status / finance_status / procurement_status / project·service status): **PENDING**
- `items_json` fails `JSON.parse()`: **PENDING**
- Reference warnings (supplier not in `suppliers`; MRF `project_code`/`service_code` not in `projects`/`services`): **PENDING**

---

## Orphan Detection (info)

**PENDING** — paste the prod `info` array verbatim here, with counts:

- Approved MRFs with no PRs generated: **PENDING**
- Finance-Approved PRs with no POs created: **PENDING**
- Full `info` list: **PENDING**

---

## Denormalization Drift (MRF → PR → PO → TR → RFP)

**PENDING** — this is the D-02 new-capability result. Paste the prod `drift`
array verbatim here, with its count and a per-field breakdown. Each line has the
form `DRIFT <field>: MRF <id>="<mrfVal>" vs <PR|PO|TR|RFP> <id>="<downstreamVal>"`.
RFPs are joined to the chain by business id (`rfp.po_id` / `rfp.tr_id`), never
the unreliable stored RFP doc-id fields.

- Total drift records: **PENDING**
- `project_code` drift: **PENDING**
- `project_name` drift: **PENDING**
- `department` drift: **PENDING**
- Full `drift` list: **PENDING**

---

## Phase 112 hand-off note

Live drift/orphan measurement for the v4.0 collections (proposals, collectibles,
billing_requests, rfps orphans, baselines) is **DEFERRED to Phase 112 (D-04)**;
this pass covers only the existing 13-collection checks plus the new
denormalized drift chain. No v4.0-collection live checks were added to the script.
