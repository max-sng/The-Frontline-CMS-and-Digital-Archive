// image-fallback.js
// Replaces broken images with a built-in "image unavailable" graphic (an inline SVG, so the
// fallback itself can never be missing). Small images such as avatars get an icon-only version.
//
// Images that handle their own errors (an onerror attribute, e.g. the logos) or that opt out
// with data-no-fallback are left alone.
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

  const IMGBB_PLACEHOLDER_SIZE = 180;
  const SMALL_IMAGE_PX = 96;

  const svgUrl = svg => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  const ICON = '<g fill="none" stroke="#9aa1ab" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + '<rect x="-16" y="-13" width="32" height="26" rx="3"/><circle cx="-7" cy="-4" r="3"/>'
    + '<path d="M16 7l-9-9-15 15"/></g>';
  // Large: icon plus label. preserveAspectRatio "slice" fills any box like object-fit: cover.
  const FALLBACK_SRC = svgUrl('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250" viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice">'
    + '<rect width="400" height="250" fill="#eef0f3"/>'
    + '<g transform="translate(200 112) scale(1.4)">' + ICON + '</g>'
    + '<text x="200" y="160" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="13" fill="#6e6e6e">Image unavailable</text>'
    + '</svg>');
  const FALLBACK_SMALL_SRC = svgUrl('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" preserveAspectRatio="xMidYMid slice">'
    + '<rect width="64" height="64" fill="#eef0f3"/><g transform="translate(32 32) scale(0.75)">' + ICON + '</g></svg>');
  const isFallbackSrc = src => src === FALLBACK_SRC || src === FALLBACK_SMALL_SRC;

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
    // Apply once per source, so a failing fallback can never loop.
    if (img.dataset.fallbackApplied === 'true') return;
    img.dataset.fallbackApplied = 'true';
    img.dataset.originalSrc = img.getAttribute('src') || '';
    // A failed image has no layout size of its own, so decide from context: avatars and
    // images with an explicit small width (thumbnails) get the icon-only version.
    const declaredWidth = parseFloat(img.style.width) || parseFloat(img.getAttribute('width')) || 0;
    const small = Boolean(img.closest('[class*="avatar"]'))
      || (declaredWidth > 0 && declaredWidth < SMALL_IMAGE_PX);
    img.removeAttribute('srcset');
    img.classList.add('img-fallback');
    if (!img.getAttribute('alt')) img.setAttribute('alt', 'Image unavailable');
    img.title = 'Image unavailable';
    img.src = small ? FALLBACK_SMALL_SRC : FALLBACK_SRC;
  }

  function isTrackedImage(target) {
    return target instanceof HTMLImageElement
      && target.getAttribute('src')
      && !isFallbackSrc(target.src)
      && !target.hasAttribute('onerror')
      && !target.hasAttribute('data-no-fallback');
  }

  // An <img> whose src changes (e.g. a new cover preview) gets a fresh chance.
  function resetIfNewSource(img) {
    if (img.dataset.fallbackApplied === 'true' && !isFallbackSrc(img.src)) {
      delete img.dataset.fallbackApplied;
      img.classList.remove('img-fallback');
      img.removeAttribute('title');
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
