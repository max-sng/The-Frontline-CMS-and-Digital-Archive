// ============================================================
// THE FRONTLINE — Email verification (step 2 of 2)
// Vercel serverless function: POST /api/verify-code
//
// Checks the 6-digit code the user typed against the signed token
// issued by /api/send-code. No database is needed: the token holds
// the email, code and expiry, protected by an HMAC signature.
// ============================================================

import crypto from 'crypto';

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const { EMAIL_CODE_SECRET } = process.env;
  if (!EMAIL_CODE_SECRET) {
    console.error('Email verification is not configured: missing EMAIL_CODE_SECRET.');
    return res.status(500).json({ error: 'Email verification is not set up on the server yet. Please contact an adviser.' });
  }

  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const code = String((req.body && req.body.code) || '').trim();
  const token = String((req.body && req.body.token) || '');

  const dot = token.lastIndexOf('.');
  if (!email || !/^\d{6}$/.test(code) || dot === -1) {
    return res.status(400).json({ valid: false, error: 'Enter the 6-digit code from your email.' });
  }

  let payload;
  try {
    payload = Buffer.from(token.slice(0, dot), 'base64url').toString('utf8');
  } catch {
    return res.status(400).json({ valid: false, error: 'This verification code is no longer valid. Request a new one.' });
  }

  const [tokenEmail, tokenCode, tokenExpiry] = payload.split('|');
  const expected = sign(payload, EMAIL_CODE_SECRET);
  const given = token.slice(dot + 1);

  const signatureOk =
    expected.length === given.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given));

  if (!signatureOk || tokenEmail !== email) {
    return res.status(400).json({ valid: false, error: 'This verification code is no longer valid. Request a new one.' });
  }
  if (Date.now() > Number(tokenExpiry)) {
    return res.status(400).json({ valid: false, error: 'This code has expired. Request a new one.' });
  }
  if (tokenCode !== code) {
    return res.status(400).json({ valid: false, error: 'That code does not match. Check the email and try again.' });
  }

  return res.status(200).json({ valid: true });
}
