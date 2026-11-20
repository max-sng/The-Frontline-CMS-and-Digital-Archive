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

- `PUBLIC_SITE_URL` - the public site's production URL, e.g. `https://the-frontline.vercel.app`
- `CMS_SITE_URL` - the CMS production URL, e.g. `https://the-frontline-cms.vercel.app`

They turn the few links that jump between the two sites into absolute URLs
(CMS -> article / contributor pages, public site -> login). After changing them,
redeploy so the build picks them up. See `.env.example` for every variable name.

## Email verification (Brevo)

New accounts must enter a 6-digit code emailed to them before the account is
created. The code is sent through Brevo by two Vercel serverless functions in
`api/` (`send-code.js` and `verify-code.js`), so the Brevo key never appears in
the website files.

One-time setup:

1. Create a free account at https://www.brevo.com/. Add and authenticate a domain you
   control under **Settings -> Senders, Domains & Dedicated IPs -> Domains** (Brevo code,
   DKIM and DMARC DNS records), then add a sender address on that domain. Brevo rejects or
   spam-folders mail sent "from" free addresses such as @gmail.com, so do not use one.
2. Create an API key under **Settings -> SMTP & API -> API Keys & MCP**. Then open
   **Settings -> Security -> Authorized IPs** and click **Deactivate blocking**, otherwise
   Brevo can reject calls from Vercel, whose outgoing IP addresses change.
3. In the **CMS** Vercel project only, open **Settings → Environment Variables** and add:
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
