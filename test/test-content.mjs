import assert from 'node:assert';
import '../url-utils.js';
import '../navigation-resolver.js';

// Setup minimal browser-like environment for content script test
class MockElement {
  constructor(tagName, attrs = {}, children = []) {
    this.tagName = tagName.toUpperCase();
    this.attrs = { ...attrs };
    this.children = [];
    this.parentElement = null;
    for (const child of children) {
      this.appendChild(child);
    }
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  getAttribute(name) {
    return this.attrs[name] ?? null;
  }

  hasAttribute(name) {
    return this.attrs[name] !== undefined;
  }

  setAttribute(name, val) {
    this.attrs[name] = val;
  }

  removeAttribute(name) {
    delete this.attrs[name];
  }

  matches(selector) {
    const parts = selector.split(',').map((s) => s.trim());
    for (const part of parts) {
      if (part === this.tagName.toLowerCase()) return true;
      if (part.startsWith('.')) {
        const cls = part.slice(1);
        if (this.attrs.class && this.attrs.class.split(/\s+/).includes(cls)) return true;
      }
      if (part.includes('[')) {
        const tagMatch = part.match(/^([a-zA-Z0-9]+)?\[(.+)\]$/);
        if (tagMatch) {
          const [, tag, attrExpr] = tagMatch;
          if (tag && tag.toLowerCase() !== this.tagName.toLowerCase()) continue;
          if (attrExpr.includes('=')) {
            const [attr, valRaw] = attrExpr.split('=');
            const val = valRaw.replace(/^["']|["']$/g, '');
            if (attr.endsWith('*')) {
              const realAttr = attr.slice(0, -1);
              if (this.attrs[realAttr] && this.attrs[realAttr].includes(val)) return true;
            } else {
              if (this.attrs[attr] === val) return true;
            }
          } else {
            if (this.attrs[attrExpr] !== undefined) return true;
          }
        }
      }
    }
    return false;
  }

  closest(selector) {
    let curr = this;
    while (curr) {
      if (curr.matches && curr.matches(selector)) return curr;
      curr = curr.parentElement;
    }
    return null;
  }

  querySelector(selector) {
    for (const child of this.children) {
      if (child.matches && child.matches(selector)) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }
}

globalThis.Element = MockElement;
const sessionStorageStore = new Map();
globalThis.window = {
  location: {
    origin: 'https://x.com',
    hostname: 'x.com',
    href: 'https://x.com/home',
    hash: ''
  },
  sessionStorage: {
    getItem: (key) => sessionStorageStore.get(key) ?? null,
    setItem: (key, val) => sessionStorageStore.set(key, String(val)),
    removeItem: (key) => sessionStorageStore.delete(key),
    clear: () => sessionStorageStore.clear()
  },
  getSelection: () => ({ toString: () => '' })
};

await import('../content.js');
const contentScript = globalThis.__SplitViewContentScript;

console.log('=== 5. CONTENT SCRIPT INTERACTION RESOLUTION (X / TWITTER) ===');

function createTweetDOM() {
  const tweetArticle = new MockElement('article', { 'data-testid': 'tweet' });
  const avatarLink = new MockElement('a', { href: '/antigravity', 'data-testid': 'Tweet-User-Avatar' });
  const timeLink = new MockElement('a', { href: '/antigravity/status/1845123456789012345' });
  const timeEl = new MockElement('time', { datetime: '2026-10-15T00:00:00Z' });
  timeLink.appendChild(timeEl);

  const tweetText = new MockElement('div', { 'data-testid': 'tweetText' });
  const replyBtn = new MockElement('button', { 'data-testid': 'reply' });
  const retweetBtn = new MockElement('button', { 'data-testid': 'retweet' });
  const likeBtn = new MockElement('button', { 'data-testid': 'like' });
  const bookmarkBtn = new MockElement('button', { 'data-testid': 'bookmark' });
  const shareBtn = new MockElement('button', { 'data-testid': 'share' });
  const caretBtn = new MockElement('button', { 'data-testid': 'caret' });
  const grokBtn = new MockElement('button', { 'data-testid': 'grokButton' });
  const videoControls = new MockElement('div', { 'data-testid': 'videoPlayer' });
  const outboundLink = new MockElement('a', { href: 'https://t.co/abc', target: '_blank' });

  tweetArticle.appendChild(avatarLink);
  tweetArticle.appendChild(timeLink);
  tweetArticle.appendChild(tweetText);
  tweetArticle.appendChild(replyBtn);
  tweetArticle.appendChild(retweetBtn);
  tweetArticle.appendChild(likeBtn);
  tweetArticle.appendChild(bookmarkBtn);
  tweetArticle.appendChild(shareBtn);
  tweetArticle.appendChild(caretBtn);
  tweetArticle.appendChild(grokBtn);
  tweetArticle.appendChild(videoControls);
  tweetArticle.appendChild(outboundLink);

  return {
    tweetArticle,
    avatarLink,
    timeLink,
    tweetText,
    replyBtn,
    retweetBtn,
    likeBtn,
    bookmarkBtn,
    shareBtn,
    caretBtn,
    grokBtn,
    videoControls,
    outboundLink
  };
}

function mockEvent(target, overrides = {}) {
  const path = [];
  let curr = target;
  while (curr) {
    path.push(curr);
    curr = curr.parentElement;
  }
  let prevented = false;
  let stopped = false;
  return {
    button: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    composedPath: () => path,
    target,
    preventDefault: () => { prevented = true; },
    stopPropagation: () => { stopped = true; },
    stopImmediatePropagation: () => { stopped = true; },
    get prevented() { return prevented; },
    get stopped() { return stopped; },
    ...overrides
  };
}

const dom = createTweetDOM();

// 1. Click on tweet body text -> should intercept & resolve tweet permalink
{
  const event = mockEvent(dom.tweetText);
  const resolved = contentScript.resolvePostNavigation(event);
  assert.strictEqual(
    resolved,
    'https://x.com/antigravity/status/1845123456789012345',
    'Click on tweet text body should resolve canonical tweet permalink'
  );
  console.log('✓ Click on tweet text resolves tweet permalink');
}

// 2. Click on timestamp permalink -> should intercept & resolve
{
  const event = mockEvent(dom.timeLink);
  const resolved = contentScript.resolvePostNavigation(event);
  assert.strictEqual(
    resolved,
    'https://x.com/antigravity/status/1845123456789012345',
    'Click on timestamp permalink should resolve canonical tweet permalink'
  );
  console.log('✓ Click on timestamp permalink resolves tweet permalink');
}

// 3. Click on user avatar -> should NOT intercept
{
  const event = mockEvent(dom.avatarLink);
  const resolved = contentScript.resolvePostNavigation(event);
  assert.strictEqual(resolved, null, 'Click on avatar profile link must not be intercepted');
  console.log('✓ Click on user avatar is ignored');
}

// 4. Click on action buttons -> should NOT intercept
{
  for (const btn of [dom.replyBtn, dom.retweetBtn, dom.likeBtn, dom.bookmarkBtn, dom.shareBtn, dom.caretBtn, dom.grokBtn]) {
    const event = mockEvent(btn);
    const resolved = contentScript.resolvePostNavigation(event);
    assert.strictEqual(resolved, null, `Click on action button ${btn.getAttribute('data-testid')} must not be intercepted`);
  }
  console.log('✓ Click on reply/retweet/like/bookmark/share/caret/grok buttons are ignored');
}

// 5. Click on video player controls -> should NOT intercept
{
  const event = mockEvent(dom.videoControls);
  const resolved = contentScript.resolvePostNavigation(event);
  assert.strictEqual(resolved, null, 'Click on video player controls must not be intercepted');
  console.log('✓ Click on video controls is ignored');
}

// 6. Click on outbound t.co link -> should NOT intercept
{
  const event = mockEvent(dom.outboundLink);
  const resolved = contentScript.resolvePostNavigation(event);
  assert.strictEqual(resolved, null, 'Click on external link must not be intercepted');
  console.log('✓ Click on outbound t.co external link is ignored');
}

// 7. Modifiers (Ctrl/Cmd/Shift/Alt) -> should NOT intercept
{
  const event = mockEvent(dom.tweetText, { ctrlKey: true });
  const resolved = contentScript.resolvePostNavigation(event);
  assert.strictEqual(resolved, null, 'Ctrl+click must not be intercepted');
  console.log('✓ Modifier clicks (Ctrl/Cmd/Shift/Alt) preserve default browser behavior');
}

// 8. Text selection active -> should NOT intercept
{
  globalThis.window.getSelection = () => ({ toString: () => 'some highlighted tweet text' });
  const event = mockEvent(dom.tweetText);
  const resolved = contentScript.resolvePostNavigation(event);
  assert.strictEqual(resolved, null, 'Click when text is highlighted must not be intercepted');
  globalThis.window.getSelection = () => ({ toString: () => '' });
  console.log('✓ Highlighted text selection is not hijacked as navigation');
}

// 9. Quoted tweet with direct href -> resolves quoted tweet permalink
{
  const quoteDiv = new MockElement('div', {
    role: 'link',
    href: '/TimSweeneyEpic/status/2110440000000000000'
  });
  const quoteText = new MockElement('span');
  quoteDiv.appendChild(quoteText);
  dom.tweetArticle.appendChild(quoteDiv);

  const event = mockEvent(quoteText);
  const resolved = contentScript.resolvePostNavigation(event);
  assert.strictEqual(
    resolved,
    'https://x.com/TimSweeneyEpic/status/2110440000000000000',
    'Click on quote tweet with direct href attribute must resolve quoted tweet URL'
  );
  console.log('✓ Click on quoted tweet with direct href resolves quoted tweet permalink');
}

// 10. Quoted tweet with child status link -> resolves quoted tweet permalink
{
  const quoteDiv = new MockElement('div', { 'data-testid': 'quoteTweet' });
  const quoteStatusLink = new MockElement('a', { href: '/FortniteLinux/status/2110450000000000000' });
  const quoteStatusText = new MockElement('span');
  quoteStatusLink.appendChild(quoteStatusText);
  quoteDiv.appendChild(quoteStatusLink);
  dom.tweetArticle.appendChild(quoteDiv);

  const event = mockEvent(quoteStatusText);
  const resolved = contentScript.resolvePostNavigation(event);
  assert.strictEqual(
    resolved,
    'https://x.com/FortniteLinux/status/2110450000000000000',
    'Click on quote tweet with child status link must resolve quoted tweet URL'
  );
  console.log('✓ Click on quoted tweet with child status link resolves quoted tweet permalink');
}

// 11. Quoted tweet without status URL -> returns null (NEVER falls through to parent tweet)
{
  const unresolvableQuoteDiv = new MockElement('div', { 'data-testid': 'quoteTweet' });
  const quoteBody = new MockElement('span');
  unresolvableQuoteDiv.appendChild(quoteBody);
  dom.tweetArticle.appendChild(unresolvableQuoteDiv);

  const event = mockEvent(quoteBody);
  const resolved = contentScript.resolvePostNavigation(event);
  assert.strictEqual(
    resolved,
    null,
    'Click on quoted tweet without resolved status URL must return null and NOT fall through to parent tweet'
  );
  console.log('✓ Unresolvable quoted tweet safely returns null instead of falling through to parent tweet');
}

// 12. Reader tab (right split) bypass: clicks are NOT intercepted and navigate natively
{
  let messageSent = false;
  globalThis.chrome = {
    runtime: {
      sendMessage: () => { messageSent = true; },
      onMessage: { addListener: () => {} }
    }
  };

  // Browsing tab: click is intercepted and prevented
  window.location.hash = '';
  window.location.href = 'https://x.com/home';
  window.sessionStorage.removeItem('__split_reader');
  contentScript.setIsReaderTab(null);

  const browsingEvent = mockEvent(dom.tweetText);
  contentScript.handlePostClick(browsingEvent);
  assert.strictEqual(browsingEvent.prevented, true, 'Browsing tab must prevent default');
  assert.strictEqual(messageSent, true, 'Browsing tab must send OPEN_POST message');

  // Reader tab with #split-reader hash: click is NOT intercepted and not prevented
  messageSent = false;
  window.location.hash = '#split-reader';
  const readerEvent = mockEvent(dom.tweetText);
  contentScript.handlePostClick(readerEvent);
  assert.strictEqual(readerEvent.prevented, false, 'Reader tab must NOT prevent default');
  assert.strictEqual(messageSent, false, 'Reader tab must NOT send OPEN_POST message');
  assert.strictEqual(window.sessionStorage.getItem('__split_reader'), '1', 'Reader hash must persist to sessionStorage');

  // Deep native reader navigation (hash cleared, but sessionStorage holds marker)
  window.location.hash = '';
  const deepReaderEvent = mockEvent(dom.tweetText);
  contentScript.handlePostClick(deepReaderEvent);
  assert.strictEqual(deepReaderEvent.prevented, false, 'Deep reader navigation must NOT prevent default');
  assert.strictEqual(messageSent, false, 'Deep reader navigation must NOT send OPEN_POST message');

  // Reader tab on permalink URL: click is NOT intercepted
  window.sessionStorage.removeItem('__split_reader');
  window.location.href = 'https://x.com/antigravity/status/1845123456789012345';
  const permalinkReaderEvent = mockEvent(dom.tweetText);
  contentScript.handlePostClick(permalinkReaderEvent);
  assert.strictEqual(permalinkReaderEvent.prevented, false, 'Permalink reader tab must NOT prevent default');
  assert.strictEqual(messageSent, false, 'Permalink reader tab must NOT send OPEN_POST message');

  // Reset window for subsequent tests
  window.location.href = 'https://x.com/home';
  window.location.hash = '';
  window.sessionStorage.removeItem('__split_reader');
  console.log('✓ Reader tab (right split) bypasses click interception to allow deep native navigation');
}

// 13. Quoted tweet with data-split-href (from Main World fiber extraction) -> resolves on left feed split
{
  window.location.hash = '';
  window.location.href = 'https://x.com/home';
  window.sessionStorage.removeItem('__split_reader');
  contentScript.setIsReaderTab(null);

  const quoteDiv = new MockElement('div', {
    role: 'link',
    tabindex: '0',
    'data-split-href': 'https://twitter.com/TimSweeneyEpic/status/2110445472641163346'
  });
  const quoteSpan = new MockElement('span');
  quoteDiv.appendChild(quoteSpan);
  dom.tweetArticle.appendChild(quoteDiv);

  const event = mockEvent(quoteSpan);
  const resolved = contentScript.resolvePostNavigation(event);
  assert.strictEqual(
    resolved,
    'https://x.com/TimSweeneyEpic/status/2110445472641163346',
    'Quote tweet with data-split-href must resolve canonical URL'
  );
  console.log('✓ Quoted tweet with data-split-href resolves canonical URL on left feed split');
}

// 14. Disabled tab bypass: when Split It is toggled OFF, clicks are NOT intercepted
{
  let messageSent = false;
  window.location.hash = '';
  window.location.href = 'https://x.com/home';
  window.sessionStorage.removeItem('__split_reader');
  contentScript.setIsReaderTab(null);
  contentScript.setIsSplitItEnabled(false);

  const disabledEvent = mockEvent(dom.tweetText);
  contentScript.handlePostClick(disabledEvent);
  assert.strictEqual(disabledEvent.prevented, false, 'Disabled Split It must NOT prevent default');
  assert.strictEqual(messageSent, false, 'Disabled Split It must NOT send OPEN_POST message');

  contentScript.setIsSplitItEnabled(true);
  console.log('✓ Split It disabled tab bypass allows native navigation');
}

// 15. Click on translate button -> should NOT intercept
{
  const translateBtn = new MockElement('button', { 'data-testid': 'tweet-translate-button' });
  dom.tweetArticle.appendChild(translateBtn);
  const event = mockEvent(translateBtn);
  const resolved = contentScript.resolvePostNavigation(event);
  assert.strictEqual(resolved, null, 'Click on translate button must not be intercepted');
  console.log('✓ Click on translate button is ignored');
}

// 16. Reddit user hover card and subreddit icon are ignored
{
  const redditLoc = { hostname: 'reddit.com', origin: 'https://reddit.com' };
  const hovercard = new MockElement('faceplate-hovercard', { 'data-testid': 'user-hover-card' });
  const subIcon = new MockElement('shreddit-subreddit-icon');
  const path = [hovercard, dom.tweetArticle];
  const target = hovercard;
  const resolved = NavigationResolver.resolvePath(path, target, redditLoc);
  assert.strictEqual(resolved, null, 'Reddit hovercard must not be intercepted');

  const resolvedSub = NavigationResolver.resolvePath([subIcon, dom.tweetArticle], subIcon, redditLoc);
  assert.strictEqual(resolvedSub, null, 'Reddit subreddit icon must not be intercepted');
  console.log('✓ Reddit hovercard and subreddit icon clicks are ignored');
}

// 17. Generic website content script interaction resolution
{
  window.location.origin = 'https://news.ycombinator.com';
  window.location.hostname = 'news.ycombinator.com';
  window.location.href = 'https://news.ycombinator.com/';
  window.location.hash = '';
  contentScript.setIsSplitItEnabled(true);
  contentScript.setIsReaderTab(false);

  // A. Generic story heading click
  const storyHeading = new MockElement('h2', { textContent: 'Show HN: Open Source Split Screen Controller' });
  const storyAnchor = new MockElement('a', { href: 'https://news.ycombinator.com/item?id=99999' }, [storyHeading]);
  const mainEl = new MockElement('main', {}, [storyAnchor]);
  const storyEvent = mockEvent(storyHeading);
  const resolvedStory = contentScript.resolvePostNavigation(storyEvent);
  assert.strictEqual(
    resolvedStory,
    'https://news.ycombinator.com/item?id=99999',
    'Generic story title link must resolve normalized URL'
  );

  // B. Generic site header click should be ignored
  const headerAnchor = new MockElement('a', { href: 'https://news.ycombinator.com/news', textContent: 'Hacker News Frontpage' });
  const headerEl = new MockElement('header', {}, [headerAnchor]);
  const headerEvent = mockEvent(headerAnchor);
  const resolvedHeader = contentScript.resolvePostNavigation(headerEvent);
  assert.strictEqual(resolvedHeader, null, 'Header link on generic site must not be intercepted');

  console.log('✓ Generic website content script navigation and safety filters verified');
}

// 18. Active post visual highlight
{
  window.location.origin = 'https://x.com';
  window.location.hostname = 'x.com';
  window.location.href = 'https://x.com/home';
  contentScript.setIsSplitItEnabled(true);
  contentScript.setIsReaderTab(false);

  const clickEvent = mockEvent(dom.tweetText);
  contentScript.handlePostClick(clickEvent);
  assert.strictEqual(
    dom.tweetArticle.getAttribute('data-split-active-post'),
    'true',
    'Clicked tweet card must receive data-split-active-post="true"'
  );

  // Clicking another element moves the highlight
  const tweetArticle2 = new MockElement('article', { 'data-testid': 'tweet' });
  const tweetText2 = new MockElement('div', { textContent: 'Second tweet' });
  const timeAnchor = new MockElement('a', { href: 'https://x.com/user/status/222222' });
  const timeEl = new MockElement('time');
  timeAnchor.appendChild(timeEl);
  tweetArticle2.appendChild(tweetText2);
  tweetArticle2.appendChild(timeAnchor);

  const clickEvent2 = mockEvent(tweetText2);
  contentScript.handlePostClick(clickEvent2);
  assert.strictEqual(
    tweetArticle2.getAttribute('data-split-active-post'),
    'true',
    'Second clicked tweet card must receive data-split-active-post="true"'
  );
  assert.strictEqual(
    dom.tweetArticle.getAttribute('data-split-active-post'),
    null,
    'Previous tweet card must have data-split-active-post removed'
  );
  console.log('✓ Active post visual indicator attaches and transfers correctly');
}

console.log('✓ All content script interaction tests passed!');
