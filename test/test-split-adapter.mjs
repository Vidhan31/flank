import assert from 'node:assert';
import {
  SplitTabAdapter,
  NativeSplitAdapter,
  AdjacentTabAdapter,
  DynamicSplitAdapter,
  createDefaultSplitAdapter
} from '../split-adapter.js';

console.log('=== TEST SUITE: SPLIT TAB ADAPTERS ===');

// Mock chrome.tabs
let tabSeq = 100;
let createdTabs = [];
let updatedTabs = [];
let unsplitCalls = [];
let mockTabsMap = new Map();
let simulateNativeSplitError = false;

globalThis.chrome = {
  tabs: {
    SPLIT_VIEW_ID_NONE: -1,
    get: async (id) => {
      const t = mockTabsMap.get(id);
      if (!t) throw new Error('Tab not found: ' + id);
      return { ...t };
    },
    create: async (props) => {
      if (simulateNativeSplitError && props.splitWithTabId) {
        throw new Error('Split view unsupported');
      }
      const newTab = {
        id: ++tabSeq,
        url: props.url,
        windowId: props.windowId || 1,
        index: props.index || 0,
        active: props.active ?? true,
        splitViewId: props.splitWithTabId ? 999 : -1
      };
      mockTabsMap.set(newTab.id, newTab);
      createdTabs.push({ props, tab: newTab });
      return newTab;
    },
    update: async (id, props) => {
      const existing = mockTabsMap.get(id);
      if (!existing) throw new Error('Tab not found');
      Object.assign(existing, props);
      updatedTabs.push({ id, props });
      return existing;
    },
    unsplit: async (splitViewId) => {
      unsplitCalls.push(splitViewId);
      return true;
    }
  }
};

function resetMocks() {
  createdTabs = [];
  updatedTabs = [];
  unsplitCalls = [];
  mockTabsMap.clear();
  simulateNativeSplitError = false;
}

// 1. NativeSplitAdapter
{
  resetMocks();
  const adapter = new NativeSplitAdapter();

  const feedTab = { id: 10, windowId: 1, splitViewId: -1 };
  mockTabsMap.set(feedTab.id, feedTab);

  const readerTab = await adapter.pairSplit(feedTab, 'https://example.com/post1');
  assert.strictEqual(createdTabs.length, 1);
  assert.strictEqual(createdTabs[0].props.splitWithTabId, 10);
  assert.strictEqual(createdTabs[0].props.active, false);
  assert.strictEqual(readerTab.splitViewId, 999);

  // isSplitActive check
  feedTab.splitViewId = 999;
  mockTabsMap.set(feedTab.id, feedTab);
  const isActive = await adapter.isSplitActive(feedTab.id, readerTab.id);
  assert.strictEqual(isActive, true, 'Tabs with matching splitViewId must be active');

  // updateReader
  await adapter.updateReader(readerTab.id, 'https://example.com/post2');
  assert.strictEqual(updatedTabs.length, 1);
  assert.strictEqual(updatedTabs[0].props.url, 'https://example.com/post2');

  // unsplit pre-existing split
  feedTab.splitViewId = 888;
  await adapter.unsplit(feedTab);
  assert.deepStrictEqual(unsplitCalls, [888]);

  console.log('✓ NativeSplitAdapter tests passed');
}

// 2. AdjacentTabAdapter
{
  resetMocks();
  const adapter = new AdjacentTabAdapter();

  const feedTab = { id: 20, windowId: 2, index: 3 };
  mockTabsMap.set(feedTab.id, feedTab);

  const readerTab = await adapter.pairSplit(feedTab, 'https://example.com/adjacent');
  assert.strictEqual(createdTabs.length, 1);
  assert.strictEqual(createdTabs[0].props.splitWithTabId, undefined);
  assert.strictEqual(createdTabs[0].props.index, 4);
  assert.strictEqual(createdTabs[0].props.windowId, 2);

  const isActive = await adapter.isSplitActive(feedTab.id, readerTab.id);
  assert.strictEqual(isActive, true, 'Adjacent tabs in same window must be active');

  console.log('✓ AdjacentTabAdapter tests passed');
}

// 3. DynamicSplitAdapter with automatic capability fallback
{
  resetMocks();
  simulateNativeSplitError = true;
  const adapter = createDefaultSplitAdapter();

  const feedTab = { id: 30, windowId: 1, index: 5 };
  mockTabsMap.set(feedTab.id, feedTab);

  const readerTab = await adapter.pairSplit(feedTab, 'https://example.com/fallback');
  assert.strictEqual(adapter.useFallback, true, 'Dynamic adapter must switch to fallback on native split failure');
  assert.strictEqual(readerTab.index, 6, 'Fallback tab must be positioned at index + 1');

  // Subsequent pairSplit directly uses fallback without throwing
  const readerTab2 = await adapter.pairSplit(feedTab, 'https://example.com/fallback2');
  assert.strictEqual(readerTab2.index, 6);

  console.log('✓ DynamicSplitAdapter fallback tests passed');
}

console.log('=== ALL SPLIT TAB ADAPTER TESTS PASSED! ===\n');
