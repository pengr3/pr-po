/* ========================================
   FIREBASE SERVICE
   Centralized Firebase configuration and exports
   ======================================== */

// Import Firebase modules from CDN
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
    initializeFirestore,
    persistentLocalCache,
    persistentSingleTabManager,
    persistentMultipleTabManager,
    collection,
    getDocs,
    getDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    setDoc,
    doc,
    query,
    where,
    onSnapshot,
    orderBy,
    limit,
    startAfter,
    Timestamp,
    serverTimestamp,
    writeBatch,
    getAggregateFromServer,
    sum,
    count,
    average,
    arrayUnion,
    arrayRemove
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    setPersistence,
    browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// Runtime environment detection
const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);

// =============================================
// DUAL ENVIRONMENT CONFIGURATION
// localhost / 127.0.0.1 → dev project (clmc-procurement-dev)
// All other hosts (Netlify) → prod project (clmc-procurement)
// See: .planning/milestones/v2.5-phases/53.1-dev-firebase-setup/53.1-RESEARCH.md
// =============================================

const prodConfig = {
    apiKey: "AIzaSyAlHcmPmkCk6CKsRbfpHpCheHb2GcLz0Oc",
    authDomain: "clmc-procurement.firebaseapp.com",
    projectId: "clmc-procurement",
    storageBucket: "clmc-procurement.firebasestorage.app",
    messagingSenderId: "946184501660",
    appId: "1:946184501660:web:6559c5de405e72100ab059"
};

const devConfig = {
    apiKey: "AIzaSyB1x47298azJBQr4dN4fqmqtepsh5mMsN0",
    authDomain: "clmc-procurement-dev.firebaseapp.com",
    projectId: "clmc-procurement-dev",
    storageBucket: "clmc-procurement-dev.firebasestorage.app",
    messagingSenderId: "1723100020",
    appId: "1:1723100020:web:d3a809d280720943f35a21"
};

const firebaseConfig = isLocal ? devConfig : prodConfig;

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: isLocal
            ? persistentMultipleTabManager()
            : persistentSingleTabManager()
    })
});
const auth = getAuth(app);

// Set auth persistence to local (1-day session)
setPersistence(auth, browserLocalPersistence);

// Dev environment indicator — visible only on localhost
if (isLocal) {
    document.addEventListener('DOMContentLoaded', () => {
        const banner = document.createElement('div');
        banner.id = 'dev-env-banner';
        banner.textContent = 'DEV ENVIRONMENT — clmc-procurement-dev';
        banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#f59e0b;color:#1e293b;text-align:center;padding:4px 8px;font-size:0.75rem;font-weight:600;z-index:9999;pointer-events:none;';
        document.body.appendChild(banner);
    });
}

// Export database and auth instances
export { db, auth };

// Export Firestore methods
export {
    collection,
    getDocs,
    getDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    setDoc,
    doc,
    query,
    where,
    onSnapshot,
    orderBy,
    limit,
    startAfter,
    Timestamp,
    serverTimestamp,
    writeBatch,
    getAggregateFromServer,
    sum,
    count,
    average,
    arrayUnion,
    arrayRemove
};

// Export Auth methods
export {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
};

// Also expose to window for backward compatibility with onclick handlers
window.db = db;
window.auth = auth;
window.firestore = {
    collection,
    getDocs,
    getDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    setDoc,
    doc,
    query,
    where,
    onSnapshot,
    orderBy,
    limit,
    startAfter,
    Timestamp,
    serverTimestamp,
    writeBatch,
    getAggregateFromServer,
    sum,
    count,
    average,
    arrayUnion,
    arrayRemove
};
window.firebaseAuth = {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
};

// Initialize auth observer after auth is set up
import('./auth.js').then(module => {
    if (module.initAuthObserver) {
        module.initAuthObserver();
    }
}).catch(err => {
    console.error('[Firebase] Auth observer failed to initialize:', err.message);
});
