class SplitTabAdapter {
  async pairSplit(feedTab, targetUrl, options = {}) {
    throw new Error('pairSplit must be implemented by adapter');
  }

  async updateReader(readerTabId, targetUrl) {
    throw new Error('updateReader must be implemented by adapter');
  }

  async isSplitActive(feedTabId, readerTabId) {
    throw new Error('isSplitActive must be implemented by adapter');
  }

  async unsplit(feedTab) {
    throw new Error('unsplit must be implemented by adapter');
  }
}

class NativeSplitAdapter extends SplitTabAdapter {
  async unsplit(feedTab) {
    try {
      const splitNone = chrome.tabs?.SPLIT_VIEW_ID_NONE !== undefined ? chrome.tabs.SPLIT_VIEW_ID_NONE : -1;
      if (feedTab?.splitViewId && feedTab.splitViewId !== splitNone) {
        if (typeof chrome.tabs?.unsplit === 'function') {
          await chrome.tabs.unsplit(feedTab.splitViewId);
        }
      }
    } catch (e) {
      console.warn('[Split It] Native unsplit error:', e);
    }
  }

  async pairSplit(feedTab, targetUrl, options = {}) {
    await this.unsplit(feedTab);

    const createProps = {
      url: targetUrl,
      splitWithTabId: feedTab.id,
      active: false
    };

    if (feedTab.windowId !== undefined) {
      createProps.windowId = feedTab.windowId;
    }

    if (feedTab.pinned) {
      createProps.pinned = true;
    }

    return await chrome.tabs.create(createProps);
  }

  async updateReader(readerTabId, targetUrl) {
    return await chrome.tabs.update(readerTabId, { url: targetUrl });
  }

  async isSplitActive(feedTabId, readerTabId) {
    try {
      const [browsingTab, readerTab] = await Promise.all([
        chrome.tabs.get(feedTabId),
        chrome.tabs.get(readerTabId)
      ]);

      if (!browsingTab || !readerTab) return false;
      if (browsingTab.windowId !== readerTab.windowId) return false;

      const splitNone = chrome.tabs?.SPLIT_VIEW_ID_NONE !== undefined ? chrome.tabs.SPLIT_VIEW_ID_NONE : -1;

      if (typeof browsingTab.splitViewId === 'number' && typeof readerTab.splitViewId === 'number') {
        if (browsingTab.splitViewId === splitNone || readerTab.splitViewId === splitNone) {
          return false;
        }
        return browsingTab.splitViewId === readerTab.splitViewId;
      }

      return true;
    } catch {
      return false;
    }
  }
}

class AdjacentTabAdapter extends SplitTabAdapter {
  async unsplit(feedTab) {
    return Promise.resolve();
  }

  async pairSplit(feedTab, targetUrl, options = {}) {
    const fallbackProps = {
      url: targetUrl,
      active: false
    };

    if (feedTab.windowId !== undefined) {
      fallbackProps.windowId = feedTab.windowId;
    }

    if (typeof feedTab.index === 'number') {
      fallbackProps.index = feedTab.index + 1;
    }

    return await chrome.tabs.create(fallbackProps);
  }

  async updateReader(readerTabId, targetUrl) {
    return await chrome.tabs.update(readerTabId, { url: targetUrl });
  }

  async isSplitActive(feedTabId, readerTabId) {
    try {
      const [browsingTab, readerTab] = await Promise.all([
        chrome.tabs.get(feedTabId),
        chrome.tabs.get(readerTabId)
      ]);

      if (!browsingTab || !readerTab) return false;
      return browsingTab.windowId === readerTab.windowId;
    } catch {
      return false;
    }
  }
}

class DynamicSplitAdapter extends SplitTabAdapter {
  constructor(nativeAdapter = new NativeSplitAdapter(), fallbackAdapter = new AdjacentTabAdapter()) {
    super();
    this.nativeAdapter = nativeAdapter;
    this.fallbackAdapter = fallbackAdapter;
    this.useFallback = false;
  }

  async unsplit(feedTab) {
    if (!this.useFallback) {
      try {
        return await this.nativeAdapter.unsplit(feedTab);
      } catch {}
    }
    return await this.fallbackAdapter.unsplit(feedTab);
  }

  async pairSplit(feedTab, targetUrl, options = {}) {
    if (!this.useFallback) {
      try {
        return await this.nativeAdapter.pairSplit(feedTab, targetUrl, options);
      } catch (err) {
        console.warn('[Split It] splitWithTabId failed, falling back to adjacent tab:', err);
        this.useFallback = true;
      }
    }
    return await this.fallbackAdapter.pairSplit(feedTab, targetUrl, options);
  }

  async updateReader(readerTabId, targetUrl) {
    if (!this.useFallback) {
      try {
        return await this.nativeAdapter.updateReader(readerTabId, targetUrl);
      } catch {}
    }
    return await this.fallbackAdapter.updateReader(readerTabId, targetUrl);
  }

  async isSplitActive(feedTabId, readerTabId) {
    return await this.nativeAdapter.isSplitActive(feedTabId, readerTabId);
  }
}

function createDefaultSplitAdapter() {
  return new DynamicSplitAdapter();
}

if (typeof globalThis !== 'undefined') {
  globalThis.SplitTabAdapter = SplitTabAdapter;
  globalThis.NativeSplitAdapter = NativeSplitAdapter;
  globalThis.AdjacentTabAdapter = AdjacentTabAdapter;
  globalThis.DynamicSplitAdapter = DynamicSplitAdapter;
  globalThis.createDefaultSplitAdapter = createDefaultSplitAdapter;
}

export {
  SplitTabAdapter,
  NativeSplitAdapter,
  AdjacentTabAdapter,
  DynamicSplitAdapter,
  createDefaultSplitAdapter
};
