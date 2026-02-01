/* ========================================
   REGISTRATION VIEW
   User registration with invitation code validation
   ======================================== */

import { db } from '../firebase.js';
import { createUserWithEmailAndPassword, signOut } from '../firebase.js';
import { auth } from '../firebase.js';
import { validateInvitationCode, markInvitationCodeUsed, createUserDocument } from '../auth.js';

/**
 * Parse URL for invitation code parameter
 * @returns {string|null} Invitation code from URL or null
 */
function getInvitationCodeFromURL() {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.split('?')[1] || '');
    return params.get('code');
}

/**
 * Render registration view
 * @returns {string} HTML string
 */
export function render() {
    const invitationCode = getInvitationCodeFromURL();
    const isCodeFromURL = !!invitationCode;

    return `
        <div class="auth-container">
            <div class="auth-card">
                <div class="auth-logo">
                    <div style="width: 60px; height: 60px; background: var(--primary); border-radius: 12px; display: flex; align-items: center; justify-content: center; margin: 0 auto;">
                        <span style="color: white; font-size: 24px; font-weight: 700;">CL</span>
                    </div>
                </div>

                <h2 class="auth-title">Create Account</h2>

                <form id="registerForm" class="auth-form">
                    <div class="auth-field">
                        <label for="fullName">Full Name</label>
                        <input
                            type="text"
                            id="fullName"
                            name="fullName"
                            required
                            placeholder="Enter your full name"
                        >
                        <div class="auth-error" id="fullNameError"></div>
                    </div>

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
                        <div class="auth-field-hint">8+ characters, mixed case, at least one number</div>
                        <div class="auth-error" id="passwordError"></div>
                    </div>

                    <div class="auth-field">
                        <label for="confirmPassword">Confirm Password</label>
                        <input
                            type="password"
                            id="confirmPassword"
                            name="confirmPassword"
                            required
                            placeholder="Re-enter password"
                        >
                        <div class="auth-error" id="confirmPasswordError"></div>
                    </div>

                    <div class="auth-field">
                        <label for="invitationCode">Invitation Code</label>
                        <input
                            type="text"
                            id="invitationCode"
                            name="invitationCode"
                            required
                            placeholder="Enter invitation code"
                            value="${invitationCode || ''}"
                            ${isCodeFromURL ? 'disabled' : ''}
                        >
                        <div class="auth-error" id="invitationCodeError"></div>
                    </div>

                    <div class="auth-error" id="generalError"></div>

                    <button type="submit" class="btn btn-primary btn-block" id="registerBtn">
                        Register
                    </button>
                </form>

                <div class="auth-link">
                    Already have an account? <a href="#/login">Log in</a>
                </div>
            </div>
        </div>
    `;
}

/**
 * Validate password requirements
 * @param {string} password - Password to validate
 * @returns {boolean} True if valid
 */
function validatePassword(password) {
    if (password.length < 8) return false;
    if (!/[a-z]/.test(password)) return false; // lowercase
    if (!/[A-Z]/.test(password)) return false; // uppercase
    if (!/[0-9]/.test(password)) return false; // number
    return true;
}

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid
 */
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
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
 * Handle registration form submission
 * @param {Event} e - Form submit event
 */
async function handleRegister(e) {
    e.preventDefault();

    // Get form values
    const fullName = document.getElementById('fullName').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const invitationCode = document.getElementById('invitationCode').value.trim();

    // Clear previous errors
    clearErrors();

    // Client-side validation
    let hasError = false;

    if (!fullName) {
        showError('fullName', 'Full name is required');
        hasError = true;
    }

    if (!email) {
        showError('email', 'Email is required');
        hasError = true;
    } else if (!validateEmail(email)) {
        showError('email', 'Please enter a valid email address');
        hasError = true;
    }

    if (!password) {
        showError('password', 'Password is required');
        hasError = true;
    } else if (!validatePassword(password)) {
        showError('password', 'Password must be 8+ characters with uppercase, lowercase, and at least one number');
        hasError = true;
    }

    if (!confirmPassword) {
        showError('confirmPassword', 'Please confirm your password');
        hasError = true;
    } else if (password !== confirmPassword) {
        showError('confirmPassword', 'Passwords do not match');
        hasError = true;
    }

    if (!invitationCode) {
        showError('invitationCode', 'Invitation code is required');
        hasError = true;
    }

    if (hasError) {
        return;
    }

    // Show loading state
    const registerBtn = document.getElementById('registerBtn');
    const originalText = registerBtn.textContent;
    registerBtn.disabled = true;
    registerBtn.textContent = 'Creating Account...';

    try {
        // Validate invitation code
        console.log('[Register] Validating invitation code...');
        const codeValidation = await validateInvitationCode(invitationCode);

        if (!codeValidation.valid) {
            showError('invitationCode', codeValidation.error || 'Invalid or already used invitation code');
            registerBtn.disabled = false;
            registerBtn.textContent = originalText;
            return;
        }

        console.log('[Register] Invitation code valid, creating Firebase Auth user...');

        // Create Firebase Auth user
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const userId = userCredential.user.uid;

        console.log('[Register] Firebase Auth user created:', userId);

        // Create user document in Firestore
        await createUserDocument(userId, {
            email,
            full_name: fullName,
            invitationCode
        });

        console.log('[Register] User document created in Firestore');

        // Mark invitation code as used
        await markInvitationCodeUsed(codeValidation.docId, userId);

        console.log('[Register] Invitation code marked as used');

        // Sign out the user (they must manually log in)
        await signOut(auth);

        console.log('[Register] User signed out, showing success message');

        // Show success message
        showError('general', 'Account created! Please log in.');
        document.getElementById('generalError').style.color = 'var(--success)';

        // Redirect to login after 2 seconds
        setTimeout(() => {
            window.location.hash = '#/login';
        }, 2000);

    } catch (error) {
        console.error('[Register] Error during registration:', error);

        // Show error based on type
        if (error.code) {
            // Firebase error
            showError('general', error.message);
        } else {
            // Network or other error
            showError('general', 'Network error. Please try again.');
        }

        registerBtn.disabled = false;
        registerBtn.textContent = originalText;
    }
}

/**
 * Initialize registration view
 */
export async function init() {
    console.log('[Register] Initializing registration view');

    // Attach form submit handler
    const form = document.getElementById('registerForm');
    if (form) {
        form.addEventListener('submit', handleRegister);
    }

    // Expose to window for potential onclick handlers
    window.handleRegister = handleRegister;
}

/**
 * Clean up registration view
 */
export async function destroy() {
    console.log('[Register] Cleaning up registration view');

    // Remove window functions
    delete window.handleRegister;

    // Form event listeners are automatically removed when DOM is cleared
}
