/* ========================================
   ADMIN WRAPPER VIEW
   Consolidates User Management, Assignments, and Settings
   into a single view with section switching
   ======================================== */

/* ========================================
   MODULE STATE
   ======================================== */

let currentSection = null;
let currentModule = null;

const SECTIONS = {
    users: {
        label: 'User Management',
        load: () => import('./user-management.js')
    },
    assignments: {
        label: 'Assignments',
        load: () => import('./project-assignments.js')
    },
    settings: {
        label: 'Settings',
        load: () => import('./role-config.js')
    }
};

/* ========================================
   RENDER FUNCTION
   ======================================== */

/**
 * Render the Admin wrapper view with section navigation
 * @param {string} activeSection - Active section ID (defaults to 'users')
 * @returns {string} HTML for the view
 */
export function render(activeSection = 'users') {
    // Check for pending section override from dropdown navigation
    if (window._pendingAdminSection && SECTIONS[window._pendingAdminSection]) {
        activeSection = window._pendingAdminSection;
    }

    const sectionButtons = Object.entries(SECTIONS).map(([id, section]) => `
        <button class="admin-section-btn tab-btn ${id === activeSection ? 'active' : ''}"
                data-section="${id}"
                onclick="switchAdminSection('${id}')">
            ${section.label}
        </button>
    `).join('');

    return `
        <!-- Admin Section Navigation -->
        <div style="background: white; border-bottom: 1px solid var(--gray-200);">
            <div style="max-width: 1400px; margin: 0 auto; padding: 0 2rem;">
                <div class="tabs-nav">
                    ${sectionButtons}
                </div>
            </div>
        </div>

        <!-- Admin Content Container -->
        <div id="adminContent"></div>
    `;
}

/* ========================================
   INIT FUNCTION
   ======================================== */

/**
 * Initialize the Admin wrapper view
 * @param {string} activeSection - Section to activate (defaults to 'users')
 */
export async function init(activeSection = 'users') {
    // Check for pending section override from dropdown navigation
    // When a user clicks a dropdown item like "Settings", the dropdown sets
    // _pendingAdminSection = 'settings' before navigating to #/admin.
    // Without this check, admin.js would always open to the default "users" section.
    if (window._pendingAdminSection && SECTIONS[window._pendingAdminSection]) {
        activeSection = window._pendingAdminSection;
        delete window._pendingAdminSection;
    }

    currentSection = activeSection;

    // Load the section module via dynamic import
    const section = SECTIONS[activeSection];
    currentModule = await section.load();

    // Render child view into container
    const container = document.getElementById('adminContent');
    if (container) {
        container.innerHTML = currentModule.render();
    }

    // Init child view
    if (typeof currentModule.init === 'function') {
        await currentModule.init();
    }

    // Attach section switch handler to window for onclick
    window.switchAdminSection = switchAdminSection;
}

/* ========================================
   DESTROY FUNCTION
   ======================================== */

/**
 * Cleanup the Admin wrapper view and its active child section
 */
export async function destroy() {
    // Destroy current child module if it has a destroy function
    if (currentModule && typeof currentModule.destroy === 'function') {
        await currentModule.destroy();
    }

    currentModule = null;
    currentSection = null;

    // Clean up window function
    delete window.switchAdminSection;
}

/* ========================================
   SECTION SWITCHING
   ======================================== */

/**
 * Switch between admin sections (User Management, Assignments, Settings)
 * Handles destroy/init lifecycle of child views
 * @param {string} sectionId - Section to switch to
 */
async function switchAdminSection(sectionId) {
    // No-op if already on this section
    if (sectionId === currentSection) {
        return;
    }

    // Validate section exists
    if (!SECTIONS[sectionId]) {
        console.error('[Admin] Unknown section:', sectionId);
        return;
    }

    // CRITICAL: Destroy current module before loading new one
    // This ensures Firebase listeners are cleaned up and window functions are removed
    if (currentModule && typeof currentModule.destroy === 'function') {
        await currentModule.destroy();
    }

    // Load new section module via dynamic import
    const section = SECTIONS[sectionId];
    currentModule = await section.load();
    currentSection = sectionId;

    // Render child view into container
    const container = document.getElementById('adminContent');
    if (container) {
        container.innerHTML = currentModule.render();
    }

    // Init child view
    if (typeof currentModule.init === 'function') {
        await currentModule.init();
    }

    // Update active state on section buttons
    document.querySelectorAll('.admin-section-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.section === sectionId);
    });
}

console.log('[Admin] Admin wrapper module loaded');
