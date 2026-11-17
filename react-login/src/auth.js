// Mirrors loginUser() in backend/firebase/auth.js so both login pages behave the same.
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase.js';

const ERROR_MESSAGES = {
  'auth/user-not-found': 'No account found with this email.',
  'auth/wrong-password': 'Incorrect password. Please try again.',
  'auth/invalid-credential': 'Invalid email or password. Please try again.',
  'auth/email-already-in-use': 'This email is already registered. Please log in instead.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
  'auth/network-request-failed': 'Network error. Please check your internet connection.'
};

function getErrorMessage(code) {
  return ERROR_MESSAGES[code] || 'An error occurred. Please try again.';
}

export async function loginUser(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;

    const userDoc = await getDoc(doc(db, 'users', uid));
    if (!userDoc.exists()) {
      await signOut(auth);
      return {
        success: false,
        error: 'Your sign-in exists, but account setup is incomplete. Please complete registration again using the same email and password.'
      };
    }

    const userData = userDoc.data();

    if (userData.role === 'pending_editorial' && userData.status === 'pending') {
      await signOut(auth);
      return { success: false, error: 'Your account is pending admin approval. Please wait for email confirmation.' };
    }
    if (userData.status !== 'active') {
      await signOut(auth);
      return { success: false, error: 'This account is not active. Please contact an adviser for help.' };
    }

    sessionStorage.setItem('user', JSON.stringify({ uid, ...userData }));
    return { success: true, role: userData.role };
  } catch (error) {
    return { success: false, error: getErrorMessage(error.code) };
  }
}
