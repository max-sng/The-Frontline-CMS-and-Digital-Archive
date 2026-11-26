// ============================================================
// THE FRONTLINE — shared helpers for email verification
// api/_lib/verification.js  (files in api/_lib are not exposed as endpoints)
//
// Codes are stored server-side in the Firestore collection `email_verifications`,
// one document per Firebase Auth uid. Clients cannot read or write that collection
// (firestore.rules denies it), only these functions can, through the Admin SDK.
// ============================================================

import crypto from 'crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export const CODE_TTL_MS = 10 * 60 * 1000;        // a code is valid for 10 minutes
export const RESEND_COOLDOWN_MS = 60 * 1000;      // at most one email per minute
export const MAX_SENDS_PER_HOUR = 5;              // per account
export const MAX_ATTEMPTS = 5;                    // wrong guesses before a new code is needed
export const ALLOWED_EMAIL = /^[^@\s]+@gordoncollege\.edu\.ph$/;
export const COLLECTION = 'email_verifications';

// Returns the Admin SDK services, or null when FIREBASE_SERVICE_ACCOUNT is not set.
// Throws if the variable is set but is not valid service-account JSON.
export function getAdmin() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(raw)) });
  }
  return { auth: getAuth(), db: getFirestore() };
}

export function hashCode(uid, code, secret) {
  return crypto.createHmac('sha256', secret).update(`${uid}|${code}`).digest('hex');
}

export function hashesMatch(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

// Verifies the "Authorization: Bearer <Firebase ID token>" header.
// Resolves to the decoded token, or null when it is missing or invalid.
export async function authenticate(req, adminAuth) {
  const header = String(req.headers?.authorization || '');
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return null;
  try {
    return await adminAuth.verifyIdToken(match[1]);
  } catch {
    return null;
  }
}

export function fail(res, status, code, error, extra = {}) {
  return res.status(status).json({ code, error, ...extra });
}

export const MESSAGES = {
  notConfigured: 'Email verification is not set up on the server yet. Please contact an adviser.',
  sessionExpired: 'Your sign-up session expired. Go back and select Create account again.',
  wrongDomain: 'Use your Gordon College email address (ending in @gordoncollege.edu.ph).'
};
