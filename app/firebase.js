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
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

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

// Export database instance
export { db };

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
    serverTimestamp
};

// Also expose to window for backward compatibility with onclick handlers
window.db = db;
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
    serverTimestamp
};

console.log('Firebase initialized successfully');
