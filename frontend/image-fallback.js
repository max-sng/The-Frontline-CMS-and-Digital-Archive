// image-fallback.js
// Replaces broken images with a local fallback image (assets/image-fallback.png).
//
// Two cases count as broken:
//   1. The image fails to load (network error, blocked host, deleted file).
//   2. ImgBB answers with its own "image not found" / "service unavailable"
//      placeholder. ImgBB serves those as valid 180x180 PNGs, so the browser
//      never fires an error for them; they are detected by host and size.
//
// Load this as a plain (non-module, non-deferred) script in <head> so the
// listeners exist before any image starts loading.
(function () {
  'use strict';

  const script = document.currentScript;
  const FALLBACK_SRC = new URL('assets/image-fallback.png', script ? script.src : location.href).href;
  const IMGBB_PLACEHOLDER_SIZE = 180;

  function isImgbb(src) {
    try {
      const host = new URL(src, location.href).hostname;
      return host === 'ibb.co' || host.endsWith('.ibb.co');
    } catch {
      return false;
    }
  }

  function isImgbbPlaceholder(img) {
    return isImgbb(img.currentSrc || img.src)
      && img.naturalWidth === IMGBB_PLACEHOLDER_SIZE
      && img.naturalHeight === IMGBB_PLACEHOLDER_SIZE;
  }

  function useFallback(img) {
    // Stop if the fallback itself fails, so a missing fallback file can't loop.
    if (img.dataset.fallbackApplied === 'true') return;
    img.dataset.fallbackApplied = 'true';
    img.removeAttribute('srcset');
    img.src = FALLBACK_SRC;
  }

  function isTrackedImage(target) {
    return target instanceof HTMLImageElement
      && target.getAttribute('src')
      && target.src !== FALLBACK_SRC;
  }

  // An <img> whose src changes (e.g. a new cover preview) gets a fresh chance.
  function resetIfNewSource(img) {
    if (img.dataset.fallbackApplied === 'true' && img.src !== FALLBACK_SRC) {
      delete img.dataset.fallbackApplied;
    }
  }

  // Image load/error events don't bubble, so listen in the capture phase.
  document.addEventListener('error', event => {
    const img = event.target;
    if (!isTrackedImage(img)) return;
    resetIfNewSource(img);
    useFallback(img);
  }, true);

  document.addEventListener('load', event => {
    const img = event.target;
    if (!isTrackedImage(img)) return;
    resetIfNewSource(img);
    if (isImgbbPlaceholder(img)) useFallback(img);
  }, true);

  // Catch images that finished before this script ran (e.g. from cache).
  function checkLoadedImages() {
    document.querySelectorAll('img[src]').forEach(img => {
      if (!img.complete || !isTrackedImage(img)) return;
      if (img.naturalWidth === 0 || isImgbbPlaceholder(img)) useFallback(img);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkLoadedImages);
  } else {
    checkLoadedImages();
  }
})();
