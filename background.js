import './site-settings.js';
import './url-utils.js';
import { createDefaultSplitAdapter } from './split-adapter.js';

const SiteSettings = globalThis.SiteSettings;
const urlUtils = globalThis.SplitViewUrlUtils || globalThis.RedditUrlUtils || {};
const normalizePostUrl = urlUtils.normalizePostUrl || urlUtils.normalizeRedditPostUrl;

function formatReaderUrl(url) {
  if (!url) return url;
  if (url.includes('split-reader')) return url;
  if (url.includes('#')) {
    return `${url}&split-reader`;
  }
  return `${url}#split-reader`;
}

class SplitSessionCoordinator {
  constructor(adapter = createDefaultSplitAdapter()) {
    this.adapter = adapter;
    this.browsingToReader = new Map(); // browsingTabId -> { readerTabId, lastUrl }
    this.readerToBrowsing = new Map(); // readerTabId -> browsingTabId
    this.siteSettings = {}; // siteKey -> boolean
    this.tabQueues = new Map(); // tabId -> Promise barrier for per-tab serialization
    this._initPromise = null;
  }

  async init() {
    if (this._initPromise) {
      return this._initPromise;
    }

    this._initPromise = (async () => {
      try {
        if (chrome.storage?.session) {
          const data = await chrome.storage.session.get(['tabPairs']);
          if (data && data.tabPairs) {
            for (const [browsingIdStr, info] of Object.entries(data.tabPairs)) {
              const bId = Number(browsingIdStr);
              const rId = Number(info.readerTabId);
              this.browsingToReader.set(bId, { readerTabId: rId, lastUrl: info.lastUrl });
              this.readerToBrowsing.set(rId, bId);
            }
          }
        }
        if (SiteSettings?.getAllSettings) {
          this.siteSettings = await SiteSettings.getAllSettings();
        } else if (chrome.storage?.local) {
          const localData = await chrome.storage.local.get(['siteSettings']);
          if (localData && typeof localData.siteSettings === 'object' && localData.siteSettings !== null) {
            this.siteSettings = { ...localData.siteSettings };
          }
        }
      } catch (e) {
        console.warn('[Split It] Failed to load session/local storage:', e);
      }
    })();

    return this._initPromise;
  }

  async persist() {
    try {
      if (!chrome.storage?.session) return;
      const obj = {};
      for (const [bId, info] of this.browsingToReader.entries()) {
        obj[bId] = info;
      }
      await chrome.storage.session.set({
        tabPairs: obj
      });
    } catch (e) {
      console.warn('[Split It] Failed to persist session storage:', e);
    }
  }

  async _enqueueTabAction(browsingTabId, actionFn) {
    const current = this.tabQueues.get(browsingTabId) || Promise.resolve();
    let release;
    const barrier = new Promise((resolve) => {
      release = resolve;
    });
    this.tabQueues.set(browsingTabId, barrier);

    try {
      await current;
    } catch {
      // Keep sequential chain operational even if preceding task threw
    }

    try {
      return await actionFn();
    } catch (err) {
      console.error(`[Split It] Action error for tab ${browsingTabId}:`, err);
    } finally {
      release();
      if (this.tabQueues.get(browsingTabId) === barrier) {
        this.tabQueues.delete(browsingTabId);
      }
    }
  }

  async isSplitActive(browsingTabId, readerTabId) {
    if (this.adapter && typeof this.adapter.isSplitActive === 'function') {
      return await this.adapter.isSplitActive(browsingTabId, readerTabId);
    }
    return false;
  }

  async openPost(browsingTabId, rawUrl, senderTab = null) {
    return this._enqueueTabAction(browsingTabId, async () => {
      await this.init();

      let browsingTab = senderTab && senderTab.id === browsingTabId && senderTab.url && senderTab.windowId !== undefined ? senderTab : null;
      if (!browsingTab && typeof chrome.tabs?.get === 'function') {
        try {
          browsingTab = await chrome.tabs.get(browsingTabId);
        } catch {}
      }

      if (browsingTab?.url) {
        const siteKey = SiteSettings?.getSiteKey ? SiteSettings.getSiteKey(browsingTab.url) : (urlUtils.getSiteKey ? urlUtils.getSiteKey(browsingTab.url) : '');
        const isEnabled = SiteSettings?.isEnabled ? SiteSettings.isEnabled(siteKey, this.siteSettings) : (urlUtils.isSiteEnabled ? urlUtils.isSiteEnabled(siteKey, this.siteSettings) : true);
        if (!isEnabled) {
          return;
        }
      }

      const targetUrl = normalizePostUrl(rawUrl);
      if (!targetUrl) return;

      // Do not intercept or navigate existing reader tab
      const parentBrowsingId = this.readerToBrowsing.get(browsingTabId);
      if (parentBrowsingId) {
        return;
      }

      const readerInfo = this.browsingToReader.get(browsingTabId);

      if (readerInfo) {
        let readerTab = null;
        try {
          readerTab = await chrome.tabs.get(readerInfo.readerTabId);
        } catch {}

        if (readerTab) {
          const splitActive = await this.isSplitActive(browsingTabId, readerInfo.readerTabId);
          if (splitActive) {
            // If the post is already loaded in the reader, skip reloading
            const stripHash = (u) => (u ? u.split('#')[0] : '');
            if (readerTab.url && stripHash(normalizePostUrl(readerTab.url)) === stripHash(targetUrl)) {
              return;
            }

            // Navigate existing reader tab preserving reader marker
            const readerUrl = formatReaderUrl(targetUrl);
            await this.adapter.updateReader(readerInfo.readerTabId, readerUrl);

            readerInfo.lastUrl = targetUrl;
            await this.persist();
            return;
          }
        }

        // Detach stale pairing if split was dissolved or closed
        this.readerToBrowsing.delete(readerInfo.readerTabId);
        this.browsingToReader.delete(browsingTabId);
        await this.persist();
      }

      if (!browsingTab && typeof chrome.tabs?.get === 'function') {
        try {
          browsingTab = await chrome.tabs.get(browsingTabId);
        } catch {}
      }
      if (!browsingTab) return;

      const readerUrl = formatReaderUrl(targetUrl);

      try {
        const readerTab = await this.adapter.pairSplit(browsingTab, readerUrl);
        if (readerTab && readerTab.id) {
          this.browsingToReader.set(browsingTabId, { readerTabId: readerTab.id, lastUrl: targetUrl });
          this.readerToBrowsing.set(readerTab.id, browsingTabId);
          await this.persist();
          try {
            if (typeof chrome.tabs?.sendMessage === 'function') {
              chrome.tabs.sendMessage(readerTab.id, { type: 'SET_TAB_ROLE', isReader: true }).catch(() => {});
            }
          } catch {}
        }
      } catch (err) {
        console.error('[Split It] Failed to create split reader tab:', err);
      }
    });
  }

  async getTabStatus(tabId) {
    if (!tabId) {
      return { isReader: false, enabled: true, parentBrowsingId: null };
    }
    await this.init();

    let parentBrowsingId = this.readerToBrowsing.get(tabId) || null;
    if (parentBrowsingId) {
      const splitActive = await this.isSplitActive(parentBrowsingId, tabId);
      if (!splitActive) {
        this.browsingToReader.delete(parentBrowsingId);
        this.readerToBrowsing.delete(tabId);
        await this.persist();
        parentBrowsingId = null;
      }
    }

    const readerInfo = this.browsingToReader.get(tabId);
    if (readerInfo) {
      const splitActive = await this.isSplitActive(tabId, readerInfo.readerTabId);
      if (!splitActive) {
        this.readerToBrowsing.delete(readerInfo.readerTabId);
        this.browsingToReader.delete(tabId);
        await this.persist();
      }
    }

    let siteEnabled = true;
    try {
      if (typeof chrome.tabs?.get === 'function') {
        const tab = await chrome.tabs.get(tabId);
        if (tab?.url) {
          const siteKey = urlUtils.getSiteKey ? urlUtils.getSiteKey(tab.url) : '';
          siteEnabled = urlUtils.isSiteEnabled ? urlUtils.isSiteEnabled(siteKey, this.siteSettings) : true;
        }
      }
    } catch {}

    const enabled = siteEnabled;
    return {
      isReader: Boolean(parentBrowsingId),
      enabled,
      parentBrowsingId: parentBrowsingId || null
    };
  }

  async getSiteStatus(rawSiteKey, tabUrl) {
    await this.init();
    if (SiteSettings?.getSiteStatus) {
      return await SiteSettings.getSiteStatus(rawSiteKey, tabUrl);
    }
    const siteKey = rawSiteKey || (tabUrl && urlUtils.getSiteKey ? urlUtils.getSiteKey(tabUrl) : '');
    const enabled = urlUtils.isSiteEnabled ? urlUtils.isSiteEnabled(siteKey, this.siteSettings) : true;
    const isDefault = urlUtils.isSiteDefaultEnabled ? urlUtils.isSiteDefaultEnabled(siteKey) : false;
    const displayName = urlUtils.getSiteDisplayName ? urlUtils.getSiteDisplayName(siteKey) : (siteKey || 'Unknown');

    let isSupported = Boolean(siteKey);
    if (tabUrl) {
      try {
        const parsed = new URL(tabUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          isSupported = false;
        }
      } catch {
        isSupported = false;
      }
    } else if (siteKey === 'extensions' || !siteKey) {
      isSupported = false;
    }

    return {
      siteKey,
      enabled,
      isDefault,
      isSupported,
      displayName
    };
  }

  async setSiteEnabled(rawSiteKey, enabled) {
    await this.init();
    const siteKey = (SiteSettings?.getSiteKey ? SiteSettings.getSiteKey(rawSiteKey) : (rawSiteKey || '')).toLowerCase();
    if (!siteKey) return false;

    const boolVal = SiteSettings?.setEnabled
      ? await SiteSettings.setEnabled(siteKey, enabled)
      : Boolean(enabled);

    this.siteSettings[siteKey] = boolVal;
    if (siteKey === 'x.com') {
      this.siteSettings['twitter.com'] = boolVal;
    } else if (siteKey === 'twitter.com') {
      this.siteSettings['x.com'] = boolVal;
    }

    return boolVal;
  }

  async handleTabChange(tabId, changeInfo) {
    await this.init();

    if (changeInfo.url) {
      // Keep lastUrl synchronized when reader tab navigates natively
      const parentBrowsingId = this.readerToBrowsing.get(tabId);
      if (parentBrowsingId) {
        const info = this.browsingToReader.get(parentBrowsingId);
        if (info) {
          info.lastUrl = changeInfo.url;
          await this.persist();
        }
      }
    }

    if (changeInfo.splitViewId !== undefined) {
      const splitNone = chrome.tabs.SPLIT_VIEW_ID_NONE !== undefined ? chrome.tabs.SPLIT_VIEW_ID_NONE : -1;
      if (changeInfo.splitViewId === splitNone) {
        // Tab is no longer in split view; dissolve recorded association
        const readerInfo = this.browsingToReader.get(tabId);
        if (readerInfo) {
          this.readerToBrowsing.delete(readerInfo.readerTabId);
          this.browsingToReader.delete(tabId);
          await this.persist();
          try {
            if (typeof chrome.tabs?.sendMessage === 'function') {
              chrome.tabs.sendMessage(readerInfo.readerTabId, { type: 'SET_TAB_ROLE', isReader: false }).catch(() => {});
            }
          } catch {}
        }

        const browsingId = this.readerToBrowsing.get(tabId);
        if (browsingId) {
          this.browsingToReader.delete(browsingId);
          this.readerToBrowsing.delete(tabId);
          await this.persist();
          try {
            if (typeof chrome.tabs?.sendMessage === 'function') {
              chrome.tabs.sendMessage(tabId, { type: 'SET_TAB_ROLE', isReader: false }).catch(() => {});
            }
          } catch {}
        }
      }
    }
  }

  async handleTabClosed(tabId) {
    await this.init();
    const readerInfo = this.browsingToReader.get(tabId);
    if (readerInfo) {
      try {
        if (typeof chrome.tabs?.sendMessage === 'function') {
          chrome.tabs.sendMessage(readerInfo.readerTabId, { type: 'SET_TAB_ROLE', isReader: false }).catch(() => {});
        }
      } catch {}
      this.readerToBrowsing.delete(readerInfo.readerTabId);
      this.browsingToReader.delete(tabId);
    }

    const browsingId = this.readerToBrowsing.get(tabId);
    if (browsingId) {
      this.browsingToReader.delete(browsingId);
      this.readerToBrowsing.delete(tabId);
    }

    this.tabQueues.delete(tabId);
    await this.persist();
  }
}

const coordinator = new SplitSessionCoordinator();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && (message.type === 'GET_TAB_ROLE' || message.type === 'GET_TAB_STATUS')) {
    const tabId = sender?.tab?.id;
    if (tabId) {
      coordinator.getTabStatus(tabId).then((status) => {
        sendResponse(status);
      });
      return true;
    }
    sendResponse({ isReader: false, enabled: true, parentBrowsingId: null });
    return false;
  }

  if (message && message.type === 'OPEN_POST' && message.url) {
    const browsingTabId = sender?.tab?.id;
    if (browsingTabId) {
      coordinator.openPost(browsingTabId, message.url, sender?.tab).then(() => {
        sendResponse({ status: 'queued' });
      });
      return true;
    }
  }

  if (message && message.type === 'GET_SITE_STATUS') {
    const siteKey = message.siteKey || (message.url && urlUtils.getSiteKey ? urlUtils.getSiteKey(message.url) : '');
    coordinator.getSiteStatus(siteKey, message.url).then((status) => {
      sendResponse(status);
    });
    return true;
  }

  if (message && message.type === 'SET_SITE_ENABLED') {
    const siteKey = message.siteKey || (message.url && urlUtils.getSiteKey ? urlUtils.getSiteKey(message.url) : '');
    coordinator.setSiteEnabled(siteKey, message.enabled).then((result) => {
      sendResponse({ success: true, enabled: result });
    });
    return true;
  }
});

if (chrome.storage?.onChanged?.addListener) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.siteSettings) {
      coordinator.siteSettings = { ...(changes.siteSettings.newValue || {}) };
    }
  });
}

chrome.tabs.onRemoved.addListener((tabId) => coordinator.handleTabClosed(tabId));

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  coordinator.handleTabChange(tabId, changeInfo);
});

if (typeof globalThis !== 'undefined') {
  globalThis.SplitSessionCoordinator = SplitSessionCoordinator;
  globalThis.splitSessionCoordinator = coordinator;
}

export { SplitSessionCoordinator, coordinator };
