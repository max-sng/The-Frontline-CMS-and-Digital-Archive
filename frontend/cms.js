/* ============================================================
   THE FRONTLINE CMS — SHARED INTERACTIONS
   cms.js — included in all CMA pages
   ============================================================ */

/* ── Mobile sidebar ── */
function openSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebarOverlay');
  if (sb) sb.classList.add('open');
  if (ov) ov.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebarOverlay');
  if (sb) sb.classList.remove('open');
  if (ov) ov.classList.remove('active');
  document.body.style.overflow = '';
}

/* ── Status dropdown ── */
function toggleStatusMenu(i, e) {
  e.stopPropagation();
  const menu   = document.getElementById('menu-' + i);
  const dd     = document.getElementById('dd-' + i);
  const isOpen = menu.classList.contains('open');

  // Close all open menus first
  document.querySelectorAll('.status-menu').forEach(m => m.classList.remove('open'));
  document.querySelectorAll('.status-dropdown').forEach(d => d.classList.remove('drop-up'));

  if (!isOpen) {
    // Check if dropdown would go off screen bottom
    const rect        = dd.getBoundingClientRect();
    const menuHeight  = 180; // approximate height of menu
    const spaceBelow  = window.innerHeight - rect.bottom;
    if (spaceBelow < menuHeight) dd.classList.add('drop-up');
    menu.classList.add('open');
  }
}

function selectStatus(i, status, event) {
  if (event) { event.stopPropagation(); event.preventDefault(); }
  const labels = {
    draft: 'Draft', pending: 'Pending',
    reviewed: 'Reviewed', published: 'Published', assigned: 'Assigned'
  };
  const dd    = document.getElementById('dd-' + i);
  const badge = dd.querySelector('.status-badge');
  badge.className = 'status-badge ' + status;

  const labelSpan = badge.querySelector('span');
  if (labelSpan) {
    labelSpan.textContent = labels[status];
  }

  const menu = document.getElementById('menu-' + i);
  menu.querySelectorAll('.status-option').forEach(o => o.classList.remove('is-selected'));
  const opt = menu.querySelector('.opt-' + status);
  if (opt) opt.classList.add('is-selected');
  menu.classList.remove('open');
  dd.classList.remove('drop-up');
}

/* Close dropdowns on outside click */
document.addEventListener('click', (e) => {
  if (!e.target.closest('.status-dropdown')) {
    document.querySelectorAll('.status-menu').forEach(m => m.classList.remove('open'));
    document.querySelectorAll('.status-dropdown').forEach(d => d.classList.remove('drop-up'));
  }
});

/* ── Rich text toolbar ── */
function execCmd(cmd) {
  const editor = document.getElementById('editor-content');
  if (editor) { editor.focus({ preventScroll: true }); document.execCommand(cmd, false, null); }
}

/* ── Tag removal ── */
function removeTag(btn) { btn.closest('.section-tag').remove(); }

/* ── Cover photo preview ── */
function previewCover(e) {
  const file = e.target.files[0];
  if (!file) return;
  const preview = document.getElementById('cover-preview');
  const btn = document.querySelector('.cover-upload-btn');
  if (preview) { preview.src = URL.createObjectURL(file); preview.style.display = 'block'; }
  if (btn) btn.style.display = 'none';
}

/* ── Media upload ── */
function handleMediaUpload(e) {
  const files = e.target.files;
  if (!files || !files.length) return;
  handleMediaFiles(files).finally(() => { e.target.value = ''; });
}

function escapeMediaText(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

function createMediaThumb(item) {
  const div = document.createElement('div');
  div.className = 'media-thumb';
  div.dataset.filename = (item.filename || '').toLowerCase();
  div.dataset.url = item.url || '';
  if (item.id) div.dataset.id = item.id;
  const img = document.createElement('img');
  img.src = item.thumb || item.url || '';
  img.alt = item.filename || 'Uploaded media';
  img.loading = 'lazy';
  const hover = document.createElement('div');
  hover.className = 'thumb-hover';
  div.append(img, hover);
  return div;
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

  let uploaded = 0;
  let failed = 0;
  let lastError = '';
  for (const file of images) {
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
      const saved = await createMediaItem({
        filename: file.name,
        url: result.url,
        thumb: result.thumb || result.url,
        uploadedBy: user.uid
      });
      if (!saved.success) throw new Error(`Image uploaded, but it could not be saved to the library: ${saved.error || 'unknown error'}`);
      div.querySelector('img').src = result.thumb || result.url;
      div.dataset.url = result.url;
      div.dataset.id = saved.id;
      label.remove();
      uploaded++;
    } catch (e) {
      failed++;
      lastError = e?.message || 'Upload failed.';
      div.remove();
      console.error('Media upload failed:', e);
    } finally {
      URL.revokeObjectURL(localUrl);
      updateMediaEmptyState();
    }
  }

  if (uploaded && !failed) {
    showToast(uploaded === 1 ? 'Image uploaded successfully.' : `${uploaded} images uploaded successfully.`, 'success');
  } else if (uploaded && failed) {
    showToast(`${uploaded} uploaded, ${failed} failed. ${lastError}`, 'warn');
  } else if (failed) {
    showToast(lastError || 'Upload failed.', 'error');
  }
}

async function initMediaLibrary() {
  const grid = document.getElementById('media-grid');
  if (!grid) return;
  try {
    const { getMediaItems } = await import('../backend/firebase/firestore.js');
    const items = await getMediaItems();
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
function showToast(msg, type = 'success') {
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
      font-family:'DM Sans',sans-serif;
    `;
    document.body.appendChild(toast);
  }

  const colors = {
    success: { bg: '#1a1a1a', dot: '#22c55e' },
    error:   { bg: '#c0392b', dot: '#fff' },
    warn:    { bg: '#b7950b', dot: '#fff' },
  };
  const c = colors[type] || colors.success;
  toast.style.background = c.bg;
  toast.style.color = '#fff';
  toast.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${c.dot};flex-shrink:0;display:inline-block;"></span><span>${msg}</span>`;
  toast.style.opacity = '1';
  toast.style.pointerEvents = 'auto';
  toast.style.transform = 'translateY(0)';

  clearTimeout(toastTimer);
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
    btn.addEventListener('click', openSidebar);
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
  if (!user || !['editorial','adviser'].includes(user.role)) {
    const corrLink = document.querySelector('a[href="correspondents.html"]');
    if (corrLink) corrLink.closest('li').style.display = 'none';
  }
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
    s.textContent = `.topbar-dd-item:hover{background:#f7f8fa!important;}`;
    document.head.appendChild(s);
  }

  const dropdown = document.createElement('div');
  dropdown.id = 'topbar-dropdown';
  dropdown.style.cssText = [
    'display:none', 'position:absolute', 'top:calc(100% + 8px)', 'right:0',
    'background:#fff', 'border:1px solid #e5e7eb', 'border-radius:10px',
    'box-shadow:0 4px 20px rgba(0,0,0,.12)', 'min-width:180px',
    'z-index:1000', 'overflow:hidden', "font-family:'DM Sans',sans-serif"
  ].join(';');

  dropdown.innerHTML = `
    <a href="settings.html#account" class="topbar-dd-item"
       style="display:flex;align-items:center;gap:10px;padding:11px 16px;
              color:#1a1a1a;text-decoration:none;font-size:13px;font-weight:500;">
      <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/>
      </svg>
      Account Settings
    </a>
    <div style="height:1px;background:#f3f4f6;margin:0 12px;"></div>
    <button id="topbar-logout-btn" class="topbar-dd-item"
            style="display:flex;align-items:center;gap:10px;padding:11px 16px;
                   color:#e74c3c;background:none;border:none;width:100%;
                   cursor:pointer;font-size:13px;font-weight:500;
                   font-family:'DM Sans',sans-serif;text-align:left;">
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
  const { subscribeUserProfile, getUser } = await import('../backend/firebase/firestore.js');

  function applyProfile(profile) {
    const roleChanged = profile.role && profile.role !== user.role;
    const updatedUser = { ...user, ...profile };
    sessionStorage.setItem('user', JSON.stringify(updatedUser));
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
  initTopbarNameFormatting();
  initTopbarSearch();
  initSidebarAccess();
  initTopbarDropdown();
  initNotificationWidget();
  initUserProfileSync();
  initDragDrop('upload-zone');
  initMediaSearch();
  initMediaLibrary();
});
