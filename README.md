# The Frontline CMS and Digital Archive

The Frontline is a static website and CMS backed by Firebase Authentication and
Cloud Firestore.

## Run locally

Open the repository root in VS Code and serve the page over HTTP, for example
`frontend/articles.html` with Live Server at
`http://localhost:5500/frontend/articles.html`. Do not open the HTML file
directly or serve only the `frontend/` directory: CMS pages import Firebase
modules from the sibling `backend/` directory.

## Deploy to Vercel (two sites from one repository)

The project is deployed as **two Vercel projects** that both import this same GitHub
repository:

| | Public site | CMS |
|---|---|---|
| Who uses it | Readers | Staff (login, Dashboard, Articles, Media, Archive, Correspondents, ...) |
| Build Command | `npm run build:public` | `npm run build:cms` |
| Output Directory | `dist/public` | `dist/cms` |
| Root Directory | `./` (repository root) | `./` (repository root) |
| Framework Preset | Other | Other |
| Needs Brevo variables | No | Yes (see below) |

`scripts/build-site.mjs` copies only the files each site needs into `dist/`, so the
source folders (`frontend/`, `backend/`) are unchanged and Live Server still works.
Both projects also receive the `api/` functions, but they only do anything in the CMS
project, which is the only one that has the Brevo environment variables.

Both projects need these environment variables (Settings -> Environment Variables):

- `PUBLIC_SITE_URL` - the public site's production URL. Defaults to
  `https://frontline-public-site.vercel.app` when unset.
- `CMS_SITE_URL` - the CMS production URL. Defaults to
  `https://the-frontline-cms-and-digital-archi-ochre.vercel.app` when unset.

Both defaults live in `DEFAULT_SITE_URLS` in `scripts/build-site.mjs`. The source files in
`frontend/` keep relative links, so local development on localhost / 127.0.0.1 is unaffected.

They turn the few links that jump between the two sites into absolute URLs
(CMS -> article / contributor pages, public site -> login). After changing them,
redeploy so the build picks them up. See `.env.example` for every variable name.

## Email verification (Brevo)

New accounts must enter a 6-digit code emailed to them before their profile is
created. The flow:

1. `register.html` creates the Firebase Auth sign-in (no profile yet, so it cannot log in).
2. `api/send-code.js` checks the caller's Firebase ID token, stores a hash of a new code
   in the Firestore collection `email_verifications/{uid}`, and emails the code through
   Brevo to that account's own address. Limits: one email per minute, five per hour.
3. `api/verify-code.js` checks the code. A correct code is deleted (it cannot be reused)
   and the account is marked `emailVerified`. Five wrong guesses disable the code until a
   new one is requested. Codes expire after 10 minutes, and resending replaces the old code.
4. The browser saves the profile. `firestore.rules` only allows that once the email is verified.

The Brevo key and the Firebase service account stay on Vercel and never appear in the
website files. Clients cannot read or write `email_verifications`.

One-time setup:

1. Create a free account at https://www.brevo.com/. Add and authenticate a domain you
   control under **Settings -> Senders, Domains & Dedicated IPs -> Domains** (Brevo code,
   DKIM and DMARC DNS records), then add a sender address on that domain. Brevo rejects or
   spam-folders mail sent "from" free addresses such as @gmail.com, so do not use one.
2. Create an API key under **Settings -> SMTP & API -> API Keys & MCP**. Then open
   **Settings -> Security -> Authorized IPs** and click **Deactivate blocking**, otherwise
   Brevo can reject calls from Vercel, whose outgoing IP addresses change.
3. In the Firebase console, open **Project settings -> Service accounts** and click
   **Generate new private key**. Keep the downloaded JSON file private and never commit it
   (`.gitignore` already excludes `*-firebase-adminsdk-*.json`).
4. In the **CMS** Vercel project only, open **Settings → Environment Variables** and add:
   - `BREVO_API_KEY` — the Brevo API key
   - `SENDER_EMAIL` — the verified sender address
   - `EMAIL_CODE_SECRET` — any long random string (it is used to hash the codes)
   - `FIREBASE_SERVICE_ACCOUNT` — the entire contents of the service account JSON file
   - `SENDER_NAME` — optional, defaults to "The Frontline"
5. Deploy the updated Firestore rules (`firebase deploy --only firestore:rules`) and
   redeploy the CMS. The free Brevo plan sends up to 300 emails per day.

Verification runs on Vercel, so locally it only works with `vercel dev` (which serves
the `api/` functions and needs the same variables in `.env.local`); plain Live Server
cannot send codes.

## Login sessions ("Remember me")

- **Remember me checked:** Firebase uses `browserLocalPersistence` and the profile is
  cached in `localStorage`, so the user stays signed in after closing the browser.
- **Unchecked:** Firebase uses `browserSessionPersistence` and the profile is cached in
  `sessionStorage` only, so the session ends when the browser (or tab) is closed.

Each CMS page also watches Firebase Auth (`watchSession` in `backend/firebase/auth.js`).
If the sign-in ends, for example after logging out in another tab, or the account is
deactivated, the page returns to the login screen.

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
