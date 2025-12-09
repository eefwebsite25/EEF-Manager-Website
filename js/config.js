/**
 * Firebase Configuration and Initialization
 *
 * This module handles Firebase app initialization and provides
 * the Firestore database instance for the application.
 */

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCVKj9PAbUlzTeF_ELCNtCKkXo9V0RYU7M",
    authDomain: "eef-internalweb.firebaseapp.com",
    projectId: "eef-internalweb",
    storageBucket: "eef-internalweb.firebasestorage.app",
    messagingSenderId: "68762526805",
    appId: "1:68762526805:web:609098a386624ad3eae0dc",
    measurementId: "G-K0DSS4LRL5"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Export Firestore database instance
export const db = firebase.firestore();
