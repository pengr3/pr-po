# Phase 2: Projects Core - Research

**Researched:** 2026-01-25
**Domain:** Project management with auto-generated composite IDs, dependent dropdowns, and dual-status tracking
**Confidence:** HIGH

## Summary

Phase 2 implements project management with auto-generated composite project codes (CLMC_CLIENT_YYYY###), dual-status tracking (Internal Status and Project Status), and client-dependent dropdown population. The standard approach follows the existing clients view pattern but adds complexity: composite ID generation requires querying existing projects filtered by client and year, client dropdown must be populated from Firestore, and two separate status dropdowns need predefined option lists.

The codebase already has proven patterns for CRUD operations (clients.js), sequential ID generation (utils.js generateSequentialId), and real-time listeners. The new challenges are: (1) composite IDs with client reference requiring per-client uniqueness checks, (2) populating client dropdown from Firestore collection, (3) optional field validation for positive numbers (budget, contract_cost), and (4) managing dual status fields with predefined options.

**Primary recommendation:** Follow clients.js CRUD pattern but extend generateSequentialId() to handle composite format with client prefix. Use onSnapshot for client dropdown population (real-time updates). Implement client-side validation for positive numbers using HTML5 min="0" plus JavaScript parseFloat checks. Store both status fields as separate string fields with validation against predefined arrays.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Firebase Firestore | 10.7.1 | Database & real-time sync | Already integrated, project requirement |
| ES6 Modules | Native | Code organization | Zero-build architecture requirement |
| Hash-based Router | Custom | SPA navigation | Existing router.js with lazy loading |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| utils.js | Custom | Sequential ID generation, validation | Extend for composite IDs |
| components.js | Custom | UI components | Reuse for forms, modals |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Client-side uniqueness | Firebase Extensions (Field Uniqueness) | Extension requires backend function, increases complexity for v1.0 |
| Custom dropdown library | Nice-select2, BVSelect | Zero-dependency requirement, native select sufficient |
| Form library | HTML5 validation API | Native validation matches existing pattern |

**Installation:**
```bash
# No installation needed - all dependencies already in place
# Firebase loaded via CDN in index.html
```

## Architecture Patterns

### Recommended Project Structure
```
app/
├── views/
│   ├── clients.js           # Existing - reference pattern
│   └── projects.js          # New - project CRUD view
├── router.js                # Add /projects route
├── utils.js                 # Extend generateSequentialId for composite IDs
└── firebase.js              # Already configured

Firestore Collections:
clients/
  {clientId}/
    - client_code: "ACME"
    - company_name: "ACME Corp"
    - contact_person: "John Doe"
    - contact_details: "..."

projects/
  {projectId}/
    - project_code: "CLMC_ACME_2026001"
    - project_name: "Office Renovation"
    - client_id: "abc123"          # Reference to clients collection
    - client_code: "ACME"           # Denormalized for filtering
    - internal_status: "For Proposal"
    - project_status: "Pending Client Review"
    - budget: 500000                # Optional, positive number
    - contract_cost: 450000         # Optional, positive number
    - personnel: "John, Jane"       # Optional, freetext
    - active: true                  # Boolean, default true
    - created_at: "2026-01-25T..."
    - updated_at: "2026-01-25T..."  # Optional
```

### Pattern 1: Composite ID Generation with Client Prefix
**What:** Generate project codes in format CLMC_CLIENT_YYYY### where uniqueness is per-client per-year
**When to use:** Project creation
**Example:**
```javascript
// Source: Extended from app/utils.js generateSequentialId pattern (lines 146-171)
/**
 * Generate composite project code: CLMC_CLIENT_YYYY###
 * @param {string} clientCode - Client code (e.g., "ACME")
 * @param {number} year - Year for the project code
 * @returns {Promise<string>} Generated project code
 */
async function generateProjectCode(clientCode, year = null) {
    try {
        const currentYear = year || new Date().getFullYear();

        // Query projects for this client and year
        const q = query(
            collection(db, 'projects'),
            where('client_code', '==', clientCode),
            where('project_code', '>=', `CLMC_${clientCode}_${currentYear}000`),
            where('project_code', '<=', `CLMC_${clientCode}_${currentYear}999`)
        );

        const snapshot = await getDocs(q);

        let maxNum = 0;
        snapshot.forEach(doc => {
            const code = doc.data().project_code;
            // Extract number from CLMC_ACME_2026001
            const parts = code.split('_');
            if (parts.length === 3) {
                const yearAndNum = parts[2]; // "2026001"
                const num = parseInt(yearAndNum.substring(4)); // Extract "001"
                if (num > maxNum) {
                    maxNum = num;
                }
            }
        });

        const newNum = maxNum + 1;
        return `CLMC_${clientCode}_${currentYear}${String(newNum).padStart(3, '0')}`;
    } catch (error) {
        console.error('[Projects] Error generating project code:', error);
        throw error;
    }
}

// Example output: CLMC_ACME_2026001, CLMC_ACME_2026002, CLMC_XYZ_2026001
```

**Key considerations:**
- Uniqueness is per-client per-year (ACME can have 2026001, XYZ can also have 2026001)
- Client code stored in both project document (denormalized) for efficient filtering
- Firestore query limitation: Cannot query substring, must use range query
- Race condition possible with simultaneous creates (acceptable for v1.0, document in code)

### Pattern 2: Client Dropdown Population from Firestore
**What:** Populate select dropdown with clients from Firestore collection
**When to use:** Project create/edit forms
**Example:**
```javascript
// Source: Adapted from existing onSnapshot pattern in clients.js (lines 117-133)
let clientsData = [];
let listeners = [];

async function loadClientsDropdown() {
    try {
        const listener = onSnapshot(collection(db, 'clients'), (snapshot) => {
            clientsData = [];
            snapshot.forEach(doc => {
                clientsData.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            // Sort alphabetically by company name
            clientsData.sort((a, b) =>
                a.company_name.localeCompare(b.company_name)
            );

            renderClientDropdown();
        });

        listeners.push(listener);
    } catch (error) {
        console.error('[Projects] Error loading clients:', error);
    }
}

function renderClientDropdown() {
    const select = document.getElementById('projectClient');
    if (!select) return;

    // Keep existing selection if editing
    const currentValue = select.value;

    // Build options HTML
    let optionsHtml = '<option value="">-- Select Client --</option>';
    clientsData.forEach(client => {
        const selected = client.id === currentValue ? 'selected' : '';
        optionsHtml += `
            <option value="${client.id}"
                    data-code="${client.client_code}"
                    ${selected}>
                ${client.company_name} (${client.client_code})
            </option>
        `;
    });

    select.innerHTML = optionsHtml;
}

// In create/edit form
<select id="projectClient" required>
    <option value="">-- Select Client --</option>
    <!-- Populated by renderClientDropdown() -->
</select>
```

**Key considerations:**
- Real-time updates via onSnapshot keep dropdown current
- Store both client_id (reference) and client_code (denormalized) in project document
- Extract client_code from selected option's data attribute when creating project
- Sort alphabetically for better UX

### Pattern 3: Dual Status Dropdowns with Predefined Options
**What:** Two separate status fields with different predefined option sets
**When to use:** All project forms
**Example:**
```javascript
// Source: Defined by requirements PROJ-04 and PROJ-05

// Predefined status options
const INTERNAL_STATUS_OPTIONS = [
    'For Inspection',
    'For Proposal',
    'For Internal Approval',
    'Ready to Submit'
];

const PROJECT_STATUS_OPTIONS = [
    'Pending Client Review',
    'Under Client Review',
    'Approved by Client',
    'For Mobilization',
    'On-going',
    'Completed',
    'Loss'
];

// Validation function
function validateStatus(status, validOptions) {
    return validOptions.includes(status);
}

// In render() function
<div class="form-group">
    <label>Internal Status *</label>
    <select id="internalStatus" required>
        <option value="">-- Select Internal Status --</option>
        ${INTERNAL_STATUS_OPTIONS.map(status =>
            `<option value="${status}">${status}</option>`
        ).join('')}
    </select>
</div>

<div class="form-group">
    <label>Project Status *</label>
    <select id="projectStatus" required>
        <option value="">-- Select Project Status --</option>
        ${PROJECT_STATUS_OPTIONS.map(status =>
            `<option value="${status}">${status}</option>`
        ).join('')}
    </select>
</div>

// In save function
const internal_status = document.getElementById('internalStatus').value;
const project_status = document.getElementById('projectStatus').value;

if (!validateStatus(internal_status, INTERNAL_STATUS_OPTIONS)) {
    showToast('Invalid internal status', 'error');
    return;
}

if (!validateStatus(project_status, PROJECT_STATUS_OPTIONS)) {
    showToast('Invalid project status', 'error');
    return;
}
```

**Key considerations:**
- Store as plain string fields, not enums (Firestore doesn't have enums)
- Validate on both client and server side (when security rules added in v2.0)
- Case-sensitive matching required
- Arrays defined as constants at top of module

### Pattern 4: Optional Field Validation for Positive Numbers
**What:** Budget and contract_cost are optional but must be positive if provided
**When to use:** Project create/edit forms
**Example:**
```javascript
// Source: Inspired by HTML5 validation and requirement PROJ-17

// In render() function
<div class="form-group">
    <label>Budget (Optional)</label>
    <input
        type="number"
        id="projectBudget"
        min="0"
        step="0.01"
        placeholder="Enter budget amount"
    >
    <small class="form-hint">Leave blank if not applicable. Must be positive if provided.</small>
</div>

<div class="form-group">
    <label>Contract Cost (Optional)</label>
    <input
        type="number"
        id="contractCost"
        min="0"
        step="0.01"
        placeholder="Enter contract cost"
    >
    <small class="form-hint">Leave blank if not applicable. Must be positive if provided.</small>
</div>

// In save function
async function saveProject() {
    const budget = document.getElementById('projectBudget').value;
    const contract_cost = document.getElementById('contractCost').value;

    // Validate optional positive numbers
    const budgetNum = budget ? parseFloat(budget) : null;
    const contractNum = contract_cost ? parseFloat(contract_cost) : null;

    if (budgetNum !== null && (isNaN(budgetNum) || budgetNum < 0)) {
        showToast('Budget must be a positive number', 'error');
        return;
    }

    if (contractNum !== null && (isNaN(contractNum) || contractNum < 0)) {
        showToast('Contract cost must be a positive number', 'error');
        return;
    }

    // Store in Firestore (null if not provided, number if provided)
    await addDoc(collection(db, 'projects'), {
        project_name,
        client_id,
        client_code,
        internal_status,
        project_status,
        budget: budgetNum,          // null or positive number
        contract_cost: contractNum, // null or positive number
        personnel,
        active: true,
        created_at: new Date().toISOString()
    });
}
```

**Key considerations:**
- HTML5 min="0" provides UI-level constraint
- JavaScript validation ensures data integrity (users can bypass HTML5)
- Store as null (not 0 or empty string) if not provided
- parseFloat handles string-to-number conversion
- Check both isNaN and < 0 for complete validation

### Pattern 5: Active/Inactive Toggle
**What:** Boolean flag controlling whether MRFs can reference this project
**When to use:** Project list display and edit
**Example:**
```javascript
// Source: Requirement PROJ-06 and MRF integration requirements

// In render() function for edit form
<div class="form-group">
    <label>
        <input
            type="checkbox"
            id="projectActive"
            checked
        >
        Project Active (allows MRF creation)
    </label>
    <small class="form-hint">Uncheck to prevent new MRFs for this project. Existing MRFs remain valid.</small>
</div>

// In save function
const active = document.getElementById('projectActive').checked; // Boolean

await addDoc(collection(db, 'projects'), {
    // ... other fields
    active: active // Store as boolean
});

// In table display
<td>
    <span class="status-badge ${project.active ? 'approved' : 'rejected'}">
        ${project.active ? 'Active' : 'Inactive'}
    </span>
</td>

// In toggle function (inline action)
async function toggleProjectActive(projectId, currentStatus) {
    if (!confirm(`${currentStatus ? 'Deactivate' : 'Activate'} this project?`)) {
        return;
    }

    showLoading(true);

    try {
        await updateDoc(doc(db, 'projects', projectId), {
            active: !currentStatus,
            updated_at: new Date().toISOString()
        });

        showToast('Project status updated', 'success');
    } catch (error) {
        console.error('[Projects] Error toggling active:', error);
        showToast('Failed to update project', 'error');
    } finally {
        showLoading(false);
    }
}
```

**Key considerations:**
- Store as boolean, not string "active"/"inactive"
- Default to true for new projects
- MRF form queries `where('active', '==', true)` to filter dropdown
- Toggle doesn't affect existing MRFs (they keep their project reference)

### Anti-Patterns to Avoid
- **Auto-generating on client selection:** Don't generate project code until form submission - user might change client, causing confusion
- **Cascade deleting projects:** Don't implement cascade delete of MRFs when project deleted - orphaned references acceptable for v1.0, will be addressed in v2.0
- **String "0" for optional numbers:** Don't store "0" or "" for unset numbers - use null for clear semantics
- **Hardcoding status in validation:** Don't use if/else chains - validate against arrays for easy updates
- **Inline editing for projects:** Projects have many fields - use dedicated edit page/form, not inline table editing like clients

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sequential ID generation | Custom query and max logic | Extend utils.js generateSequentialId() | Already handles year-based sequencing, just add client prefix |
| Positive number validation | Regex patterns | HTML5 min + JavaScript parseFloat check | Native validation + simple JS covers all cases |
| Client dropdown population | Manual fetch and HTML | onSnapshot + render pattern from clients.js | Real-time updates, consistent with existing code |
| Uniqueness checking | Query every time | In-memory array check like clients.js | Faster, acceptable race condition for v1.0 |
| Form state management | Custom state object | Direct DOM access like existing views | Zero-dependency requirement, simple enough for project forms |
| Status badges | Custom CSS per status | Reuse getStatusClass() from utils.js | Consistent styling across views |

**Key insight:** Firestore lacks native unique constraints and enums. Client-side validation with in-memory checks is the standard pattern in this codebase. Accept race condition risk for v1.0 (document in code comments), defer robust solution to v2.0 with Firebase Functions.

## Common Pitfalls

### Pitfall 1: Composite ID Parsing Complexity
**What goes wrong:** Project code parsing fails when client code contains underscore (ACME_INC → CLMC_ACME_INC_2026001)
**Why it happens:** Naive split('_') returns 4+ parts instead of expected 3
**How to avoid:** Normalize client codes to alphanumeric only, OR use regex for parsing
**Warning signs:** Project code generation fails for certain clients, split() returns unexpected parts

**Prevention code:**
```javascript
// CORRECT - Use regex or handle variable parts
function parseProjectCode(code) {
    // Match pattern: CLMC_{anything}_YYYY###
    const match = code.match(/^CLMC_(.+)_(\d{4})(\d{3})$/);
    if (!match) return null;

    return {
        prefix: 'CLMC',
        client_code: match[1],  // Handles underscores in client code
        year: parseInt(match[2]),
        number: parseInt(match[3])
    };
}

// WRONG - Assumes exactly 3 parts
const parts = code.split('_'); // Breaks if client_code contains underscore
const client_code = parts[1];
```

**Recommendation:** CLIENT-05 allows manual client codes - add validation to prevent underscores in client codes (simpler solution).

### Pitfall 2: Client Dropdown Not Updating After New Client Added
**What goes wrong:** User creates new client, returns to project form, client not in dropdown
**Why it happens:** Project view doesn't have real-time listener for clients
**How to avoid:** Use onSnapshot for client dropdown, not one-time getDocs
**Warning signs:** Dropdown requires page refresh to show new clients

**Prevention:** Already addressed in Pattern 2 - use onSnapshot listener.

### Pitfall 3: Year Boundary Sequential ID Reset
**What goes wrong:** On January 1, project codes should reset to 001 but continue from previous year's max
**Why it happens:** Query doesn't filter by year properly
**How to avoid:** Query uses year-specific range in where clause
**Warning signs:** 2027 projects start at 004 instead of 001 when 2026 had 3 projects

**Prevention code:**
```javascript
// CORRECT - Year-specific range query
const q = query(
    collection(db, 'projects'),
    where('client_code', '==', clientCode),
    where('project_code', '>=', `CLMC_${clientCode}_${currentYear}000`),
    where('project_code', '<=', `CLMC_${clientCode}_${currentYear}999`)
);

// WRONG - Gets all years, picks max across years
const q = query(
    collection(db, 'projects'),
    where('client_code', '==', clientCode)
);
// This would continue from 2026003 in 2027 instead of resetting to 2027001
```

### Pitfall 4: Status Validation Case Sensitivity
**What goes wrong:** User manually edits Firestore document with "for proposal" (lowercase), UI breaks
**Why it happens:** Status validation is case-sensitive, expects exact match
**How to avoid:** Document that status fields are case-sensitive, add validation
**Warning signs:** Projects display with missing status, dropdown doesn't pre-select status

**Prevention code:**
```javascript
// Add defensive check when displaying
function displayInternalStatus(status) {
    if (!INTERNAL_STATUS_OPTIONS.includes(status)) {
        console.warn('[Projects] Invalid internal status:', status);
        return 'Unknown Status';
    }
    return status;
}

// In render
<select id="internalStatus" required>
    <option value="">-- Select Internal Status --</option>
    ${INTERNAL_STATUS_OPTIONS.map(opt => {
        const selected = opt === project.internal_status ? 'selected' : '';
        return `<option value="${opt}" ${selected}>${opt}</option>`;
    }).join('')}
</select>
```

### Pitfall 5: Budget/Contract Cost Validation Allows Zero
**What goes wrong:** Requirement says "positive numbers" but 0 passes validation
**Why it happens:** Checking `>= 0` instead of `> 0`
**How to avoid:** Use `> 0` if zero is not valid, or clarify requirement
**Warning signs:** Users can save $0 budget/contract cost

**Clarification needed:** PROJ-17 says "positive numbers" - does this include 0 or exclude 0?
- If exclude: use `budgetNum <= 0` in validation
- If include: use `budgetNum < 0` in validation

**Recommendation:** Interpret "positive" as > 0 (exclude zero), but make optional (null allowed).

### Pitfall 6: Client Code Denormalization Gets Out of Sync
**What goes wrong:** Client code updated in clients collection, project still shows old code
**Why it happens:** Client code denormalized in projects for filtering, not updated when client changes
**How to avoid:** Document that client code changes require manual project updates, OR implement cascade update
**Warning signs:** Project displays old client code, filtering by client code misses projects

**For v1.0:** Document limitation - client code changes don't cascade to projects. Workaround: don't change client codes after projects created.

**For v2.0:** Implement Firebase Function to cascade client code updates to all referencing projects.

### Pitfall 7: Edit Form Doesn't Pre-Fill Client Dropdown
**What goes wrong:** Edit form loads, client dropdown shows "-- Select Client --" despite project having client
**Why it happens:** Client dropdown re-renders async, loses selected value
**How to avoid:** Pass current client_id to renderClientDropdown, preserve selection
**Warning signs:** Edit form requires re-selecting client even though it's already set

**Prevention:** Already addressed in Pattern 2 - check currentValue before rendering options.

## Code Examples

Verified patterns adapted from existing codebase:

### Firestore Schema
```javascript
// Collection: projects
{
    project_code: "CLMC_ACME_2026001",     // String, auto-generated, unique per client per year
    project_name: "Office Renovation",     // String, required
    client_id: "abc123def456",              // String, reference to clients collection doc ID
    client_code: "ACME",                    // String, denormalized from client
    internal_status: "For Proposal",        // String, one of INTERNAL_STATUS_OPTIONS
    project_status: "Pending Client Review", // String, one of PROJECT_STATUS_OPTIONS
    budget: 500000.00,                      // Number or null, positive if provided
    contract_cost: 450000.00,               // Number or null, positive if provided
    personnel: "John Doe, Jane Smith",      // String or null, freetext
    active: true,                           // Boolean, default true
    created_at: "2026-01-25T10:30:00.000Z", // ISO string
    updated_at: "2026-01-25T11:45:00.000Z"  // ISO string, optional
}
```

### Complete View Module Template (projects.js)
```javascript
// app/views/projects.js
import { db, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, onSnapshot } from '../firebase.js';
import { showLoading, showToast } from '../utils.js';

// Global state
let projectsData = [];
let clientsData = [];
let currentPage = 1;
const itemsPerPage = 15;
let listeners = [];

// Status options
const INTERNAL_STATUS_OPTIONS = [
    'For Inspection',
    'For Proposal',
    'For Internal Approval',
    'Ready to Submit'
];

const PROJECT_STATUS_OPTIONS = [
    'Pending Client Review',
    'Under Client Review',
    'Approved by Client',
    'For Mobilization',
    'On-going',
    'Completed',
    'Loss'
];

// Attach window functions
function attachWindowFunctions() {
    console.log('[Projects] Attaching window functions...');
    window.toggleAddProjectForm = toggleAddProjectForm;
    window.addProject = addProject;
    window.editProject = editProject;
    window.deleteProject = deleteProject;
    window.toggleProjectActive = toggleProjectActive;
    window.changeProjectsPage = changeProjectsPage;
    console.log('[Projects] Window functions attached');
}

// Render view HTML
export function render(activeTab = null) {
    return `
        <div class="container" style="margin-top: 2rem;">
            <div class="card">
                <div class="suppliers-header">
                    <h2>Project Management</h2>
                    <button class="btn btn-primary" onclick="window.toggleAddProjectForm()">Add Project</button>
                </div>

                <!-- Add Project Form -->
                <div id="addProjectForm" class="add-form" style="display: none;">
                    <h3 style="margin-bottom: 1rem;">Add New Project</h3>

                    <div class="form-group">
                        <label>Client *</label>
                        <select id="projectClient" required>
                            <option value="">-- Select Client --</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Project Name *</label>
                        <input type="text" id="projectName" required>
                    </div>

                    <div class="form-group">
                        <label>Internal Status *</label>
                        <select id="internalStatus" required>
                            <option value="">-- Select Internal Status --</option>
                            ${INTERNAL_STATUS_OPTIONS.map(s =>
                                `<option value="${s}">${s}</option>`
                            ).join('')}
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Project Status *</label>
                        <select id="projectStatus" required>
                            <option value="">-- Select Project Status --</option>
                            ${PROJECT_STATUS_OPTIONS.map(s =>
                                `<option value="${s}">${s}</option>`
                            ).join('')}
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Budget (Optional)</label>
                        <input type="number" id="projectBudget" min="0" step="0.01" placeholder="0.00">
                    </div>

                    <div class="form-group">
                        <label>Contract Cost (Optional)</label>
                        <input type="number" id="contractCost" min="0" step="0.01" placeholder="0.00">
                    </div>

                    <div class="form-group">
                        <label>Personnel (Optional)</label>
                        <input type="text" id="personnel" placeholder="John Doe, Jane Smith">
                    </div>

                    <div class="form-actions">
                        <button class="btn btn-secondary" onclick="window.toggleAddProjectForm()">Cancel</button>
                        <button class="btn btn-success" onclick="window.addProject()">Add Project</button>
                    </div>
                </div>

                <!-- Projects Table -->
                <table>
                    <thead>
                        <tr>
                            <th>Code</th>
                            <th>Name</th>
                            <th>Client</th>
                            <th>Internal Status</th>
                            <th>Project Status</th>
                            <th>Active</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="projectsTableBody">
                        <tr>
                            <td colspan="7" style="text-align: center; padding: 2rem;">Loading projects...</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// Initialize view
export async function init(activeTab = null) {
    console.log('[Projects] Initializing projects view...');
    attachWindowFunctions();
    await loadClients();
    await loadProjects();
}

// Cleanup
export async function destroy() {
    console.log('[Projects] Destroying projects view...');

    listeners.forEach(unsubscribe => unsubscribe?.());
    listeners = [];
    projectsData = [];
    clientsData = [];
    currentPage = 1;

    delete window.toggleAddProjectForm;
    delete window.addProject;
    delete window.editProject;
    delete window.deleteProject;
    delete window.toggleProjectActive;
    delete window.changeProjectsPage;

    console.log('[Projects] View destroyed');
}

// Load clients with real-time listener
async function loadClients() {
    try {
        const listener = onSnapshot(collection(db, 'clients'), (snapshot) => {
            clientsData = [];
            snapshot.forEach(doc => {
                clientsData.push({ id: doc.id, ...doc.data() });
            });

            clientsData.sort((a, b) => a.company_name.localeCompare(b.company_name));

            console.log('[Projects] Clients loaded:', clientsData.length);
            renderClientDropdown();
        });

        listeners.push(listener);
    } catch (error) {
        console.error('[Projects] Error loading clients:', error);
    }
}

// Render client dropdown
function renderClientDropdown() {
    const select = document.getElementById('projectClient');
    if (!select) return;

    const currentValue = select.value;

    let optionsHtml = '<option value="">-- Select Client --</option>';
    clientsData.forEach(client => {
        const selected = client.id === currentValue ? 'selected' : '';
        optionsHtml += `
            <option value="${client.id}"
                    data-code="${client.client_code}"
                    ${selected}>
                ${client.company_name} (${client.client_code})
            </option>
        `;
    });

    select.innerHTML = optionsHtml;
}

// Generate project code
async function generateProjectCode(clientCode) {
    try {
        const currentYear = new Date().getFullYear();

        // Query projects for this client and year
        const q = query(
            collection(db, 'projects'),
            where('client_code', '==', clientCode),
            where('project_code', '>=', `CLMC_${clientCode}_${currentYear}000`),
            where('project_code', '<=', `CLMC_${clientCode}_${currentYear}999`)
        );

        const snapshot = await getDocs(q);

        let maxNum = 0;
        snapshot.forEach(doc => {
            const code = doc.data().project_code;
            const match = code.match(/^CLMC_.+_\d{4}(\d{3})$/);
            if (match) {
                const num = parseInt(match[1]);
                if (num > maxNum) {
                    maxNum = num;
                }
            }
        });

        const newNum = maxNum + 1;
        return `CLMC_${clientCode}_${currentYear}${String(newNum).padStart(3, '0')}`;
    } catch (error) {
        console.error('[Projects] Error generating project code:', error);
        throw error;
    }
}

// Add project
async function addProject() {
    const clientSelect = document.getElementById('projectClient');
    const clientId = clientSelect.value;
    const clientCode = clientSelect.selectedOptions[0]?.getAttribute('data-code');
    const project_name = document.getElementById('projectName').value.trim();
    const internal_status = document.getElementById('internalStatus').value;
    const project_status = document.getElementById('projectStatus').value;
    const budgetVal = document.getElementById('projectBudget').value;
    const contractVal = document.getElementById('contractCost').value;
    const personnel = document.getElementById('personnel').value.trim();

    // Validate required fields
    if (!clientId || !project_name || !internal_status || !project_status) {
        showToast('Please fill in all required fields', 'error');
        return;
    }

    // Validate optional positive numbers
    const budget = budgetVal ? parseFloat(budgetVal) : null;
    const contract_cost = contractVal ? parseFloat(contractVal) : null;

    if (budget !== null && (isNaN(budget) || budget <= 0)) {
        showToast('Budget must be a positive number', 'error');
        return;
    }

    if (contract_cost !== null && (isNaN(contract_cost) || contract_cost <= 0)) {
        showToast('Contract cost must be a positive number', 'error');
        return;
    }

    showLoading(true);

    try {
        // Generate project code
        const project_code = await generateProjectCode(clientCode);

        await addDoc(collection(db, 'projects'), {
            project_code,
            project_name,
            client_id: clientId,
            client_code: clientCode,
            internal_status,
            project_status,
            budget,
            contract_cost,
            personnel: personnel || null,
            active: true,
            created_at: new Date().toISOString()
        });

        showToast(`Project "${project_name}" created successfully!`, 'success');
        toggleAddProjectForm();
    } catch (error) {
        console.error('[Projects] Error adding project:', error);
        showToast('Failed to create project', 'error');
    } finally {
        showLoading(false);
    }
}

// Load projects
async function loadProjects() {
    try {
        const listener = onSnapshot(collection(db, 'projects'), (snapshot) => {
            projectsData = [];
            snapshot.forEach(doc => {
                projectsData.push({ id: doc.id, ...doc.data() });
            });

            // Sort by created_at descending (most recent first)
            projectsData.sort((a, b) =>
                new Date(b.created_at) - new Date(a.created_at)
            );

            console.log('[Projects] Loaded:', projectsData.length);
            renderProjectsTable();
        });

        listeners.push(listener);
    } catch (error) {
        console.error('[Projects] Error loading projects:', error);
    }
}

// Render projects table
function renderProjectsTable() {
    const tbody = document.getElementById('projectsTableBody');
    if (!tbody) return;

    if (projectsData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">No projects yet. Add your first project!</td></tr>';
        return;
    }

    // Pagination
    const totalPages = Math.ceil(projectsData.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, projectsData.length);
    const pageItems = projectsData.slice(startIndex, endIndex);

    tbody.innerHTML = pageItems.map(project => {
        // Find client name
        const client = clientsData.find(c => c.id === project.client_id);
        const clientName = client ? client.company_name : project.client_code;

        return `
            <tr>
                <td><strong>${project.project_code}</strong></td>
                <td>${project.project_name}</td>
                <td>${clientName}</td>
                <td>${project.internal_status}</td>
                <td>${project.project_status}</td>
                <td>
                    <span class="status-badge ${project.active ? 'approved' : 'rejected'}">
                        ${project.active ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td style="white-space: nowrap;">
                    <button class="btn btn-sm btn-primary" onclick="editProject('${project.id}')">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteProject('${project.id}', '${project.project_name.replace(/'/g, "\\'")}')">Delete</button>
                </td>
            </tr>
        `;
    }).join('');

    updatePaginationControls(totalPages, startIndex, endIndex, projectsData.length);
}

// ... (pagination, toggle, edit, delete functions follow clients.js pattern)
```

### Router Configuration
```javascript
// Source: app/router.js - add after clients route
'/projects': {
    name: 'Projects',
    load: () => import('./views/projects.js'),
    title: 'Projects | CLMC Procurement'
}
```

### Navigation Link
```html
<!-- Source: index.html - add after clients link -->
<a href="#/projects" class="nav-link">
    <span class="nav-icon">📋</span>
    <span>Projects</span>
</a>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Modal forms for CRUD | Inline forms (clients) or dedicated pages (projects) | Phase 1 | Better UX, more space for complex forms |
| Manual ID generation | Sequential ID generation via utils.js | Existing | Consistent format, automatic numbering |
| Static dropdowns | Real-time populated dropdowns via onSnapshot | Phase 1 | Auto-updates when clients added |
| Single status field | Dual status fields (internal + project) | Phase 2 requirement | Clear separation of internal vs client-facing status |

**Deprecated/outdated:**
- Firebase v9: Already on v10.7.1, no changes needed
- Inline table editing for complex forms: Simple entities (clients) use inline, complex entities (projects) use dedicated forms

## Open Questions

1. **Should budget = 0 be considered valid?**
   - What we know: PROJ-17 requires "positive numbers if provided"
   - What's unclear: Does "positive" include 0 or only > 0?
   - Recommendation: Interpret as > 0 (exclude zero), but allow null (not provided). Document in validation message.

2. **Should client code changes cascade to projects?**
   - What we know: Client code is denormalized in projects for filtering
   - What's unclear: What happens when client code updated in clients collection?
   - Recommendation: v1.0 document limitation (don't change client codes). v2.0 implement cascade via Firebase Function.

3. **Should project code uniqueness be enforced server-side?**
   - What we know: Client-side check has race condition
   - What's unclear: How critical is absolute uniqueness for v1.0?
   - Recommendation: Client-side check sufficient for v1.0 (low concurrency). Document race condition. v2.0 add Firestore Security Rules or Firebase Function.

4. **Should personnel field support structured data?**
   - What we know: Requirement says "freetext" for v1.0
   - What's unclear: Should we prepare for structured personnel (array of user IDs) in v2.0?
   - Recommendation: Store as string for v1.0. v2.0 migration can parse string to array when auth implemented.

5. **Should inactive projects be hideable in the list?**
   - What we know: Projects can be toggled active/inactive
   - What's unclear: Should list have "Show inactive" toggle, or always show all?
   - Recommendation: Phase 3 adds filtering - handle there. Phase 2 shows all projects.

6. **Should we validate personnel field format?**
   - What we know: Freetext, comma-separated expected
   - What's unclear: Should we enforce comma separation or allow any format?
   - Recommendation: No validation for v1.0 - truly freetext. Users decide format.

## Sources

### Primary (HIGH confidence)
- C:\Users\franc\dev\projects\pr-po\.planning\REQUIREMENTS.md - PROJ-01 to PROJ-18 requirements
- C:\Users\franc\dev\projects\pr-po\.planning\PROJECT.md - Project decisions and context
- C:\Users\franc\dev\projects\pr-po\app\views\clients.js - CRUD pattern (lines 1-372)
- C:\Users\franc\dev\projects\pr-po\app\utils.js - generateSequentialId pattern (lines 140-171)
- C:\Users\franc\dev\projects\pr-po\app\router.js - Routing configuration (lines 1-250)
- C:\Users\franc\dev\projects\pr-po\CLAUDE.md - Sequential ID generation pattern (line 156)
- C:\Users\franc\dev\projects\pr-po\.planning\phases\01-clients-foundation\01-RESEARCH.md - Phase 1 patterns

### Secondary (MEDIUM confidence)
- [Enforcing Unique Key Constraints In Firestore](https://medium.com/lost-but-coding/enforcing-unique-key-constraints-in-firestore-c5fdf7f10d93) - Firestore uniqueness patterns
- [Firebase Firestore Unique Constraints](https://medium.com/@jqualls/firebase-firestore-unique-constraints-d0673b7a4952) - Unique field workarounds
- [Composite Key Pattern in Firebase](https://gist.github.com/codediodeio/6c561f6f7cdd79ccd4b46247d0d4fb75) - Composite key strategies
- [Number Validation in JavaScript - GeeksforGeeks](https://www.geeksforgeeks.org/javascript/number-validation-in-javascript/) - Positive number validation
- [How to Allow Only Positive Numbers in the Input Number Type](https://www.w3docs.com/snippets/html/how-to-allow-only-positive-numbers-in-the-input-number-type.html) - HTML5 validation
- [Client-side form validation - MDN](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Form_validation) - Form validation best practices

### Tertiary (LOW confidence)
- [10 Best Cascading Dropdown Plugins](https://www.jqueryscript.net/blog/best-cascading-dropdown.html) - Dependent dropdown patterns (evaluated, not used)
- [Form Validation Best Practices](https://ivyforms.com/blog/form-validation-best-practices/) - Optional field handling

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All existing infrastructure, no new dependencies
- Architecture: HIGH - Patterns extracted from Phase 1 implementation (clients.js)
- Pitfalls: MEDIUM - Some pitfalls theoretical (composite ID parsing), others from similar patterns
- Code examples: HIGH - Adapted from working Phase 1 code and existing utils

**Research date:** 2026-01-25
**Valid until:** 2026-02-25 (30 days - stable patterns, unlikely to change)

**Notes:**
- Zero new dependencies required
- Composite ID generation is new complexity beyond Phase 1
- Dual status fields and optional number validation are straightforward extensions
- Client dropdown population follows established onSnapshot pattern
- Race condition in uniqueness check acceptable for v1.0 based on project decisions
