---
status: resolved
trigger: "Investigate this UAT issue: The View PO button and dynamic fields prompt (promptPODocument, generatePOWithFields) were added to Procurement (app/views/procurement.js) but the user says Finance users need this function in Finance (app/views/finance.js) since there's no way for finance users to retrieve PO documents."
created: 2026-02-08T00:00:00Z
updated: 2026-02-08T00:30:00Z
---

## Current Focus

hypothesis: View PO button exists in procurement.js but not in finance.js Purchase Orders tab
test: Reading both files to locate PO rendering and View PO button
expecting: Find exact location of View PO button in procurement.js and identify where it should go in finance.js
next_action: Read finance.js to examine Purchase Orders tab rendering

## Symptoms

expected: Finance users should be able to view/generate PO documents from Finance view
actual: View PO button only exists in Procurement view, not accessible to Finance users
errors: None reported
reproduction: Navigate to Finance > Purchase Orders tab - no View PO button available
started: After View PO button was added to procurement.js only

## Eliminated

## Evidence

- timestamp: 2026-02-08T00:10:00Z
  checked: finance.js Purchase Orders tab (lines 258-270, 1796-1846)
  found: PO table renders with "View in Procurement" button (line 1838) that redirects to #/procurement/tracking
  implication: Finance users cannot view/generate PO documents from Finance view

- timestamp: 2026-02-08T00:12:00Z
  checked: procurement.js tabs structure (lines 106-127)
  found: Only 3 tabs exist - "mrfs", "suppliers", "records" (MRF Records). NO "tracking" tab exists
  implication: The redirect button in finance.js points to non-existent #/procurement/tracking route

- timestamp: 2026-02-08T00:15:00Z
  checked: procurement.js for View PO button location (line 3722)
  found: "View PO" button exists in renderPOTrackingTable() which renders PO rows in "records" tab (MRF Records section)
  implication: View PO functionality is in procurement.js "records" tab, not a separate "tracking" tab

- timestamp: 2026-02-08T00:18:00Z
  checked: promptPODocument and generatePOWithFields functions (lines 4962-5051)
  found: Functions exist in procurement.js and are attached to window (lines 89-90)
  implication: These functions can be called from finance.js if properly imported/referenced

- timestamp: 2026-02-08T00:20:00Z
  checked: Dependencies for PO document functions
  found: Functions use createModal, openModal, closeModal from components.js; also use generatePODocument (line 5045)
  implication: Need to import components.js functions and potentially duplicate generatePODocument in finance.js

- timestamp: 2026-02-08T00:22:00Z
  checked: finance.js imports (lines 6-7)
  found: Only imports firebase, utils.js. Does NOT import components.js
  implication: Need to add components.js import to use createModal/openModal/closeModal

- timestamp: 2026-02-08T00:25:00Z
  checked: generatePODocument function and dependencies (lines 4909-4955)
  found: Uses formatDocumentDate (4843), generateItemsTableHTML (4387), generatePOHTML (4611), openPrintWindow (4819), DOCUMENT_CONFIG (4370)
  implication: To duplicate View PO functionality in finance.js, need to copy 6 functions + 1 config object (~550 lines total)

## Resolution

root_cause: View PO button (promptPODocument) and document generation (generatePOWithFields) only exist in procurement.js. Finance view only has a redirect button to non-existent #/procurement/tracking (line 1838). Finance users have no way to generate/view PO documents from Finance view. Additionally, the redirect points to a non-existent route (#/procurement/tracking doesn't exist - only mrfs, suppliers, records tabs exist).

fix:
**Option A: Duplicate all PO document generation code (~550 lines)**
1. Import createModal, openModal, closeModal from components.js into finance.js (line 7)
2. Copy DOCUMENT_CONFIG object (procurement.js line 4370)
3. Copy 5 helper functions:
   - formatDocumentDate (line 4843)
   - generateItemsTableHTML (line 4387)
   - generatePOHTML (line 4611)
   - openPrintWindow (line 4819)
   - generatePODocument (line 4909)
4. Copy promptPODocument (line 4962)
5. Copy generatePOWithFields (line 5024)
6. Replace "View in Procurement" button (line 1838) with "View PO" button calling promptPODocument
7. Attach new functions to window in attachWindowFunctions()
8. Clean up functions in destroy()

**Option B: Create shared document generation module (RECOMMENDED)**
1. Create app/document-generator.js with all document generation functions
2. Export functions from document-generator.js
3. Import into both finance.js and procurement.js
4. Replace button in finance.js renderPOs() (line 1838)

**Option C: Call window functions from procurement.js (RISKY)**
Finance calls window.promptPODocument() directly - only works if user visited procurement first.

Recommended approach: Option B (shared module) for maintainability, or Option A if time-constrained.

verification: After adding View PO button, Finance users should be able to:
1. Navigate to Finance > Purchase Orders tab
2. Click "View PO" button on any PO row
3. See modal with payment terms, condition, delivery date fields
4. Click "Generate PO Document" to view/download PO PDF
5. Should work even if user never visited Procurement view

files_changed:
**Option A (Duplication):**
- app/views/finance.js:
  - Line 7: Add import { createModal, openModal, closeModal } from '../components.js'
  - After line 18: Add DOCUMENT_CONFIG, all helper functions
  - Line 25-59: Add window.promptPODocument, window.generatePOWithFields to attachWindowFunctions
  - Line 703-756: Add cleanup in destroy()
  - Line 1838: Replace button with View PO

**Option B (Shared Module):**
- app/document-generator.js: NEW FILE with all document generation code
- app/views/finance.js: Import from document-generator, add button
- app/views/procurement.js: Import from document-generator instead of local functions
