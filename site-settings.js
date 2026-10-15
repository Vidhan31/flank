// SiteSettings: website configuration backed by chrome.storage.local
(function () {
  'use strict';

  function getSiteKey(urlOrDomain) {
    if (!urlOrDomain || typeof urlOrDomain !== 'string') return '';
    try {
      let host = '';
      if (urlOrDomain.includes('://')) {
        const url = new URL(urlOrDomain);
        host = url.hostname.toLowerCase();
        if (!host && url.protocol === 'chrome:') {
          host = url.host || url.pathname.replace(/^\/+/g, '');
        }
      } else {
        const url = new URL('https://' + urlOrDomain);
        host = url.hostname.toLowerCase();
      }

      if (host.startsWith('www.')) {
        host = host.slice(4);
      }

      if (
        host === 'x.com' ||
        host.endsWith('.x.com') ||
        host === 'twitter.com' ||
        host.endsWith('.twitter.com')
      ) {
        return 'x.com';
      }

      if (host === 'reddit.com' || host.endsWith('.reddit.com')) {
        return 'reddit.com';
      }

      return host;
    } catch {
      return '';
    }
  }

  function isSupported(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') return false;
    try {
      if (!urlStr.includes('://')) return Boolean(getSiteKey(urlStr));
      const parsed = new URL(urlStr);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  function isDefaultEnabled(siteKeyOrUrl) {
    const key = getSiteKey(siteKeyOrUrl);
    if (!key) return false;
    return key === 'x.com' || key === 'reddit.com';
  }

  function getDisplayName(siteKeyOrUrl) {
    const key = getSiteKey(siteKeyOrUrl);
    if (!key) return 'Unknown';
    if (key === 'x.com') return 'X (Twitter)';
    if (key === 'reddit.com') return 'Reddit';
    return key;
  }

  function getStorage(keys) {
    if (typeof chrome === 'undefined' || !chrome.storage?.local?.get) {
      return Promise.resolve({});
    }
    return new Promise((resolve) => {
      let settled = false;
      try {
        const result = chrome.storage.local.get(keys, (data) => {
          if (!settled) {
            settled = true;
            resolve(data || {});
          }
        });
        if (result && typeof result.then === 'function') {
          result
            .then((data) => {
              if (!settled) {
                settled = true;
                resolve(data || {});
              }
            })
            .catch(() => {
              if (!settled) {
                settled = true;
                resolve({});
              }
            });
        }
      } catch {
        if (!settled) {
          settled = true;
          resolve({});
        }
      }
    });
  }

  function setStorage(obj) {
    if (typeof chrome === 'undefined' || !chrome.storage?.local?.set) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      try {
        const result = chrome.storage.local.set(obj, () => {
          if (!settled) {
            settled = true;
            if (chrome.runtime?.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve();
            }
          }
        });
        if (result && typeof result.then === 'function') {
          result
            .then(() => {
              if (!settled) {
                settled = true;
                resolve();
              }
            })
            .catch((err) => {
              if (!settled) {
                settled = true;
                reject(err);
              }
            });
        }
      } catch (err) {
        if (!settled) {
          settled = true;
          resolve();
        }
      }
    });
  }

  function isEnabled(siteKeyOrUrl, siteSettingsMap) {
    const key = getSiteKey(siteKeyOrUrl);
    if (!key) return false;

    if (siteSettingsMap && typeof siteSettingsMap === 'object') {
      if (typeof siteSettingsMap[key] === 'boolean') {
        return siteSettingsMap[key];
      }
      if (key === 'x.com' && typeof siteSettingsMap['twitter.com'] === 'boolean') {
        return siteSettingsMap['twitter.com'];
      }
      return isDefaultEnabled(key);
    }

    return getStorage(['siteSettings']).then((data) => {
      const settings = data?.siteSettings || {};
      if (typeof settings[key] === 'boolean') {
        return settings[key];
      }
      if (key === 'x.com' && typeof settings['twitter.com'] === 'boolean') {
        return settings['twitter.com'];
      }
      return isDefaultEnabled(key);
    });
  }

  async function setEnabled(siteKeyOrUrl, enabled) {
    const key = getSiteKey(siteKeyOrUrl);
    if (!key) return false;

    const boolVal = Boolean(enabled);
    const data = await getStorage(['siteSettings']);
    const currentSettings = { ...(data?.siteSettings || {}) };

    currentSettings[key] = boolVal;
    if (key === 'x.com') {
      currentSettings['twitter.com'] = boolVal;
    } else if (key === 'twitter.com') {
      currentSettings['x.com'] = boolVal;
    }

    await setStorage({ siteSettings: currentSettings });
    return boolVal;
  }

  async function getSiteStatus(siteKeyOrUrl, tabUrl) {
    const siteKey = getSiteKey(siteKeyOrUrl || tabUrl);
    const enabled = await isEnabled(siteKey);
    const isDefault = isDefaultEnabled(siteKey);
    const displayName = getDisplayName(siteKey);
    const supported = tabUrl ? isSupported(tabUrl) : Boolean(siteKey && siteKey !== 'extensions');

    return {
      siteKey,
      enabled,
      isDefault,
      isSupported: supported,
      displayName
    };
  }

  async function getAllSettings() {
    const data = await getStorage(['siteSettings']);
    return data?.siteSettings || {};
  }

  const SiteSettings = {
    getSiteKey,
    isSupported,
    isDefaultEnabled,
    getDisplayName,
    isEnabled,
    setEnabled,
    getSiteStatus,
    getAllSettings
  };

  if (typeof globalThis !== 'undefined') {
    globalThis.SiteSettings = SiteSettings;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SiteSettings;
  }
})();
