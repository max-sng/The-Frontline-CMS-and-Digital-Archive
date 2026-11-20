// ============================================================
// THE FRONTLINE — builds ONE of the two Vercel deployments
//
//   node scripts/build-site.mjs public   ->  dist/public   (readers' website)
//   node scripts/build-site.mjs cms      ->  dist/cms      (staff CMS + Digital Archive)
//
// The source files stay exactly where they are (frontend/ and backend/), so local
// development with Live Server keeps working. This script only copies the files each
// site needs into a flat folder, which Vercel then serves as the site root.
//
// Optional environment variables (set them in each Vercel project):
//   PUBLIC_SITE_URL  e.g. https://the-frontline.vercel.app      (the public site)
//   CMS_SITE_URL     e.g. https://the-frontline-cms.vercel.app  (the CMS)
// They are used to turn the few links that jump from one site to the other
// (CMS -> article / contributor pages, public site -> login) into absolute URLs.
// ============================================================
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND = join(ROOT, 'frontend');
const BACKEND = join(ROOT, 'backend', 'firebase');

// Which files belong to which deployment.
const SITES = {
  public: {
    pages: ['index', 'about', 'article-view', 'correspondent-profile-public', 'article'],
    files: ['frontline.css'],
    backend: ['firebase-config.js', 'firestore.js'],
    entry: null, // index.html is already the home page
    // Pages that live on the OTHER site, and which site that is.
    otherSite: { site: 'cms', pages: ['login', 'register', 'forgot-password', 'dashboard', 'archive', 'articles', 'media', 'correspondents', 'settings', 'approval-queue', 'user-management'] }
  },
  cms: {
    pages: ['login', 'register', 'forgot-password', 'dashboard', 'archive', 'articles', 'media', 'correspondents', 'settings', 'approval-queue', 'user-management'],
    // frontline.css is needed by the article Preview, which renders inside an iframe.
    files: ['shared.css', 'auth.css', 'cms.js', 'frontline.css'],
    backend: ['firebase-config.js', 'firestore.js', 'auth.js', 'imgbb.js'],
    entry: 'login', // the CMS home page (/) is the login page
    otherSite: { site: 'public', pages: ['index', 'about', 'article-view', 'correspondent-profile-public', 'article'] }
  }
};

const siteName = process.argv[2];
const site = SITES[siteName];
if (!site) {
  console.error('Usage: node scripts/build-site.mjs <public|cms>');
  process.exit(1);
}

const urlFor = { public: process.env.PUBLIC_SITE_URL, cms: process.env.CMS_SITE_URL };
const clean = value => (value || '').trim().replace(/\/+$/, '');
const otherUrl = clean(urlFor[site.otherSite.site]);

const OUT = join(ROOT, 'dist', siteName);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'backend', 'firebase'), { recursive: true });

const must = (path) => {
  if (!existsSync(path)) { console.error(`Missing file: ${path}`); process.exit(1); }
  return path;
};

// Links that point at the other deployment become absolute URLs.
const otherPagesPattern = new RegExp(`(?<![\\w./:-])(${site.otherSite.pages.join('|')})\\.html`, 'g');
const crossSite = text => (otherUrl ? text.replace(otherPagesPattern, `${otherUrl}/$1.html`) : text);
let rewrittenFiles = 0;
const copyText = (from, to) => {
  const original = readFileSync(must(from), 'utf8');
  const updated = to.endsWith('.html') || to.endsWith('.js') ? crossSite(original) : original;
  if (updated !== original) rewrittenFiles++;
  writeFileSync(to, updated);
};

for (const page of site.pages) copyText(join(FRONTEND, `${page}.html`), join(OUT, `${page}.html`));
for (const file of site.files) copyText(join(FRONTEND, file), join(OUT, file));
for (const file of site.backend) cpSync(must(join(BACKEND, file)), join(OUT, 'backend', 'firebase', file));
if (site.entry) writeFileSync(join(OUT, 'index.html'), readFileSync(join(OUT, `${site.entry}.html`)));

// Copy only the images this site actually references.
const assetsOut = join(OUT, 'assets');
const sources = [...readdirSync(OUT).filter(f => /\.(html|css|js)$/.test(f)).map(f => join(OUT, f)),
                 ...site.backend.map(f => join(OUT, 'backend', 'firebase', f))];
const wanted = new Set();
for (const file of sources) {
  for (const match of readFileSync(file, 'utf8').matchAll(/assets\/([\w.-]+\.(?:png|jpe?g|svg|webp|gif|ico))/gi)) wanted.add(match[1]);
}
mkdirSync(assetsOut, { recursive: true });
for (const asset of wanted) {
  const from = join(FRONTEND, 'assets', asset);
  if (existsSync(from)) cpSync(from, join(assetsOut, asset));
  else console.warn(`  warning: ${asset} is referenced but missing from frontend/assets`);
}

console.log(`Built "${siteName}" -> dist/${siteName}`);
console.log(`  pages: ${site.pages.length}${site.entry ? ` (+ index.html copied from ${site.entry}.html)` : ''}, assets: ${wanted.size}`);
if (otherUrl) {
  console.log(`  links to the ${site.otherSite.site} site now point to ${otherUrl} (${rewrittenFiles} file(s) updated)`);
} else {
  console.warn(`  note: ${site.otherSite.site === 'cms' ? 'CMS_SITE_URL' : 'PUBLIC_SITE_URL'} is not set, so links to the ${site.otherSite.site} site stay relative and will not work until you set it and redeploy.`);
}
