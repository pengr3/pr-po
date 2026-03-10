# Phase 62.3: Client Search Bar + Dropdown Sort by Code

## Status: COMPLETE

## Changes Made

### 1. Client Search Bar (clients.js)
- Added search input above the clients table (`#clientSearchInput`)
- Searches by client code or company name (case-insensitive)
- Resets pagination on filter change
- Shows "No clients match your search" when filtered results are empty
- Added `filterClients` window function + cleanup in `destroy()`

### 2. Dropdown Sort by Code (mrf-form.js + procurement.js)
- **mrf-form.js**: `cachedProjects` sorted by `project_code` (was `project_name`)
- **mrf-form.js**: `cachedServices` sorted by `service_code` (was `service_name`)
- **procurement.js**: `projectsData` sorted by `project_code` (was `project_name`)
- **procurement.js**: `cachedServicesForNewMRF` sorted by `service_code` (was `service_name`)

## Files Modified
- `app/views/clients.js` — search bar + filter logic
- `app/views/mrf-form.js` — sort by code (2 locations)
- `app/views/procurement.js` — sort by code (2 locations)
- `.planning/ROADMAP.md` — phase entry
