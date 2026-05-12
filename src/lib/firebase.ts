import { initializeApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

// Firebase configuration using environment variables
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;

if (!projectId || !apiKey || projectId === "YOUR_PROJECT_ID") {
  console.warn("Firebase configuration is missing! Real-time features will not work. Please set your Firebase keys in the .env file.");
}

const firebaseConfig = {
  apiKey: apiKey || "YOUR_API_KEY",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || (projectId ? `${projectId}.firebaseapp.com` : "YOUR_AUTH_DOMAIN"),
  projectId: projectId || "YOUR_PROJECT_ID",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || (projectId ? `${projectId}.appspot.com` : "YOUR_STORAGE_BUCKET"),
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "YOUR_MESSAGING_SENDER_ID",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "YOUR_APP_ID",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || (projectId ? `https://${projectId}-default-rtdb.firebaseio.com` : undefined)
};

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
export const auth = getAuth(app);
// Ensure rtdb is initialized with a URL if possible
export const rtdb = getDatabase(app, firebaseConfig.databaseURL);
