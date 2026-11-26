// ============================================================
// THE FRONTLINE — Authentication
// firebase/auth.js
// ============================================================

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  updatePassword,
  deleteUser,
  reload
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  doc, setDoc, getDoc, serverTimestamp,
  collection, query, where, getDocs, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { auth, db } from "./firebase-config.js";
import { createNotification, logAuditEntry, getUsersByRole, toTitleCaseName } from "./firestore.js";

// ── SESSION CACHE ─────────────────────────────────────────
// Pages read the signed-in user's profile synchronously from storage under the "user" key.
// sessionStorage holds it for the current tab. When "Remember me" is checked, a copy is also
// kept in localStorage so it survives closing the browser, matching Firebase's
// browserLocalPersistence. Without "Remember me", Firebase uses browserSessionPersistence and
// nothing is written to localStorage, so the session ends when the browser closes.
const USER_KEY = 'user';

function readStoredUser(storage) {
  try { return JSON.parse(storage.getItem(USER_KEY) || 'null'); } catch { return null; }
}

function isRemembered() {
  try { return Boolean(localStorage.getItem(USER_KEY)); } catch { return false; }
}

export function cacheUserProfile(profile, { remember = isRemembered() } = {}) {
  const value = JSON.stringify(profile);
  try { sessionStorage.setItem(USER_KEY, value); } catch { /* storage unavailable */ }
  try {
    if (remember) localStorage.setItem(USER_KEY, value);
    else localStorage.removeItem(USER_KEY);
  } catch { /* storage unavailable */ }
}

export function clearCachedUser() {
  try { sessionStorage.removeItem(USER_KEY); } catch { /* storage unavailable */ }
  try { localStorage.removeItem(USER_KEY); } catch { /* storage unavailable */ }
}

// Returns the cached profile for this tab, or the remembered one (copied into this tab).
function getCachedUser() {
  const tabUser = readStoredUser(sessionStorage);
  if (tabUser) return tabUser;
  const remembered = readStoredUser(localStorage);
  if (remembered) {
    try { sessionStorage.setItem(USER_KEY, JSON.stringify(remembered)); } catch { /* storage unavailable */ }
  }
  return remembered;
}

// Loads the Firestore profile and checks that the account may use the CMS.
async function loadActiveProfile(uid) {
  const userDoc = await getDoc(doc(db, "users", uid));
  if (!userDoc.exists()) {
    return {
      ok: false,
      error: "Your sign-in exists, but account setup is incomplete. Please complete registration again using the same email and password."
    };
  }
  const userData = userDoc.data();
  if (userData.role === 'pending_editorial' && userData.status === 'pending') {
    return { ok: false, error: "Your account is pending admin approval. Please wait for an adviser to approve it." };
  }
  if (userData.status !== 'active') {
    return { ok: false, error: "This account is not active. Please contact an adviser for help." };
  }
  return { ok: true, profile: { uid, ...userData } };
}

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

// ── REGISTER (step 1 of 2): create the sign-in, before the email is verified ──
// The Firebase Auth account is created first so the verification API can tie the emailed
// code to it. No Firestore profile exists until completeRegistration(), so an unverified
// account cannot log in. Firestore rules also require a verified email to create the profile.
export async function startRegistration({ email, password }) {
  const normalizedEmail = email.trim().toLowerCase();
  try {
    // A sign-up in progress should not outlive the browser session.
    await setPersistence(auth, browserSessionPersistence);
  } catch (error) {
    console.error('Could not set sign-in persistence for registration:', error);
  }

  const current = auth.currentUser;
  if (current) {
    let hasProfile = false;
    try {
      hasProfile = (await getDoc(doc(db, 'users', current.uid))).exists();
    } catch (error) {
      console.error('Could not check the current account before registration:', error);
      hasProfile = true; // be safe: never modify an account we could not inspect
    }
    if (!hasProfile && current.email === normalizedEmail) {
      // The user went back from the code step: keep the sign-in and apply the latest password.
      try {
        await updatePassword(current, password);
        return { success: true, emailVerified: current.emailVerified };
      } catch (error) {
        console.error('Could not update the password of the unfinished sign-up:', error);
        await signOut(auth);
      }
    } else if (!hasProfile && !current.emailVerified) {
      // The email was changed: discard the unfinished, unverified sign-up for the old address.
      try { await deleteUser(current); } catch { await signOut(auth); }
    } else {
      await signOut(auth);
    }
  }
  clearCachedUser();

  try {
    const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
    return { success: true, emailVerified: credential.user.emailVerified };
  } catch (error) {
    if (error.code !== 'auth/email-already-in-use') {
      return { success: false, error: getErrorMessage(error.code) };
    }
  }

  // The email already has a sign-in. If it has no profile (an earlier sign-up that never
  // finished), let the same person continue with the same password.
  try {
    const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
    const existingProfile = await getDoc(doc(db, 'users', credential.user.uid));
    if (existingProfile.exists()) {
      await signOut(auth);
      return { success: false, error: 'This email already has an account. Please log in instead.' };
    }
    return { success: true, emailVerified: credential.user.emailVerified, recovered: true };
  } catch (error) {
    if (auth.currentUser) await signOut(auth);
    if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      return { success: false, error: 'This email is already registered. Please log in instead, or use "Forgot password?" on the login page.' };
    }
    console.error('Could not verify an existing account during registration recovery:', error);
    return { success: false, error: getErrorMessage(error.code) };
  }
}

// ID token for the account being registered, sent to the verification API.
export async function getAuthIdToken() {
  return auth.currentUser ? auth.currentUser.getIdToken() : null;
}

// ── REGISTER (step 2 of 2): save the profile once the email is verified ──
export async function completeRegistration({ firstName, surname, email, role, section }) {
  firstName = toTitleCaseName(firstName || '');
  surname = toTitleCaseName(surname || '');
  const normalizedEmail = email.trim().toLowerCase();
  const isEditorialSignup = role === 'editorial' || role === 'pending_editorial';
  const user = auth.currentUser;
  if (!user || user.email !== normalizedEmail) {
    return { success: false, error: 'Your sign-up session ended. Go back and select Create account again.' };
  }

  try {
    await reload(user);
    // Refresh the ID token so Firestore sees the new email_verified claim.
    await user.getIdToken(true);
  } catch (error) {
    console.error('Could not refresh the account after verification:', error);
    return { success: false, error: 'Network error. Please check your internet connection and try again.' };
  }
  if (!user.emailVerified) {
    return { success: false, error: 'Your email has not been verified yet. Enter the 6-digit code from your email.' };
  }

  const uid = user.uid;
  try {
    const existing = await getDoc(doc(db, 'users', uid));
    if (!existing.exists()) {
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
    }
  } catch (error) {
    console.error('Email verified, but the user profile could not be saved:', error);
    return {
      success: false,
      error: 'Your email is verified, but account setup did not finish. Select Verify & create account again to retry.'
    };
  }

  // The user logs in from the login page, where they choose "Remember me".
  await signOut(auth);
  clearCachedUser();
  return { success: true, uid };
}

// ── LOGIN ─────────────────────────────────────────────────
export async function loginUser(email, password, { remember = false } = {}) {
  try {
    // "Remember me": keep the Firebase sign-in after the browser closes (local), or only
    // for this browser session (session). Must be set before signing in.
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
    const userCredential = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
    const result = await loadActiveProfile(userCredential.user.uid);
    if (!result.ok) {
      await signOut(auth);
      clearCachedUser();
      return { success: false, error: result.error };
    }
    cacheUserProfile(result.profile, { remember });
    return { success: true, role: result.profile.role };
  } catch (error) {
    if (auth.currentUser) await signOut(auth).catch(() => {});
    if (!error.code) console.error('Login failed:', error);
    return { success: false, error: getErrorMessage(error.code) };
  }
}

// ── RESTORE SESSION ───────────────────────────────────────
// Used by the login page: resolves to the signed-in user's profile when a valid session
// (remembered or from this tab) still exists, otherwise null.
export async function restoreSession() {
  const cached = getCachedUser();
  await auth.authStateReady();
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) {
    clearCachedUser();
    return null;
  }
  if (!cached || cached.uid !== firebaseUser.uid) {
    // A Firebase sign-in with no matching profile cache was not remembered by this app
    // (for example, one stored before "Remember me" was supported). End it.
    await signOut(auth).catch(() => {});
    clearCachedUser();
    return null;
  }
  try {
    const result = await loadActiveProfile(firebaseUser.uid);
    if (!result.ok) {
      await signOut(auth).catch(() => {});
      clearCachedUser();
      return null;
    }
    const profile = { ...cached, ...result.profile };
    cacheUserProfile(profile);
    return profile;
  } catch (error) {
    // Offline or Firestore unreachable: trust the cached session for now.
    console.error('Could not refresh the session profile:', error);
    return cached;
  }
}

// ── SESSION WATCH ─────────────────────────────────────────
// Keeps the page in sync with Firebase Auth: if the sign-in ends (logout in another tab,
// expired session, account switched) or the account is deactivated, return to login.
let watchedUid = null;
export function watchSession(uid) {
  if (!uid || watchedUid) return;
  watchedUid = uid;
  let checkedProfile = false;
  onAuthStateChanged(auth, async firebaseUser => {
    if (!firebaseUser || firebaseUser.uid !== uid) {
      clearCachedUser();
      window.location.href = 'login.html?reason=signed-out';
      return;
    }
    if (checkedProfile) return;
    checkedProfile = true;
    try {
      const result = await loadActiveProfile(uid);
      if (!result.ok) {
        await signOut(auth).catch(() => {});
        clearCachedUser();
        window.location.href = 'login.html?reason=inactive';
        return;
      }
      cacheUserProfile({ ...getCachedUser(), ...result.profile });
    } catch (error) {
      console.error('Could not refresh the session profile:', error);
    }
  });
}

// ── LOGOUT ────────────────────────────────────────────────
export async function logoutUser() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Sign-out failed:', error);
  }
  clearCachedUser();
  window.location.href = 'login.html';
}

// ── RESET PASSWORD ────────────────────────────────────────
export async function resetPassword(email) {
  const normalizedEmail = email.trim().toLowerCase();
  // After resetting, Firebase's page offers a "Continue" link back to our login page.
  const continueUrl = new URL('login.html?reason=password-reset', window.location.href).href;
  try {
    await sendPasswordResetEmail(auth, normalizedEmail, { url: continueUrl });
    return { success: true };
  } catch (error) {
    // The continue link only works on domains authorized in Firebase. Send without it otherwise.
    if (error.code === 'auth/unauthorized-continue-uri' || error.code === 'auth/invalid-continue-uri') {
      try {
        await sendPasswordResetEmail(auth, normalizedEmail);
        return { success: true };
      } catch (retryError) {
        return { success: false, error: getErrorMessage(retryError.code) };
      }
    }
    if (!error.code) console.error('Password reset failed:', error);
    return { success: false, error: getErrorMessage(error.code) };
  }
}

// ── AUTH GUARD ────────────────────────────────────────────
// Call this at the top of every CMA page
export function requireAuth(allowedRoles = ['correspondent', 'editorial', 'adviser']) {
  const user = getCachedUser();
  if (!user) {
    window.location.href = 'login.html';
    return null;
  }
  if (!allowedRoles.includes(user.role)) {
    window.location.href = 'dashboard.html';
    return null;
  }
  watchSession(user.uid);
  return user;
}

// ── GET CURRENT USER ──────────────────────────────────────
export function getCurrentUser() {
  return getCachedUser();
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
    console.error('deactivateUser error', e);
    return {
      success: false,
      error: e.code === 'permission-denied'
        ? 'Firestore denied deactivation. Deploy the latest Firestore rules and confirm your adviser account is active.'
        : e.message
    };
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
    'auth/missing-email':        'Enter your email address.',
    'auth/missing-password':     'Enter your password.',
    'auth/user-disabled':        'This account has been disabled. Please contact an adviser.',
    'auth/requires-recent-login': 'For your security, please start again.',
  };
  return messages[code] || 'An error occurred. Please try again.';
}
