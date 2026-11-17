import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Same Firebase project as backend/firebase/firebase-config.js
const firebaseConfig = {
  apiKey: 'AIzaSyAfSDmupZkz-6B5yu-9kxf8JxH8ruYf1DM',
  authDomain: 'the-frontline-dd17d.firebaseapp.com',
  projectId: 'the-frontline-dd17d',
  storageBucket: 'the-frontline-dd17d.appspot.com',
  messagingSenderId: '935620901835',
  appId: '1:935620901835:web:d99bdd95f929fc8b56544e'
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
