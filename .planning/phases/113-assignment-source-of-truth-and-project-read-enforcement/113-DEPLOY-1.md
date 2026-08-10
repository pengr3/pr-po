# Phase 113 Plan 01 — Deploy Runbook (Wave-2 human gate)

**Scope:** deploys ONLY the additive server-side changes landed in `113-01-PLAN.md` (3 composite
indexes + the widened `services`/`project_tasks`/`service_tasks` rule branches). This is the
operator runbook the Wave-2 checkpoint executes. **No deploy has been run as part of writing this
document** — Task 3 of Plan 01 is documentation only.

---

## 1. Deploy order — indexes FIRST, then rules

Run these two commands in this exact order, as two separate steps:

```bash
firebase deploy --only firestore:indexes
```

Then, **only after the indexes finish building**, run:

```bash
firebase deploy --only firestore:rules
```

**Why this order and why wait:** indexes can take minutes to build on a live database (unlike
rules, which apply instantly). Before running the rules deploy, open the Firebase console →
Firestore Database → **Indexes** tab and confirm all 3 new `personnel_user_ids` composite indexes
(listed in full in Section 4 below) show state **Enabled** — not **Building**. Deploying the rules
before the indexes finish building is safe in principle (the rules only grant new request shapes;
they don't require the index to exist to deploy), but any client query that pairs an equality
filter with `personnel_user_ids array-contains` will fail at runtime with a missing-index error
until the corresponding index reaches `Enabled`. Since the Wave-4 client conversions that issue
those paired queries haven't shipped yet, there is no live query depending on these indexes today
— but confirm `Enabled` anyway before treating this deploy as complete, so the later wave doesn't
inherit an in-progress index build as a surprise.

---

## 2. This deploy is ADDITIVE ONLY — no rollback plan required beyond git

Every rule edit in Plan 01 is an OR-alternative appended to an existing `allow` expression. No
existing permitted request shape becomes denied, no field mask is narrowed, no role loses access.
Concretely:

- `services` `allow list` / `allow update`: the legacy `isAssignedToService(...)` term is
  unchanged and still evaluated; a new `request.auth.uid in resource.data.personnel_user_ids`
  term is OR-ed in alongside it (plus a hoisted `all_services == true` top-level OR term).
- `project_tasks` / `service_tasks` `allow create` / `allow update` (Tier 1) / `allow delete`: the
  legacy `isAssignedTo*(...)` term is unchanged and listed FIRST (so it short-circuits); a new
  guarded parent-document `get()` personnel check is OR-ed in as a fallback.
- The 3 new indexes are net-new entries; no existing index entry was modified or removed.

Because this cannot break any currently-working flow, **there is no rollback plan beyond
redeploying the previous `firestore.rules` from git** (`git show <prior-commit>:firestore.rules`
piped to a file, then `firebase deploy --only firestore:rules`) if an unexpected issue is
discovered post-deploy. Indexes, once built, are harmless to leave in place even if unused — no
index rollback is anticipated or necessary.

---

## 3. Confirm the CLI's active project before deploying

Run and record the output:

```bash
firebase use
```

**Production is `clmc-procurement`.** Confirm the CLI reports that project before running either
deploy command in Section 1 — deploying against the wrong project (e.g. a lingering `dev` alias)
would silently no-op against production.

**Do not use the Firebase MCP `firebase_deploy` tool for this.** `.planning/` history
(`feedback_firebase_mcp_deploy_noop.md`) records that the MCP `firebase_deploy` tool silently
no-ops on `firestore.rules` — it reports success without actually updating the deployed rules. The
Firebase CLI (`firebase deploy --only firestore:rules` / `firebase deploy --only firestore:indexes`
as run directly in a terminal) is the only verified-working deploy path for this repo.

---

## 4. The 3 index definitions (verbatim from `firestore.indexes.json`)

Eyeball-match these against the Firebase console Indexes tab after the indexes deploy:

**Index 1 — `projects` × `project_code` + `personnel_user_ids`**
(serves `project-detail.js` / `project-plan.js` scoped lookups, Wave 4)

```json
{
  "collectionGroup": "projects",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "project_code", "order": "ASCENDING" },
    { "fieldPath": "personnel_user_ids", "arrayConfig": "CONTAINS" }
  ]
}
```

**Index 2 — `projects` × `client_code` + `personnel_user_ids`**
(serves `clients.js` scoped project lookup, Wave 4)

```json
{
  "collectionGroup": "projects",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "client_code", "order": "ASCENDING" },
    { "fieldPath": "personnel_user_ids", "arrayConfig": "CONTAINS" }
  ]
}
```

**Index 3 — `services` × `client_code` + `personnel_user_ids`**
(serves `clients.js` scoped service lookup, Wave 4)

```json
{
  "collectionGroup": "services",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "client_code", "order": "ASCENDING" },
    { "fieldPath": "personnel_user_ids", "arrayConfig": "CONTAINS" }
  ]
}
```

All 3 use `"queryScope": "COLLECTION"` and list the equality field (`order: ASCENDING`) before the
`personnel_user_ids` field (`arrayConfig: CONTAINS`), matching the JSON shape of the 18 pre-existing
entries in `firestore.indexes.json`.

---

## 5. Standing rules debt — diff before you deploy

This deploy carries ONLY the Phase 113 Plan 01 additive changes **plus whatever standing
un-deployed rules debt already exists in the working tree** — `.planning/STATE.md` records a
chain of prior phases (87.4 / 99 / 100 / 101 / 102 / 103.1 / 104 / 105-01, and the
`fix(crossdept-sync)` commit `8591740` landed just before this plan) whose `firestore.rules`
changes are riding into the eventual v3.3 → main merge and have not yet reached production.

**Before running `firebase deploy --only firestore:rules`, diff the working tree's
`firestore.rules` against what production currently serves** (e.g. `firebase firestore:rules:get`
or the Rules tab in the console, compared against `git diff <last-known-deployed-commit>..HEAD --
firestore.rules`) so the operator deploys with full awareness of everything going out in this
push, not just the Plan 01 diff. This runbook does not attempt to enumerate that standing debt —
it is tracked in `STATE.md` — but the operator must not assume this deploy is Plan-01-only.

---

## Post-deploy verification

1. Firebase console → Firestore Database → Indexes: all 3 indexes from Section 4 show `Enabled`.
2. Firebase console → Firestore Database → Rules: current ruleset timestamp matches the deploy
   time; spot-check that `personnel_user_ids` appears in the `services`, `project_tasks`, and
   `service_tasks` blocks.
3. No manual rollback action is expected — this deploy is additive-only (Section 2).
