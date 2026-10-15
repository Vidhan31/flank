(function () {
  'use strict';

  const urlUtils = globalThis.SplitViewUrlUtils || {};

  // Persist reader role marker if hash is present at document_start
  try {
    if (
      typeof window !== 'undefined' &&
      window.location &&
      typeof window.location.hash === 'string' &&
      window.location.hash.includes('split-reader')
    ) {
      if (typeof window.sessionStorage !== 'undefined') {
        window.sessionStorage.setItem('__split_reader', '1');
      }
    }
  } catch {}

  const siteSettings = globalThis.SiteSettings || {};

  let initialSiteKey = '';
  try {
    if (typeof window !== 'undefined' && window.location) {
      initialSiteKey = siteSettings.getSiteKey ? siteSettings.getSiteKey(window.location.href) : (urlUtils.getSiteKey ? urlUtils.getSiteKey(window.location.href) : '');
    }
  } catch {}

  let isSplitItEnabled = initialSiteKey && siteSettings.isDefaultEnabled
    ? siteSettings.isDefaultEnabled(initialSiteKey)
    : (initialSiteKey && urlUtils.isSiteDefaultEnabled ? urlUtils.isSiteDefaultEnabled(initialSiteKey) : true);
  let forcedReaderTab = null;

  // Single source of truth: SiteSettings backed by chrome.storage.local
  try {
    if (siteSettings.isEnabled && initialSiteKey) {
      Promise.resolve(siteSettings.isEnabled(initialSiteKey)).then((enabled) => {
        if (typeof enabled === 'boolean') {
          isSplitItEnabled = enabled;
        }
      });
    } else if (typeof chrome !== 'undefined' && chrome.storage?.local?.get && initialSiteKey) {
      chrome.storage.local.get(['siteSettings'], (res) => {
        if (res && res.siteSettings && typeof res.siteSettings[initialSiteKey] === 'boolean') {
          isSplitItEnabled = res.siteSettings[initialSiteKey];
        }
      });
    }

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'GET_TAB_ROLE' }, (status) => {
        if (status && typeof status.isReader === 'boolean') {
          forcedReaderTab = status.isReader;
        }
      });
    }
  } catch {}

  // Single storage seam: update enabled state whenever siteSettings changes in storage.local
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged?.addListener) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.siteSettings && typeof window !== 'undefined' && window.location) {
        const siteKey = siteSettings.getSiteKey ? siteSettings.getSiteKey(window.location.href) : (urlUtils.getSiteKey ? urlUtils.getSiteKey(window.location.href) : '');
        const newSettings = changes.siteSettings.newValue || {};
        if (siteSettings.isEnabled) {
          isSplitItEnabled = siteSettings.isEnabled(siteKey, newSettings);
        } else if (typeof newSettings[siteKey] === 'boolean') {
          isSplitItEnabled = newSettings[siteKey];
        } else if (urlUtils.isSiteDefaultEnabled) {
          isSplitItEnabled = urlUtils.isSiteDefaultEnabled(siteKey);
        }
      }
    });
  }

  function isReaderTab() {
    if (typeof forcedReaderTab === 'boolean') {
      return forcedReaderTab;
    }

    try {
      if (typeof window !== 'undefined' && window.location) {
        const hash = window.location.hash;
        if (typeof hash === 'string' && hash.includes('split-reader')) {
          try {
            if (typeof window.sessionStorage !== 'undefined') {
              window.sessionStorage.setItem('__split_reader', '1');
            }
          } catch {}
          return true;
        }

        try {
          if (
            typeof window.sessionStorage !== 'undefined' &&
            window.sessionStorage.getItem('__split_reader') === '1'
          ) {
            return true;
          }
        } catch {}

        if (
          typeof urlUtils.isPostUrl === 'function' &&
          window.location.href &&
          urlUtils.isPostUrl(window.location.href)
        ) {
          return true;
        }
      }
    } catch {}

    return false;
  }

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage?.addListener) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message && message.type === 'SET_TAB_ROLE') {
        forcedReaderTab = Boolean(message.isReader);
      }
    });
  }

  function resolvePostNavigation(event) {
    const resolver = globalThis.NavigationResolver;
    if (resolver && typeof resolver.resolveClick === 'function') {
      return resolver.resolveClick(event);
    }
    return null;
  }

  let activePostEl = null;

  function highlightActivePost(eventTarget) {
    if (!eventTarget || !(eventTarget instanceof Element)) return;
    try {
      const card = eventTarget.closest?.('shreddit-post, [data-testid="post-container"], article[data-testid="tweet"], article');
      if (card) {
        if (activePostEl && activePostEl !== card) {
          try {
            activePostEl.removeAttribute('data-split-active-post');
          } catch {}
        }
        if (typeof document !== 'undefined') {
          if (!document.getElementById('split-it-active-style')) {
            const style = document.createElement('style');
            style.id = 'split-it-active-style';
            style.textContent = `
              [data-split-active-post="true"] {
                outline: 2px solid #38bdf8 !important;
                outline-offset: -1px !important;
                border-radius: 8px !important;
                transition: outline 0.15s ease !important;
              }
            `;
            (document.head || document.documentElement).appendChild(style);
          }
          if (typeof document.querySelectorAll === 'function') {
            document.querySelectorAll('[data-split-active-post="true"]').forEach((el) => {
              if (el !== card) {
                el.removeAttribute('data-split-active-post');
              }
            });
          }
        }
        card.setAttribute('data-split-active-post', 'true');
        activePostEl = card;
      }
    } catch {}
  }

  function handlePostClick(event) {
    if (!isSplitItEnabled || isReaderTab()) {
      // Allow native navigation in reader tab or when disabled
      return;
    }

    const postUrl = resolvePostNavigation(event);
    if (!postUrl) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    highlightActivePost(event.target);

    try {
      chrome.runtime.sendMessage(
        {
          type: 'OPEN_POST',
          url: postUrl
        },
        () => {
          if (chrome.runtime?.lastError) {
          }
        }
      );
    } catch {
    }
  }

  // Register in capture phase so we intercept before SPA routers
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('click', handlePostClick, true);
  }

  const exportObj = {
    resolvePostNavigation,
    handlePostClick,
    highlightActivePost,
    isReaderTab,
    getIsReaderTab: () => isReaderTab(),
    setIsReaderTab: (val) => {
      forcedReaderTab = val === null ? null : Boolean(val);
    },
    getIsSplitItEnabled: () => isSplitItEnabled,
    setIsSplitItEnabled: (val) => {
      isSplitItEnabled = Boolean(val);
    },
    getIsSplitViewReaderEnabled: () => isSplitItEnabled,
    setIsSplitViewReaderEnabled: (val) => {
      isSplitItEnabled = Boolean(val);
    }
  };

  if (typeof globalThis !== 'undefined') {
    globalThis.__SplitViewContentScript = exportObj;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportObj;
  }
})();
