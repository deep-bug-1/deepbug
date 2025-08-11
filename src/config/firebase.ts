import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyBtPwPneKnNHWl4UccodlyDOfKp4nIVESI",
  authDomain: "deep-bug-4bb1d.firebaseapp.com",
  projectId: "deep-bug-4bb1d",
  storageBucket: "deep-bug-4bb1d.firebasestorage.app",
  messagingSenderId: "1039577829985",
  appId: "1:1039577829985:web:b1a3702a58dce50e40d020",
  measurementId: "G-09C3MYVC9G"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
