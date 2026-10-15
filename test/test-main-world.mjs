import assert from 'node:assert';

// Mock DOM elements and environment for main world script
class MockElement {
  constructor(tagName, attrs = {}) {
    this.tagName = tagName.toUpperCase();
    this.attrs = { ...attrs };
    this.children = [];
    this.parentElement = null;
    this.isConnected = true;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  getAttribute(name) {
    return this.attrs[name] ?? null;
  }

  setAttribute(name, val) {
    this.attrs[name] = val;
  }

  hasAttribute(name) {
    return this.attrs[name] !== undefined;
  }

  matches(selector) {
    const parts = selector.split(',').map((s) => s.trim());
    for (const part of parts) {
      if (part === this.tagName.toLowerCase()) return true;
      if (part.includes('[')) {
        const match = part.match(/^([a-zA-Z0-9]+)?\[(.+)\]$/);
        if (match) {
          const [, tag, attrExpr] = match;
          if (tag && tag.toLowerCase() !== this.tagName.toLowerCase()) continue;
          if (attrExpr.includes('=')) {
            const [attr, valRaw] = attrExpr.split('=');
            const val = valRaw.replace(/^["']|["']$/g, '');
            if (this.attrs[attr] === val) return true;
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

  querySelectorAll(selector) {
    const results = [];
    const search = (node) => {
      for (const child of node.children) {
        if (child.matches && child.matches(selector)) {
          results.push(child);
        }
        search(child);
      }
    };
    search(this);
    return results;
  }
}

globalThis.Element = MockElement;
const eventListeners = new Map();
globalThis.window = {
  addEventListener: (type, cb, options) => {
    if (!eventListeners.has(type)) eventListeners.set(type, []);
    eventListeners.get(type).push({ cb, options });
  }
};
globalThis.document = {
  body: new MockElement('body'),
  addEventListener: () => {}
};
globalThis.MutationObserver = class MockMutationObserver {
  observe() {}
  disconnect() {}
};

console.log('=== 6. X (TWITTER) MAIN WORLD REACT FIBER TESTS ===');

// Load main world script
await import('../x-main-world.js');

const extractUrlFromFiber = globalThis.__extractUrlFromFiber;
const annotateElement = globalThis.__annotateElement;

assert.ok(typeof extractUrlFromFiber === 'function', 'extractUrlFromFiber must be exported');
assert.ok(typeof annotateElement === 'function', 'annotateElement must be exported');

// 1. Fiber extraction with memoizedProps.link.pathname
{
  const el = new MockElement('div');
  el.__reactFiber$test = {
    memoizedProps: {
      link: { pathname: '/elonmusk/status/123456789' }
    }
  };
  const url = extractUrlFromFiber(el);
  assert.strictEqual(url, '/elonmusk/status/123456789');
  console.log('✓ extractUrlFromFiber resolves memoizedProps.link.pathname');
}

// 2. Fiber extraction with memoizedProps.href
{
  const el = new MockElement('div');
  el.__reactFiber$test = {
    memoizedProps: {
      href: 'https://x.com/OpenAI/status/987654321'
    }
  };
  const url = extractUrlFromFiber(el);
  assert.strictEqual(url, 'https://x.com/OpenAI/status/987654321');
  console.log('✓ extractUrlFromFiber resolves memoizedProps.href with /status/');
}

// 3. Fiber extraction with memoizedProps.to
{
  const el = new MockElement('div');
  el.__reactFiber$test = {
    memoizedProps: {
      to: '/anthropic/status/1122334455'
    }
  };
  const url = extractUrlFromFiber(el);
  assert.strictEqual(url, '/anthropic/status/1122334455');
  console.log('✓ extractUrlFromFiber resolves memoizedProps.to');
}

// 4. Fiber extraction with memoizedProps.quoted_status
{
  const el = new MockElement('div');
  el.__reactFiber$test = {
    memoizedProps: {
      quoted_status: {
        id_str: '998877665544',
        user: { screen_name: 'sama' }
      }
    }
  };
  const url = extractUrlFromFiber(el);
  assert.strictEqual(url, '/sama/status/998877665544');
  console.log('✓ extractUrlFromFiber resolves memoizedProps.quoted_status');
}

// 5. Fiber parent traversal (return pointer chain)
{
  const el = new MockElement('div');
  el.__reactFiber$test = {
    memoizedProps: {},
    return: {
      memoizedProps: {},
      return: {
        memoizedProps: {
          tweet: {
            id_str: '5544332211',
            user: { screen_name: 'antigravity' }
          }
        }
      }
    }
  };
  const url = extractUrlFromFiber(el);
  assert.strictEqual(url, '/antigravity/status/5544332211');
  console.log('✓ extractUrlFromFiber traverses parent fiber return pointers');
}

// 6. annotateElement on DOM tree
{
  const article = new MockElement('article');
  const quoteDiv = new MockElement('div', { role: 'link', tabindex: '0' });
  const innerSpan = new MockElement('span');
  quoteDiv.appendChild(innerSpan);
  article.appendChild(quoteDiv);

  quoteDiv.__reactFiber$test = {
    memoizedProps: {
      link: { pathname: '/TimSweeneyEpic/status/2110445472641163346' }
    }
  };

  annotateElement(innerSpan);
  assert.strictEqual(
    quoteDiv.getAttribute('data-split-href'),
    '/TimSweeneyEpic/status/2110445472641163346',
    'annotateElement must set data-split-href on the quote container'
  );
  console.log('✓ annotateElement attaches data-split-href attribute to quote tweet container');
}

// 7. Event listeners registered with passive options
{
  assert.ok(eventListeners.has('pointerdown'), 'pointerdown listener registered');
  assert.ok(eventListeners.has('mousedown'), 'mousedown listener registered');
  assert.ok(eventListeners.has('focusin'), 'focusin listener registered');
  assert.ok(eventListeners.has('click'), 'click listener registered');

  const pointerdownEntry = eventListeners.get('pointerdown')[0];
  assert.strictEqual(pointerdownEntry.options.passive, true, 'pointerdown listener must be passive');
  assert.strictEqual(pointerdownEntry.options.capture, true, 'pointerdown listener must use capture');
  console.log('✓ Gesture listeners use passive capture options for non-blocking scrolling');
}

console.log('✓ All main world Fiber tests passed successfully!');
