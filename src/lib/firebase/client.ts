import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyC8qkbCONQFowxeS67_3RzTqxKDrzm6LHQ',
  authDomain: 'ilpea-hr-system.firebaseapp.com',
  projectId: 'ilpea-hr-system',
  storageBucket: 'ilpea-hr-system.firebasestorage.app',
  messagingSenderId: '536387147308',
  appId: '1:536387147308:web:04e9fa73b694a11e212389',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
