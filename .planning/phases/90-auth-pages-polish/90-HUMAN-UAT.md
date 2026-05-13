---
status: partial
phase: 90-auth-pages-polish
source: [90-VERIFICATION.md]
started: 2026-05-13T00:00:00Z
updated: 2026-05-13T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Login with active credentials — URL settles on #/
expected: After signing in, browser hash ends on #/ with no intermediate flash of #/login
result: [pending]

### 2. Login with intendedRoute set (e.g. sessionStorage key = '/procurement/mrfs')
expected: URL lands on #/procurement/mrfs after login; sessionStorage key cleared
result: [pending]

### 3. Login with pending/rejected account
expected: URL settles on #/pending; no bounce
result: [pending]

### 4. Login with deactivated account
expected: User signed out immediately; URL is #/login; error shown
result: [pending]

### 5. Registration success — complete form with valid invitation code
expected: Green #generalSuccess block shown with "Account created! Redirecting to login..."; #registerForm hidden; immediate redirect to #/login (no 2s delay)
result: [pending]

### 6. Registration error path — submit with invalid data
expected: Red .auth-error elements appear; #generalSuccess stays hidden; #registerForm stays visible
result: [pending]

### 7. "Forgot password?" link visible on login form
expected: Link visible below password field, right-aligned
result: [pending]

### 8. Clicking "Forgot password?" toggles panels
expected: #loginForm hidden, #forgotPanel visible, #resetEmail receives focus
result: [pending]

### 9. Send Reset Link with valid registered email
expected: "Password reset email sent. Check your inbox..." shown; "Cancel" → "Back to Login"; Firebase sends email
result: [pending]

### 10. Send Reset Link with unregistered email
expected: "No account found with that email address." error shown
result: [pending]

### 11. Cancel / Back to Login restores login form
expected: #forgotPanel hidden, #loginForm restored, #resetEmail cleared, buttons reset to default state
result: [pending]

## Summary

total: 11
passed: 0
issues: 0
pending: 11
skipped: 0
blocked: 0

## Gaps
