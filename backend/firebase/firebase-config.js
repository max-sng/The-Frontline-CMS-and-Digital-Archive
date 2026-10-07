// ============================================================
// THE FRONTLINE — Firebase Configuration
// firebase/firebase-config.js
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAfSDmupZkz-6B5yu-9kxf8JxH8ruYf1DM",
  authDomain: "the-frontline-dd17d.firebaseapp.com",
  projectId: "the-frontline-dd17d",
  storageBucket: "the-frontline-dd17d.appspot.com",
  messagingSenderId: "935620901835",
  appId: "1:935620901835:web:d99bdd95f929fc8b56544e"
};

const app     = initializeApp(firebaseConfig);
const auth    = getAuth(app);
const db      = getFirestore(app);
const storage = getStorage(app);

export { auth, db, storage };
