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

      const isGeneric = siteKey !== 'reddit.com' && siteKey !== 'x.com' && siteKey !== 'twitter.com';
      const patterns = siteSettings?.getSitePatterns ? siteSettings.getSitePatterns(siteKey) : [
        `*://*.${siteKey}/*`,
        `*://${siteKey}/*`
      ];

      let hasPermission = !isGeneric;
      if (isGeneric) {
        try {
          if (chrome.permissions?.contains) {
            hasPermission = await chrome.permissions.contains({ origins: patterns });
          }
        } catch {
          hasPermission = false;
        }
      }

      let enabled = false;
      if (hasPermission) {
        if (siteSettings?.isEnabled) {
          enabled = await siteSettings.isEnabled(siteKey);
        } else if (urlUtils.isSiteEnabled) {
          enabled = urlUtils.isSiteEnabled(siteKey);
        }
      } else {
        enabled = false;
      }

      if (splitToggle) {
        splitToggle.checked = enabled;
        splitToggle.setAttribute('aria-checked', String(enabled));

        async function enableSite() {
          try {
            if (siteSettings?.setEnabled) {
              await siteSettings.setEnabled(siteKey, true);
            }
            if (isGeneric) {
              const scriptId = siteSettings?.getScriptId
                ? siteSettings.getScriptId(siteKey)
                : ('split-it-site-' + siteKey.replace(/[^a-z0-9_-]/g, '-'));

              if (chrome.scripting?.registerContentScripts) {
                try {
                  if (chrome.scripting?.getRegisteredContentScripts) {
                    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [scriptId] });
                    if (existing && existing.length > 0) {
                      await chrome.scripting.unregisterContentScripts({ ids: [scriptId] });
                    }
                  }
                  await chrome.scripting.registerContentScripts([
                    {
                      id: scriptId,
                      matches: patterns,
                      js: [
                        'site-settings.js',
                        'url-utils.js',
                        'navigation-resolver.js',
                        'content.js'
                      ],
                      runAt: 'document_start',
                      persistAcrossSessions: true
                    }
                  ]);
                } catch (regErr) {
                  console.warn('[Split It] Failed to register content script in popup:', regErr);
                }
              }

              if (activeTab?.id && chrome.scripting?.executeScript) {
                try {
                  await chrome.scripting.executeScript({
                    target: { tabId: activeTab.id },
                    files: [
                      'site-settings.js',
                      'url-utils.js',
                      'navigation-resolver.js',
                      'content.js'
                    ]
                  });
                } catch (injectErr) {
                  console.warn('[Split It] Failed to inject content script into active tab:', injectErr);
                }
              }
            }
          } catch (err) {
            console.error('[Split It] Failed to enable site:', err);
          }
        }

        async function disableSite() {
          try {
            if (siteSettings?.setEnabled) {
              await siteSettings.setEnabled(siteKey, false);
            }
            if (isGeneric) {
              const scriptId = siteSettings?.getScriptId
                ? siteSettings.getScriptId(siteKey)
                : ('split-it-site-' + siteKey.replace(/[^a-z0-9_-]/g, '-'));

              if (chrome.scripting?.unregisterContentScripts) {
                try {
                  await chrome.scripting.unregisterContentScripts({ ids: [scriptId] });
                } catch (unregErr) {
                  console.warn('[Split It] Failed to unregister dynamic content script:', unregErr);
                }
              }

              if (chrome.permissions?.remove) {
                try {
                  await chrome.permissions.remove({ origins: patterns });
                  hasPermission = false;
                } catch (remErr) {
                  console.warn('[Split It] Failed to remove host permissions:', remErr);
                }
              }
            }
          } catch (err) {
            console.error('[Split It] Failed to disable site:', err);
          }
        }

        splitToggle.addEventListener('change', (e) => {
          const isChecked = e.target.checked;
          splitToggle.setAttribute('aria-checked', String(isChecked));

          if (isChecked) {
            if (isGeneric && !hasPermission) {
              let settled = false;
              const handlePermissionResult = async (granted) => {
                if (settled) return;
                settled = true;
                if (!granted) {
                  splitToggle.checked = false;
                  splitToggle.setAttribute('aria-checked', 'false');
                  return;
                }
                hasPermission = true;
                await enableSite();
              };

              try {
                const req = chrome.permissions?.request
                  ? chrome.permissions.request({ origins: patterns }, (granted) => {
                      if (typeof granted === 'boolean') {
                        handlePermissionResult(granted);
                      }
                    })
                  : null;

                if (req && typeof req.then === 'function') {
                  req.then((granted) => {
                    handlePermissionResult(granted);
                  }).catch((err) => {
                    console.error('[Split It] Permission request error:', err);
                    splitToggle.checked = false;
                    splitToggle.setAttribute('aria-checked', 'false');
                  });
                }
              } catch (err) {
                console.error('[Split It] Permission request error:', err);
                splitToggle.checked = false;
                splitToggle.setAttribute('aria-checked', 'false');
              }
              return;
            }
            enableSite();
          } else {
            disableSite();
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
