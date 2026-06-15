/* ========================================
   LOGIN VIEW
   User authentication with email and password
   ======================================== */

import { auth, db } from '../firebase.js';
import { signInWithEmailAndPassword, signOut, doc, getDoc, sendPasswordResetEmail } from '../firebase.js';

/**
 * Render login view
 * @returns {string} HTML string
 */
export function render() {
    return `
        <div class="auth-container">
            <div class="auth-card">
                <div class="auth-logo">
                    <img src="./CLMC Registered Logo Cropped (black fill).png"
                         alt="CLMC Logo"
                         onerror="this.style.display='none'">
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

                    <div class="auth-link" style="margin-top: -0.5rem; text-align: right; font-size: 0.875rem;"><a href="#" id="forgotPasswordLink">Forgot password?</a></div>

                    <div class="auth-error" id="generalError"></div>

                    <button type="submit" class="btn btn-primary btn-block" id="loginBtn">
                        Sign In
                    </button>
                </form>

                <div id="forgotPanel" style="display:none;">
                    <p style="margin-bottom:1rem; font-size:0.9375rem; color: var(--gray-700);">
                        Enter your email address and we'll send you a link to reset your password.
                    </p>
                    <div class="auth-form">
                        <div class="auth-field">
                            <label for="resetEmail">Email</label>
                            <input type="email" id="resetEmail" placeholder="Enter your email">
                            <div class="auth-error" id="resetEmailError"></div>
                        </div>
                        <div class="auth-success" id="resetSuccess"></div>
                        <button type="button" class="btn btn-primary btn-block" id="sendResetBtn">
                            Send Reset Link
                        </button>
                        <button type="button" class="btn btn-secondary btn-block" id="cancelResetBtn">
                            Cancel
                        </button>
                    </div>
                </div>
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
            // Auth observer (auth.js) owns post-login routing — no hash assignment here.

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

/**
 * Handle "Forgot password?" link click — toggle to forgot panel
 * @param {Event} e - Click event
 */
function handleForgotPassword(e) {
    e.preventDefault();
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('forgotPanel').style.display = 'block';
    document.getElementById('resetEmail').focus();
}

/**
 * Handle "Send Reset Link" button click — fire sendPasswordResetEmail
 */
async function handleSendReset() {
    const email = document.getElementById('resetEmail').value.trim();

    // Clear previous messages
    const resetEmailError = document.getElementById('resetEmailError');
    resetEmailError.textContent = '';
    resetEmailError.style.display = 'none';
    const resetSuccess = document.getElementById('resetSuccess');
    resetSuccess.style.display = 'none';

    // Validate email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        resetEmailError.textContent = 'Please enter a valid email address.';
        resetEmailError.style.display = 'block';
        return;
    }

    // Show loading state
    const sendResetBtn = document.getElementById('sendResetBtn');
    sendResetBtn.textContent = 'Sending...';
    sendResetBtn.disabled = true;

    try {
        await sendPasswordResetEmail(auth, email);

        // Success
        resetSuccess.textContent = 'Password reset email sent. Check your inbox and follow the link to reset your password.';
        resetSuccess.style.display = 'block';
        document.getElementById('cancelResetBtn').textContent = 'Back to Login';
        // Keep sendResetBtn disabled after success
    } catch (error) {
        // Re-enable button on error
        sendResetBtn.disabled = false;
        sendResetBtn.textContent = 'Send Reset Link';

        if (error.code === 'auth/invalid-email') {
            resetEmailError.textContent = 'Please enter a valid email address.';
        } else if (error.code === 'auth/user-not-found') {
            resetEmailError.textContent = 'No account found with that email address.';
        } else {
            resetEmailError.textContent = 'Failed to send reset email. Please try again.';
        }
        resetEmailError.style.display = 'block';
    }
}

/**
 * Handle "Cancel" / "Back to Login" button click — restore login form
 */
function handleCancelReset() {
    // Clear forgot panel state
    document.getElementById('resetEmail').value = '';
    const resetEmailError = document.getElementById('resetEmailError');
    resetEmailError.textContent = '';
    resetEmailError.style.display = 'none';
    document.getElementById('resetSuccess').style.display = 'none';
    document.getElementById('cancelResetBtn').textContent = 'Cancel';
    const sendResetBtn = document.getElementById('sendResetBtn');
    sendResetBtn.disabled = false;
    sendResetBtn.textContent = 'Send Reset Link';

    // Toggle panels
    document.getElementById('forgotPanel').style.display = 'none';
    document.getElementById('loginForm').style.display = '';
}

// Expose functions to window for testing
window.handleLogin = handleLogin;
window.handleForgotPassword = handleForgotPassword;
window.handleSendReset = handleSendReset;
window.handleCancelReset = handleCancelReset;

/**
 * Initialize login view
 */
export async function init() {
    // Get form element
    const form = document.getElementById('loginForm');
    if (!form) {
        console.error('[Login] Form element not found');
        return;
    }

    // Add submit handler
    form.addEventListener('submit', handleLogin);

    // Wire forgot-password panel handlers
    const forgotLink = document.getElementById('forgotPasswordLink');
    if (forgotLink) forgotLink.addEventListener('click', handleForgotPassword);
    const sendResetBtn = document.getElementById('sendResetBtn');
    if (sendResetBtn) sendResetBtn.addEventListener('click', handleSendReset);
    const cancelResetBtn = document.getElementById('cancelResetBtn');
    if (cancelResetBtn) cancelResetBtn.addEventListener('click', handleCancelReset);
}

/**
 * Cleanup on view destroy
 */
export async function destroy() {
    // Remove event listeners
    const form = document.getElementById('loginForm');
    if (form) {
        form.removeEventListener('submit', handleLogin);
    }

    const forgotLink = document.getElementById('forgotPasswordLink');
    if (forgotLink) forgotLink.removeEventListener('click', handleForgotPassword);
    const sendResetBtn = document.getElementById('sendResetBtn');
    if (sendResetBtn) sendResetBtn.removeEventListener('click', handleSendReset);
    const cancelResetBtn = document.getElementById('cancelResetBtn');
    if (cancelResetBtn) cancelResetBtn.removeEventListener('click', handleCancelReset);

    // Remove window functions
    delete window.handleLogin;
    delete window.handleForgotPassword;
    delete window.handleSendReset;
    delete window.handleCancelReset;
}
