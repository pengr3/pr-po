---
status: testing
phase: 84-notification-triggers-existing-events
source: 84-01-SUMMARY.md, 84-02-SUMMARY.md, 84-03-SUMMARY.md, 84-04-SUMMARY.md
started: 2026-04-30T09:00:00Z
updated: 2026-04-30T09:00:00Z
---

## Current Test

number: 1
name: MRF Rejected — Requestor Receives Notification
expected: |
  Open an MRF as a procurement officer. Click Reject. After rejection completes,
  the requestor (logged in on another tab/account) should see a new notification
  in their bell showing the MRF was rejected (e.g. "MRF-2026-### has been rejected").
awaiting: user response

## Tests

### 1. MRF Rejected — Requestor Receives Notification
expected: Open an MRF as a procurement officer. Click Reject. After rejection completes, the requestor (logged in on another tab/account) should see a new notification in their bell showing the MRF was rejected (e.g. "MRF-2026-### has been rejected").
result: [pending]

### 2. MRF Approved via Generate PR — Requestor Receives Notification
expected: Approve an MRF via Generate PR. The requestor should receive a notification that their MRF was approved, with the PR ID mentioned (e.g. "Your MRF-2026-### has been approved. PR-2026-### generated.").
result: [pending]

### 3. MRF Approved via Generate PR+TR — Requestor Receives Notification
expected: Approve an MRF via Generate PR and TR together. The requestor should receive an approved notification referencing both the PR and TR IDs.
result: [pending]

### 4. PR Generated — Finance Receives Review Notification
expected: After generating a PR (from any path), Finance role users should receive a notification indicating a PR needs review (e.g. "PR-2026-### needs Finance review").
result: [pending]

### 5. TR Submitted — Finance Receives Review Notification
expected: After submitting a standalone Transport Request, Finance role users should receive a notification that a TR needs review.
result: [pending]

### 6. RFP Submitted — Finance Receives Review Notification
expected: After submitting any RFP (standard, TR-based, or Delivery Fee), Finance role users should receive a notification that an RFP needs review.
result: [pending]

### 7. Project/Service Status Change — Personnel Receive Notification
expected: Open a project (or service) detail page. Change the project_status field to a meaningful value (e.g. "On-going", "Completed", "Client Approved", "For Mobilization", or "Loss"). Personnel assigned to that project should receive a PROJECT_STATUS_CHANGED notification. Status changes to non-whitelisted values should NOT send notifications.
result: [pending]

### 8. New User Registration — Super Admins Receive Notification
expected: Register a new user account using a valid invitation code. After registration completes, all active super_admin users should receive a notification indicating a new user is pending approval/review (e.g. "New user registration pending").
result: [pending]

## Summary

total: 8
passed: 0
issues: 0
pending: 8
skipped: 0
blocked: 0

## Gaps

[none yet]
