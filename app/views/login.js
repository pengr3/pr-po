/* ========================================
   LOGIN VIEW
   User authentication with email and password
   ======================================== */

import { auth, db } from '../firebase.js';
import { signInWithEmailAndPassword, signOut, doc, getDoc } from '../firebase.js';

/**
 * Render login view
 * @returns {string} HTML string
 */
export function render() {
    return `
        <div class="auth-container">
            <div class="auth-card">
                <div class="auth-logo">
                    <div style="width: 60px; height: 60px; background: var(--primary); border-radius: 12px; display: flex; align-items: center; justify-content: center; margin: 0 auto;">
                        <span style="color: white; font-size: 24px; font-weight: 700;">CL</span>
                    </div>
                </div>

                <h2 class="auth-title">Sign In</h2>

                <form id="loginForm" class="auth-form">
                    <div class="auth-field">
                        <label for="email">Email</label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            required
                            placeholder="Enter your email"
                        >
                        <div class="auth-error" id="emailError"></div>
                    </div>

                    <div class="auth-field">
                        <label for="password">Password</label>
                        <input
                            type="password"
                            id="password"
                            name="password"
                            required
                            placeholder="Enter password"
                        >
                        <div class="auth-error" id="passwordError"></div>
                    </div>

                    <div class="auth-error" id="generalError"></div>

                    <button type="submit" class="btn btn-primary btn-block" id="loginBtn">
                        Sign In
                    </button>
                </form>
            </div>
        </div>
    `;
}

/**
 * Clear all error messages
 */
function clearErrors() {
    document.querySelectorAll('.auth-error').forEach(el => {
        el.textContent = '';
        el.style.display = 'none';
    });
}

/**
 * Show error message for a field
 * @param {string} fieldId - Field ID
 * @param {string} message - Error message
 */
function showError(fieldId, message) {
    const errorEl = document.getElementById(fieldId + 'Error');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
    }
}

/**
 * Handle login form submission
 * @param {Event} e - Submit event
 */
async function handleLogin(e) {
    e.preventDefault();

    // Clear previous errors
    clearErrors();

    // Get form values
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    // Client-side validation
    let hasError = false;

    if (!email) {
        showError('email', 'Email is required');
        hasError = true;
    }

    if (!password) {
        showError('password', 'Password is required');
        hasError = true;
    }

    if (hasError) {
        return;
    }

    // Show loading state
    const loginBtn = document.getElementById('loginBtn');
    const originalBtnText = loginBtn.textContent;
    loginBtn.textContent = 'Signing in...';
    loginBtn.disabled = true;

    try {
        // Sign in with Firebase Auth
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        console.log('[Login] User signed in successfully:', user.email);

        // CRITICAL: Validate user document BEFORE allowing navigation
        try {
            // Check if user document exists
            const userDocRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userDocRef);

            if (!userDoc.exists()) {
                // User document doesn't exist - check if deleted
                const deletedUserDocRef = doc(db, 'deleted_users', user.uid);
                const deletedUserDoc = await getDoc(deletedUserDocRef);

                // Sign out immediately
                await signOut(auth);

                if (deletedUserDoc.exists()) {
                    // Account was deleted
                    showError('general', 'Your account has been deleted. Please contact an administrator.');
                } else {
                    // User document missing (corrupted state)
                    showError('general', 'Your account information is missing. Please contact an administrator.');
                }

                // Reset button
                loginBtn.textContent = originalBtnText;
                loginBtn.disabled = false;
                return;
            }

            // User document exists - check status
            const userData = userDoc.data();

            if (userData.status === 'deactivated') {
                // Account is deactivated
                await signOut(auth);
                showError('general', 'Your account has been deactivated. Please contact an administrator.');

                // Reset button
                loginBtn.textContent = originalBtnText;
                loginBtn.disabled = false;
                return;
            }

            // Valid user (active, pending, or rejected) - allow navigation
            // Auth observer will handle routing based on status
            console.log('[Login] User validation passed, navigating...');
            window.location.hash = '#/';

        } catch (validationError) {
            console.error('[Login] Error validating user:', validationError);

            // Sign out on validation error for security
            await signOut(auth);
            showError('general', 'Unable to verify your account. Please try again.');

            // Reset button
            loginBtn.textContent = originalBtnText;
            loginBtn.disabled = false;
        }

    } catch (error) {
        console.error('[Login] Error signing in:', error);

        // Show generic error message per CONTEXT.md
        showError('general', 'Invalid credentials');

        // Reset button
        loginBtn.textContent = originalBtnText;
        loginBtn.disabled = false;
    }
}

// Expose function to window for testing
window.handleLogin = handleLogin;

/**
 * Initialize login view
 */
export async function init() {
    console.log('[Login] Initializing login view');

    // Get form element
    const form = document.getElementById('loginForm');
    if (!form) {
        console.error('[Login] Form element not found');
        return;
    }

    // Add submit handler
    form.addEventListener('submit', handleLogin);
}

/**
 * Cleanup on view destroy
 */
export async function destroy() {
    console.log('[Login] Cleaning up login view');

    // Remove event listeners
    const form = document.getElementById('loginForm');
    if (form) {
        form.removeEventListener('submit', handleLogin);
    }

    // Remove window function
    delete window.handleLogin;
}
