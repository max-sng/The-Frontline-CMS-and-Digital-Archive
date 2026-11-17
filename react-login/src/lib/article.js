// Copy of articleSection() from backend/firebase/firestore.js. Keep the two in sync.
// The backend module imports Firebase from a CDN, so the React build can't import it directly.
export function articleSection(article) {
  const section = String(article?.section || '').replace(/^#+/, '').trim();
  if (section) return section;
  const firstTag = Array.isArray(article?.tags) ? String(article.tags[0] || '').replace(/^#+/, '').trim() : '';
  return firstTag || 'General';
}
