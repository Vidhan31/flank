import assert from 'node:assert';
import '../url-utils.js';
import '../navigation-resolver.js';

const NavigationResolver = globalThis.NavigationResolver;

class MockElement {
  constructor(tagName, attrs = {}, children = []) {
    this.tagName = tagName.toUpperCase();
    this.attrs = { ...attrs };
    this.children = [];
    this.parentElement = null;
    this._textContent = attrs.textContent ?? '';
    for (const child of children) {
      this.appendChild(child);
    }
  }

  get textContent() {
    if (this._textContent) return this._textContent;
    return this.children.map((c) => c.textContent || '').join('');
  }

  set textContent(val) {
    this._textContent = val;
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

  matches(selector) {
    const parts = selector.split(',').map((s) => s.trim());
    for (const part of parts) {
      if (part === this.tagName.toLowerCase()) return true;
      if (part.startsWith('.')) {
        const cls = part.slice(1);
        if (this.attrs.class && this.attrs.class.split(/\s+/).includes(cls)) return true;
      }
      if (part.includes('[')) {
        const tagMatch = part.match(/^([a-zA-Z0-9_-]+)?\[(.+)\]$/);
        if (tagMatch) {
          const [, tag, rawExpr] = tagMatch;
          if (tag && tag.toLowerCase() !== this.tagName.toLowerCase()) continue;
          let attrExpr = rawExpr.trim();
          let isCaseInsensitive = false;
          if (attrExpr.toLowerCase().endsWith(' i')) {
            isCaseInsensitive = true;
            attrExpr = attrExpr.slice(0, -2).trim();
          }

          if (attrExpr.includes('*=')) {
            const [k, v] = attrExpr.split('*=').map((s) => s.replace(/["']/g, '').trim());
            const val = this.attrs[k];
            if (val !== undefined) {
              if (isCaseInsensitive) {
                if (String(val).toLowerCase().includes(v.toLowerCase())) return true;
              } else {
                if (String(val).includes(v)) return true;
              }
            }
          } else if (attrExpr.includes('=')) {
            const [k, v] = attrExpr.split('=').map((s) => s.replace(/["']/g, '').trim());
            if (this.attrs[k] === v) return true;
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
    const parts = selector.split(',').map((s) => s.trim());
    for (const child of this.children) {
      for (const part of parts) {
        if (child.matches && child.matches(part)) return child;
      }
      const deep = child.querySelector(selector);
      if (deep) return deep;
    }
    return null;
  }
}

globalThis.Element = MockElement;

console.log('=== TEST SUITE: NAVIGATION RESOLVER ===');

// 1. Reddit Resolution
{
  const redditLoc = { hostname: 'reddit.com', origin: 'https://reddit.com' };

  // A. Post card click
  const postCard = new MockElement('shreddit-post', {
    permalink: '/r/technology/comments/12345/quantum_chip_revealed/'
  });
  const cardBody = new MockElement('div', { 'data-click-id': 'body' });
  postCard.appendChild(cardBody);
  const path = [cardBody, postCard];

  const resolved = NavigationResolver.resolvePath(path, cardBody, redditLoc);
  assert.strictEqual(
    resolved,
    'https://www.reddit.com/r/technology/comments/12345/quantum_chip_revealed/'
  );

  // B. Vote button click ignored
  const voteBtn = new MockElement('button', { 'data-click-id': 'upvote' });
  postCard.appendChild(voteBtn);
  assert.strictEqual(NavigationResolver.resolvePath([voteBtn, postCard], voteBtn, redditLoc), null);

  // C. Outbound link ignored
  const outboundAnchor = new MockElement('a', {
    href: 'https://example.com/news',
    'data-testid': 'outbound-link'
  });
  assert.strictEqual(NavigationResolver.resolvePath([outboundAnchor, postCard], outboundAnchor, redditLoc), null);

  console.log('✓ Reddit resolution passed');
}

// 2. X (Twitter) Resolution
{
  const xLoc = { hostname: 'x.com', origin: 'https://x.com' };

  // A. Tweet article click
  const tweetArticle = new MockElement('article', { 'data-testid': 'tweet' });
  const timeLink = new MockElement('a', { href: '/antigravity/status/1845123456789012345' });
  tweetArticle.appendChild(timeLink);
  const tweetText = new MockElement('div', { textContent: 'Hello Split View!' });
  tweetArticle.appendChild(tweetText);

  const resolved = NavigationResolver.resolvePath([tweetText, tweetArticle], tweetText, xLoc);
  assert.strictEqual(
    resolved,
    'https://x.com/antigravity/status/1845123456789012345'
  );

  // B. Like button click ignored
  const likeBtn = new MockElement('button', { 'data-testid': 'like' });
  tweetArticle.appendChild(likeBtn);
  assert.strictEqual(NavigationResolver.resolvePath([likeBtn, tweetArticle], likeBtn, xLoc), null);

  // C. Quote tweet with data-split-href
  const quoteDiv = new MockElement('div', {
    role: 'link',
    'data-split-href': '/karpathy/status/9876543210'
  });
  tweetArticle.appendChild(quoteDiv);
  const quoteResolved = NavigationResolver.resolvePath([quoteDiv, tweetArticle], quoteDiv, xLoc);
  assert.strictEqual(quoteResolved, 'https://x.com/karpathy/status/9876543210');

  console.log('✓ X (Twitter) resolution passed');
}

// 3. Generic Resolution (Semantic Content Gate)
{
  const genericLoc = { hostname: 'news.ycombinator.com', origin: 'https://news.ycombinator.com' };

  // Article link
  const articleAnchor = new MockElement('a', {
    href: 'https://example.com/post/123?utm_source=feed',
    textContent: 'Read'
  });
  const articleEl = new MockElement('article', {}, [articleAnchor]);
  assert.strictEqual(
    NavigationResolver.resolvePath([articleAnchor, articleEl], articleAnchor, genericLoc),
    'https://example.com/post/123'
  );

  // Heading link
  const headingTag = new MockElement('h2', { textContent: 'Major Breakthrough in Quantum Computing' });
  const headingAnchor = new MockElement('a', { href: 'https://techblog.com/breakthrough' }, [headingTag]);
  assert.strictEqual(
    NavigationResolver.resolvePath([headingTag, headingAnchor], headingTag, genericLoc),
    'https://techblog.com/breakthrough'
  );

  // Navigation / Header ignored
  const navEl = new MockElement('nav');
  const navAnchor = new MockElement('a', { href: 'https://news.ycombinator.com/news', textContent: 'Stories' });
  navEl.appendChild(navAnchor);
  assert.strictEqual(NavigationResolver.resolvePath([navAnchor, navEl], navAnchor, genericLoc), null);

  console.log('✓ Generic resolution and semantic content gate passed');
}

// 4. resolveClick MouseEvent entry point
{
  globalThis.window = {
    location: { hostname: 'reddit.com', origin: 'https://reddit.com' },
    getSelection: () => ''
  };

  const post = new MockElement('shreddit-post', { permalink: '/r/news/comments/999/headline/' });
  const body = new MockElement('div', {});
  post.appendChild(body);

  const mockEvent = {
    button: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    composedPath: () => [body, post],
    target: body
  };

  const url = NavigationResolver.resolveClick(mockEvent);
  assert.strictEqual(url, 'https://www.reddit.com/r/news/comments/999/headline/');

  // Modifier click ignored
  mockEvent.metaKey = true;
  assert.strictEqual(NavigationResolver.resolveClick(mockEvent), null);

  console.log('✓ resolveClick entry point passed');
}

console.log('=== ALL NAVIGATION RESOLVER TESTS PASSED! ===\n');
