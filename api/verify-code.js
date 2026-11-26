// ============================================================
// THE FRONTLINE — Email verification (step 2 of 2)
// Vercel serverless function: POST /api/verify-code
//
// Requires the caller's Firebase ID token (Authorization: Bearer <token>).
// Checks the 6-digit code against the hash stored by /api/send-code. On a match the code
// is deleted (it cannot be used again) and the Firebase Auth account is marked
// emailVerified, which Firestore rules require before the user profile can be created.
// After MAX_ATTEMPTS wrong guesses the code stops working and a new one must be requested.
// ============================================================

import {
  getAdmin, authenticate, fail, hashCode, hashesMatch, MESSAGES, COLLECTION, MAX_ATTEMPTS
} from './_lib/verification.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return fail(res, 405, 'method_not_allowed', 'Method not allowed.');
  }

  const { EMAIL_CODE_SECRET } = process.env;
  let admin = null;
  try {
    admin = getAdmin();
  } catch (error) {
    console.error('FIREBASE_SERVICE_ACCOUNT is not valid service account JSON:', error.message);
  }
  if (!EMAIL_CODE_SECRET || !admin) {
    console.error('Email verification is not configured: missing EMAIL_CODE_SECRET or FIREBASE_SERVICE_ACCOUNT.');
    return fail(res, 500, 'not_configured', MESSAGES.notConfigured);
  }

  const decoded = await authenticate(req, admin.auth);
  if (!decoded) return fail(res, 401, 'session_expired', MESSAGES.sessionExpired);

  const code = String((req.body && req.body.code) || '').trim();
  if (!/^\d{6}$/.test(code)) {
    return fail(res, 400, 'invalid_format', 'Enter the 6-digit code from your email.');
  }

  const uid = decoded.uid;
  const email = String(decoded.email || '').toLowerCase();

  let userRecord;
  try {
    userRecord = await admin.auth.getUser(uid);
  } catch (error) {
    console.error('Could not load the Firebase user:', error);
    return fail(res, 401, 'session_expired', MESSAGES.sessionExpired);
  }
  if (userRecord.emailVerified) {
    // Nothing left to verify. The browser can finish creating the profile.
    return res.status(200).json({ valid: true, alreadyVerified: true });
  }

  const ref = admin.db.collection(COLLECTION).doc(uid);
  let outcome;
  try {
    outcome = await admin.db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { status: 'missing' };
      const data = snap.data();
      if (data.email !== email) {
        tx.delete(ref);
        return { status: 'missing' };
      }
      if (Date.now() > data.expiresAt) {
        tx.delete(ref);
        return { status: 'expired' };
      }
      if ((data.attempts || 0) >= MAX_ATTEMPTS) return { status: 'locked' };

      if (hashesMatch(hashCode(uid, code, EMAIL_CODE_SECRET), data.codeHash)) {
        tx.delete(ref); // single use
        return { status: 'ok' };
      }
      const attempts = (data.attempts || 0) + 1;
      tx.update(ref, { attempts });
      return { status: attempts >= MAX_ATTEMPTS ? 'locked' : 'mismatch', remaining: MAX_ATTEMPTS - attempts };
    });
  } catch (error) {
    console.error('Could not check the verification code:', error);
    return fail(res, 500, 'server_error', 'Something went wrong on our side. Please try again in a moment.');
  }

  switch (outcome.status) {
    case 'missing':
      return fail(res, 400, 'no_code', 'There is no active code for this account. Select Resend code to get a new one.');
    case 'expired':
      return fail(res, 400, 'expired', 'This code has expired. Select Resend code to get a new one.');
    case 'locked':
      return fail(res, 429, 'too_many_attempts', 'Too many incorrect codes. Select Resend code to get a new one.');
    case 'mismatch':
      return fail(res, 400, 'mismatch',
        `That code does not match. Check the email and try again (${outcome.remaining} attempt${outcome.remaining === 1 ? '' : 's'} left).`,
        { remaining: outcome.remaining });
    default:
      break;
  }

  try {
    await admin.auth.updateUser(uid, { emailVerified: true });
  } catch (error) {
    console.error('Code matched, but the account could not be marked verified:', error);
    return fail(res, 500, 'server_error', 'Your code was correct, but verification could not finish. Select Resend code and try again.');
  }

  return res.status(200).json({ valid: true });
}
