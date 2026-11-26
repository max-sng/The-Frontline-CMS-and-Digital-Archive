// ============================================================
// THE FRONTLINE — Email verification (step 1 of 2)
// Vercel serverless function: POST /api/send-code
//
// Generates a 6-digit code, emails it through Brevo, and returns
// a signed token the browser later sends back to /api/verify-code.
// The code itself is never sent to the browser.
//
// Required Vercel environment variables (Project Settings → Environment Variables):
//   BREVO_API_KEY      — Brevo API key (SMTP & API → API Keys)
//   EMAIL_CODE_SECRET  — any long random string, used to sign codes
//   SENDER_EMAIL       — sender address verified in Brevo (Senders & IP)
// Optional:
//   SENDER_NAME        — defaults to "The Frontline"
// ============================================================

import crypto from 'crypto';

const CODE_TTL_MS = 10 * 60 * 1000; // code is valid for 10 minutes

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const { BREVO_API_KEY, EMAIL_CODE_SECRET, SENDER_EMAIL, SENDER_NAME } = process.env;
  if (!BREVO_API_KEY || !EMAIL_CODE_SECRET || !SENDER_EMAIL) {
    console.error('Email verification is not configured: missing BREVO_API_KEY, EMAIL_CODE_SECRET, or SENDER_EMAIL.');
    return res.status(500).json({ error: 'Email verification is not set up on the server yet. Please contact an adviser.' });
  }

  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const name = String((req.body && req.body.name) || '').trim();

  if (!/^[^@\s]+@gordoncollege\.edu\.ph$/.test(email)) {
    return res.status(400).json({ error: 'Use your Gordon College email address (ending in @gordoncollege.edu.ph).' });
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const expiresAt = Date.now() + CODE_TTL_MS;
  const payload = `${email}|${code}|${expiresAt}`;
  const token = Buffer.from(payload).toString('base64url') + '.' + sign(payload, EMAIL_CODE_SECRET);

  const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': BREVO_API_KEY
    },
    body: JSON.stringify({
      sender: { name: SENDER_NAME || 'The Frontline', email: SENDER_EMAIL },
      to: [{ email, name: name || email }],
      subject: 'Your Frontline verification code',
      htmlContent:
        `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">` +
        `<h2 style="margin:0 0 12px;color:#7b1f1f;">The Frontline</h2>` +
        `<p>Hi${name ? ' ' + name.replace(/[<>&]/g, '') : ''},</p>` +
        `<p>Enter this code to finish creating your account:</p>` +
        `<p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:20px 0;">${code}</p>` +
        `<p style="color:#666;font-size:13px;">The code expires in 10 minutes. If you did not create an account, you can ignore this email.</p>` +
        `</div>`
    })
  });

  if (!brevoResponse.ok) {
    const detail = await brevoResponse.text();
    console.error(`Brevo rejected the email [${brevoResponse.status}]: ${detail}`);
    return res.status(502).json({ error: 'The verification email could not be sent. Please try again in a moment.' });
  }

  return res.status(200).json({ token, expiresAt });
}
