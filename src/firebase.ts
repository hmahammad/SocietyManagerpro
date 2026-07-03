import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBQnJ6MNRKSpe7LWissGaRvYdZJdFi0eVs",
  authDomain: "shomitiapp-847e3.firebaseapp.com",
  projectId: "shomitiapp-847e3",
  storageBucket: "shomitiapp-847e3.firebasestorage.app",
  messagingSenderId: "121572759041",
  appId: "1:121572759041:web:2df968bfbe76fa287b5200"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);
export const auth = getAuth(app);

const secondaryApp = getApps().find(a => a.name === "Secondary") || initializeApp(firebaseConfig, "Secondary");
export const secondaryAuth = getAuth(secondaryApp);
