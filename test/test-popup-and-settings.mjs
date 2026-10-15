import assert from 'node:assert';
import '../url-utils.js';

const {
  getSiteKey,
  isSiteDefaultEnabled,
  isSiteEnabled,
  getSiteDisplayName
} = globalThis.SplitViewUrlUtils || {};

console.log('=== TEST SUITE: POPUP & SITE-LEVEL SETTINGS ===');

// 1. URL Utils: Site key extraction
{
  assert.strictEqual(getSiteKey('https://x.com/home'), 'x.com');
  assert.strictEqual(getSiteKey('https://twitter.com/dev/status/123'), 'x.com');
  assert.strictEqual(getSiteKey('https://mobile.x.com/user/status/456'), 'x.com');
  assert.strictEqual(getSiteKey('https://www.x.com/explore'), 'x.com');
  assert.strictEqual(getSiteKey('https://www.reddit.com/r/technology'), 'reddit.com');
  assert.strictEqual(getSiteKey('https://old.reddit.com/r/kde'), 'reddit.com');
  assert.strictEqual(getSiteKey('https://reddit.com/comments/123'), 'reddit.com');
  assert.strictEqual(getSiteKey('https://github.com/torvalds/linux'), 'github.com');
  assert.strictEqual(getSiteKey('https://www.nytimes.com/section/world'), 'nytimes.com');
  assert.strictEqual(getSiteKey('chrome://extensions'), 'extensions');
  assert.strictEqual(getSiteKey('about:blank'), '');
  assert.strictEqual(getSiteKey(''), '');
  assert.strictEqual(getSiteKey(null), '');
  console.log('✓ getSiteKey correctly normalizes domains and platform aliases');
}

// 2. URL Utils: Default site enablement
{
  assert.strictEqual(isSiteDefaultEnabled('x.com'), true);
  assert.strictEqual(isSiteDefaultEnabled('reddit.com'), true);
  assert.strictEqual(isSiteDefaultEnabled('github.com'), false);
  assert.strictEqual(isSiteDefaultEnabled('nytimes.com'), false);
  assert.strictEqual(isSiteDefaultEnabled('google.com'), false);
  assert.strictEqual(isSiteDefaultEnabled(''), false);
  assert.strictEqual(isSiteDefaultEnabled(null), false);
  console.log('✓ isSiteDefaultEnabled defaults to true only for X and Reddit');
}

// 3. URL Utils: isSiteEnabled with user settings
{
  // Defaults when settings map is empty
  assert.strictEqual(isSiteEnabled('x.com', {}), true);
  assert.strictEqual(isSiteEnabled('reddit.com', {}), true);
  assert.strictEqual(isSiteEnabled('github.com', {}), false);

  // User explicitly disabled X
  assert.strictEqual(isSiteEnabled('x.com', { 'x.com': false }), false);

  // User explicitly enabled Github
  assert.strictEqual(isSiteEnabled('github.com', { 'github.com': true }), true);

  // User explicitly disabled Reddit
  assert.strictEqual(isSiteEnabled('reddit.com', { 'reddit.com': false }), false);

  console.log('✓ isSiteEnabled respects user overrides and falls back to defaults');
}

// 4. URL Utils: Display names
{
  assert.strictEqual(getSiteDisplayName('x.com'), 'X (Twitter)');
  assert.strictEqual(getSiteDisplayName('reddit.com'), 'Reddit');
  assert.strictEqual(getSiteDisplayName('github.com'), 'github.com');
  assert.strictEqual(getSiteDisplayName(''), 'Unknown');
  console.log('✓ getSiteDisplayName returns user-friendly labels');
}

// 5. Background Coordinator: Site status and toggle integration
{
  const localStorageData = {};
  const sessionStorageData = {};
  const tabs = new Map();
  let tabIdSeq = 200;
  let splitIdSeq = 700;
  let messageListener = null;
  let storageChangeListener = null;
  let lastBadge = null;

  globalThis.chrome = {
    action: {
      setBadgeText: async (opts) => { lastBadge = opts; },
      setBadgeBackgroundColor: async () => {},
      setTitle: async () => {},
      onClicked: { addListener: () => {} }
    },
    storage: {
      session: {
        get: async (keys) => {
          const res = {};
          const list = Array.isArray(keys) ? keys : [keys];
          for (const k of list) res[k] = sessionStorageData[k];
          return res;
        },
        set: async (obj) => Object.assign(sessionStorageData, obj)
      },
      local: {
        get: async (keys) => {
          const res = {};
          const list = Array.isArray(keys) ? keys : [keys];
          for (const k of list) res[k] = localStorageData[k];
          return res;
        },
        set: async (obj) => Object.assign(localStorageData, obj)
      },
      onChanged: {
        addListener: (cb) => { storageChangeListener = cb; }
      }
    },
    tabs: {
      SPLIT_VIEW_ID_NONE: -1,
      get: async (id) => {
        const t = tabs.get(id);
        if (!t) throw new Error('Tab not found: ' + id);
        return { ...t };
      },
      query: async () => Array.from(tabs.values()),
      create: async (props) => {
        const id = ++tabIdSeq;
        let splitViewId = -1;
        if (props.splitWithTabId) {
          const splitWith = tabs.get(props.splitWithTabId);
          if (splitWith) {
            splitViewId = ++splitIdSeq;
            splitWith.splitViewId = splitViewId;
          }
        }
        const newTab = {
          id,
          url: props.url,
          windowId: props.windowId || 1,
          active: Boolean(props.active),
          splitViewId,
          pinned: Boolean(props.pinned),
          index: typeof props.index === 'number' ? props.index : tabs.size
        };
        tabs.set(id, newTab);
        return { ...newTab };
      },
      update: async (id, props) => {
        const t = tabs.get(id);
        if (!t) throw new Error('Tab not found: ' + id);
        if (props.url) t.url = props.url;
        return { ...t };
      },
      sendMessage: async () => {},
      onRemoved: { addListener: () => {} },
      onUpdated: { addListener: () => {} }
    },
    runtime: {
      onMessage: {
        addListener: (cb) => { messageListener = cb; }
      }
    }
  };

  // Import background ESM freshly
  const { SplitSessionCoordinator, coordinator } = await import(`../background.js?test_settings=${Date.now()}`);
  await coordinator.init();

  // Test getSiteStatus default states
  const xStatus = await coordinator.getSiteStatus('x.com', 'https://x.com/home');
  assert.strictEqual(xStatus.enabled, true, 'X must be enabled by default');
  assert.strictEqual(xStatus.isDefault, true);
  assert.strictEqual(xStatus.isSupported, true);
  assert.strictEqual(xStatus.displayName, 'X (Twitter)');

  const redditStatus = await coordinator.getSiteStatus('reddit.com', 'https://www.reddit.com/');
  assert.strictEqual(redditStatus.enabled, true, 'Reddit must be enabled by default');
  assert.strictEqual(redditStatus.isDefault, true);
  assert.strictEqual(redditStatus.isSupported, true);

  const githubStatus = await coordinator.getSiteStatus('github.com', 'https://github.com/explore');
  assert.strictEqual(githubStatus.enabled, false, 'Other sites must be disabled by default');
  assert.strictEqual(githubStatus.isDefault, false);
  assert.strictEqual(githubStatus.isSupported, true, 'All websites are supported via GenericPolicy');

  const systemStatus = await coordinator.getSiteStatus('', 'chrome://extensions');
  assert.strictEqual(systemStatus.isSupported, false, 'System / internal pages are not supported');

  console.log('✓ coordinator.getSiteStatus returns correct defaults');

  // Test setSiteEnabled for X
  tabs.set(201, { id: 201, url: 'https://x.com/home', windowId: 1, active: true, splitViewId: -1, index: 0 });
  await coordinator.setSiteEnabled('x.com', false);
  assert.strictEqual(coordinator.siteSettings['x.com'], false);
  assert.strictEqual(coordinator.siteSettings['twitter.com'], false, 'Toggling x.com must also toggle twitter.com');
  assert.strictEqual(localStorageData.siteSettings['x.com'], false, 'Must persist to storage.local');

  const xStatusAfterDisable = await coordinator.getSiteStatus('x.com');
  assert.strictEqual(xStatusAfterDisable.enabled, false);

  // Clicking post while site is disabled should NOT open split view
  await coordinator.openPost(201, 'https://x.com/user/status/123456789');
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(coordinator.browsingToReader.has(201), false, 'Post must not be opened when site is disabled');
  console.log('✓ openPost is bypassed when site is disabled in settings');

  // Re-enable X
  await coordinator.setSiteEnabled('x.com', true);
  assert.strictEqual(coordinator.siteSettings['x.com'], true);
  await coordinator.openPost(201, 'https://x.com/user/status/123456789');
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(coordinator.browsingToReader.has(201), true, 'Post opens reader tab when site is enabled');
  console.log('✓ openPost works properly when site is enabled');

  // Test runtime message handlers: GET_SITE_STATUS and SET_SITE_ENABLED
  let msgStatus = null;
  await messageListener({ type: 'GET_SITE_STATUS', siteKey: 'reddit.com' }, {}, (res) => {
    msgStatus = res;
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(msgStatus.siteKey, 'reddit.com');
  assert.strictEqual(msgStatus.enabled, true);

  let setMsgResult = null;
  await messageListener({ type: 'SET_SITE_ENABLED', siteKey: 'reddit.com', enabled: false }, {}, (res) => {
    setMsgResult = res;
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(setMsgResult.success, true);
  assert.strictEqual(setMsgResult.enabled, false);

  const redditStatusAfterMsg = await coordinator.getSiteStatus('reddit.com');
  assert.strictEqual(redditStatusAfterMsg.enabled, false);
  console.log('✓ GET_SITE_STATUS and SET_SITE_ENABLED runtime messages verified');

  // Test chrome.storage.onChanged listener updates coordinator.siteSettings
  if (storageChangeListener) {
    storageChangeListener(
      { siteSettings: { newValue: { 'github.com': true, 'reddit.com': true } } },
      'local'
    );
    assert.strictEqual(coordinator.siteSettings['github.com'], true);
    console.log('✓ storage.onChanged updates cached siteSettings dynamically');
  }

  // Test generic website enablement and post navigation
  tabs.set(202, { id: 202, url: 'https://news.ycombinator.com/', windowId: 1, active: true, splitViewId: -1, index: 1 });
  // By default, disabled
  await coordinator.openPost(202, 'https://arstechnica.com/gadgets/2026/10/browser-split-view');
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(coordinator.browsingToReader.has(202), false, 'Generic site must not open split when disabled by default');

  // Enable news.ycombinator.com
  await coordinator.setSiteEnabled('news.ycombinator.com', true);
  assert.strictEqual(coordinator.siteSettings['news.ycombinator.com'], true);
  await coordinator.openPost(202, 'https://arstechnica.com/gadgets/2026/10/browser-split-view');
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(coordinator.browsingToReader.has(202), true, 'Generic site opens split view when enabled');
  console.log('✓ Generic website toggle and split view navigation verified');
}

// 6. Deep SiteSettings Module Tests
{
  const SiteSettings = globalThis.SiteSettings;
  assert.ok(SiteSettings, 'SiteSettings module must be available');
  assert.strictEqual(typeof SiteSettings.getSiteKey, 'function');
  assert.strictEqual(typeof SiteSettings.isDefaultEnabled, 'function');
  assert.strictEqual(typeof SiteSettings.isEnabled, 'function');
  assert.strictEqual(typeof SiteSettings.setEnabled, 'function');
  assert.strictEqual(typeof SiteSettings.getSiteStatus, 'function');
  assert.strictEqual(typeof SiteSettings.getAllSettings, 'function');

  // Domain Normalizer
  assert.strictEqual(SiteSettings.getSiteKey('https://mobile.x.com/post/1'), 'x.com');
  assert.strictEqual(SiteSettings.getSiteKey('https://www.twitter.com/post/2'), 'x.com');
  assert.strictEqual(SiteSettings.getSiteKey('https://old.reddit.com/r/all'), 'reddit.com');
  assert.strictEqual(SiteSettings.getSiteKey('https://sub.domain.example.com/page'), 'sub.domain.example.com');
  assert.strictEqual(SiteSettings.isSupported('https://example.com'), true);
  assert.strictEqual(SiteSettings.isSupported('chrome://settings'), false);

  // Default Enablement Logic
  assert.strictEqual(SiteSettings.isDefaultEnabled('x.com'), true);
  assert.strictEqual(SiteSettings.isDefaultEnabled('reddit.com'), true);
  assert.strictEqual(SiteSettings.isDefaultEnabled('github.com'), false);

  // Storage IO: setEnabled and isEnabled
  await SiteSettings.setEnabled('lobste.rs', true);
  const lobstersEnabled = await SiteSettings.isEnabled('lobste.rs');
  assert.strictEqual(lobstersEnabled, true, 'Custom enabled site must be true');

  await SiteSettings.setEnabled('x.com', false);
  const xEnabled = await SiteSettings.isEnabled('x.com');
  assert.strictEqual(xEnabled, false, 'Disabled site must be false');
  const twitterEnabled = await SiteSettings.isEnabled('twitter.com');
  assert.strictEqual(twitterEnabled, false, 'Disabling x.com must synchronize to twitter.com');

  const status = await SiteSettings.getSiteStatus('lobste.rs', 'https://lobste.rs/s/123');
  assert.strictEqual(status.siteKey, 'lobste.rs');
  assert.strictEqual(status.enabled, true);
  assert.strictEqual(status.isSupported, true);

  console.log('✓ SiteSettings module methods and storage seam verified directly');
}

console.log('\n=== ALL POPUP & SITE-LEVEL SETTINGS TESTS PASSED! ===');
