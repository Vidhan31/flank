(function () {
  'use strict';

  const siteIconWrapper = document.getElementById('site-icon-wrapper');
  const siteDomainEl = document.getElementById('site-domain');
  const splitToggle = document.getElementById('split-toggle');

  function getUrlUtils() {
    return globalThis.SplitViewUrlUtils || {};
  }

  function setSiteIcon(siteKey, favIconUrl) {
    if (!siteIconWrapper) return;

    if (favIconUrl && (favIconUrl.startsWith('http://') || favIconUrl.startsWith('https://') || favIconUrl.startsWith('data:'))) {
      const img = document.createElement('img');
      img.className = 'site-icon-img';
      img.alt = '';
      img.src = favIconUrl;
      img.onerror = () => {
        applyFallbackIcon(siteKey);
      };
      siteIconWrapper.innerHTML = '';
      siteIconWrapper.appendChild(img);
      return;
    }

    applyFallbackIcon(siteKey);
  }

  function applyFallbackIcon(siteKey) {
    if (!siteIconWrapper) return;
    siteIconWrapper.innerHTML = '';
    const span = document.createElement('span');
    span.className = 'site-icon-fallback';

    if (siteKey === 'x.com' || siteKey === 'twitter.com') {
      span.textContent = '𝕏';
    } else if (siteKey === 'reddit.com') {
      span.textContent = '🤖';
    } else {
      span.textContent = '🌐';
    }
    siteIconWrapper.appendChild(span);
  }

  function renderSystemPage(url) {
    if (siteDomainEl) {
      siteDomainEl.textContent = 'System page';
    }
    if (splitToggle) {
      splitToggle.checked = false;
      splitToggle.disabled = true;
      splitToggle.setAttribute('aria-checked', 'false');
    }
    if (siteIconWrapper) {
      siteIconWrapper.innerHTML = '<span class="site-icon-fallback">⚙️</span>';
    }
  }

  async function init() {
    try {
      if (!chrome.tabs?.query) {
        renderSystemPage();
        return;
      }

      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs && tabs[0];

      if (!activeTab || !activeTab.url) {
        renderSystemPage();
        return;
      }

      const url = activeTab.url;
      const isHttpOrHttps = url.startsWith('http://') || url.startsWith('https://');

      if (!isHttpOrHttps) {
        renderSystemPage(url);
        return;
      }

      const siteSettings = globalThis.SiteSettings;
      const urlUtils = getUrlUtils();
      const siteKey = siteSettings?.getSiteKey
        ? siteSettings.getSiteKey(url)
        : (urlUtils.getSiteKey ? urlUtils.getSiteKey(url) : (new URL(url)).hostname);

      if (siteDomainEl) {
        siteDomainEl.textContent = siteKey;
      }
      setSiteIcon(siteKey, activeTab.favIconUrl);

      let enabled = false;
      if (siteSettings?.isEnabled) {
        enabled = await siteSettings.isEnabled(siteKey);
      } else if (urlUtils.isSiteEnabled) {
        enabled = urlUtils.isSiteEnabled(siteKey);
      }

      if (splitToggle) {
        splitToggle.checked = enabled;
        splitToggle.setAttribute('aria-checked', String(enabled));

        splitToggle.addEventListener('change', async (e) => {
          const isChecked = e.target.checked;
          splitToggle.setAttribute('aria-checked', String(isChecked));

          try {
            if (siteSettings?.setEnabled) {
              await siteSettings.setEnabled(siteKey, isChecked);
            }
          } catch (err) {
            console.error('[Split It] Failed to save site enabled state:', err);
          }
        });
      }
    } catch (err) {
      console.error('[Split It] Popup init error:', err);
      renderSystemPage();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
