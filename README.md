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

## Firebase

The client Firebase configuration is in `backend/firebase/firebase-config.js`.
Configure the Firebase project's authorized domains to include the Vercel
production domain. Firestore access rules are in
`backend/firebase/firestore.rules` and can be deployed with the Firebase CLI:

```sh
firebase deploy --only firestore:rules
```

Image uploads use Firebase Storage unless an ImgBB API key is configured in
`backend/firebase/imgbb.js`.
