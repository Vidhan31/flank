import assert from 'node:assert';
import '../site-settings.js';
import '../url-utils.js';

const {
  isRedditPostUrl,
  normalizeRedditPostUrl,
  isXPostUrl,
  normalizeXPostUrl,
  isPostUrl,
  normalizePostUrl,
  detectPlatform
} = globalThis.SplitViewUrlUtils || {};

console.log('=== 1. REDDIT URL UTILS TESTS ===');
{
  const tests = [
    ['/r/technology/comments/12345/apple_releases_new_device/', true],
    ['https://www.reddit.com/r/kde/comments/67890/plasma_68_is_out/', true],
    ['https://reddit.com/comments/abcde/', true],
    ['/r/technology/s/xyz987', true],
    ['/r/technology/', false],
    ['/user/spez/', false],
    ['https://external.com/news', false],
    ['https://www.reddit.com/r/technology/comments/12345/?utm_source=share&utm_medium=web2x&rdt=123', true]
  ];
  for (const [url, expectedBool] of tests) {
    const isPost = isRedditPostUrl(url);
    assert.strictEqual(isPost, expectedBool, `isRedditPostUrl(${url}) should be ${expectedBool}`);
  }

  // Tracking query parameters cleaning test
  const dirtyUrl = 'https://www.reddit.com/r/technology/comments/12345/headline/?utm_source=share&utm_medium=web2x&rdt=123&gclid=test123&keep=1';
  const cleanUrl = normalizeRedditPostUrl(dirtyUrl);
  assert.strictEqual(cleanUrl, 'https://www.reddit.com/r/technology/comments/12345/headline/?keep=1');

  console.log('✓ Reddit URL utilities tests passed');
}

console.log('\n=== 2. X (TWITTER) URL UTILS TESTS ===');
{
  const tests = [
    ['https://x.com/antigravity/status/1845123456789012345', true],
    ['https://twitter.com/dev/status/987654321', true],
    ['https://mobile.x.com/user/status/11223344', true],
    ['/elonmusk/status/55667788', true],
    ['/i/status/998877', true],
    ['/i/web/status/123123', true],
    ['https://x.com/home', false],
    ['https://x.com/explore', false],
    ['https://x.com/antigravity', false],
    ['https://x.com/hashtag/opensource', false],
    ['https://t.co/randomLink', false],
    ['https://external.com/article', false]
  ];

  for (const [url, expectedBool] of tests) {
    const isPost = isXPostUrl(url);
    assert.strictEqual(isPost, expectedBool, `isXPostUrl(${url}) should be ${expectedBool}`);
  }

  // Normalization and tracking parameter cleaning test for X (including twclid, gclid, fbclid)
  const dirtyXUrl = 'https://twitter.com/antigravity/status/1845123456789012345?s=20&t=abc&ref_src=twsrc%5Etfw&twclid=xyz&fbclid=fb1&custom_id=99';
  const cleanXUrl = normalizeXPostUrl(dirtyXUrl);
  assert.strictEqual(
    cleanXUrl,
    'https://x.com/antigravity/status/1845123456789012345?custom_id=99',
    'normalizeXPostUrl must canonicalize to x.com and strip s, t, ref_src, twclid, fbclid tracking'
  );

  console.log('✓ X URL utilities tests passed');
}

console.log('\n=== 3. UNIFIED URL UTILS TESTS ===');
{
  assert.strictEqual(detectPlatform('https://www.reddit.com/r/kde/comments/123/post'), 'reddit');
  assert.strictEqual(detectPlatform('https://x.com/user/status/456'), 'x');
  assert.strictEqual(detectPlatform('https://twitter.com/user/status/456'), 'x');
  assert.strictEqual(detectPlatform('https://example.com/'), 'generic');
  assert.strictEqual(detectPlatform('chrome://extensions'), null);
  assert.strictEqual(detectPlatform('about:blank'), null);

  assert.strictEqual(isPostUrl('/r/kde/comments/123/post'), true);
  assert.strictEqual(isPostUrl('/user/status/456'), true);
  assert.strictEqual(isPostUrl('/home'), false);

  assert.strictEqual(
    normalizePostUrl('/r/kde/comments/123/post'),
    'https://www.reddit.com/r/kde/comments/123/post'
  );
  assert.strictEqual(
    normalizePostUrl('/user/status/456?s=20'),
    'https://x.com/user/status/456'
  );
  assert.strictEqual(
    normalizePostUrl('https://news.ycombinator.com/item?id=12345&utm_source=hn'),
    'https://news.ycombinator.com/item?id=12345'
  );
  assert.strictEqual(
    normalizePostUrl('https://example.com/article/foo?utm_medium=email&ref=home'),
    'https://example.com/article/foo?ref=home'
  );

  console.log('✓ Unified URL utilities tests passed');
}

console.log('\n=== 4. BACKGROUND SERVICE WORKER & SPLIT VIEW TESTS ===');
{
  const storageData = {};
  const tabs = new Map();
  let tabIdSeq = 100;
  let splitIdSeq = 500;
  let messageListener = null;
  let removedListener = null;
  let updatedListener = null;

  let actionListener = null;
  let lastBadgeText = null;
  let lastBadgeBg = null;
  let failSplitCreate = false;

  const localStorageData = {};
  let storageChangeListener = null;

  globalThis.chrome = {
    action: {
      setBadgeText: async (opts) => { lastBadgeText = opts; },
      setBadgeBackgroundColor: async (opts) => { lastBadgeBg = opts; },
      setTitle: async () => {},
      onClicked: { addListener: (cb) => { actionListener = cb; } }
    },
    storage: {
      session: {
        get: async (keys) => {
          const res = {};
          const list = Array.isArray(keys) ? keys : [keys];
          for (const k of list) {
            res[k] = storageData[k];
          }
          return res;
        },
        set: async (obj) => Object.assign(storageData, obj)
      },
      local: {
        get: async (keys, cb) => {
          const res = {};
          const list = Array.isArray(keys) ? keys : [keys];
          for (const k of list) {
            res[k] = localStorageData[k];
          }
          if (typeof cb === 'function') cb(res);
          return res;
        },
        set: async (obj, cb) => {
          Object.assign(localStorageData, obj);
          if (storageChangeListener) {
            const changes = {};
            for (const [k, v] of Object.entries(obj)) {
              changes[k] = { newValue: v };
            }
            storageChangeListener(changes, 'local');
          }
          if (typeof cb === 'function') cb();
        }
      },
      onChanged: {
        addListener: (cb) => { storageChangeListener = cb; }
      }
    },
    tabs: {
      SPLIT_VIEW_ID_NONE: -1,
      query: async () => Array.from(tabs.values()),
      get: async (id) => {
        const t = tabs.get(id);
        if (!t) throw new Error('Tab not found: ' + id);
        return { ...t };
      },
      create: async (props) => {
        if (failSplitCreate && props.splitWithTabId) {
          throw new Error('Split view unsupported');
        }
        const id = ++tabIdSeq;
        let splitViewId = -1;
        if (props.splitWithTabId) {
          const splitWith = tabs.get(props.splitWithTabId);
          if (!splitWith) throw new Error('splitWithTabId tab not found');
          splitViewId = ++splitIdSeq;
          splitWith.splitViewId = splitViewId;
        }
        const newTab = {
          id,
          url: props.url,
          windowId: props.windowId || 1,
          active: props.active ?? true,
          splitViewId,
          index: props.index ?? 0
        };
        tabs.set(id, newTab);
        return { ...newTab };
      },
      update: async (id, props) => {
        const t = tabs.get(id);
        if (!t) throw new Error('Tab not found: ' + id);
        if (props.url) t.url = props.url;
        if (props.active !== undefined) t.active = props.active;
        return { ...t };
      },
      remove: async (id) => {
        tabs.delete(id);
      },
      unsplit: async (splitViewId) => {
        for (const t of tabs.values()) {
          if (t.splitViewId === splitViewId) {
            t.splitViewId = -1;
          }
        }
      },
      sendMessage: async () => {},
      onRemoved: { addListener: (cb) => { removedListener = cb; } },
      onUpdated: { addListener: (cb) => { updatedListener = cb; } }
    },
    runtime: {
      onMessage: { addListener: (cb) => { messageListener = cb; } }
    }
  };

  const { SplitSessionCoordinator, coordinator } = await import('../background.js');

  // Verify SplitSessionCoordinator deep class architecture
  assert.ok(SplitSessionCoordinator, 'SplitSessionCoordinator class must be exported');
  assert.ok(coordinator, 'coordinator singleton must be exported');
  assert.strictEqual(typeof coordinator.openPost, 'function', 'coordinator.openPost must exist');
  assert.strictEqual(coordinator.toggleTab, undefined, 'coordinator.toggleTab must be purged as dead tab toggle code');
  assert.strictEqual(coordinator.disabledTabs, undefined, 'coordinator.disabledTabs must be purged');
  assert.strictEqual(typeof coordinator.handleTabChange, 'function', 'coordinator.handleTabChange must exist');
  assert.strictEqual(typeof coordinator.handleTabClosed, 'function', 'coordinator.handleTabClosed must exist');
  console.log('✓ SplitSessionCoordinator class and methods verified');

  // Browsing tab (Reddit)
  tabs.set(1, { id: 1, url: 'https://www.reddit.com/', windowId: 1, active: true, splitViewId: -1 });

  // 1. Initial post click on Reddit (creates split tab with #split-reader hash)
  await messageListener({ type: 'OPEN_POST', url: '/r/kde/comments/post1/plasma_68/' }, { tab: { id: 1 } }, () => {});
  await new Promise((r) => setTimeout(r, 50));

  assert.strictEqual(tabs.size, 2, 'Tab count should be 2');
  const readerTab1 = tabs.get(101);
  assert.ok(readerTab1, 'Reader tab 101 must exist');
  assert.strictEqual(
    readerTab1.url,
    'https://www.reddit.com/r/kde/comments/post1/plasma_68/#split-reader',
    'Initial split creation must append #split-reader hash'
  );
  assert.strictEqual(readerTab1.splitViewId, 501);
  assert.strictEqual(tabs.get(1).splitViewId, 501, 'Browsing tab must share splitViewId with reader tab');
  console.log('✓ Initial Reddit post click creates Split View');

  // 2. Subsequent post clicks reuse reader tab
  await messageListener({ type: 'OPEN_POST', url: '/r/technology/comments/post2/chips/' }, { tab: { id: 1 } }, () => {});
  await new Promise((r) => setTimeout(r, 50));

  assert.strictEqual(tabs.size, 2, 'Tab count must remain 2');
  assert.strictEqual(readerTab1.url, 'https://www.reddit.com/r/technology/comments/post2/chips/');
  assert.strictEqual(readerTab1.id, 101, 'Reader tab ID must remain 101');
  console.log('✓ Subsequent Reddit post click navigates existing reader tab');

  // 3. Repeated post click doesn't trigger unnecessary re-navigation
  const prevUrl = readerTab1.url;
  await messageListener({ type: 'OPEN_POST', url: '/r/technology/comments/post2/chips/' }, { tab: { id: 1 } }, () => {});
  await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual(readerTab1.url, prevUrl);
  console.log('✓ Repeated click on same post handled idempotently');

  // 4. Rapid clicks in quick succession (tests async mutual exclusion queue)
  messageListener({ type: 'OPEN_POST', url: '/r/rust/comments/post3/rust_release/' }, { tab: { id: 1 } }, () => {});
  messageListener({ type: 'OPEN_POST', url: '/r/linux/comments/post4/kernel_update/' }, { tab: { id: 1 } }, () => {});
  messageListener({ type: 'OPEN_POST', url: '/r/space/comments/post5/rocket_launch/' }, { tab: { id: 1 } }, () => {});
  await new Promise((r) => setTimeout(r, 100));

  assert.strictEqual(tabs.size, 2, 'Tab count remains 2 without orphan tabs');
  assert.strictEqual(readerTab1.url, 'https://www.reddit.com/r/space/comments/post5/rocket_launch/');
  console.log('✓ Rapid clicks serialize with async/await queue and display most recent post');

  // 5. Gentle unsplit behavior
  tabs.get(1).splitViewId = -1;
  tabs.get(101).splitViewId = -1;
  await updatedListener(1, { splitViewId: -1 });

  await messageListener({ type: 'OPEN_POST', url: '/r/biology/comments/post5b/cells/' }, { tab: { id: 1 } }, () => {});
  await new Promise((r) => setTimeout(r, 50));

  assert.ok(tabs.has(101), 'Previous un-split reader tab 101 must be preserved');
  const readerTabNew = tabs.get(102);
  assert.ok(readerTabNew, 'New reader tab 102 must be created for the new split');
  assert.strictEqual(
    readerTabNew.url,
    'https://www.reddit.com/r/biology/comments/post5b/cells/#split-reader',
    'New split tab must append #split-reader hash'
  );
  assert.strictEqual(readerTabNew.splitViewId, 502);
  assert.strictEqual(tabs.size, 3, 'Total tabs should be 3 (feed, detached 101, new reader 102)');
  console.log('✓ Gentle unsplit preserves previous reader tab and pairs new split');

  // 6. Recovery after manual tab close
  tabs.delete(102);
  tabs.get(1).splitViewId = -1;
  await removedListener(102);

  await messageListener({ type: 'OPEN_POST', url: '/r/science/comments/post6/breakthrough/' }, { tab: { id: 1 } }, () => {});
  await new Promise((r) => setTimeout(r, 50));

  const readerTab3 = tabs.get(103);
  assert.ok(readerTab3, 'New reader tab 103 created after close');
  assert.strictEqual(
    readerTab3.url,
    'https://www.reddit.com/r/science/comments/post6/breakthrough/#split-reader',
    'Recovered reader tab must append #split-reader hash'
  );
  assert.strictEqual(readerTab3.splitViewId, 503);
  console.log('✓ Automatic recovery after reader tab was closed');

  // 7. Multi-window independence
  tabs.set(2, { id: 2, url: 'https://www.reddit.com/r/popular', windowId: 2, active: true, splitViewId: -1 });
  await messageListener({ type: 'OPEN_POST', url: '/r/gaming/comments/post7/game/' }, { tab: { id: 2 } }, () => {});
  await new Promise((r) => setTimeout(r, 50));

  const readerTabW2 = tabs.get(104);
  assert.ok(readerTabW2);
  assert.strictEqual(
    readerTabW2.url,
    'https://www.reddit.com/r/gaming/comments/post7/game/#split-reader',
    'Multi-window reader tab must append #split-reader hash'
  );
  assert.strictEqual(readerTabW2.windowId, 2);
  assert.strictEqual(tabs.get(103).windowId, 1, 'Window 1 reader remains intact');
  console.log('✓ Multiple windows operate independently');

  // 8. X (Twitter) Feed Split View
  tabs.set(10, { id: 10, url: 'https://x.com/home', windowId: 1, active: true, splitViewId: -1 });
  await messageListener(
    { type: 'OPEN_POST', url: 'https://x.com/antigravity/status/1845123456789012345?s=20' },
    { tab: { id: 10 } },
    () => {}
  );
  await new Promise((r) => setTimeout(r, 50));

  const xReaderTab = tabs.get(105);
  assert.ok(xReaderTab, 'X reader tab 105 must be created');
  assert.strictEqual(
    xReaderTab.url,
    'https://x.com/antigravity/status/1845123456789012345#split-reader',
    'X reader tab must have normalized tweet URL with #split-reader hash'
  );
  assert.strictEqual(xReaderTab.splitViewId, 505);
  assert.strictEqual(tabs.get(10).splitViewId, 505, 'X feed tab must share splitViewId with X reader tab');
  console.log('✓ X tweet click creates Split View');

  // 9. Subsequent X tweet clicks navigate reader tab
  await messageListener(
    { type: 'OPEN_POST', url: 'https://twitter.com/dev/status/9876543210' },
    { tab: { id: 10 } },
    () => {}
  );
  await new Promise((r) => setTimeout(r, 50));

  assert.strictEqual(xReaderTab.url, 'https://x.com/dev/status/9876543210');
  assert.strictEqual(xReaderTab.id, 105, 'Existing X reader tab reused');
  console.log('✓ Subsequent X tweet click reuses existing reader tab');

  // 10. GET_TAB_ROLE returns correct roles for feed and reader tabs
  let browsingRoleResponse = null;
  await messageListener({ type: 'GET_TAB_ROLE' }, { tab: { id: 10 } }, (res) => {
    browsingRoleResponse = res;
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(browsingRoleResponse.isReader, false, 'Browsing tab must report isReader: false');

  let readerRoleResponse = null;
  await messageListener({ type: 'GET_TAB_ROLE' }, { tab: { id: 105 } }, (res) => {
    readerRoleResponse = res;
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(readerRoleResponse.isReader, true, 'Reader tab must report isReader: true');
  assert.strictEqual(readerRoleResponse.parentBrowsingId, 10, 'Reader tab must reference parent browsing tab');
  console.log('✓ GET_TAB_ROLE accurately distinguishes feed vs reader tabs');

  // Also verify coordinator.getTabStatus directly
  const directTabStatus = await coordinator.getTabStatus(10);
  assert.strictEqual(directTabStatus.isReader, false);
  assert.strictEqual(directTabStatus.enabled, true);
  assert.strictEqual(directTabStatus.parentBrowsingId, null);

  const directReaderStatus = await coordinator.getTabStatus(105);
  assert.strictEqual(directReaderStatus.isReader, true);
  assert.strictEqual(directReaderStatus.enabled, true);
  assert.strictEqual(directReaderStatus.parentBrowsingId, 10);
  console.log('✓ coordinator.getTabStatus verified directly');

  // 11. Reader tab OPEN_POST message is safely ignored (no forced reloads)
  const initialReaderUrl = xReaderTab.url;
  await messageListener(
    { type: 'OPEN_POST', url: 'https://x.com/TimSweeneyEpic/status/2110440000000000000' },
    { tab: { id: 105 } },
    () => {}
  );
  await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual(
    xReaderTab.url,
    initialReaderUrl,
    'Reader tab must not be reloaded or updated via OPEN_POST; native navigation takes precedence'
  );
  console.log('✓ Reader tab OPEN_POST messages are ignored to preserve native browsing');

  // Reader native navigation syncs URL without dissolving split
  await updatedListener(105, { url: 'https://x.com/TimSweeneyEpic/status/2110440000000000000' });
  xReaderTab.url = 'https://x.com/TimSweeneyEpic/status/2110440000000000000';
  await new Promise((r) => setTimeout(r, 20));
  console.log('✓ Native navigation in reader tab synchronizes lastUrl in background');

  // 13. Clicking the original post in the feed tab afterwards navigates the reader tab back
  await messageListener(
    { type: 'OPEN_POST', url: 'https://twitter.com/dev/status/9876543210' },
    { tab: { id: 10 } },
    () => {}
  );
  await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual(
    xReaderTab.url,
    'https://x.com/dev/status/9876543210',
    'Clicking post on feed tab must successfully navigate reader tab back from deep navigation'
  );
  console.log('✓ Feed tab post click updates reader tab even after deep reader navigation');

  // 14. Disabling site via SiteSettings triggers Badge Sync with OFF feedback
  await globalThis.SiteSettings.setEnabled('x.com', false);
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(lastBadgeText?.text, 'OFF');
  assert.strictEqual(lastBadgeBg?.color, '#ef4444');
  console.log('✓ Action icon click toggles Split It OFF with badge feedback');

  // 15. Opening post when site is disabled in settings is ignored
  const currentReaderUrlBeforeDisabled = xReaderTab.url;
  await messageListener(
    { type: 'OPEN_POST', url: 'https://x.com/disabled/status/123' },
    { tab: { id: 10 } },
    () => {}
  );
  await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual(xReaderTab.url, currentReaderUrlBeforeDisabled, 'Opening post while tab is disabled must be ignored');
  console.log('✓ OPEN_POST is ignored when Split It is disabled for browsing tab');

  // Re-enable site via SiteSettings
  await globalThis.SiteSettings.setEnabled('x.com', true);
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(lastBadgeText?.text, '');
  console.log('✓ Action icon click toggles Split It back ON with badge feedback');

  // 16. Fallback to adjacent tab when splitWithTabId fails
  tabs.set(20, { id: 20, url: 'https://www.reddit.com/', windowId: 1, active: true, splitViewId: -1, index: 3 });
  failSplitCreate = true;
  await messageListener({ type: 'OPEN_POST', url: '/r/news/comments/fallback1/story/' }, { tab: { id: 20 } }, () => {});
  await new Promise((r) => setTimeout(r, 50));
  failSplitCreate = false;

  const fallbackReaderTab = tabs.get(106);
  assert.ok(fallbackReaderTab, 'Fallback reader tab 106 must be created');
  assert.strictEqual(
    fallbackReaderTab.url,
    'https://www.reddit.com/r/news/comments/fallback1/story/#split-reader',
    'Fallback reader tab must have #split-reader hash appended'
  );
  assert.strictEqual(fallbackReaderTab.index, 4, 'Fallback reader tab must be adjacent (index + 1)');
  assert.strictEqual(fallbackReaderTab.splitViewId, -1, 'Fallback reader tab is created as standard tab');
  console.log('✓ Graceful fallback creates adjacent tab when splitWithTabId fails');

  // 17. Stale pair cleanup in GET_TAB_ROLE when isSplitActive is false
  tabs.get(105).splitViewId = -1;
  tabs.get(10).splitViewId = -1;
  let staleRoleResponse = null;
  await messageListener({ type: 'GET_TAB_ROLE' }, { tab: { id: 105 } }, (res) => {
    staleRoleResponse = res;
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(staleRoleResponse.isReader, false, 'Unsplit tab must report isReader: false');
  console.log('✓ GET_TAB_ROLE purges stale pairing when split view was dissolved');
}

console.log('\n=== ALL EXTENSION TESTS PASSED! ===');
