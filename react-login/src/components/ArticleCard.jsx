import './ArticleCard.css';
import { articleSection } from '../lib/article.js';

function truncate(text, limit) {
  return text.length > limit ? text.slice(0, limit) + '...' : text;
}

// Card for a published article. Matches the .card markup used on the home page.
// Props:
//   article: { id, title, excerpt, section, tags, coverPhoto, writerName, authorName }
//   href:    optional link; defaults to the public article page for this id
export default function ArticleCard({ article, href }) {
  const url = href || `/frontend/article-view.html?id=${encodeURIComponent(article.id)}`;
  const title = article.title || 'Untitled';
  const author = article.writerName || article.authorName || 'Unknown';

  return (
    <a href={url} className="article-card">
      {article.coverPhoto
        ? <img className="article-card-img" src={article.coverPhoto} alt={title} />
        : <div className="article-card-img article-card-img--empty" aria-hidden="true" />}
      <div className="article-card-body">
        <div className="article-card-section">{articleSection(article).toUpperCase()}</div>
        <div className="article-card-title">{truncate(title, 80)}</div>
        {article.excerpt && (
          <div className="article-card-excerpt">{truncate(article.excerpt, 100)}</div>
        )}
        <div className="article-card-author">by {author}</div>
      </div>
    </a>
  );
}
