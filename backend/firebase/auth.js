// ============================================================
// THE FRONTLINE — Authentication
// firebase/auth.js
// ============================================================

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  doc, setDoc, getDoc, serverTimestamp,
  collection, query, where, getDocs, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { auth, db } from "./firebase-config.js";
import { createNotification, logAuditEntry, getUsersByRole, toTitleCaseName } from "./firestore.js";

// Remove the "invited" placeholder that an adviser created for this email, so the
// correspondent does not appear twice. Failures are logged and do not block registration.
async function removeInvitedDuplicates(normalizedEmail, uid) {
  try {
    const snap = await getDocs(query(collection(db, 'users'), where('status', '==', 'invited')));
    const matches = snap.docs.filter(d => d.id !== uid && String(d.data().email || '').toLowerCase() === normalizedEmail);
    for (const placeholder of matches) {
      await deleteDoc(placeholder.ref);
    }
  } catch (error) {
    console.error('Could not remove the invited placeholder record:', error);
  }
}

// ── REGISTER ──────────────────────────────────────────────
export async function registerUser({ firstName, surname, email, password, role, section }) {
  firstName = toTitleCaseName(firstName || '');
  surname = toTitleCaseName(surname || '');
  const normalizedEmail = email.trim().toLowerCase();
  const isEditorialSignup = role === 'editorial' || role === 'pending_editorial';
  let userCredential;
  let isProfileRecovery = false;

  try {
    userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
  } catch (error) {
    if (error.code !== 'auth/email-already-in-use') {
      return { success: false, error: getErrorMessage(error.code) };
    }

    try {
      userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      const existingProfile = await getDoc(doc(db, 'users', userCredential.user.uid));
      if (existingProfile.exists()) {
        await signOut(auth);
        return { success: false, error: 'This email already has an account. Please log in instead.' };
      }
      isProfileRecovery = true;
    } catch (recoveryError) {
      if (auth.currentUser) await signOut(auth);
      if (recoveryError.code === 'auth/wrong-password' || recoveryError.code === 'auth/invalid-credential') {
        return { success: false, error: 'This email is already registered. Please log in instead.' };
      }
      console.error('Could not verify an existing account during registration recovery:', recoveryError);
      return { success: false, error: 'Could not verify your account. Please try again.' };
    }
  }

  const uid = userCredential.user.uid;
  try {
    await setDoc(doc(db, 'users', uid), {
      firstName,
      surname,
      name: `${firstName} ${surname}`,
      email: normalizedEmail,
      role: isEditorialSignup ? 'pending_editorial' : role,
      section: section || null,
      status: isEditorialSignup ? 'pending' : 'active',
      createdAt: serverTimestamp()
    });
    await removeInvitedDuplicates(normalizedEmail, uid);
  } catch (error) {
    console.error('Account authentication succeeded but the user profile could not be saved:', error);
    return {
      success: false,
      error: 'Your sign-in was created, but account setup did not finish. Submit Create Account again with the same email and password to complete setup.'
    };
  }

  if (isEditorialSignup) {
    const fromName = `${firstName} ${surname}`;
    try {
      const advisers = await getUsersByRole('adviser');
      await Promise.all(advisers.map(adviser => createNotification({
        toUid: adviser.id,
        type: 'editorial_signup_pending',
        articleId: null,
        articleTitle: null,
        fromUid: uid,
        fromName,
        message: `${fromName} has registered for editorial access and is awaiting your approval.`,
        read: false
      })));
    } catch (error) {
      console.error('Editorial signup was saved, but adviser notifications could not be created:', error);
    }
    try {
      await logAuditEntry({ action: 'editorial_signup', performedBy: uid, targetUid: null, details: 'New editorial registration pending approval' });
    } catch (error) {
      console.error('Editorial signup was saved, but its audit entry could not be created:', error);
    }
  }

  return { success: true, uid, recovered: isProfileRecovery };
}

// ── LOGIN ─────────────────────────────────────────────────
export async function loginUser(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;

    // Get user role from Firestore
    const userDoc = await getDoc(doc(db, "users", uid));
    if (!userDoc.exists()) {
      await signOut(auth);
      return {
        success: false,
        error: "Your sign-in exists, but account setup is incomplete. Please complete registration again using the same email and password."
      };
    }

    const userData = userDoc.data();

    // Block pending editorial registrations
    if (userData.role === 'pending_editorial' && userData.status === 'pending') {
      await signOut(auth);
      return { success: false, error: "Your account is pending admin approval. Please wait for email confirmation." };
    }
    if (userData.status !== 'active') {
      await signOut(auth);
      return { success: false, error: "This account is not active. Please contact an adviser for help." };
    }

    // Save user data to sessionStorage for use across pages
    sessionStorage.setItem('user', JSON.stringify({ uid, ...userData }));

    return { success: true, role: userData.role };
  } catch (error) {
    return { success: false, error: getErrorMessage(error.code) };
  }
}

// ── LOGOUT ────────────────────────────────────────────────
export async function logoutUser() {
  await signOut(auth);
  sessionStorage.removeItem('user');
  window.location.href = 'login.html';
}

// ── RESET PASSWORD ────────────────────────────────────────
export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase());
    return { success: true };
  } catch (error) {
    return { success: false, error: getErrorMessage(error.code) };
  }
}

// ── AUTH GUARD ────────────────────────────────────────────
// Call this at the top of every CMA page
export function requireAuth(allowedRoles = ['correspondent', 'editorial', 'adviser']) {
  const user = JSON.parse(sessionStorage.getItem('user') || 'null');
  if (!user) {
    window.location.href = 'login.html';
    return null;
  }
  if (!allowedRoles.includes(user.role)) {
    window.location.href = 'dashboard.html';
    return null;
  }
  return user;
}

// ── GET CURRENT USER ──────────────────────────────────────
export function getCurrentUser() {
  return JSON.parse(sessionStorage.getItem('user') || 'null');
}

// ── ADMIN ACTIONS (client helpers) ───────────────────────
// These are convenience wrappers intended for use by adviser-only UI controls.
export async function deactivateUser(targetUid) {
  const current = getCurrentUser();
  if (!current) return { success: false, error: 'Not authenticated' };
  if (current.uid === targetUid) return { success: false, error: 'You cannot deactivate your own account' };
  if (current.role !== 'adviser') return { success: false, error: 'Only adviser can deactivate users' };
  try {
    await updateDoc(doc(db, 'users', targetUid), { status: 'deactivated', deactivatedAt: serverTimestamp() });
    await createNotification({
      toUid: targetUid,
      type: 'user_deactivated',
      articleId: null,
      articleTitle: null,
      fromUid: current.uid,
      fromName: current.name || `${current.firstName} ${current.surname}`,
      message: 'Your account has been deactivated by an adviser.',
      read: false
    });
    await logAuditEntry({ action: 'deactivate_user', performedBy: current.uid, targetUid, details: 'User account deactivated' });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export async function changeUserRole(targetUid, newRole) {
  const current = getCurrentUser();
  if (!current) return { success: false, error: 'Not authenticated' };
  if (current.uid === targetUid) return { success: false, error: 'You cannot change your own role' };
  if (current.role !== 'adviser') return { success: false, error: 'Only adviser can change user roles' };
  try {
    await updateDoc(doc(db, 'users', targetUid), { role: newRole, roleChangedAt: serverTimestamp() });
    await createNotification({
      toUid: targetUid,
      type: 'role_changed',
      articleId: null,
      articleTitle: null,
      fromUid: current.uid,
      fromName: current.name || `${current.firstName} ${current.surname}`,
      message: `Your role has been changed to ${newRole}.`,
      read: false
    });
    await logAuditEntry({ action: 'change_user_role', performedBy: current.uid, targetUid, details: `Role changed to ${newRole}` });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── ERROR MESSAGES ────────────────────────────────────────
function getErrorMessage(code) {
  const messages = {
    'auth/user-not-found':       'No account found with this email.',
    'auth/wrong-password':       'Incorrect password. Please try again.',
    'auth/invalid-credential':   'Invalid email or password. Please try again.',
    'auth/email-already-in-use': 'This email is already registered. Please log in instead.',
    'auth/weak-password':        'Password must be at least 6 characters.',
    'auth/invalid-email':        'Please enter a valid email address.',
    'auth/too-many-requests':    'Too many failed attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Please check your internet connection.',
  };
  return messages[code] || 'An error occurred. Please try again.';
}
