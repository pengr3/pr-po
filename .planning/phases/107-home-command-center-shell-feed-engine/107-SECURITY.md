---
phase: 107
slug: home-command-center-shell-feed-engine
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-10
---

# Phase 107 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Verified by gsd-security-auditor on 2026-07-10 — 3/3 threats CLOSED with file:line evidence.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| user (browser) → Firestore | Feed sources (`app/home-feed.js`) issue reads on behalf of the signed-in user; returned items deep-link to actions (proposal approve/reject). KPI/Your Work/Recent Activity panels (`app/views/home.js`) issue scoped `getDocs` reads. | Proposal / MRF / PR / TR / notification metadata scoped to the user's role, ownership, and assignments. No new collections introduced. |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-107-01 | Information Disclosure | Feed sources surfacing items outside the user's permission/assignment scope (scoping bypass — HOME-02) | mitigate | Client scoping reuses existing app predicates: approver gate `['super_admin','operations_admin']` (`home-feed.js:256`), ownership `created_by==uid` (`home-feed.js:303`), `requestor_name==full_name` + `status=='Rejected'` (`home-feed.js:336-337`), dept scope `scopeProposalToDept` mirroring `filterProposalsForUser` (`home-feed.js:242-247`, applied `262-266`). Firestore rules are the real boundary (defense-in-depth) — `firestore.rules:384` (`mrfs`: get=isActiveUser, list role/assignment-scoped `393-396`), `firestore.rules:920-922` (`proposals`: read=isActiveUser). No new collections → no new rules. | closed |
| T-107-02 | Elevation of Privilege | A feed row invoking a destructive action the user shouldn't perform | accept/mitigate | Engine emits only handler-name + id, no new UI (`home-feed.js:282`). Dispatch bridges to the existing handler via `window[dl.handler](dl.arg)` (`home.js:1292-1294`). The only destructive deep-link (proposal reject) reuses the EXISTING `_openHomeQueueModal(id,'reject')` → `_homeQueueConfirmAction` path: red `btn-danger` confirm (`home.js:852`), rejection reason ≥10 chars (`home.js:908-914`), fresh `getDoc` re-check `status==='pending_internal'` before write (`home.js:895-902`, on-open `833-839`). | closed |
| T-107-03 | Tampering | A single failing/malicious source poisoning the whole feed | mitigate | `assembleFeed` wraps each source in `try/catch`; a failure is logged and skipped, `failedCount++`, feed continues (`home-feed.js:206-214`). Error state only when EVERY source fails: `allSourcesFailed = sourceFns.length > 0 && failedCount === sourceFns.length` (`home-feed.js:222`). | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

**107.4 Recent Activity read-only claim (informal, verified):** `markNotificationRead` absent from `home.js` (0 matches) — Recent Activity is strictly read-only. Rows call `window.ccOpenActivity(idx)` (`home.js:625`), whose handler reads the cached doc and sets `location.hash = n.link || …` (`home.js:1309-1312`) — the notification `link` is a navigation target, never interpolated into an HTML attribute (attribute injection avoided).

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-107-01 | T-107-01 | **Pre-existing, not a Phase 107 regression.** `firestore.rules:922` grants `allow read: if isActiveUser()` on `proposals` — any active user can read all proposals; the per-dept scoping in `sourceProposalsAwaitingApproval` (`home-feed.js:266`) is therefore client-side UX only. The T-107-01 "tamper-still-can't-read" guarantee holds strongly for `mrfs` (list is role/assignment-scoped) but is weaker for `proposals`. This is a property of the existing proposals rules (Phase 87.3 lineage); Phase 107 surfaces nothing the existing `filterProposalsForUser` path did not already surface. Tracked for a future proposals-rule tightening pass, not blocking. | pengr.clmc.3 (super_admin) | 2026-07-10 |
| AR-107-02 | T-107-02 | **Pre-existing, not a Phase 107 regression.** `window.homeQueueOpenApproveModal` is a global handler callable by any session, not just approvers; the feed only *surfaces* it to approvers. Real write authorization is the proposal `update` rule + the fresh `getDoc` status re-check inside the modal. Inherited from Phase 87.1; matches the "accept" half of T-107-02's disposition. | pengr.clmc.3 (super_admin) | 2026-07-10 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-10 | 3 | 3 | 0 | gsd-security-auditor (spawned by /gsd-secure-phase 107) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-10
