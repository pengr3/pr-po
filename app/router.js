/* ========================================
   SPA ROUTER
   Hash-based router with lazy loading
   ======================================== */

import { showLoading } from './utils.js';

// Current view state
let currentView = null;
let currentRoute = null;

// Route definitions with lazy loading
const routes = {
    '/': {
        name: 'Home',
        load: () => import('./views/home.js'),
        title: 'Home | CLMC Procurement'
    },
    '/mrf-form': {
        name: 'Material Request',
        load: () => import('./views/mrf-form.js'),
        title: 'Submit MRF | CLMC Procurement'
    },
    '/procurement': {
        name: 'Procurement',
        load: () => import('./views/procurement.js'),
        title: 'Procurement Dashboard | CLMC Procurement',
        defaultTab: 'mrfs'
    },
    '/finance': {
        name: 'Finance',
        load: () => import('./views/finance.js'),
        title: 'Finance Dashboard | CLMC Procurement',
        defaultTab: 'approvals'
    }
};

/**
 * Parse hash to extract route and optional tab
 * @returns {object} { path, tab }
 */
function parseHash() {
    const hash = window.location.hash.slice(1) || '/';
    const parts = hash.split('/').filter(Boolean);

    if (parts.length === 0) {
        return { path: '/', tab: null };
    }

    const path = '/' + parts[0];
    const tab = parts[1] || null;

    return { path, tab };
}

/**
 * Update navigation active state
 * @param {string} path - Current route path
 */
function updateNavigation(path) {
    // Update nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        const href = link.getAttribute('href');
        if (href && href.startsWith('#' + path)) {
            link.classList.add('active');
        }
    });

    // Update page title
    const route = routes[path];
    if (route) {
        document.title = route.title;
    }
}

/**
 * Navigate to a route
 * @param {string} path - Route path
 * @param {string} tab - Optional tab within the route
 */
export async function navigate(path, tab = null) {
    // Validate route
    const route = routes[path];
    if (!route) {
        console.error('Route not found:', path);
        // Redirect to home
        window.location.hash = '#/';
        return;
    }

    // Show loading
    showLoading(true);

    try {
        // Check if we're just switching tabs within the same view
        const isSameView = currentRoute === path;
        console.log('[Router] Navigation:', { path, tab, currentRoute, isSameView });

        // Cleanup previous view ONLY if navigating to a different view
        if (!isSameView && currentView && typeof currentView.destroy === 'function') {
            console.log('[Router] 🔴 Cleaning up previous view:', currentRoute);
            await currentView.destroy();
        } else if (isSameView) {
            console.log('[Router] 🔄 Same view - skipping destroy, just re-rendering tab:', tab);
        }

        // Clear app container
        const appContainer = document.getElementById('app-container');
        if (!appContainer) {
            throw new Error('App container not found');
        }

        // Load view module (reuse current module if same view)
        let module;
        if (isSameView && currentView) {
            console.log('[Router] 📦 Reusing current view module');
            module = currentView;
        } else {
            console.log('[Router] 📦 Loading view module:', path);
            module = await route.load();
        }

        // Render view
        if (typeof module.render === 'function') {
            const activeTab = tab || route.defaultTab || null;
            console.log('[Router] 🎨 Rendering view with tab:', activeTab);
            appContainer.innerHTML = module.render(activeTab);
        } else {
            throw new Error('View module must export a render() function');
        }

        // Initialize view
        if (typeof module.init === 'function') {
            const activeTab = tab || route.defaultTab || null;
            console.log('[Router] ⚙️ Initializing view with tab:', activeTab);
            await module.init(activeTab);
        }

        // Store current view
        currentView = module;
        currentRoute = path;

        // Update navigation
        updateNavigation(path);

        // Scroll to top
        window.scrollTo(0, 0);

        console.log('[Router] ✅ Navigation complete:', { path, tab, isSameView });
    } catch (error) {
        console.error('Error navigating to route:', error);

        // Show error message
        const appContainer = document.getElementById('app-container');
        if (appContainer) {
            appContainer.innerHTML = `
                <div class="container" style="padding: 4rem 2rem;">
                    <div class="card">
                        <div class="card-body">
                            <div class="empty-state">
                                <div class="empty-state-icon">⚠️</div>
                                <h3>Error Loading Page</h3>
                                <p>There was an error loading this page. Please try again.</p>
                                <button class="btn btn-primary" onclick="location.hash='#/'">
                                    Go to Home
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    } finally {
        showLoading(false);
    }
}

/**
 * Handle hash change events
 */
function handleHashChange() {
    const { path, tab } = parseHash();
    navigate(path, tab);
}

/**
 * Initialize router
 */
export function initRouter() {
    console.log('Initializing router...');

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);

    // Handle initial route
    const { path, tab } = parseHash();
    navigate(path, tab);

    // Expose navigate to window for onclick handlers
    window.navigateTo = function(route) {
        window.location.hash = '#' + route;
    };

    console.log('Router initialized');
}

/**
 * Get current route
 * @returns {string} Current route path
 */
export function getCurrentRoute() {
    return currentRoute;
}

/**
 * Get current view module
 * @returns {object} Current view module
 */
export function getCurrentView() {
    return currentView;
}

/**
 * Navigate to tab within current view
 * @param {string} tabId - Tab ID to navigate to
 */
export function navigateToTab(tabId) {
    const { path } = parseHash();
    window.location.hash = `#${path}/${tabId}`;
}

// Expose tab navigation to window for onclick handlers
window.navigateToTab = navigateToTab;

/**
 * Get all available routes
 * @returns {object} Routes object
 */
export function getRoutes() {
    return routes;
}

console.log('Router module loaded successfully');
