import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// These must be the FARIER-PRO project's values (not the landing page)
const farrierProConfig = {
  apiKey: import.meta.env.VITE_FP_API_KEY,
  authDomain: import.meta.env.VITE_FP_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FP_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FP_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FP_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FP_APP_ID,
};

const appName = "farritech-app";
const existing = getApps().find((a) => a.name === appName);

const farrierProApp = existing || initializeApp(farrierProConfig, appName);

export const farrierProAuth = getAuth(farrierProApp);
export const farrierProDb = getFirestore(farrierProApp);
