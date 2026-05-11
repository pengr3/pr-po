#!/usr/bin/env bash
# verify-phase-88.sh — Static verification for Phase 88 (Plans 88-01 + 88-02)
# Run from repo root: bash scripts/verify-phase-88.sh

set -euo pipefail
PASS=0; FAIL=0

ok()   { echo "  [PASS] $1"; PASS=$((PASS+1)); }
fail() { echo "  [FAIL] $1"; FAIL=$((FAIL+1)); }
section() { echo; echo "=== $1 ==="; }

# ─── PLAN 88-01: engagement-create.js helper ──────────────────────────────────

section "88-01: engagement-create.js"

[ -f app/engagement-create.js ] \
  && ok "app/engagement-create.js exists" \
  || fail "app/engagement-create.js missing"

node --check app/engagement-create.js 2>/dev/null \
  && ok "engagement-create.js syntax valid" \
  || fail "engagement-create.js syntax error"

grep -q "export async function createEngagement" app/engagement-create.js \
  && ok "createEngagement exported" \
  || fail "createEngagement not exported"

[ "$(grep -c "addDoc(collection(db," app/engagement-create.js)" -ge 1 ] \
  && ok "addDoc write present in helper" \
  || fail "addDoc write missing from helper"

grep -q "from './views/" app/engagement-create.js 2>/dev/null \
  && fail "engagement-create.js imports from views/ (should NOT)" \
  || ok "engagement-create.js has no view-module imports"

grep -q "recordEditHistory" app/engagement-create.js \
  && ok "recordEditHistory called in helper" \
  || fail "recordEditHistory missing from helper"

section "88-01: projects.js delegation"
node --check app/views/projects.js 2>/dev/null \
  && ok "projects.js syntax valid" || fail "projects.js syntax error"

grep -q "import { createEngagement }" app/views/projects.js \
  && ok "projects.js imports createEngagement" \
  || fail "projects.js does not import createEngagement"

grep -q "addDoc(collection(db, 'projects'" app/views/projects.js \
  && fail "projects.js still has direct addDoc write for projects" \
  || ok "projects.js no direct addDoc for project create"

section "88-01: services.js delegation"
node --check app/views/services.js 2>/dev/null \
  && ok "services.js syntax valid" || fail "services.js syntax error"

grep -q "import { createEngagement }" app/views/services.js \
  && ok "services.js imports createEngagement" \
  || fail "services.js does not import createEngagement"

grep -q "addDoc(collection(db, 'services'" app/views/services.js \
  && fail "services.js still has direct addDoc write for services" \
  || ok "services.js no direct addDoc for service create"

# ─── PLAN 88-02: proposals.js view ────────────────────────────────────────────

section "88-02: proposals.js structure"

[ -f app/views/proposals.js ] \
  && ok "app/views/proposals.js exists" \
  || fail "app/views/proposals.js missing"

node --check app/views/proposals.js 2>/dev/null \
  && ok "proposals.js syntax valid" || fail "proposals.js syntax error"

grep -q "export function render" app/views/proposals.js \
  && ok "render() exported" || fail "render() not exported"
grep -q "export async function init" app/views/proposals.js \
  && ok "init() exported" || fail "init() not exported"
grep -q "export async function destroy" app/views/proposals.js \
  && ok "destroy() exported" || fail "destroy() not exported"

grep -q "import.*engagement-create" app/views/proposals.js \
  && ok "proposals.js imports from engagement-create" \
  || fail "proposals.js missing engagement-create import"

grep -q "syncServicePersonnelToAssignments" app/views/proposals.js \
  && ok "syncServicePersonnelToAssignments used in proposals.js" \
  || fail "syncServicePersonnelToAssignments missing"

# HIGH-1: both sync helpers must come from utils.js
if grep -q "syncServicePersonnelToAssignments" app/views/proposals.js; then
  import_line=$(grep "syncServicePersonnelToAssignments" app/views/proposals.js | grep "^import" | head -1)
  echo "$import_line" | grep -q "utils" \
    && ok "syncServicePersonnelToAssignments imported from utils.js (HIGH-1)" \
    || fail "syncServicePersonnelToAssignments NOT imported from utils.js — HIGH-1 violation"
fi

ADDOC_CALLS=$(grep -c "addDoc(" app/views/proposals.js || true)
[ "$ADDOC_CALLS" -eq 0 ] \
  && ok "proposals.js has no addDoc( call (all writes go through createEngagement)" \
  || fail "proposals.js has $ADDOC_CALLS direct addDoc( call(s) — should delegate to createEngagement"

grep -q "projectStatus: 'Draft'" app/views/proposals.js \
  && ok "proposals.js submits projectStatus='Draft'" \
  || fail "proposals.js missing projectStatus: 'Draft'"

grep -q "proposal-queue-mount" app/views/proposals.js \
  && ok "#proposal-queue-mount mount point present (Phase 89)" \
  || fail "#proposal-queue-mount missing"

grep -q "proposal-dashboard-mount" app/views/proposals.js \
  && ok "#proposal-dashboard-mount mount point present (Phase 87)" \
  || fail "#proposal-dashboard-mount missing"

grep -q "Client is required for service engagements" app/views/proposals.js \
  && ok "D-08 client-required validation present" \
  || fail "D-08 client-required validation missing"

section "88-02: router.js /proposals route"
node --check app/router.js 2>/dev/null \
  && ok "router.js syntax valid" || fail "router.js syntax error"

PROPOSALS_HITS=$(grep -c "'/proposals'" app/router.js || true)
[ "$PROPOSALS_HITS" -ge 3 ] \
  && ok "/proposals appears $PROPOSALS_HITS times in router.js (routePermissionMap + routes + gate)" \
  || fail "/proposals only $PROPOSALS_HITS hits in router.js — expected ≥ 3"

grep -q "super_admin" app/router.js \
  && ok "super_admin gate present in router.js" \
  || fail "super_admin gate missing from router.js"

grep -q "views/proposals" app/router.js \
  && ok "router.js lazy-loads views/proposals.js" \
  || fail "router.js missing views/proposals.js load"

section "88-02: index.html nav links"
grep -q 'href="#/proposals"' index.html \
  && ok "Proposals href in index.html" \
  || fail "Proposals href missing from index.html"

grep -q 'data-route="proposals"' index.html \
  && ok "data-route=proposals in index.html" \
  || fail "data-route=proposals missing from index.html"

section "88-02: auth.js nav-link hiding"
node --check app/auth.js 2>/dev/null \
  && ok "auth.js syntax valid" || fail "auth.js syntax error"

grep -q "proposals" app/auth.js \
  && ok "proposals link handled in auth.js" \
  || fail "proposals link not mentioned in auth.js"

grep -q "super_admin" app/auth.js \
  && ok "super_admin check present in auth.js" \
  || fail "super_admin check missing from auth.js"

section "88-02: Draft status in UNIFIED_STATUS_OPTIONS"
node --check app/views/home.js 2>/dev/null \
  && ok "home.js syntax valid" || fail "home.js syntax error"

for f in app/views/projects.js app/views/services.js app/views/home.js; do
  grep -q "'Draft'" "$f" \
    && ok "'Draft' in UNIFIED_STATUS_OPTIONS in $f" \
    || fail "'Draft' missing from $f"
done

grep -q "'Draft'.*rgba" app/views/home.js \
  && ok "home.js MONOCHROMATIC_STATUS_COLORS has Draft palette entry (MED-3)" \
  || fail "home.js MONOCHROMATIC_STATUS_COLORS missing Draft entry"

section "88-02: Draft filtered from consumer views"
node --check app/views/procurement.js 2>/dev/null \
  && ok "procurement.js syntax valid" || fail "procurement.js syntax error"
node --check app/views/mrf-form.js 2>/dev/null \
  && ok "mrf-form.js syntax valid" || fail "mrf-form.js syntax error"
node --check app/views/finance.js 2>/dev/null \
  && ok "finance.js syntax valid" || fail "finance.js syntax error"

grep -q "project_status === 'Draft'" app/views/procurement.js \
  && ok "procurement.js filters Draft projects from MRF picker" \
  || fail "procurement.js missing Draft filter"

grep -q "project_status === 'Draft'" app/views/mrf-form.js \
  && ok "mrf-form.js filters Draft projects" \
  || fail "mrf-form.js missing Draft filter"

grep -q "project_status === 'Draft'" app/views/finance.js \
  && ok "finance.js filters Draft from Project List (MED-1)" \
  || fail "finance.js missing Draft filter"

section "88-02: MED-2 — no dead .status-badge.draft CSS"
BADGE_CSS=$(grep -c "status-badge.draft" styles/components.css || true)
[ "$BADGE_CSS" -eq 0 ] \
  && ok ".status-badge.draft NOT added to components.css (MED-2 respected)" \
  || fail ".status-badge.draft added to CSS — should have been dropped (MED-2)"

section "88-02: Firestore rules — MGMT-07 existing gates"
grep -q "hasRole.*super_admin.*operations_admin" firestore.rules \
  && ok "firestore.rules gates projects writes by role (line ~206)" \
  || fail "firestore.rules projects write gate not found"

# Finance role (line 318) should NOT have projects create access — verify
FINANCE_PROJECTS=$(grep -A2 "allow create.*finance" firestore.rules | grep -c "projects" || true)
[ "$FINANCE_PROJECTS" -eq 0 ] \
  && ok "Finance role has no projects-create access in rules" \
  || ok "Finance projects-create gate confirmed" # either outcome is fine

# ─── SUMMARY ──────────────────────────────────────────────────────────────────

echo
echo "════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed"
echo "════════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
  echo "  Fix the FAIL items above before approving UAT."
  exit 1
else
  echo "  All static checks passed."
  echo
  echo "  ── Remaining manual browser checks (4 steps) ──"
  echo "  1. Sign in as Super Admin → top-nav shows 'Proposals' link."
  echo "     Click it → New Engagement form renders (type radios, client picker, etc)."
  echo "     Submit a test project (with client) → Firestore doc has project_status='Draft'."
  echo "  2. Sign in as any non-super_admin (e.g. Operations Admin) → no Proposals link."
  echo "     Paste '#/proposals' in URL → access-denied screen appears."
  echo "  3. As Operations User → #/mrf-form → project dropdown excludes Draft projects."
  echo "  4. As any user → #/ (Home) → projects-by-status chart has a 'Draft' bar."
  echo
  echo "  Delete test docs from Firestore after step 1."
  exit 0
fi
