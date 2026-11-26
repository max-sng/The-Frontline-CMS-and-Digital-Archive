// ============================================================
// THE FRONTLINE — Email verification (step 1 of 2)
// Vercel serverless function: POST /api/send-code
//
// Requires the caller's Firebase ID token (Authorization: Bearer <token>). The browser
// creates the Firebase Auth account first, then calls this endpoint, so the code is tied
// to that account and is only ever sent to the account's own email address.
//
// Generates a 6-digit code, stores only its HMAC in Firestore (email_verifications/{uid}),
// and emails the code through Brevo. Sending a new code replaces the previous one.
// Limits: one email per minute, five per hour, per account.
//
// Required Vercel environment variables (Project Settings → Environment Variables):
//   BREVO_API_KEY            — Brevo API key (SMTP & API → API Keys)
//   EMAIL_CODE_SECRET        — any long random string, used to hash codes
//   SENDER_EMAIL             — sender address verified in Brevo (Senders & IP)
//   FIREBASE_SERVICE_ACCOUNT — the Firebase service account key JSON (one line)
// Optional:
//   SENDER_NAME              — defaults to "The Frontline"
// ============================================================

import crypto from 'crypto';
import {
  getAdmin, authenticate, fail, hashCode, MESSAGES, ALLOWED_EMAIL, COLLECTION,
  CODE_TTL_MS, RESEND_COOLDOWN_MS, MAX_SENDS_PER_HOUR
} from './_lib/verification.js';

const HOUR_MS = 60 * 60 * 1000;
const BREVO_TIMEOUT_MS = 10000;

class LimitError extends Error {
  constructor(retryAfter, hourly) {
    super('rate limited');
    this.retryAfter = retryAfter;
    this.hourly = hourly;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return fail(res, 405, 'method_not_allowed', 'Method not allowed.');
  }

  const { BREVO_API_KEY, EMAIL_CODE_SECRET, SENDER_EMAIL, SENDER_NAME } = process.env;
  let admin = null;
  try {
    admin = getAdmin();
  } catch (error) {
    console.error('FIREBASE_SERVICE_ACCOUNT is not valid service account JSON:', error.message);
  }
  if (!BREVO_API_KEY || !EMAIL_CODE_SECRET || !SENDER_EMAIL || !admin) {
    console.error('Email verification is not configured: missing BREVO_API_KEY, EMAIL_CODE_SECRET, SENDER_EMAIL, or FIREBASE_SERVICE_ACCOUNT.');
    return fail(res, 500, 'not_configured', MESSAGES.notConfigured);
  }

  const decoded = await authenticate(req, admin.auth);
  if (!decoded) return fail(res, 401, 'session_expired', MESSAGES.sessionExpired);

  const uid = decoded.uid;
  const email = String(decoded.email || '').toLowerCase();
  if (!ALLOWED_EMAIL.test(email)) return fail(res, 400, 'wrong_domain', MESSAGES.wrongDomain);

  let userRecord;
  try {
    userRecord = await admin.auth.getUser(uid);
  } catch (error) {
    console.error('Could not load the Firebase user:', error);
    return fail(res, 401, 'session_expired', MESSAGES.sessionExpired);
  }
  if (userRecord.emailVerified) {
    return fail(res, 409, 'already_verified', 'This email is already verified.');
  }

  const name = String((req.body && req.body.name) || '').replace(/[<>&"]/g, '').trim().slice(0, 60);
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const now = Date.now();
  const expiresAt = now + CODE_TTL_MS;
  const ref = admin.db.collection(COLLECTION).doc(uid);

  // Reserve the send (rate limits) and store the new code in one transaction.
  let previous = null;
  try {
    await admin.db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : {};
      previous = snap.exists ? data : null;

      const sinceLast = now - (data.lastSentAt || 0);
      if (sinceLast < RESEND_COOLDOWN_MS) {
        throw new LimitError(Math.ceil((RESEND_COOLDOWN_MS - sinceLast) / 1000), false);
      }
      const sameWindow = data.windowStart && now - data.windowStart < HOUR_MS;
      const windowStart = sameWindow ? data.windowStart : now;
      const sendCount = sameWindow ? (data.sendCount || 0) + 1 : 1;
      if (sendCount > MAX_SENDS_PER_HOUR) {
        throw new LimitError(Math.ceil((windowStart + HOUR_MS - now) / 1000), true);
      }

      tx.set(ref, {
        email,
        codeHash: hashCode(uid, code, EMAIL_CODE_SECRET),
        expiresAt,
        attempts: 0,
        lastSentAt: now,
        windowStart,
        sendCount
      });
    });
  } catch (error) {
    if (error instanceof LimitError) {
      const message = error.hourly
        ? `Too many codes requested. Try again in about ${Math.ceil(error.retryAfter / 60)} minute(s).`
        : `Please wait ${error.retryAfter} seconds before requesting another code.`;
      return fail(res, 429, error.hourly ? 'hourly_limit' : 'cooldown', message, { retryAfter: error.retryAfter });
    }
    console.error('Could not store the verification code:', error);
    return fail(res, 500, 'server_error', 'Something went wrong on our side. Please try again in a moment.');
  }

  // If the email cannot be sent, restore the previous state so the user can retry right away.
  const undoReservation = async () => {
    try {
      if (previous) await ref.set(previous);
      else await ref.delete();
    } catch (error) {
      console.error('Could not roll back the verification code after a failed send:', error);
    }
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BREVO_TIMEOUT_MS);
  let brevoResponse;
  try {
    brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
      signal: controller.signal,
      body: JSON.stringify({
        sender: { name: SENDER_NAME || 'The Frontline', email: SENDER_EMAIL },
        to: [{ email, name: name || email }],
        subject: 'Your Frontline verification code',
        textContent: `Your Frontline verification code is ${code}. It expires in 10 minutes. If you did not create an account, you can ignore this email.`,
        htmlContent:
          `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">` +
          `<h2 style="margin:0 0 12px;color:#7b1f1f;">The Frontline</h2>` +
          `<p>Hi${name ? ' ' + name : ''},</p>` +
          `<p>Enter this code to finish creating your account:</p>` +
          `<p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:20px 0;">${code}</p>` +
          `<p style="color:#666;font-size:13px;">The code expires in 10 minutes and can be used once. If you did not create an account, you can ignore this email.</p>` +
          `</div>`
      })
    });
  } catch (error) {
    await undoReservation();
    console.error('Could not reach Brevo:', error?.name === 'AbortError' ? 'timed out' : error);
    return fail(res, 502, 'email_failed', 'The verification email could not be sent. Please try again in a moment.');
  } finally {
    clearTimeout(timer);
  }

  if (!brevoResponse.ok) {
    await undoReservation();
    const detail = await brevoResponse.text().catch(() => '');
    console.error(`Brevo rejected the email [${brevoResponse.status}]: ${detail}`);
    if (brevoResponse.status === 429) {
      return fail(res, 503, 'email_quota', "We've hit today's email limit. Please try again later or contact an adviser.");
    }
    return fail(res, 502, 'email_failed', 'The verification email could not be sent. Please try again in a moment.');
  }

  return res.status(200).json({ expiresAt, resendAfter: Math.ceil(RESEND_COOLDOWN_MS / 1000) });
}
