---
status: resolved
trigger: "PR Creator Attribution shows 'Unknown User' for newly created PRs"
created: 2026-02-07T06:30:00Z
updated: 2026-02-07T06:30:00Z
---

## Current Focus

hypothesis: User attribution fields (pr_creator_user_id, pr_creator_name) are not being set when updating rejected PRs or merging into approved PRs
test: Code review of all three PR generation paths (new PR, rejected PR update, approved PR merge)
expecting: Two code paths missing pr_creator field assignment
next_action: Document root cause and provide fix recommendation

## Symptoms

expected: When you generate a PR from an MRF, the PR Details modal should display your name in the "Prepared By" field
actual: User reported "prepared by displays 'Unknown User' in PR Modal"
errors: None - fallback value working as designed
reproduction: Generate PR for MRF that has a previously rejected PR OR has an approved PR (update/merge paths)
started: Phase 17-01 implementation - feature works for NEW PRs only

## Eliminated

- hypothesis: getCurrentUser() is not working correctly
  evidence: Code shows getCurrentUser() is called at start of generatePR() and session check passes (lines 2931-2936)
  timestamp: 2026-02-07T06:30:00Z

- hypothesis: PR Details modal is not displaying the field correctly
  evidence: Modal code shows proper display with fallback to "Unknown User" (lines 3930-3934 in viewPRDetails)
  timestamp: 2026-02-07T06:30:00Z

- hypothesis: currentUser object doesn't have full_name property
  evidence: auth.js shows currentUser is populated from Firestore user document which includes full_name field (line 213)
  timestamp: 2026-02-07T06:30:00Z

## Evidence

- timestamp: 2026-02-07T06:30:00Z
  checked: Phase 17-01 plan and summary documents
  found: Feature should capture pr_creator_user_id and pr_creator_name in all generated PRs
  implication: Implementation should handle all three PR generation paths

- timestamp: 2026-02-07T06:30:00Z
  checked: generatePR() function in app/views/procurement.js (lines 2923-3200)
  found: Function has THREE distinct code paths for PR generation:
    1. NEW PR creation (lines 3120-3148) - HAS pr_creator fields ✓
    2. Rejected PR update (lines 3082-3095) - MISSING pr_creator fields ✗
    3. Approved PR merge (lines 3096-3119) - MISSING pr_creator fields ✗
  implication: User attribution only works for path 1 (new PRs), not paths 2 and 3

- timestamp: 2026-02-07T06:30:00Z
  checked: Lines 3086-3092 (rejected PR update path)
  found: updateDoc() call includes items_json, total_amount, finance_status, updated_at, resubmitted_at - but NOT pr_creator fields
  implication: When reusing rejected PR, the old pr_creator fields remain unchanged (likely null or from original creator)

- timestamp: 2026-02-07T06:30:00Z
  checked: Lines 3109-3115 (approved PR merge path)
  found: updateDoc() call includes items_json, total_amount, updated_at, items_merged - but NOT pr_creator fields
  implication: When merging into approved PR, pr_creator fields remain from original creator

- timestamp: 2026-02-07T06:30:00Z
  checked: Lines 3141-3142 (new PR creation path)
  found: pr_creator_user_id and pr_creator_name fields ARE included in prDoc object
  implication: Feature works correctly for NEW PRs only

## Resolution

root_cause: Phase 17-01 implementation incomplete - user attribution fields (pr_creator_user_id, pr_creator_name) are only added when creating NEW PRs (line 3141-3142), but are NOT added when updating rejected PRs (lines 3086-3092) or merging into approved PRs (lines 3109-3115)

fix: Add pr_creator fields to both updateDoc() calls:
1. Rejected PR update path (after line 3089): Add pr_creator_user_id and pr_creator_name
2. Approved PR merge path (after line 3112): Add pr_creator_user_id and pr_creator_name

verification:
- Test new PR creation (should already work)
- Test PR generation when MRF has rejected PR (should now capture current user)
- Test PR generation when MRF has approved PR (should now capture current user who added items)

files_changed:
  - app/views/procurement.js: Lines 3086-3092 (rejected PR update)
  - app/views/procurement.js: Lines 3109-3115 (approved PR merge)
