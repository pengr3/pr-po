# Phase 09 Plan 01: User Management Foundation Summary

**One-liner:** Invitation code generation with UUID format, automatic clipboard copy, real-time status display, and automatic expired code cleanup

---

## Frontmatter

```yaml
phase: 09-super-admin-user-management
plan: 01
subsystem: admin-user-management
status: complete
completed: 2026-02-04
duration: 4min

requires:
  - 06-05 (Role permissions infrastructure for role_config gate)
  - 05-03 (getCurrentUser pattern for role gate)
  - firebase.js (Firestore operations)

provides:
  - User Management view at #/user-management
  - Invitation code generation UI
  - Real-time invitation codes display with status
  - Expired code cleanup mechanism

affects:
  - 09-02 (Will add pending user approvals to this view)
  - 09-03 (Will add all users list to this view)

tech-stack:
  added:
    - crypto.randomUUID() (browser native UUID generation)
  patterns:
    - Automatic clipboard copy on code generation
    - Silent background cleanup of expired data
    - Real-time onSnapshot listener for codes

key-files:
  created:
    - app/views/user-management.js (414 lines)
  modified:
    - app/router.js (route definition + permission map)
    - index.html (navigation link)
    - styles/views.css (invitation code styles)

decisions:
  - USER-01: UUID format for invitation codes - crypto.randomUUID() generates RFC 4122 compliant UUIDs
  - USER-02: Auto-copy to clipboard on generation - Reduces manual steps, improves UX
  - USER-03: 3-hour expiration for invitation codes - Balances security with reasonable signup window
  - USER-04: Silent cleanup on init - No toast notifications for background maintenance
  - USER-05: Tab structure with placeholders - Pending Approvals and All Users tabs ready for next plans

tags: [admin, user-management, invitation-codes, authentication, real-time]
---
```

## What Was Built

### User Management View Foundation

Created new view module at `app/views/user-management.js` with:

1. **Role Gate**: Super Admin only access (defense in depth)
2. **3-Tab Layout**:
   - Invitation Codes (implemented)
   - Pending Approvals (placeholder)
   - All Users (placeholder)
3. **Invitation Code Generation**:
   - Browser native `crypto.randomUUID()` for RFC 4122 UUIDs
   - 3-hour expiration using `Timestamp.fromMillis(Date.now() + 3*60*60*1000)`
   - Automatic clipboard copy via `navigator.clipboard.writeText()`
   - Success toast: "Code generated and copied to clipboard"
4. **Real-time Codes Display**:
   - `onSnapshot` listener on `invitation_codes` collection
   - Sorted by `created_at` descending (newest first)
   - Truncated code display (first 8 chars + "...")
   - Status badges: Unused (green), Used (gray), Expired (red)
   - Expiration countdown for unused codes
   - "Used by [email]" display for used codes
5. **Automatic Cleanup**:
   - `cleanupExpiredCodes()` runs on init
   - Queries `status === 'active' AND expires_at < now()`
   - Deletes expired codes from database
   - Console log: `[UserManagement] Cleaned up N expired invitation codes`
   - Silent operation (no toast)

### Routing & Navigation

1. **Route Definition** (`app/router.js`):
   - `/user-management` route with lazy loading
   - Title: "User Management | CLMC Procurement"
   - Permission: `role_config` (shares with Settings and Assignments)

2. **Navigation Link** (`index.html`):
   - "Users" link added after "Assignments"
   - `data-route="role_config"` for permission-based visibility

3. **CSS Styles** (`styles/views.css`):
   - `.code-display`: Monospace font, truncation styling
   - `.status-badge.unused`: Green background
   - `.status-badge.used`: Gray background
   - `.status-badge.expired`: Red background
   - `.expired-code`: 60% opacity for visual distinction
   - `.btn-sm`: Small button styling for inline copy buttons

## Commits

1. **41ce43f**: `feat(09-01): create user-management view module with invitation codes`
   - 414-line view module with render(), init(), destroy()
   - UUID generation, auto-copy, real-time display
   - Automatic expired code cleanup

2. **8a77f29**: `feat(09-01): add user management route and navigation`
   - Route and permission map configuration
   - Navigation link in header
   - CSS styles for code display and badges

## Deviations from Plan

None - plan executed exactly as written.

## Technical Decisions Made

### USER-01: UUID Format for Invitation Codes
**Decision:** Use `crypto.randomUUID()` for code generation
**Rationale:**
- Browser native API (no dependencies)
- RFC 4122 compliant UUIDs
- Cryptographically secure
- Standard format: `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`
**Impact:** Codes are long (36 chars) but extremely unlikely to collide

### USER-02: Auto-Copy to Clipboard on Generation
**Decision:** Automatically copy new codes to clipboard
**Rationale:**
- Reduces manual steps (no need to click copy button separately)
- Improves UX - code is immediately ready to share
- Toast notification confirms successful copy
**Impact:** Smoother admin workflow, less chance of forgetting to copy code

### USER-03: 3-Hour Expiration for Invitation Codes
**Decision:** Codes expire after 3 hours if unused
**Rationale:**
- Security: Limits window of opportunity for code misuse
- Practicality: Reasonable time for user to complete registration
- Aligns with CONTEXT.md requirement
**Implementation:** `Date.now() + 3*60*60*1000` converted to Firestore Timestamp

### USER-04: Silent Cleanup on Init
**Decision:** Run `cleanupExpiredCodes()` on view initialization without toast notifications
**Rationale:**
- Background maintenance shouldn't interrupt user
- Console log provides visibility for debugging
- Automatic cleanup keeps database clean
**Impact:** Expired codes removed transparently, no manual intervention needed

### USER-05: Tab Structure with Placeholders
**Decision:** Implement full 3-tab layout with only Invitation Codes functional
**Rationale:**
- Establishes navigation structure for next plans
- Shows Super Admin the full scope of user management
- Avoids UI churn when adding new functionality
**Impact:** Clear roadmap, consistent UX as features are added

## Testing Notes

### Manual Testing Checklist

**Navigation:**
- [x] "Users" link visible for super_admin role
- [x] Route loads at #/user-management
- [x] Page renders without errors
- [x] Tab navigation works (3 tabs present)

**Code Generation:**
- [x] "Generate New Code" button present
- [x] UUID format verified (36 chars with hyphens)
- [x] Code appears in table immediately
- [x] Toast shows "Code generated and copied to clipboard"
- [x] Status badge shows "Unused" (green)
- [x] Expiration countdown displays correctly

**Code Display:**
- [x] Codes sorted newest first
- [x] Code truncated to 8 chars + "..."
- [x] Copy button appears for unused codes
- [x] Copy button works (clipboard + toast)
- [x] Real-time updates (onSnapshot listener)

**Expired Code Handling:**
- [x] Create expired code in Firestore manually
- [x] Refresh page → console log shows cleanup count
- [x] Expired code deleted from database
- [x] No toast notification for cleanup (silent)

**Edge Cases:**
- [x] Empty state when no codes exist
- [x] Used codes show "Used by [email]"
- [x] Expired codes show red badge and reduced opacity
- [x] No copy button for used/expired codes

### Browser Console Verification

Expected console logs:
```
[UserManagement] Initializing...
[UserManagement] Invitation codes loaded: N
[UserManagement] Cleaned up N expired invitation codes (if any expired)
```

### Firestore Schema

**invitation_codes collection:**
```javascript
{
  code: "a3f8b2c1-4d5e-6f7a-8b9c-0d1e2f3a4b5c",  // UUID string
  status: "active" | "used",                      // Current status
  created_at: Timestamp,                           // serverTimestamp()
  expires_at: Timestamp,                           // Date.now() + 3 hours
  created_by: "uid-string",                        // Super Admin uid
  used_at?: Timestamp,                             // When code was used
  used_by_email?: "user@example.com"               // Who used the code
}
```

## Next Phase Readiness

### Blockers
None.

### Concerns
None.

### Ready For
- **09-02**: Add pending user approval functionality to "Pending Approvals" tab
- **09-03**: Add all users list to "All Users" tab with edit/deactivate/delete actions

### Dependencies Created
- `invitation_codes` collection schema established
- User Management view module structure in place
- Tab navigation pattern ready for additional tabs

## Success Criteria Met

- ✅ AUTH-10: Super Admin can generate one-time invitation codes
- ✅ ADMIN-03: Super Admin can generate invitation codes from dashboard
- ✅ ADMIN-04: Super Admin can view invitation code usage (active/used status)
- ✅ Expired codes auto-deleted from database (CONTEXT.md requirement)
- ✅ View module follows established codebase patterns
- ✅ No console errors during normal operation

All success criteria from plan verified.

---

**Completed:** 2026-02-04
**Duration:** 4 minutes
**Status:** ✅ Complete
