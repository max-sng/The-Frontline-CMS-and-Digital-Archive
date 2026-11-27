/* ============================================================
   THE FRONTLINE CMS — SHARED INTERACTIONS
   cms.js — included on every CMS page
   ============================================================ */

/* ── Sidebar ── */
function isMobileSidebar() {
  return window.matchMedia('(max-width: 768px)').matches;
}

function supportsSidebarHoverCollapse() {
  return window.matchMedia('(min-width: 769px) and (hover: hover) and (pointer: fine)').matches;
}

function updateSidebarNavLabels() {
  const collapsed = supportsSidebarHoverCollapse()
    && !document.body.classList.contains('sidebar-hover-expanded');
  document.querySelectorAll('.sidebar-nav li a, .sidebar-nav .nav-toggle, .sidebar-nav .sidebar-logout-button').forEach(control => {
    const label = (control.querySelector('span:not(.nav-chevron)')?.textContent || control.textContent)
      .trim().replace(/\s+/g, ' ');
    if (!label) return;
    control.setAttribute('aria-label', label);
    if (collapsed) control.title = label;
    else control.removeAttribute('title');
  });
}

function updateSidebarButton() {
  const btn = document.getElementById('hamburger');
  const sidebar = document.getElementById('sidebar');
  if (!btn || !sidebar) return;
  const expanded = sidebar.classList.contains('open');
  const label = expanded ? 'Close navigation' : 'Open navigation';
  btn.setAttribute('aria-controls', 'sidebar');
  btn.setAttribute('aria-expanded', String(expanded));
  btn.setAttribute('aria-label', label);
  btn.title = label;
  updateSidebarNavLabels();
}

function initSidebarHoverCollapse() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar || sidebar.dataset.hoverCollapseBound) return;
  sidebar.dataset.hoverCollapseBound = 'true';
  let pointerInside = supportsSidebarHoverCollapse() && sidebar.matches(':hover');
  const syncExpansion = () => {
    const expanded = supportsSidebarHoverCollapse()
      && (pointerInside || Boolean(sidebar.querySelector(':focus-visible')));
    document.body.classList.toggle('sidebar-hover-expanded', expanded);
    updateSidebarNavLabels();
  };
  sidebar.addEventListener('mouseenter', () => { pointerInside = true; syncExpansion(); });
  sidebar.addEventListener('mouseleave', () => { pointerInside = false; syncExpansion(); });
  sidebar.addEventListener('focusin', syncExpansion);
  sidebar.addEventListener('focusout', syncExpansion);
  window.addEventListener('resize', () => {
    pointerInside = supportsSidebarHoverCollapse() && sidebar.matches(':hover');
    syncExpansion();
  });
  syncExpansion();
}

function openSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebarOverlay');
  if (sb) sb.classList.add('open');
  if (ov) ov.classList.add('active');
  document.body.style.overflow = 'hidden';
  updateSidebarButton();
}

function closeSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebarOverlay');
  if (sb) sb.classList.remove('open');
  if (ov) ov.classList.remove('active');
  document.body.style.overflow = '';
  updateSidebarButton();
}

/* Close any open status menu on an outside click */
document.addEventListener('click', (e) => {
  if (!e.target.closest('.status-dropdown')) {
    document.querySelectorAll('.status-menu').forEach(m => m.classList.remove('open'));
  }
});

/* ── Media upload ── */
function handleMediaUpload(e) {
  const files = e.target.files;
  if (!files || !files.length) return;
  handleMediaFiles(files).finally(() => { e.target.value = ''; });
}

function createMediaThumb(item) {
  const div = document.createElement('div');
  div.className = 'media-thumb';
  div.dataset.filename = (item.filename || '').toLowerCase();
  div.dataset.url = item.url || '';
  if (item.id) div.dataset.id = item.id;
  const img = document.createElement('img');
  // Online thumbnails (and the local preview shown while a file uploads) load as usual;
  // image-fallback.js swaps in the grey "Image unavailable" graphic if one fails or is still
  // loading after 10 seconds. A missing or unusable URL gets that graphic straight away.
  img.src = mediaThumbUrl(item.thumb) || mediaThumbUrl(item.url) || window.FrontlineImageFallback?.src || '';
  img.alt = item.filename || 'Uploaded media';
  img.loading = 'lazy';
  const hover = document.createElement('div');
  hover.className = 'thumb-hover';
  div.append(img, hover);
  return div;
}

function mediaThumbUrl(value) {
  const src = String(value || '').trim();
  if (/^blob:/i.test(src)) return src; // in-progress upload preview, never saved
  return articleImageUrl(src);
}

function articleImageUrl(value) {
  const src = String(value || '').trim();
  if (/^data:image\/[a-z0-9.+-]+(?:;[^,]*)?,/i.test(src)) return src;
  try {
    const url = new URL(src, window.location.href);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function getArticleMediaItems(article) {
  const items = [];
  const title = String(article.title || 'Untitled article').trim();
  const addImage = (value, label) => {
    const url = articleImageUrl(value);
    if (!url) return;
    items.push({
      id: `article-${article.id || 'unknown'}-${items.length}`,
      filename: `${title} - ${label}`,
      url,
      thumb: url
    });
  };

  addImage(article.coverPhoto, 'cover');
  const content = new DOMParser().parseFromString(String(article.content || ''), 'text/html');
  content.querySelectorAll('img[src]').forEach((image, index) => {
    addImage(image.getAttribute('src'), `image ${index + 1}`);
  });
  return items;
}

function mediaUrlKey(value) {
  try {
    const url = new URL(value, window.location.href);
    url.hash = '';
    return url.href;
  } catch {
    return String(value || '').trim();
  }
}

function updateMediaEmptyState() {
  const grid = document.getElementById('media-grid');
  const emptyState = document.getElementById('media-empty');
  if (!grid || !emptyState) return;
  const hasItems = grid.querySelector('.media-thumb') !== null;
  emptyState.style.display = hasItems ? 'none' : 'flex';
}

async function handleMediaFiles(files) {
  const grid = document.getElementById('media-grid');
  if (!grid) return;
  const user = JSON.parse(sessionStorage.getItem('user') || 'null');
  if (!user?.uid) {
    showToast('Please sign in again before uploading.', 'error');
    return;
  }

  const images = Array.from(files).filter(file => file.type && file.type.startsWith('image/'));
  const skipped = files.length - images.length;
  if (skipped) showToast(`${skipped} file${skipped > 1 ? 's were' : ' was'} skipped because ${skipped > 1 ? 'they are' : 'it is'} not an image.`, 'warn');
  if (!images.length) return;

  const [{ uploadImage }, { createMediaItem }] = await Promise.all([
    import('../backend/firebase/imgbb.js'),
    import('../backend/firebase/firestore.js')
  ]);

  // Firestore only confirms a write once its server acknowledges it, which can take a long
  // time on a restricted network. The upload itself is done by then, so the "Uploading" state
  // never waits longer than this for that confirmation.
  const SAVE_CONFIRM_TIMEOUT_MS = 10000;
  const SAVE_PENDING = Symbol('save-pending');

  let uploaded = 0;
  let failed = 0;
  let stillSaving = 0;
  let lastError = '';
  for (const [index, file] of images.entries()) {
    showToast(images.length === 1 ? 'Uploading image…' : `Uploading image ${index + 1} of ${images.length}…`, 'progress', { persist: true });
    const localUrl = URL.createObjectURL(file);
    const div = createMediaThumb({ filename: file.name, url: localUrl });
    const label = document.createElement('span');
    label.className = 'uploading-label';
    label.textContent = 'Uploading...';
    div.appendChild(label);
    grid.prepend(div);
    updateMediaEmptyState();

    try {
      const result = await uploadImage(file);
      if (!result.success) throw new Error(result.error || 'Upload failed.');
      // Show the online copy right away. Whether the browser can load it (i.ibb.co may be
      // blocked) does not matter here: image-fallback.js handles a thumbnail that won't load.
      div.querySelector('img').src = result.thumb || result.url;
      div.dataset.url = result.url;

      const savePromise = createMediaItem({
        filename: file.name,
        url: result.url,
        thumb: result.thumb || result.url,
        uploadedBy: user.uid
      });
      const saved = await Promise.race([
        savePromise,
        new Promise(resolve => setTimeout(() => resolve(SAVE_PENDING), SAVE_CONFIRM_TIMEOUT_MS))
      ]);
      if (saved === SAVE_PENDING) {
        // Uploaded, but Firestore has not confirmed yet: finish quietly in the background.
        stillSaving++;
        savePromise.then(late => {
          if (late.success) {
            div.dataset.id = late.id;
            showToast('Image saved to the library.', 'success');
          } else {
            div.remove();
            updateMediaEmptyState();
            showToast(`Image uploaded, but it could not be saved to the library: ${late.error || 'unknown error'}`, 'error');
          }
        });
      } else if (!saved.success) {
        throw new Error(`Image uploaded, but it could not be saved to the library: ${saved.error || 'unknown error'}`);
      } else {
        div.dataset.id = saved.id;
        uploaded++;
      }
    } catch (e) {
      failed++;
      lastError = e?.message || 'Upload failed.';
      div.remove();
      console.error('Media upload failed:', e);
    } finally {
      label.remove(); // never left behind, whatever happened
      URL.revokeObjectURL(localUrl);
      updateMediaEmptyState();
    }
  }

  // The progress toast is always replaced by a short, auto-dismissing result.
  const done = uploaded + stillSaving;
  if (failed && !done) {
    showToast(lastError || 'Upload failed.', 'error');
  } else if (failed) {
    showToast(`${done} uploaded, ${failed} failed. ${lastError}`, 'warn');
  } else if (stillSaving) {
    showToast(`${done === 1 ? 'Image' : `${done} images`} uploaded. Saving to the library is taking longer than usual; keep this page open for a moment.`, 'warn');
  } else {
    showToast(uploaded === 1 ? 'Image uploaded' : `${uploaded} images uploaded`, 'success');
  }
}

async function initMediaLibrary() {
  const grid = document.getElementById('media-grid');
  if (!grid) return;
  try {
    const user = JSON.parse(sessionStorage.getItem('user') || 'null');
    if (!user?.uid) throw new Error('Please sign in again to view article media.');
    const { getMediaItems, getAllArticles, getMyArticles } = await import('../backend/firebase/firestore.js');
    const articleQuery = ['adviser', 'editorial'].includes(user.role)
      ? getAllArticles()
      : getMyArticles(user.uid);
    const [libraryItems, articles] = await Promise.all([getMediaItems(), articleQuery]);
    const items = [...libraryItems];
    const seenUrls = new Set(libraryItems.map(item => mediaUrlKey(item.url)));
    articles.flatMap(getArticleMediaItems).forEach(item => {
      const key = mediaUrlKey(item.url);
      if (!key || seenUrls.has(key)) return;
      seenUrls.add(key);
      items.push(item);
    });
    // Keep any uploads that started while the library was loading.
    const existingIds = new Set(Array.from(grid.querySelectorAll('.media-thumb[data-id]')).map(el => el.dataset.id));
    items.forEach(item => {
      if (existingIds.has(item.id)) return;
      grid.appendChild(createMediaThumb(item));
    });
  } catch (e) {
    console.error('Failed to load media library', e);
    showToast('Could not load the media library. Please refresh the page.', 'error');
  } finally {
    updateMediaEmptyState();
  }
}

/* ── Media search by filename ── */
function initMediaSearch() {
  const input = document.getElementById('media-search-input');
  if (!input || input.dataset.searchBound) return;
  input.dataset.searchBound = 'true';
  input.addEventListener('input', function () {
    const q = this.value.toLowerCase().trim();
    let visible = 0;
    document.querySelectorAll('#media-grid .media-thumb').forEach(thumb => {
      const name = thumb.dataset.filename || '';
      const show = !q || name.includes(q);
      thumb.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    let noMatch = document.getElementById('media-no-match');
    const total = document.querySelectorAll('#media-grid .media-thumb').length;
    if (total && !visible) {
      if (!noMatch) {
        noMatch = document.createElement('p');
        noMatch.id = 'media-no-match';
        noMatch.className = 'empty-msg';
        noMatch.textContent = 'No media matches your search.';
        document.getElementById('media-grid').after(noMatch);
      }
    } else if (noMatch) {
      noMatch.remove();
    }
  });
}

/* ── Drag and drop for upload zone ── */
function initDragDrop(zoneId) {
  const zone = document.getElementById(zoneId);
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    handleMediaFiles(e.dataTransfer.files);
  });
}

/* ── Toast notification ── */
let toastTimer;
// type: success | error | warn | progress. Toasts hide after a few seconds; pass
// { persist: true } for one that stays until the next showToast (e.g. "Uploading…").
function showToast(msg, type = 'success', { persist = false } = {}) {
  let toast = document.getElementById('cms-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'cms-toast';
    toast.style.cssText = `
      position:fixed;bottom:24px;right:24px;
      padding:12px 20px;border-radius:8px;
      font-size:13px;font-weight:500;
      z-index:9999;opacity:0;pointer-events:none;
      transform:translateY(8px);
      transition:opacity 0.2s,transform 0.2s;
      display:flex;align-items:center;gap:8px;
      font-family:'Inter', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
    `;
    document.body.appendChild(toast);
  }

  const colors = {
    success: { bg: 'var(--ink)', dot: '#22c55e' },
    error:   { bg: 'var(--red-bright)', dot: '#fff' },
    warn:    { bg: '#b7950b', dot: '#fff' },
    progress: { bg: 'var(--ink)', dot: '#f5c542' },
  };
  const c = colors[type] || colors.success;
  toast.style.background = c.bg;
  toast.style.color = '#fff';
  toast.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${c.dot};flex-shrink:0;display:inline-block;"></span><span></span>`;
  toast.lastElementChild.textContent = msg; // plain text: messages can include server error text
  toast.style.opacity = '1';
  toast.style.pointerEvents = 'auto';
  toast.style.transform = 'translateY(0)';

  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  clearTimeout(toastTimer);
  if (persist) return;
  toastTimer = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
  }, 3200);
}

/* ── Hamburger (for pages using id="hamburger") ── */
function initHamburger() {
  const btn = document.getElementById('hamburger');
  const ov  = document.getElementById('sidebarOverlay');
  if (btn && !btn.dataset.boundSidebar) {
    btn.dataset.boundSidebar = 'true';
    btn.addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      if (!sidebar || !isMobileSidebar()) return;
      sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
    });
    updateSidebarButton();
    window.addEventListener('resize', () => {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebarOverlay');
      if (!isMobileSidebar() && (sidebar?.classList.contains('open') || overlay?.classList.contains('active'))) {
        closeSidebar();
      }
      updateSidebarButton();
    });
  }
  if (ov && !ov.dataset.boundSidebar) {
    ov.dataset.boundSidebar = 'true';
    ov.addEventListener('click', closeSidebar);
  }
}

/* ── Name formatting ── */
function toTitleCaseName(value) {
  if (typeof value !== 'string') return value;
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
    .replace(/(^|[\s\-'’])(\p{L})/gu, (_, sep, letter) => sep + letter.toLocaleUpperCase());
}
window.toTitleCaseName = toTitleCaseName;

/* ── Article body sanitizer ──
   Cleans stored article HTML before it is shown (e.g. the Approval Queue preview). Uses
   DOMPurify when its CDN script has loaded; otherwise an allowlist that keeps the editor's
   formatting and drops scripts, event handlers and unsafe links. */
function sanitizeArticleHtml(content) {
  if (typeof window.DOMPurify?.sanitize === 'function') {
    return window.DOMPurify.sanitize(content || '', {
      ALLOWED_TAGS: ['p','br','strong','em','u','s','h1','h2','h3','blockquote','pre','sub','sup','span','div','ul','ol','li','a','img','iframe'],
      ALLOWED_ATTR: ['href','target','src','alt','frameborder','allowfullscreen','class','style','data-list']
    });
  }
  const parsed = new DOMParser().parseFromString(String(content || ''), 'text/html');
  const allowedTags = new Set(['P','BR','STRONG','B','EM','I','U','S','H1','H2','H3','BLOCKQUOTE','PRE','SUB','SUP','SPAN','DIV','UL','OL','LI','A','IMG']);
  const allowedAttributes = new Set(['href','src','alt','title','class','style','data-list']);
  const allowedStyles = new Set(['font-size','color','background-color','text-align']);
  const cleanStyle = value => value.split(';').map(rule => rule.trim()).filter(rule => {
    const [prop, ...rest] = rule.split(':');
    const val = rest.join(':').trim().toLowerCase();
    return allowedStyles.has((prop || '').trim().toLowerCase()) && val && !/url\(|expression|javascript:/.test(val);
  }).join('; ');
  const cleanNode = node => {
    Array.from(node.childNodes).forEach(child => {
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      if (!allowedTags.has(child.tagName)) {
        cleanNode(child);
        child.replaceWith(...child.childNodes);
        return;
      }
      Array.from(child.attributes).forEach(attribute => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim();
        const safeUrl = /^(https?:|mailto:)/i.test(value) || value.startsWith('/') || value.startsWith('#');
        if (!allowedAttributes.has(name) || ((name === 'href' || name === 'src') && !safeUrl)) {
          child.removeAttribute(attribute.name);
        } else if (name === 'style') {
          const style = cleanStyle(value);
          if (style) child.setAttribute('style', style); else child.removeAttribute('style');
        }
      });
      cleanNode(child);
    });
  };
  cleanNode(parsed.body);
  return parsed.body.innerHTML;
}
window.sanitizeArticleHtml = sanitizeArticleHtml;

/* Keep the topbar name in Title Case whichever page script sets it. */
function initTopbarNameFormatting() {
  const nameEl = document.getElementById('topbar-username');
  if (!nameEl || nameEl.dataset.titleCaseBound) return;
  nameEl.dataset.titleCaseBound = 'true';
  const apply = () => {
    const text = nameEl.textContent;
    if (!text || text === 'Loading...') return;
    const formatted = toTitleCaseName(text);
    if (formatted !== text) nameEl.textContent = formatted;
  };
  apply();
  new MutationObserver(apply).observe(nameEl, { childList: true, characterData: true, subtree: true });
}

/* ── Topbar search ──
   The topbar search is wired once here for every CMS page:
   1. If the page has its own search box (Articles, Media, Archive), the query is mirrored into it,
      so the page's existing filtering, empty states and pagination keep working.
   2. Otherwise a "frontline:search" event is dispatched; pages such as Correspondents and
      User Management listen for it.
   3. Pages with neither get a generic text filter over their visible list items. */
const PAGE_SEARCH_INPUTS = ['#articles-search', '#media-search-input', '#archive-search'];
const GENERIC_SEARCH_ITEMS = '#dashboard-content .article-card, #queue .queue-item, .tab-panel .setting-row, .tab-panel .password-row, .tab-panel .danger-row';

function runGenericSearch(query) {
  const items = document.querySelectorAll(GENERIC_SEARCH_ITEMS);
  if (!items.length) return;
  const q = query.toLocaleLowerCase();
  let visible = 0;
  items.forEach(item => {
    const show = !q || item.textContent.toLocaleLowerCase().includes(q);
    item.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  const host = document.querySelector('.cms-content');
  let msg = document.getElementById('topbar-search-empty');
  if (q && !visible) {
    if (!msg && host) {
      msg = document.createElement('p');
      msg.id = 'topbar-search-empty';
      msg.className = 'empty-msg';
      host.appendChild(msg);
    }
    if (msg) msg.textContent = `No results for "${query}".`;
  } else if (msg) {
    msg.remove();
  }
}

function initTopbarSearch() {
  const input = document.querySelector('.cms-topbar .search-wrap input');
  if (!input || input.dataset.searchBound) return;
  input.dataset.searchBound = 'true';
  input.removeAttribute('readonly');
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('type', 'search');
  input.setAttribute('aria-label', 'Search this page');
  input.value = '';

  const pageInput = PAGE_SEARCH_INPUTS.map(sel => document.querySelector(sel)).find(Boolean);
  if (pageInput) {
    // Keep both boxes in sync in either direction.
    pageInput.addEventListener('input', () => {
      if (input.value !== pageInput.value) input.value = pageInput.value;
    });
  }

  input.addEventListener('input', () => {
    const query = input.value.trim();
    if (pageInput) {
      pageInput.value = input.value;
      pageInput.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const event = new CustomEvent('frontline:search', { detail: { query }, cancelable: true });
    const handled = !document.dispatchEvent(event) || window.__frontlineSearchHandled === true;
    if (!handled) runGenericSearch(query);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { input.value = ''; input.dispatchEvent(new Event('input')); }
  });
}

/* ── Hide restricted sidebar links based on role ── */
function initSidebarAccess() {
  const user = JSON.parse(sessionStorage.getItem('user') || 'null');
  document.querySelectorAll('.sidebar-nav li a').forEach(link => {
    Array.from(link.childNodes).forEach(node => {
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) return;
      const label = document.createElement('span');
      label.textContent = node.textContent.trim();
      node.replaceWith(label);
    });
  });
  const isAdviser = user?.role === 'adviser';
  document.querySelectorAll('.admin-only').forEach(item => { item.style.display = isAdviser ? '' : 'none'; });
  document.querySelectorAll('.adviser-parent').forEach(link => { link.style.display = isAdviser ? 'none' : ''; });
  document.querySelectorAll('.non-adviser-only').forEach(item => { item.style.display = isAdviser ? 'none' : ''; });
  if (!user || !['editorial','adviser'].includes(user.role)) {
    const corrLink = document.querySelector('a[href="correspondents.html"]');
    if (corrLink) corrLink.closest('li').style.display = 'none';
  }
  updateSidebarNavLabels();
}

function initSidebarLogout() {
  const navFoot = document.querySelector('.sidebar-nav .nav-foot');
  if (!navFoot || navFoot.querySelector('.sidebar-logout-button')) return;

  const item = document.createElement('li');
  item.className = 'sidebar-logout-item';
  item.innerHTML = `
    <button type="button" class="sidebar-logout-button">
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fill-rule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h6a1 1 0 100-2H4V5h5a1 1 0 100-2H3zm10.293 3.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L14.586 11H7a1 1 0 110-2h7.586l-1.293-1.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
      </svg>
      <span>Log out</span>
    </button>`;
  const button = item.querySelector('.sidebar-logout-button');
  button.addEventListener('click', async () => {
    if (typeof window.__frontlineLogout !== 'function') {
      showToast('Sign-out is unavailable. Refresh the page and try again.', 'error');
      return;
    }
    button.disabled = true;
    try {
      await window.__frontlineLogout();
    } catch (error) {
      console.error('Sidebar logout failed:', error);
      button.disabled = false;
      showToast('Could not log out. Please try again.', 'error');
    }
  });
  navFoot.appendChild(item);
}

/* ── Topbar avatar dropdown (Account Settings / Log Out) ── */
function initTopbarDropdown() {
  const avatar = document.getElementById('topbar-avatar');
  if (!avatar) return;
  if (avatar.dataset.dropdownReady) return;
  avatar.dataset.dropdownReady = 'true';

  avatar.removeAttribute('title');
  avatar.style.cursor = 'pointer';

  // Inject hover styles once
  if (!document.getElementById('topbar-dd-styles')) {
    const s = document.createElement('style');
    s.id = 'topbar-dd-styles';
    s.textContent = `.topbar-dd-item:hover{background:var(--bg-surface)!important;}`;
    document.head.appendChild(s);
  }

  const dropdown = document.createElement('div');
  dropdown.id = 'topbar-dropdown';
  dropdown.style.cssText = [
    'display:none', 'position:absolute', 'top:calc(100% + 8px)', 'right:0',
    'background:#fff', 'border:1px solid var(--border)', 'border-radius:10px',
    'box-shadow:0 4px 20px rgba(0,0,0,.12)', 'min-width:180px',
    'z-index:1000', 'overflow:hidden', "font-family:'Inter', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif"
  ].join(';');

  dropdown.innerHTML = `
    <a href="settings.html#account" class="topbar-dd-item"
       style="display:flex;align-items:center;gap:10px;padding:11px 16px;
              color:var(--ink);text-decoration:none;font-size:13px;font-weight:500;">
      <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/>
      </svg>
      Account Settings
    </a>
    <div style="height:1px;background:var(--bg-surface);margin:0 12px;"></div>
    <button id="topbar-logout-btn" class="topbar-dd-item"
            style="display:flex;align-items:center;gap:10px;padding:11px 16px;
                   color:#e74c3c;background:none;border:none;width:100%;
                   cursor:pointer;font-size:13px;font-weight:500;
                   font-family:'Inter', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;text-align:left;">
      <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h6a1 1 0 100-2H4V5h5a1 1 0 100-2H3zm10.293 3.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L14.586 11H7a1 1 0 110-2h7.586l-1.293-1.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
      </svg>
      Log Out
    </button>`;

  const anchor = avatar.closest('.topbar-user') || avatar.parentElement;
  anchor.style.position = 'relative';
  anchor.appendChild(dropdown);

  avatar.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
  });

  dropdown.querySelector('#topbar-logout-btn').addEventListener('click', () => {
    if (typeof window.__frontlineLogout === 'function') window.__frontlineLogout();
  });

  document.addEventListener('click', () => { dropdown.style.display = 'none'; });
}

async function initNotificationWidget() {
  const user = JSON.parse(sessionStorage.getItem('user') || 'null');
  if (!user || !user.uid) return;
  const topbar = document.querySelector('.cms-topbar');
  const topbarUser = topbar?.querySelector('.topbar-user');
  if (!topbar || !topbarUser) return;
  if (topbar.querySelector('#notif-btn')) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'topbar-notification';
  wrapper.innerHTML = `
    <button id="notif-btn" class="notif-button" aria-label="Open notifications">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 01-3.46 0" />
      </svg>
    </button>
    <div id="notif-panel" class="notif-panel" role="list"></div>`;

  topbar.insertBefore(wrapper, topbarUser);

  const notifBtn = wrapper.querySelector('#notif-btn');
  const notifPanel = wrapper.querySelector('#notif-panel');
  const { getNotifications, markNotificationRead } = await import('../backend/firebase/firestore.js');

  function renderNotifications(list) {
    notifPanel.innerHTML = `
      <div class="notif-panel-header">
        <span>Notifications</span>
        <button id="mark-all-read">Mark all read</button>
      </div>`;
    if (!list.length) {
      notifPanel.innerHTML += '<div class="notif-item"><div class="notif-item-title">No new notifications</div><div class="notif-item-message">You are all caught up.</div></div>';
      return;
    }
    list.forEach(n => {
      const item = document.createElement('div');
      item.className = `notif-item ${n.read ? '' : 'unread'}`;
      item.innerHTML = `
        <div class="notif-item-title">${String(n.type).replace(/_/g, ' ')}</div>
        <div class="notif-item-message">${n.message || ''}</div>
        <div class="notif-item-meta">${n.createdAt?.toDate?.().toLocaleString() || ''}</div>`;
      notifPanel.appendChild(item);
    });
  }

  async function loadNotifications() {
    const list = await getNotifications(user.uid);
    renderNotifications(list);
    return list;
  }

  async function markUnreadNotificationsRead(list) {
    const results = await Promise.all(
      list.filter(n => !n.read).map(n => markNotificationRead(n.id))
    );
    const failed = results.find(result => !result.success);
    if (failed) throw new Error(failed.error || 'Could not mark notifications as read.');
  }

  function showNotificationError(error) {
    console.error('Could not load notifications:', error);
    notifPanel.innerHTML = `
      <div class="notif-panel-header"><span>Notifications</span></div>
      <div class="notif-item">
        <div class="notif-item-title">Notifications unavailable</div>
        <div class="notif-item-message">Please try again in a moment.</div>
      </div>`;
  }

  notifBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const visible = notifPanel.classList.toggle('visible');
    if (!visible) return;
    try {
      const list = await loadNotifications();
      await markUnreadNotificationsRead(list);
      renderNotifications(list.map(n => ({ ...n, read: true })));
    } catch (error) {
      showNotificationError(error);
    }
  });

  notifPanel.addEventListener('click', async (event) => {
    if (event.target.id !== 'mark-all-read') return;
    event.preventDefault();
    try {
      const list = await getNotifications(user.uid);
      await markUnreadNotificationsRead(list);
      renderNotifications(list.map(n => ({ ...n, read: true })));
    } catch (error) {
      showNotificationError(error);
    }
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.topbar-notification') && !event.target.closest('#notif-panel')) {
      notifPanel.classList.remove('visible');
    }
  });

}

async function initUserProfileSync() {
  const user = JSON.parse(sessionStorage.getItem('user') || 'null');
  if (!user?.uid) return;
  const { subscribeUserProfile, getUser, syncPublicProfile, publicProfileFrom, shouldHavePublicProfile } = await import('../backend/firebase/firestore.js');

  // Keep this user's public contributor profile (public_profiles/{uid}) in line with their
  // own profile, so the public portal can show their name and photo to visitors.
  let lastPublicProfile = null;
  function syncPublic(profile) {
    const key = JSON.stringify([shouldHavePublicProfile(profile), publicProfileFrom(profile)]);
    if (key === lastPublicProfile) return;
    lastPublicProfile = key;
    syncPublicProfile(user.uid, profile).then(result => {
      if (!result.success) {
        lastPublicProfile = null; // try again on the next profile refresh
        console.warn('Could not update the public profile:', result.error);
      }
    });
  }

  function applyProfile(profile) {
    syncPublic(profile);
    const roleChanged = profile.role && profile.role !== user.role;
    const updatedUser = { ...user, ...profile };
    sessionStorage.setItem('user', JSON.stringify(updatedUser));
    // "Remember me" keeps a copy in localStorage; keep it current too.
    if (localStorage.getItem('user')) localStorage.setItem('user', JSON.stringify(updatedUser));
    const roleLabels = { adviser: 'Adviser', editorial: 'Editorial Board', correspondent: 'Correspondent' };
    const roleEl = document.getElementById('topbar-role');
    const nameEl = document.getElementById('topbar-username');
    if (roleEl) {
      const roleLabel = roleLabels[profile.role] || profile.role || 'User';
      roleEl.textContent = profile.status && profile.status !== 'active'
        ? `${roleLabel} · ${profile.status}`
        : roleLabel;
    }
    if (nameEl) nameEl.textContent = toTitleCaseName(profile.name || [profile.firstName, profile.surname].filter(Boolean).join(' ') || 'User');
    if (roleChanged) window.setTimeout(() => window.location.reload(), 250);
  }

  async function refreshProfile() {
    const profile = await getUser(user.uid);
    if (profile) applyProfile(profile);
  }

  subscribeUserProfile(user.uid, applyProfile, error => console.error('Real-time user profile updates failed:', error));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshProfile();
  });
  window.setInterval(refreshProfile, 10000);
}

document.addEventListener('DOMContentLoaded', () => {
  initHamburger();
  initSidebarHoverCollapse();
  initTopbarNameFormatting();
  initTopbarSearch();
  initSidebarLogout();
  initSidebarAccess();
  initTopbarDropdown();
  initNotificationWidget();
  initUserProfileSync();
  initDragDrop('upload-zone');
  initMediaSearch();
  initMediaLibrary();
});

/* ── Sidebar sub-menus ──
   A group stays open across page changes until the user closes it: open groups are remembered
   for the session and restored on every page. The group holding the current page always opens.
   Runs as soon as cms.js loads (it sits after the sidebar on every page), not on DOMContentLoaded,
   which waits for Firebase and would make restored groups pop open late. */
const NAV_OPEN_KEY = 'frontline:navOpen';
function readOpenGroups() {
  try { return new Set(JSON.parse(sessionStorage.getItem(NAV_OPEN_KEY) || '[]')); } catch { return new Set(); }
}
function writeOpenGroups(set) {
  try { sessionStorage.setItem(NAV_OPEN_KEY, JSON.stringify([...set])); } catch { /* storage unavailable */ }
}
function initSidebarToggles() {
  const saved = readOpenGroups();
  document.querySelectorAll('.sidebar-nav .nav-toggle').forEach(btn => {
    const group = btn.closest('li');
    const sub = group.querySelector(':scope > .sub-nav');
    if (!sub || btn.dataset.toggleBound) return;
    btn.dataset.toggleBound = 'true';
    const id = group.id || sub.querySelector('a')?.getAttribute('href') || btn.textContent.trim();
    const setOpen = open => {
      sub.hidden = !open;
      group.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
    };
    if (sub.querySelector('li.active')) { setOpen(true); saved.add(id); writeOpenGroups(saved); }
    else if (saved.has(id)) setOpen(true);
    // Clear the class once the last (most delayed) item has finished sliding in.
    sub.addEventListener('animationend', e => {
      if (e.target === sub.querySelector(':scope > li:last-child')) sub.classList.remove('is-opening');
    });
    btn.addEventListener('click', () => {
      const open = sub.hidden;
      setOpen(open);
      sub.classList.toggle('is-opening', open); // slide in on a click-open only; closing is instant
      const current = readOpenGroups();
      open ? current.add(id) : current.delete(id);
      writeOpenGroups(current);
    });
  });
}
initSidebarToggles();

/* ── Fill the topbar name/role from the session immediately, so it doesn't flash
      "Loading..." on every page while Firebase loads. Page scripts still refresh it. ── */
(function prefillTopbarUser() {
  try {
    const u = JSON.parse(sessionStorage.getItem('user') || localStorage.getItem('user') || 'null');
    if (!u) return;
    const nameEl = document.getElementById('topbar-username');
    const roleEl = document.getElementById('topbar-role');
    const name = u.name || [u.firstName, u.surname].filter(Boolean).join(' ');
    if (nameEl && name) nameEl.textContent = typeof toTitleCaseName === 'function' ? toTitleCaseName(name) : name;
    const labels = { adviser: 'Adviser', editorial: 'Editorial Board', correspondent: 'Correspondent' };
    if (roleEl && labels[u.role]) roleEl.textContent = labels[u.role];
  } catch (e) { /* session unavailable: keep the placeholder */ }
})();

/* ── Tables wider than the screen slide sideways inside .table-wrap (scrollbar hidden).
      Over such a table the mouse wheel scrolls it left/right; at either end the wheel
      goes back to scrolling the page, so it never traps the reader. ── */
document.addEventListener('wheel', e => {
  const wrap = e.target.closest?.('.table-wrap');
  if (!wrap || e.ctrlKey) return;
  const max = wrap.scrollWidth - wrap.clientWidth;
  if (max <= 1 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // fits, or trackpad already scrolling sideways
  const atStart = wrap.scrollLeft <= 0 && e.deltaY < 0;
  const atEnd = wrap.scrollLeft >= max - 1 && e.deltaY > 0;
  if (atStart || atEnd) return;
  e.preventDefault();
  wrap.scrollLeft += e.deltaY;
}, { passive: false });
