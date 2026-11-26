// ============================================================
// THE FRONTLINE — Firestore Database
// firebase/firestore.js
// ============================================================

import {
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, where, orderBy,
  limit, serverTimestamp, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { db } from "./firebase-config.js";

const FIRESTORE_READ_TIMEOUT_MS = 10000;

// Proper Title Case for person names ("samantha sunga" -> "Samantha Sunga").
// Handles hyphens and apostrophes ("anne-marie o'neil" -> "Anne-Marie O'Neil").
export function toTitleCaseName(value) {
  if (typeof value !== 'string') return value;
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase()
    .replace(/(^|[\s\-'’])(\p{L})/gu, (_, sep, letter) => sep + letter.toLocaleUpperCase());
}

// Normalizes only the name fields of a user payload; email and other fields are untouched.
export function normalizeUserNames(data) {
  if (!data || typeof data !== 'object') return data;
  const next = { ...data };
  if (typeof next.firstName === 'string') next.firstName = toTitleCaseName(next.firstName);
  if (typeof next.surname === 'string') next.surname = toTitleCaseName(next.surname);
  if (typeof next.name === 'string') next.name = toTitleCaseName(next.name);
  return next;
}

function normalizeArticleSection(value) {
  const section = String(value || '').replace(/^#+/, '').trim();
  return section.toLowerCase() === 'general' ? '' : section;
}

export function articleSection(article) {
  const section = normalizeArticleSection(article?.section);
  if (section) return section;
  return Array.isArray(article?.tags)
    ? article.tags.map(normalizeArticleSection).find(Boolean) || ''
    : '';
}

// Public portal sections, in navbar order. `matches` lists the section/tag values (lowercase)
// that count as that section, including older values: articles tagged "Opinion-Editorial"
// before Editorial and Opinion were split appear under both, and "DevComm" is DevCom.
export const PUBLIC_SECTIONS = [
  { label: 'News',      param: 'News',      matches: ['news'] },
  { label: 'Editorial', param: 'Editorial', matches: ['editorial', 'opinion-editorial'] },
  { label: 'Opinion',   param: 'Opinion',   matches: ['opinion', 'opinion-editorial'] },
  { label: 'Feature',   param: 'Feature',   matches: ['feature', 'features'] },
  { label: 'DevCom',    param: 'DevCom',    matches: ['devcom', 'devcomm'] },
  { label: 'Literary',  param: 'Literary',  matches: ['literary'] },
  { label: 'Sports',    param: 'Sports',    matches: ['sports'] }
];

// Finds the public section for a ?section= value. Old links such as
// ?section=Opinion-Editorial or ?section=DevComm still resolve.
export function findPublicSection(param) {
  const value = String(param || '').trim().toLowerCase();
  if (!value) return null;
  return PUBLIC_SECTIONS.find(section => section.param.toLowerCase() === value)
    || PUBLIC_SECTIONS.find(section => section.matches.includes(value))
    || null;
}

// True when the article belongs to the ?section= value (checks the section and every tag).
export function articleMatchesSection(article, param) {
  const value = String(param || '').trim().toLowerCase();
  if (!value) return true;
  const sections = [article?.section, ...(Array.isArray(article?.tags) ? article.tags : [])]
    .map(normalizeArticleSection)
    .map(section => section.toLowerCase())
    .filter(Boolean);
  const publicSection = findPublicSection(value);
  // Legacy "Opinion-Editorial" links show both halves.
  const accepted = value === 'opinion-editorial'
    ? ['editorial', 'opinion', 'opinion-editorial']
    : publicSection ? publicSection.matches : [value];
  return sections.some(section => accepted.includes(section));
}

function articleTimestamp(article) {
  return article?.publishedAt?.toMillis?.() || article?.createdAt?.toMillis?.() || 0;
}

function withFirestoreTimeout(promise) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Firestore request timed out')), FIRESTORE_READ_TIMEOUT_MS);
    })
  ]);
}

// ══════════════════════════════
// ARTICLES
// ══════════════════════════════

// When the caller records who assigned the article (assignedBy), stamp when it happened.
function withAssignmentTime(data) {
  if (!data || !Object.hasOwn(data, 'assignedBy')) return data;
  return { ...data, assignedAt: data.assignedBy ? serverTimestamp() : null };
}

// Can this user forward the article to the adviser? Only the editor who assigned it may.
// Articles with no recorded assigner (self-submitted, or assigned before assignedBy existed)
// may be forwarded by any editor. Mirrors forwardAllowed() in firestore.rules.
export function canForwardToAdviser(article, user) {
  if (!user) return false;
  if (user.role === 'adviser') return true;
  if (user.role !== 'editorial') return false;
  return !article?.assignedBy || article.assignedBy === user.uid;
}

// Can this user delete the article? Advisers may delete any article. Correspondents and
// editors may delete unpublished articles they created, not ones merely assigned to them.
// Mirrors isCreatorSoftDelete() in firestore.rules.
export function canDeleteArticle(article, user) {
  if (!article || !user) return false;
  if (user.role === 'adviser') return true;
  return ['correspondent', 'editorial'].includes(user.role)
    && article.authorId === user.uid
    && article.status !== 'published';
}

// Create new article
export async function createArticle(data) {
  try {
    const ref = await addDoc(collection(db, "articles"), {
      status:    'draft',
      ...withAssignmentTime(data),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return { success: true, id: ref.id };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Get all articles (editorial board)
export async function getAllArticles() {
  const snap = await withFirestoreTimeout(getDocs(collection(db, "articles")));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(a => a.status !== 'deleted');
}

// Get articles by correspondent
export async function getMyArticles(authorId) {
  const articles = collection(db, "articles");
  const [authored, assigned] = await Promise.all([
    withFirestoreTimeout(getDocs(query(articles, where("authorId", "==", authorId)))),
    withFirestoreTimeout(getDocs(query(articles, where("assignedTo", "==", authorId))))
  ]);
  const uniqueArticles = new Map();
  [...authored.docs, ...assigned.docs].forEach(snapshot => {
    if (snapshot.data().status !== 'deleted') {
      uniqueArticles.set(snapshot.id, { id: snapshot.id, ...snapshot.data() });
    }
  });
  return [...uniqueArticles.values()];
}

export function subscribeArticles(role, userUid, onChange, onError = () => {}) {
  const articles = collection(db, "articles");
  const queries = ['adviser', 'editorial'].includes(role)
    ? [query(articles)]
    : [
        query(articles, where("authorId", "==", userUid)),
        query(articles, where("assignedTo", "==", userUid))
      ];
  const snapshots = queries.map(() => new Map());
  let hasError = false;
  const unsubscribe = queries.map((articlesQuery, index) => onSnapshot(articlesQuery, snapshot => {
    snapshots[index] = new Map(snapshot.docs.map(article => [
      article.id,
      { id: article.id, ...article.data() }
    ]));
    const uniqueArticles = new Map();
    snapshots.forEach(items => items.forEach((article, id) => {
      if (article.status !== 'deleted') uniqueArticles.set(id, article);
    }));
    onChange([...uniqueArticles.values()]);
  }, error => {
    if (hasError) return;
    hasError = true;
    unsubscribe.forEach(stop => stop());
    onError(error);
  }));
  return () => unsubscribe.forEach(stop => stop());
}

export function subscribeUserProfile(userUid, onChange, onError = () => {}) {
  if (!userUid) return () => {};
  return onSnapshot(doc(db, "users", userUid), snapshot => {
    if (snapshot.exists()) onChange({ id: snapshot.id, ...snapshot.data() });
  }, onError);
}

// Get published articles (CDA)
// Published articles are fetched with a single equality filter and sorted in the browser.
// An orderBy("publishedAt") query needs a composite index (missing in this project) and
// silently excludes any published article that has no publishedAt field.
export async function getPublishedArticles(limitCount = 20) {
  try {
    const articles = await getAllPublishedArticles();
    return articles.slice(0, limitCount);
  } catch (e) {
    console.error("getPublishedArticles error:", e);
    throw e;
  }
}

export async function getAllPublishedArticles() {
  try {
    const snap = await withFirestoreTimeout(getDocs(query(
      collection(db, "articles"),
      where("status", "==", "published")
    )));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => articleTimestamp(b) - articleTimestamp(a));
  } catch (e) {
    console.error("getAllPublishedArticles error:", e);
    throw e;
  }
}

export async function getPublishedArticlesByAuthor(authorId, limitCount = 20) {
  try {
    const snap = await withFirestoreTimeout(getDocs(query(
      collection(db, "articles"),
      where("status", "==", "published"),
      where("authorId", "==", authorId)
    )));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => articleTimestamp(b) - articleTimestamp(a))
      .slice(0, limitCount);
  } catch (e) {
    console.error("getPublishedArticlesByAuthor error:", e);
    return [];
  }
}

// Get single article
export async function getArticle(id) {
  try {
    const snap = await getDoc(doc(db, "articles", id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  } catch (e) {
    return null;
  }
}

export async function addArticleComment(articleId, comment) {
  try {
    const ref = await addDoc(collection(db, "articles", articleId, "comments"), {
      articleId,
      name: comment.name || 'Anonymous',
      email: comment.email || null,
      comment: comment.comment || '',
      createdAt: serverTimestamp()
    });
    return { success: true, id: ref.id };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export async function getArticleComments(articleId) {
  try {
    const snap = await getDocs(collection(db, "articles", articleId, "comments"));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
  } catch (e) {
    console.error("getArticleComments error:", e);
    return [];
  }
}

// Update article
export async function updateArticle(id, data) {
  try {
    const session = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('user') || 'null') : null;
    if (session?.role === 'correspondent') {
      const existingSnap = await getDoc(doc(db, "articles", id));
      const existingArticle = existingSnap.data();
      if (!existingSnap.exists() || (existingArticle.authorId !== session.uid && existingArticle.assignedTo !== session.uid)) {
        return { success: false, error: 'You can only edit articles you authored or were assigned.' };
      }
      const currentStatus = existingArticle.status || 'draft';
      const allowedStatuses = currentStatus === 'draft'
        ? ['draft', 'pending']
        : currentStatus === 'reviewed'
          ? ['pending']
          : [currentStatus];
      if (data.status && !allowedStatuses.includes(data.status)) {
        return { success: false, error: 'Submitted article status can only be changed by an administrator.' };
      }
      if (existingArticle.assignedTo === session.uid && existingArticle.authorId !== session.uid
        && data.authorId && data.authorId !== existingArticle.authorId) {
        return { success: false, error: 'Assigned articles must retain their original author.' };
      }
    }
    await updateDoc(doc(db, "articles", id), {
      ...withAssignmentTime(data),
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Update article status
export async function updateArticleStatus(id, status) {
  try {
    const session = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('user') || 'null') : null;
    const actorUid = session?.uid || null;
    const actorRole = session?.role || null;
    if (status === 'published' && actorRole !== 'adviser') {
      return { success: false, error: 'Only adviser may publish articles.' };
    }

    const articleSnap = await getDoc(doc(db, 'articles', id));
    if (!articleSnap.exists()) return { success: false, error: 'Article not found.' };
    const article = { id: articleSnap.id, ...articleSnap.data() };

    if (actorRole === 'correspondent') {
      const canSubmit = status === 'pending'
        && (article.authorId === actorUid || article.assignedTo === actorUid)
        && ['draft', 'assigned', 'reviewed'].includes(article.status || 'draft');
      if (!canSubmit) {
        return { success: false, error: 'Correspondents may only submit their own or assigned articles for review.' };
      }
    }
    if (status === 'assigned' && article.status !== 'assigned' && actorRole !== 'editorial') {
      return { success: false, error: 'Only editors may assign articles.' };
    }
    if (status === 'pending_adviser' && !['editorial', 'adviser'].includes(actorRole)) {
      return { success: false, error: 'Only editorial staff may forward articles to an adviser.' };
    }
    if (status === 'pending_adviser' && article.status !== 'pending_adviser'
      && !canForwardToAdviser(article, session)) {
      const assigner = article.assignedByName || 'the editor who assigned it';
      return { success: false, error: `Only ${assigner} can forward this article to the adviser.` };
    }

    const data = { status, updatedAt: serverTimestamp() };
    // Timestamps / audit fields for status transitions
    if (status === 'published') {
      data.publishedAt = serverTimestamp();
      if (actorUid) data.publishedBy = actorUid;
      data.approvedByAdviserAt = serverTimestamp();
    }
    if (status === 'pending' || status === 'pending_editorial') {
      data.submittedAt = serverTimestamp();
      if (actorUid) data.submittedBy = actorUid;
    }
    if (status === 'pending_adviser') {
      data.submittedAt = serverTimestamp();
      if (actorUid) data.approvedByEditorial = actorUid;
      data.approvedByEditorialAt = serverTimestamp();
    }
    if (status === 'reviewed') {
      if (actorUid) data.reviewedBy = actorUid;
      data.reviewedAt = serverTimestamp();
    }

    await updateDoc(doc(db, 'articles', id), data);

    const title = article.title || 'Untitled article';
    const fromName = session?.name || 'System';
    const payload = {
      articleId: id,
      articleTitle: title,
      fromUid: actorUid || null,
      fromName,
      read: false
    };

    if (status === 'pending') {
      const editors = await getUsersByRole('editorial');
      await Promise.all(editors.map(editor => createNotification({
        toUid: editor.id,
        type: 'article_submitted',
        ...payload,
        message: `${fromName} submitted an article for editorial review.`
      })));
      await logAuditEntry({ action: 'submit_article', performedBy: actorUid, targetUid: article.authorId, articleId: id, details: 'Article submitted for editorial review' });
    }

    if (status === 'pending_adviser') {
      const advisers = await getUsersByRole('adviser');
      await Promise.all(advisers.map(adviser => createNotification({
        toUid: adviser.id,
        type: 'awaiting_final_approval',
        ...payload,
        message: `${fromName} forwarded an article for final adviser approval.`
      })));
      await logAuditEntry({ action: 'forward_to_adviser', performedBy: actorUid, targetUid: article.authorId, articleId: id, details: 'Article forwarded for adviser approval' });
    }

    if (status === 'reviewed') {
      await createNotification({
        toUid: article.authorId,
        type: 'revision_requested',
        ...payload,
        message: `${fromName} requested revisions on your article.`
      });
      await logAuditEntry({ action: 'request_revision', performedBy: actorUid, targetUid: article.authorId, articleId: id, details: 'Revision requested' });
    }

    if (status === 'draft' && article.status !== 'draft') {
      await createNotification({
        toUid: article.authorId,
        type: 'article_rejected',
        ...payload,
        message: `${fromName} rejected the article and sent it back to draft.`
      });
      await logAuditEntry({ action: 'reject_article', performedBy: actorUid, targetUid: article.authorId, articleId: id, details: 'Article rejected back to draft' });
    }

    if (status === 'assigned' && article.assignedTo) {
      await createNotification({
        toUid: article.assignedTo,
        type: 'article_assigned',
        ...payload,
        message: `${fromName} assigned this article to you.`
      });
      await logAuditEntry({ action: 'assign_article', performedBy: actorUid, targetUid: article.assignedTo, articleId: id, details: 'Article assigned to correspondent or co-editor' });
    }

    if (status === 'published') {
      await createNotification({
        toUid: article.authorId,
        type: 'article_published',
        ...payload,
        message: `${fromName} published your article.`
      });
      await logAuditEntry({ action: 'publish_article', performedBy: actorUid, targetUid: article.authorId, articleId: id, details: 'Article published' });
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Delete article (soft delete). Advisers may delete any article; correspondents and editors
// may delete unpublished articles they created.
export async function deleteArticle(id) {
  try {
    const session = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('user') || 'null') : null;
    if (!session?.uid) return { success: false, error: 'Please log in again to delete articles.' };

    const snap = await getDoc(doc(db, "articles", id));
    if (!snap.exists() || snap.data().status === 'deleted') {
      return { success: false, error: 'This article no longer exists.' };
    }
    const article = { id: snap.id, ...snap.data() };
    if (!canDeleteArticle(article, session)) {
      return {
        success: false,
        error: article.authorId === session.uid
          ? 'Published articles can only be deleted by an adviser.'
          : 'You can only delete articles you created.'
      };
    }

    const deletedBy = session.uid;
    await updateDoc(doc(db, "articles", id), {
      status: 'deleted',
      deletedAt: serverTimestamp(),
      deletedBy,
      updatedAt: serverTimestamp()
    });

    const fromName = session.name || 'A staff member';
    const title = article.title || 'Untitled article';
    // Tell the assigned writer the article is gone, unless they deleted it themselves.
    if (article.assignedTo && article.assignedTo !== deletedBy) {
      await createNotification({
        toUid: article.assignedTo,
        type: 'article_deleted',
        articleId: id,
        articleTitle: title,
        fromUid: deletedBy,
        fromName,
        message: `${fromName} deleted the article "${title}".`,
        read: false
      });
    }
    await logAuditEntry({
      action: 'delete_article',
      performedBy: deletedBy,
      targetUid: article.authorId || null,
      articleId: id,
      details: session.role === 'adviser' && article.authorId !== deletedBy
        ? 'Article soft-deleted by adviser'
        : 'Article soft-deleted by its creator'
    });
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e.code === 'permission-denied'
        ? 'You do not have permission to delete this article.'
        : e.message
    };
  }
}

// ══════════════════════════════
// USERS / CORRESPONDENTS
// ══════════════════════════════

// Get all users
export async function getAllUsers() {
  try {
    const snap = await getDocs(collection(db, "users"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error('getAllUsers error', e);
    throw e;
  }
}

export async function getUsersByRole(role) {
  try {
    const q = query(collection(db, "users"), where("role", "==", role));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error('getUsersByRole error', e);
    return [];
  }
}

// Get correspondents only
export async function getCorrespondents() {
  const q = query(
    collection(db, "users"),
    where("role", "==", "correspondent")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Get single user
export async function getUser(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  } catch (e) {
    return null;
  }
}

// Update user profile
export async function updateUser(uid, data) {
  try {
    await updateDoc(doc(db, "users", uid), {
      ...normalizeUserNames(data),
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export async function getPublicationSettings() {
  const snap = await getDoc(doc(db, 'settings', 'publication'));
  return snap.exists() ? snap.data() : {};
}

export async function updatePublicationSettings(data) {
  const allowedFields = ['publicationName', 'contactEmail', 'publicArticleAccess'];
  if (!data || Object.keys(data).some(key => !allowedFields.includes(key))) {
    return { success: false, error: 'Invalid publication settings.' };
  }
  if (Object.hasOwn(data, 'publicationName')
    && (typeof data.publicationName !== 'string' || !data.publicationName.trim())) {
    return { success: false, error: 'Publication name cannot be empty.' };
  }
  if (Object.hasOwn(data, 'contactEmail')
    && (typeof data.contactEmail !== 'string' || !data.contactEmail.trim())) {
    return { success: false, error: 'Contact email cannot be empty.' };
  }
  if (Object.hasOwn(data, 'publicArticleAccess') && typeof data.publicArticleAccess !== 'boolean') {
    return { success: false, error: 'Public article access must be enabled or disabled.' };
  }
  try {
    const settingsRef = doc(db, 'settings', 'publication');
    const existing = await getDoc(settingsRef);
    await setDoc(settingsRef, {
      publicationName: 'The Frontline',
      contactEmail: 'theforefront@gordoncollege.edu.ph',
      publicArticleAccess: true,
      ...(existing.exists() ? existing.data() : {}),
      ...data,
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Approve editorial account
export async function approveEditorial(uid) {
  try {
    const session = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('user') || 'null') : null;
    const approverUid = session?.uid || null;
    await updateDoc(doc(db, "users", uid), {
      role: 'editorial',
      status: 'active',
      approvedAt: serverTimestamp()
    });
    await createNotification({
      toUid: uid,
      type: 'editorial_approved',
      articleId: null,
      articleTitle: null,
      fromUid: approverUid,
      fromName: 'System',
      message: 'Your editorial account has been approved by an adviser.',
      read: false
    });
    await logAuditEntry({
      action: 'approve_editorial',
      performedBy: approverUid,
      targetUid: uid,
      details: 'Editorial account approved',
      createdAt: serverTimestamp()
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Feedback / Review Notes ──────────────────────────────
export async function addArticleFeedback(articleId, feedback) {
  try {
    const ref = await addDoc(collection(db, 'articles', articleId, 'feedback'), {
      ...feedback,
      createdAt: serverTimestamp()
    });
    return { success: true, id: ref.id };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export async function getArticleFeedbacks(articleId) {
  try {
    const snap = await getDocs(collection(db, 'articles', articleId, 'feedback'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b)=> (a.createdAt?.toMillis?.()||0) - (b.createdAt?.toMillis?.()||0));
  } catch (e) {
    console.error('getArticleFeedbacks error', e);
    return [];
  }
}

export async function createNotification(notification) {
  try {
    const preferenceKey = {
      article_published: 'articlePublished',
      revision_requested: 'articleReturned',
      article_assigned: 'articleAssigned'
    }[notification.type];
    if (preferenceKey && notification.toUid) {
      const recipient = await getDoc(doc(db, 'users', notification.toUid));
      if (recipient.exists() && recipient.data().notificationPreferences?.[preferenceKey] === false) {
        return { success: true, skipped: true };
      }
    }
    const ref = await addDoc(collection(db, 'notifications'), {
      ...notification,
      fromUid: notification.fromUid || null,
      read: notification.read === true,
      createdAt: serverTimestamp()
    });
    return { success: true, id: ref.id };
  } catch (e) {
    console.error('createNotification error', e);
    return { success: false, error: e.message };
  }
}

export async function markNotificationRead(notificationId) {
  try {
    await updateDoc(doc(db, 'notifications', notificationId), {
      read: true,
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (e) {
    console.error('markNotificationRead error', e);
    return { success: false, error: e.message };
  }
}

export function subscribeUnreadNotifications(userUid, callback) {
  if (!userUid) return () => {};
  const q = query(
    collection(db, 'notifications'),
    where('toUid', '==', userUid),
    where('read', '==', false)
  );
  return onSnapshot(q, snapshot => {
    callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function getNotifications(userUid, limitCount = 30) {
  try {
    const q = query(
      collection(db, 'notifications'),
      where('toUid', '==', userUid),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error('getNotifications error', e);
    throw e;
  }
}

export async function logAuditEntry(entry) {
  try {
    const ref = await addDoc(collection(db, 'audit_log'), {
      ...entry,
      createdAt: serverTimestamp()
    });
    return { success: true, id: ref.id };
  } catch (e) {
    console.error('logAuditEntry error', e);
    return { success: false, error: e.message };
  }
}

export async function createMediaItem(item) {
  try {
    if (!item?.uploadedBy) return { success: false, error: 'You must be signed in to save media.' };
    const ref = await addDoc(collection(db, 'media'), {
      filename: String(item.filename || 'image'),
      url: String(item.url || ''),
      thumb: String(item.thumb || item.url || ''),
      uploadedBy: item.uploadedBy,
      createdAt: serverTimestamp()
    });
    return { success: true, id: ref.id };
  } catch (e) {
    console.error('createMediaItem error', e);
    return { success: false, error: e.message };
  }
}

export async function getMediaItems(limitCount = 60) {
  try {
    const q = query(collection(db, 'media'), orderBy('createdAt', 'desc'), limit(limitCount));
    const snap = await withFirestoreTimeout(getDocs(q));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error('getMediaItems error', e);
    throw e;
  }
}
