# The Frontline CMS and Digital Archive

The Frontline is a static website and CMS backed by Firebase Authentication and
Cloud Firestore.

## Run locally

Open the repository root in VS Code and serve the page over HTTP, for example
`frontend/articles.html` with Live Server at
`http://localhost:5500/frontend/articles.html`. Do not open the HTML file
directly or serve only the `frontend/` directory: CMS pages import Firebase
modules from the sibling `backend/` directory.

## Deploy to Vercel

Import this GitHub repository into Vercel and use the repository root as the
project root. The root `vercel.json` routes the public site and CMS pages to
their files in `frontend/`; no build command is required.

Each push to the configured production branch deploys automatically when the
Vercel Git integration is enabled. A production deployment can also be started
from the repository root with `vercel --prod`.

## Email verification (Brevo)

New accounts must enter a 6-digit code emailed to them before the account is
created. The code is sent through Brevo by two Vercel serverless functions in
`api/` (`send-code.js` and `verify-code.js`), so the Brevo key never appears in
the website files.

One-time setup:

1. Create a free account at https://www.brevo.com/ and verify a sender address
   under **Senders & IP** (for example `thefrontline@gordoncollege.edu.ph`).
2. Create an API key under **SMTP & API → API Keys**.
3. In the Vercel project, open **Settings → Environment Variables** and add:
   - `BREVO_API_KEY` — the Brevo API key
   - `SENDER_EMAIL` — the verified sender address
   - `EMAIL_CODE_SECRET` — any long random string (it signs the codes)
   - `SENDER_NAME` — optional, defaults to "The Frontline"
4. Redeploy. The free Brevo plan sends up to 300 emails per day.

Codes expire after 10 minutes. Verification runs on Vercel, so locally it only
works with `vercel dev` (which serves the `api/` functions); plain Live Server
cannot send codes.

## Firebase

The client Firebase configuration is in `backend/firebase/firebase-config.js`.
Configure the Firebase project's authorized domains to include the Vercel
production domain. Firestore access rules are in
`backend/firebase/firestore.rules` and can be deployed with the Firebase CLI:

```sh
firebase deploy --only firestore:rules
```

Image uploads (Media page, cover photos, profile photos) use ImgBB when an API
key is set in `backend/firebase/imgbb.js`; otherwise they fall back to Firebase
Storage. To use ImgBB, create a free key at https://api.imgbb.com/ and replace
`YOUR_IMGBB_API_KEY`. To use Firebase Storage instead, enable Storage in the
Firebase console (new buckets require the Blaze plan). Uploaded image details
are saved to the Firestore `media` collection.
