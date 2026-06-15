# Phase 5: Core Authentication - Context

**Gathered:** 2026-01-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can register with invitation codes and authenticate securely. This phase covers registration flow, login/logout, session management, and pending user experience. Password reset, OAuth providers, and advanced auth features are out of scope.

</domain>

<decisions>
## Implementation Decisions

### Registration flow & form
- **Required fields:** Email, password, invitation code, full name
- **Invitation code input:** Pre-filled from URL parameter (registration link includes code as query param, field is pre-filled and disabled)
- **Password requirements:** Standard - 8+ characters, mixed case, at least one number
- **Validation strategy:** Client + server validation (client validates format/requirements for instant feedback, Firebase/Firestore validates code status and enforces rules)

### Session persistence & login UX
- **Session duration:** 1 day with auto-renewal
- **Remember Me option:** No - fixed 1-day session for everyone
- **Post-registration flow:** User must manually login after successful registration (not auto-logged in)
- **Session expiry handling:** Silent re-auth if possible, else redirect to login page
- **Login page features:** Basic email/password form only (no forgot password, no registration link)
- **Logout placement:** Logout button in header/nav, always visible
- **Logout confirmation:** Yes - modal asking "Are you sure?"
- **Post-logout behavior:** Redirect to login page

### Pending user experience
- **What pending users see:** Dedicated "awaiting approval" page (no navigation, no system access)
- **Approval page content:** Message + estimated timeline ("Approvals typically take 24-48 hours") + logout button
- **Status checking:** Yes - manual refresh button to check if approved
- **Rejection handling:** User sees rejection message when checking status ("Your registration was not approved. Please contact admin.")

### Error states & messaging
- **Authentication error detail:** Generic - "Invalid credentials" (don't reveal if email exists or password is wrong)
- **Invalid invitation code:** Show error inline below code field ("Invalid or already used invitation code")
- **Network/Firebase errors:** Technical message from Firebase directly (show raw Firebase error codes)
- **Validation errors placement:** Inline only on submit attempt (no real-time validation, all errors shown when Register button clicked)

### Claude's Discretion
- Exact styling and layout of forms
- Loading states and spinners
- Transition animations between states
- Exact wording of success messages
- Firebase Auth configuration details

</decisions>

<specifics>
## Specific Ideas

- Registration link format: `/register?code=ABC123` (invitation code in URL)
- Approval timeline messaging: "24-48 hours" as typical expectation
- Session behavior follows Firebase Auth defaults with 1-day expiry
- Keep UI consistent with existing CLMC procurement system design language

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope

</deferred>

---

*Phase: 05-core-authentication*
*Context gathered: 2026-01-31*
