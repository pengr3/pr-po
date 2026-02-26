/* ========================================
   FIREBASE SERVICE
   Centralized Firebase configuration and exports
   ======================================== */

// Import Firebase modules from CDN
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
    getFirestore,
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

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAlHcmPmkCk6CKsRbfpHpCheHb2GcLz0Oc",
    authDomain: "clmc-procurement.firebaseapp.com",
    projectId: "clmc-procurement",
    storageBucket: "clmc-procurement.firebasestorage.app",
    messagingSenderId: "946184501660",
    appId: "1:946184501660:web:6559c5de405e72100ab059"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Set auth persistence to local (1-day session)
setPersistence(auth, browserLocalPersistence);

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

console.log('Firebase initialized successfully');

// Initialize auth observer after auth is set up
import('./auth.js').then(module => {
    if (module.initAuthObserver) {
        module.initAuthObserver();
    }
}).catch(err => {
    console.log('[Firebase] Auth observer not initialized yet:', err.message);
});
