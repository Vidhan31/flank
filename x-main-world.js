(function () {
  'use strict';

  function extractUrlFromFiber(el) {
    if (!el) return null;
    const fiberKey = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
    if (!fiberKey) return null;

    let curr = el[fiberKey];
    let depth = 0;
    while (curr && depth < 35) {
      depth++;
      const mp = curr.memoizedProps;
      if (mp) {
        if (mp.link && typeof mp.link.pathname === 'string') {
          return mp.link.pathname;
        }
        if (typeof mp.href === 'string' && mp.href.includes('/status/')) {
          return mp.href;
        }
        if (typeof mp.to === 'string' && mp.to.includes('/status/')) {
          return mp.to;
        }
        if (mp.tweet && mp.tweet.id_str) {
          const user = mp.tweet.user?.screen_name || 'i';
          return `/${user}/status/${mp.tweet.id_str}`;
        }
        if (mp.quoted_status && mp.quoted_status.id_str) {
          const user = mp.quoted_status.user?.screen_name || 'i';
          return `/${user}/status/${mp.quoted_status.id_str}`;
        }
      }
      curr = curr.return;
    }
    return null;
  }

  function annotateElement(el) {
    if (!el || !(el instanceof Element)) return;
    const quoteDiv = el.closest?.('div[role="link"][tabindex="0"], div[role="link"]');
    if (!quoteDiv) return;
    if (quoteDiv.hasAttribute('data-split-href')) return;

    // Must be inside an article (nested quote tweet)
    if (!quoteDiv.closest?.('article')) return;

    const url = extractUrlFromFiber(quoteDiv);
    if (url) {
      quoteDiv.setAttribute('data-split-href', url);
    }
  }

  // Passive gesture listeners avoid blocking compositor scrolling
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('pointerdown', (e) => annotateElement(e.target), { capture: true, passive: true });
    window.addEventListener('mousedown', (e) => annotateElement(e.target), { capture: true, passive: true });
    window.addEventListener('focusin', (e) => annotateElement(e.target), { capture: true, passive: true });
    window.addEventListener('click', (e) => annotateElement(e.target), true);
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.__extractUrlFromFiber = extractUrlFromFiber;
    globalThis.__annotateElement = annotateElement;
  }
})();
