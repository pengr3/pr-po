/* ========================================
   SPA ROUTER
   Hash-based router with lazy loading
   ======================================== */

import { showLoading } from './utils.js';

// Map routes to permission tab IDs
const routePermissionMap = {
    '/': 'dashboard',
    '/clients': 'clients',
    '/projects': 'projects',
    '/project-detail': 'projects',  // Detail view uses projects permission
    '/mrf-form': 'mrf_form',
    '/procurement': 'procurement',
    '/finance': 'finance',
    '/role-config': 'role_config',   // Admin route (future)
    '/project-assignments': 'role_config',   // Shares role_config gate with Settings
    '/user-management': 'role_config'        // Shares role_config gate with Settings
};

// Routes that don't require permission checks (auth routes)
const publicRoutes = ['/login', '/register', '/pending'];

// Current view state
let currentView = null;
let currentRoute = null;
let currentParam = null;

// Route definitions with lazy loading
const routes = {
    '/': {
        name: 'Home',
        load: () => import('./views/home.js'),
        title: 'Home | CLMC Procurement'
    },
    '/clients': {
        name: 'Clients',
        load: () => import('./views/clients.js'),
        title: 'Clients | CLMC Procurement'
    },
    '/projects': {
        name: 'Projects',
        load: () => import('./views/projects.js'),
        title: 'Projects | CLMC Procurement'
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
    },
    '/project-detail': {
        name: 'Project Detail',
        load: () => import('./views/project-detail.js'),
        title: 'Project Details | CLMC Procurement'
    },
    '/register': {
        name: 'Register',
        load: () => import('./views/register.js'),
        title: 'Create Account | CLMC Procurement'
    },
    '/login': {
        name: 'Login',
        load: () => import('./views/login.js'),
        title: 'Sign In | CLMC Procurement'
    },
    '/pending': {
        name: 'Pending Approval',
        load: () => import('./views/pending.js'),
        title: 'Pending Approval | CLMC Procurement'
    },
    '/role-config': {
        name: 'Role Configuration',
        load: () => import('./views/role-config.js'),
        title: 'Role Configuration | CLMC Procurement'
    },
    '/project-assignments': {
        name: 'Project Assignments',
        load: () => import('./views/project-assignments.js'),
        title: 'Project Assignments | CLMC Procurement'
    },
    '/user-management': {
        name: 'User Management',
        load: () => import('./views/user-management.js'),
        title: 'User Management | CLMC Procurement'
    }
};

/**
 * Parse hash to extract route, optional tab, and optional subpath
 * @returns {object} { path, tab, subpath }
 */
function parseHash() {
    const hash = window.location.hash.slice(1) || '/';
    const parts = hash.split('/').filter(Boolean);

    if (parts.length === 0) {
        return { path: '/', tab: null, subpath: null };
    }

    const path = '/' + parts[0];
    const tab = parts[1] || null;
    const subpath = parts[2] || null;

    return { path, tab, subpath };
}

/**
 * Build route string from path, tab, and param
 * Used for deep linking (SEC-02)
 * @param {string} path - Route path
 * @param {string} tab - Optional tab
 * @param {string} param - Optional parameter
 * @returns {string} Full route string (e.g., '/projects/detail/CLMC_001')
 */
function buildRouteString(path, tab, param) {
    let route = path;

    if (tab) {
        route += '/' + tab;
    }

    if (param) {
        route += '/' + param;
    }

    return route;
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
 * Show access denied page
 */
function showAccessDenied() {
    const appContainer = document.getElementById('app-container');
    if (!appContainer) return;

    appContainer.innerHTML = `
        <div class="container" style="padding: 4rem 2rem;">
            <div class="card">
                <div class="card-body">
                    <div class="empty-state">
                        <div class="empty-state-icon">🔒</div>
                        <h3>Access Denied</h3>
                        <p>You don't have permission to access this page.</p>
                        <p style="color: var(--gray-500); font-size: 0.875rem; margin-top: 0.5rem;">
                            Contact your administrator if you believe this is an error.
                        </p>
                        <button class="btn btn-primary" onclick="location.hash='#/'" style="margin-top: 1rem;">
                            Go to Dashboard
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Navigate to a route
 * @param {string} path - Route path
 * @param {string} tab - Optional tab within the route
 * @param {string} param - Optional parameter (e.g., for detail views)
 */
export async function navigate(path, tab = null, param = null) {
    // Validate route
    const route = routes[path];
    if (!route) {
        console.error('Route not found:', path);
        // Redirect to home
        window.location.hash = '#/';
        return;
    }

    // Authentication check for protected routes (SEC-01, SEC-03)
    if (!publicRoutes.includes(path)) {
        const currentUser = window.getCurrentUser?.();

        if (!currentUser) {
            // Save intended route for deep linking (SEC-02)
            const intendedRoute = buildRouteString(path, tab, param);
            console.log('[Router] Saving intended route:', intendedRoute);
            sessionStorage.setItem('intendedRoute', intendedRoute);

            console.warn('[Router] Unauthenticated access blocked:', path);
            window.location.hash = '#/login';
            return;
        }

        // Check for pending/rejected/deactivated status
        if (currentUser.status === 'pending' || currentUser.status === 'rejected') {
            console.warn('[Router] Pending/rejected user redirected to pending page');
            window.location.hash = '#/pending';
            return;
        }

        if (currentUser.status === 'deactivated') {
            console.warn('[Router] Deactivated user redirected to login');
            window.location.hash = '#/login';
            return;
        }
    }

    // Permission check for protected routes (PERM-14)
    if (!publicRoutes.includes(path)) {
        const permissionKey = routePermissionMap[path];
        const hasAccess = window.hasTabAccess?.(permissionKey);

        // IMPORTANT: Use strict equality check to distinguish:
        // - false = no permission (block)
        // - undefined = not loaded yet (allow, pending state)
        // - true = has permission (allow)
        if (hasAccess === false) {
            console.warn('[Router] Access denied to:', path);
            showAccessDenied();
            return;
        }
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
            console.log('[Router] 🎨 Rendering view with tab:', activeTab, 'param:', param);
            appContainer.innerHTML = module.render(activeTab, param);
        } else {
            throw new Error('View module must export a render() function');
        }

        // Initialize view
        if (typeof module.init === 'function') {
            const activeTab = tab || route.defaultTab || null;
            console.log('[Router] ⚙️ Initializing view with tab:', activeTab, 'param:', param);
            await module.init(activeTab, param);
        }

        // Store current view
        currentView = module;
        currentRoute = path;
        currentParam = param;

        // Update navigation
        updateNavigation(path);

        // Scroll to top
        window.scrollTo(0, 0);

        // Clear intended route if navigation succeeded (SEC-02)
        // This prevents re-restoring the route on subsequent logins
        const intendedRoute = sessionStorage.getItem('intendedRoute');
        if (intendedRoute && intendedRoute === buildRouteString(path, tab, param)) {
            console.log('[Router] Clearing fulfilled intended route');
            sessionStorage.removeItem('intendedRoute');
        }

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
    const { path, tab, subpath } = parseHash();

    // Handle detail routes: #/projects/detail/CODE -> navigate to /project-detail with param
    if (path === '/projects' && tab === 'detail' && subpath) {
        navigate('/project-detail', null, subpath);
        return;
    }

    navigate(path, tab);
}

/**
 * Handle initial route after auth state is known
 * Called by auth.js after authentication state is determined
 */
export function handleInitialRoute() {
    console.log('[Router] Handling initial route after auth check');

    // Hide initial loading indicator
    const appContainer = document.getElementById('app-container');
    if (appContainer) {
        const loadingIndicator = appContainer.querySelector('.loading-spinner');
        if (loadingIndicator && loadingIndicator.parentElement) {
            loadingIndicator.parentElement.style.display = 'none';
        }
    }

    // Show navbar
    const navbar = document.querySelector('.top-nav');
    if (navbar) {
        navbar.style.display = '';
    }

    // Navigate to current hash
    const { path, tab, subpath } = parseHash();

    // Handle detail routes on initial load
    if (path === '/projects' && tab === 'detail' && subpath) {
        navigate('/project-detail', null, subpath);
    } else {
        navigate(path, tab);
    }
}

/**
 * Initialize router
 */
export function initRouter() {
    console.log('Initializing router...');

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);

    // Expose navigate to window for onclick handlers
    window.navigateTo = function(route) {
        window.location.hash = '#' + route;
    };

    // Expose handleInitialRoute for auth.js
    window.handleInitialRoute = handleInitialRoute;

    console.log('Router initialized - waiting for auth state before initial navigation');
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
