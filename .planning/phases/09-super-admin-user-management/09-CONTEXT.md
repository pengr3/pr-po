# Phase 9: Super Admin User Management - Context

**Gathered:** 2026-02-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Super Admin controls user lifecycle - generating invitation codes, reviewing pending registrations with role assignment, managing active users (viewing, deactivating, deleting), and assigning projects. This phase delivers the admin interface for complete user management operations.

</domain>

<decisions>
## Implementation Decisions

### Invitation Code Generation
- **Format**: UUID-style (long, unique) - e.g., `a3f8b2c1-4d5e-6f7a-8b9c-0d1e2f3a4b5c`
- **Generation**: Single code at a time with copy-to-clipboard button
- **Expiration**: Codes expire after 3 hours if unused
- **Visibility**: Display all used and unused codes with status (used/unused)
- **Cleanup**: Expired codes are auto-deleted from database

### Pending User Approval Flow
- **Display**: Table layout with email, registration date, invitation code used, and action buttons
- **Role Assignment**: Modal opens before approval - admin selects role, then confirms approval in single step
- **Rejection**: Rejected accounts are deleted immediately (no "rejected" status, clean removal)
- **Information Shown**: Email, registration date, and which invitation code was used

### User List Display
- **Columns**: Email, Role, Status, Assigned Projects
- **Assigned Projects Format**: Show "All projects" for unrestricted users, or count (e.g., "3 projects") for specific assignments
- **Interaction**: Dropdown menu (three-dot) per row with actions: Edit Role, Assign Projects, Deactivate, Delete
- **Search**: Simple email search box (no role/status filters)

### User Actions (Deactivate/Delete)
- **Deactivation Confirmation**: Admin must type user's email address to confirm
- **Deletion**: Two-step process - can only delete users who are already deactivated
- **Last Super Admin Protection**: Hard block with error message - "Cannot deactivate last Super Admin"
- **Data Handling**: User's created data (MRFs, PRs, POs, etc.) remains unchanged - records show original creator email
- **Reactivation**: Deactivated users can be reactivated (reversible action)

### Design Principles
- **Clear Consequences**: Always show what will happen before action commits (e.g., "This will log them out immediately")
- **Reversible Actions**: Admin can reactivate deactivated users - mistakes are recoverable
- **Minimal Clicks**: Common tasks (approve user, generate code) should be efficient and fast
- **Audit Trail**: Show who did what and when for accountability

</decisions>

<specifics>
## Specific Ideas

No specific requirements - open to standard admin interface approaches that follow the design principles above.

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

*Phase: 09-super-admin-user-management*
*Context gathered: 2026-02-04*
