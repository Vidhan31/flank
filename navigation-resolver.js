(function () {
  'use strict';

  function getUrlUtils() {
    if (typeof globalThis !== 'undefined' && globalThis.SplitViewUrlUtils) {
      return globalThis.SplitViewUrlUtils;
    }
    return {};
  }

  function isRedditUserLink(href, currentLoc) {
    try {
      const origin = currentLoc && currentLoc.origin && currentLoc.origin !== 'null' ? currentLoc.origin : 'https://www.reddit.com';
      const url = new URL(href, origin);
      return /^\/(?:user|u)\/[a-zA-Z0-9_-]+/i.test(url.pathname);
    } catch {
      return false;
    }
  }

  function isSubredditOnlyLink(href, currentLoc) {
    try {
      const origin = currentLoc && currentLoc.origin && currentLoc.origin !== 'null' ? currentLoc.origin : 'https://www.reddit.com';
      const url = new URL(href, origin);
      return /^\/r\/[a-zA-Z0-9_]+\/?$/i.test(url.pathname);
    } catch {
      return false;
    }
  }

  function isRedditExternalOutboundLink(anchor, href, currentLoc) {
    const urlUtils = getUrlUtils();
    const isRedditPostUrl = urlUtils.isRedditPostUrl || (() => false);

    try {
      const origin = currentLoc && currentLoc.origin && currentLoc.origin !== 'null' ? currentLoc.origin : 'https://www.reddit.com';
      const url = new URL(href, origin);
      const hostname = url.hostname.toLowerCase();
      const isReddit = hostname === 'reddit.com' || hostname.endsWith('.reddit.com');
      if (!isReddit) return true;

      if (anchor.getAttribute?.('data-testid') === 'outbound-link') return true;
      if (anchor.getAttribute?.('rel')?.includes('noopener') && !isRedditPostUrl(href)) return true;
      if (url.pathname.startsWith('/domain/') || url.pathname.startsWith('/external/')) return true;

      return false;
    } catch {
      return true;
    }
  }

  function extractPermalinkFromRedditPost(postEl) {
    const urlUtils = getUrlUtils();
    const isRedditPostUrl = urlUtils.isRedditPostUrl || (() => false);
    if (!postEl) return null;

    const attrPermalink = postEl.getAttribute?.('permalink');
    if (attrPermalink && isRedditPostUrl(attrPermalink)) {
      return attrPermalink;
    }

    const dataPermalink = postEl.getAttribute?.('data-permalink');
    if (dataPermalink && isRedditPostUrl(dataPermalink)) {
      return dataPermalink;
    }

    const titleLink = postEl.querySelector?.('a[slot="title"], a[data-testid="post-title"], a[data-click-id="title"], a.title');
    if (titleLink) {
      const href = titleLink.getAttribute?.('href');
      if (href && isRedditPostUrl(href)) return href;
    }

    const commentLink = postEl.querySelector?.('a[slot="comments"], a[data-click-id="comments"], a.comments');
    if (commentLink) {
      const href = commentLink.getAttribute?.('href');
      if (href && isRedditPostUrl(href)) return href;
    }

    const bodyLink = postEl.querySelector?.('a[data-click-id="body"]');
    if (bodyLink) {
      const href = bodyLink.getAttribute?.('href');
      if (href && isRedditPostUrl(href)) return href;
    }

    return null;
  }

  function isXUserLink(href, currentLoc) {
    if (!href) return false;
    try {
      const origin = currentLoc && currentLoc.origin && currentLoc.origin !== 'null' ? currentLoc.origin : 'https://x.com';
      const url = new URL(href, origin);
      const path = url.pathname.replace(/^\/+|\/+$/g, '');
      const reservedPrefixes = ['home', 'explore', 'notifications', 'messages', 'i', 'settings', 'search', 'hashtag'];
      if (reservedPrefixes.includes(path.toLowerCase())) return false;
      return /^[a-zA-Z0-9_]{1,50}$/.test(path);
    } catch {
      return false;
    }
  }

  function isXHashtagOrSearchLink(href, currentLoc) {
    if (!href) return false;
    try {
      const origin = currentLoc && currentLoc.origin && currentLoc.origin !== 'null' ? currentLoc.origin : 'https://x.com';
      const url = new URL(href, origin);
      return /^\/(?:hashtag|search|explore)\b/i.test(url.pathname);
    } catch {
      return false;
    }
  }

  function isXExternalOutboundLink(anchor, href, currentLoc) {
    const urlUtils = getUrlUtils();
    const isXPostUrl = urlUtils.isXPostUrl || (() => false);

    if (!href) return true;
    try {
      const origin = currentLoc && currentLoc.origin && currentLoc.origin !== 'null' ? currentLoc.origin : 'https://x.com';
      const url = new URL(href, origin);
      const hostname = url.hostname.toLowerCase();
      const isXHost =
        hostname === 'x.com' ||
        hostname.endsWith('.x.com') ||
        hostname === 'twitter.com' ||
        hostname.endsWith('.twitter.com');

      if (!isXHost) return true;
      if (hostname === 't.co' || hostname.endsWith('.t.co')) return true;
      if (anchor.getAttribute?.('target') === '_blank') return true;
      if (anchor.getAttribute?.('rel')?.includes('noopener') && !isXPostUrl(href)) return true;
      if (anchor.closest?.('[data-testid="card.wrapper"]')) return true;
      return false;
    } catch {
      return true;
    }
  }

  function resolveReddit(path, target, currentLoc) {
    const urlUtils = getUrlUtils();
    const isRedditPostUrl = urlUtils.isRedditPostUrl || (() => false);
    const normalizeRedditPostUrl = urlUtils.normalizeRedditPostUrl || ((u) => u);

    for (const el of path) {
      if (!el || !(el instanceof Element)) continue;

      if (
        el.tagName === 'FACEPLATE-HOVERCARD' ||
        el.tagName === 'SHREDDIT-SUBREDDIT-ICON' ||
        el.matches?.(
          'faceplate-hovercard, shreddit-subreddit-icon, [data-testid*="user-hover-card"], [data-testid*="subreddit-name"], [data-testid*="post_author"]'
        )
      ) {
        return null;
      }

      if (
        el.tagName === 'SHREDDIT-VOTE-BUTTON' ||
        el.matches?.(
          '[data-click-id="upvote"], [data-click-id="downvote"], button[upvote], button[downvote], .vote, [aria-label*="upvote" i], [aria-label*="downvote" i]'
        )
      ) {
        return null;
      }

      if (
        el.tagName === 'SHREDDIT-POST-SHARE-BUTTON' ||
        el.tagName === 'SHREDDIT-SAVE-BUTTON' ||
        el.tagName === 'SHREDDIT-POST-OVERFLOW-MENU' ||
        el.matches?.(
          'shreddit-overflow-menu, [data-click-id="share"], [data-click-id="save"], [data-testid="post_award_button"], [aria-haspopup="menu"]'
        )
      ) {
        return null;
      }

      if (
        el.tagName === 'SHREDDIT-COMMENT-TREE' ||
        el.matches?.(
          '[data-testid="comment-collapse-button"], button[aria-label*="collapse" i], button[aria-label*="expand" i], .comment-collapse'
        )
      ) {
        return null;
      }

      if (
        el.tagName === 'SHREDDIT-GALLERY-CAROUSEL' ||
        el.tagName === 'SHREDDIT-MEDIA-LIGHTBOX' ||
        el.matches?.(
          '[data-testid="carousel-next-button"], [data-testid="carousel-prev-button"], button[aria-label*="next" i], button[aria-label*="previous" i], button[aria-label*="close" i]'
        )
      ) {
        return null;
      }

      if (el.matches?.('input, textarea, select, [contenteditable="true"]')) {
        return null;
      }

      if (el.matches?.('video, audio, [data-testid="video-player-controls"], .video-controls')) {
        return null;
      }

      if (
        el.matches?.(
          'button[aria-expanded], summary, [data-testid="expando-button"], [data-click-id="expando_button"]'
        )
      ) {
        return null;
      }

      if (el.tagName === 'BODY' || el.tagName === 'HTML') break;
    }

    let anchor = null;
    for (const el of path) {
      if (el && el instanceof Element && el.tagName === 'A') {
        anchor = el;
        break;
      }
      if (el && el.tagName === 'BODY') break;
    }

    if (anchor) {
      const rawHref = anchor.getAttribute?.('href') || anchor.href;
      if (!rawHref) return null;

      if (isRedditUserLink(rawHref, currentLoc)) return null;
      if (isSubredditOnlyLink(rawHref, currentLoc)) return null;
      if (isRedditExternalOutboundLink(anchor, rawHref, currentLoc)) return null;

      if (isRedditPostUrl(rawHref)) {
        return normalizeRedditPostUrl(rawHref);
      }
      return null;
    }

    let postEl = null;
    for (const el of path) {
      if (el && el instanceof Element) {
        if (
          el.tagName === 'SHREDDIT-POST' ||
          el.matches?.('[data-testid="post-container"], article.post, div.thing.link')
        ) {
          postEl = el;
          break;
        }
      }
      if (el && el.tagName === 'BODY') break;
    }

    if (postEl) {
      const button = target?.closest?.('button, [role="button"]');
      if (button) {
        const isCommentBtn = button.closest?.('shreddit-post-comment-action, [data-click-id="comments"]');
        if (!isCommentBtn) return null;
      }

      const permalink = extractPermalinkFromRedditPost(postEl);
      if (permalink && isRedditPostUrl(permalink)) {
        return normalizeRedditPostUrl(permalink);
      }
    }

    return null;
  }

  function resolveX(path, target, currentLoc) {
    const urlUtils = getUrlUtils();
    const isXPostUrl = urlUtils.isXPostUrl || (() => false);
    const normalizeXPostUrl = urlUtils.normalizeXPostUrl || ((u) => u);

    for (const el of path) {
      if (!el || !(el instanceof Element)) continue;

      if (el.matches?.('input, textarea, select, [contenteditable="true"]')) {
        return null;
      }

      if (
        el.matches?.(
          '[data-testid="reply"], [data-testid="retweet"], [data-testid="unretweet"], [data-testid="like"], [data-testid="unlike"], [data-testid="bookmark"], [data-testid="removeBookmark"], [data-testid="share"], [data-testid="caret"], [data-testid="grokButton"], [data-testid="analyticsButton"], [data-testid="poll"], [data-testid="tweet-translate-button"], [data-testid="audiospace"]'
        ) ||
        el.matches?.(
          'button[aria-label*="reply" i], button[aria-label*="repost" i], button[aria-label*="like" i], button[aria-label*="bookmark" i], button[aria-label*="share" i], button[aria-label*="more" i], button[aria-label*="grok" i], button[aria-label*="translate" i]'
        ) ||
        el.matches?.('[aria-haspopup="menu"], [data-testid*="follow" i], [data-testid*="Follow" i]')
      ) {
        return null;
      }

      if (
        el.matches?.(
          'video, audio, [data-testid="videoPlayer"], [data-testid="videoComponent"], [data-testid="playButton"], button[aria-label*="play" i], button[aria-label*="pause" i], button[aria-label*="mute" i], button[aria-label*="unmute" i], .video-controls'
        )
      ) {
        return null;
      }

      if (el.matches?.('[data-testid="tweetPhoto"]')) {
        return null;
      }

      if (
        el.matches?.(
          'header[role="banner"], nav[aria-label="Primary"], [data-testid="sidebarColumn"], [data-testid="SearchBox_Search_Input"], form[role="search"], [data-testid="trend"]'
        )
      ) {
        return null;
      }

      if (el.tagName === 'BODY' || el.tagName === 'HTML') break;
    }

    let anchor = null;
    for (const el of path) {
      if (el && el instanceof Element && el.tagName === 'A') {
        anchor = el;
        break;
      }
      if (el && el.tagName === 'BODY') break;
    }

    if (anchor) {
      const rawHref = anchor.getAttribute?.('href') || anchor.href;
      if (!rawHref) return null;

      if (
        isXUserLink(rawHref, currentLoc) ||
        anchor.closest?.('[data-testid="Tweet-User-Avatar"], [data-testid="User-Name"]')
      ) {
        return null;
      }

      if (isXExternalOutboundLink(anchor, rawHref, currentLoc)) return null;
      if (isXHashtagOrSearchLink(rawHref, currentLoc)) return null;

      if (isXPostUrl(rawHref)) {
        if (rawHref.includes('/analytics')) return null;
        return normalizeXPostUrl(rawHref);
      }

      return null;
    }

    let quoteEl = null;
    for (const el of path) {
      if (el && el instanceof Element) {
        if (
          el.hasAttribute?.('data-split-href') ||
          Boolean(el.getAttribute?.('data-split-href')) ||
          el.getAttribute?.('data-testid') === 'quoteTweet' ||
          el.getAttribute?.('data-testid') === 'quotedTweet' ||
          (el.tagName === 'DIV' && el.getAttribute?.('role') === 'link' && (el.closest?.('article') || el.closest?.('[data-testid="tweet"]'))) ||
          (el.getAttribute?.('role') === 'link' && (el.getAttribute?.('href')?.includes('/status/') || el.getAttribute?.('data-href')?.includes('/status/')) && (el.closest?.('article') || el.closest?.('[data-testid="tweet"]')))
        ) {
          quoteEl = el;
          break;
        }
      }
      if (el && el.tagName === 'BODY') break;
    }

    if (quoteEl) {
      const rawQuoteHref =
        quoteEl.getAttribute?.('data-split-href') ||
        quoteEl.querySelector?.('[data-split-href]')?.getAttribute?.('data-split-href') ||
        quoteEl.getAttribute?.('href') ||
        quoteEl.getAttribute?.('data-href');

      if (rawQuoteHref && isXPostUrl(rawQuoteHref)) {
        return normalizeXPostUrl(rawQuoteHref);
      }

      const quoteTime = quoteEl.querySelector?.('time')?.closest?.('a, [role="link"]');
      if (quoteTime) {
        const timeHref = quoteTime.getAttribute?.('href') || quoteTime.getAttribute?.('data-href') || quoteTime.href;
        if (timeHref && isXPostUrl(timeHref)) {
          return normalizeXPostUrl(timeHref);
        }
      }

      const quoteStatus = quoteEl.querySelector?.('a[href*="/status/"], [role="link"][href*="/status/"], [data-href*="/status/"]');
      if (quoteStatus) {
        const href = quoteStatus.getAttribute?.('href') || quoteStatus.getAttribute?.('data-href') || quoteStatus.href;
        if (href && isXPostUrl(href)) {
          return normalizeXPostUrl(href);
        }
      }

      return null;
    }

    let tweetEl = null;
    for (const el of path) {
      if (el && el instanceof Element) {
        if (el.tagName === 'ARTICLE' || el.getAttribute?.('data-testid') === 'tweet') {
          tweetEl = el;
          break;
        }
      }
      if (el && (el.tagName === 'BODY' || el.tagName === 'HTML')) break;
    }

    if (tweetEl) {
      const button = target?.closest?.('button, [role="button"]');
      if (button) return null;

      const timeLink = tweetEl.querySelector?.('time')?.closest?.('a');
      const permalinkAnchor = timeLink || tweetEl.querySelector?.('a[href*="/status/"]');
      if (permalinkAnchor) {
        const href = permalinkAnchor.getAttribute?.('href') || permalinkAnchor.href;
        if (href && isXPostUrl(href)) {
          return normalizeXPostUrl(href);
        }
      }
    }

    return null;
  }

  function resolveGeneric(path, target, currentLoc) {
    if (!path || !Array.isArray(path) || path.length === 0) return null;
    if (!target) return null;

    const urlUtils = getUrlUtils();
    const normalizeGenericUrl = urlUtils.normalizeGenericUrl || ((u) => u);

    for (const el of path) {
      if (!el || !(el instanceof Element)) continue;

      if (el.matches?.('input, textarea, select, option, summary, dialog, [contenteditable="true"]')) {
        return null;
      }

      if (
        el.matches?.(
          'button, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="menuitem"], [role="treeitem"]'
        )
      ) {
        return null;
      }

      if (
        el.matches?.(
          '[aria-haspopup], [aria-expanded], [data-toggle], [data-bs-toggle], [data-target], [data-action]'
        )
      ) {
        return null;
      }

      if (el.hasAttribute?.('onclick')) {
        return null;
      }

      if (el.matches?.('video, audio, [data-testid*="player" i], .video-controls, .media-player')) {
        return null;
      }

      if (
        el.matches?.(
          'header, nav, footer, aside, form, [role="navigation"], [role="banner"], [role="contentinfo"], [role="menubar"], [role="menu"], [role="search"]'
        )
      ) {
        return null;
      }

      if (
        el.matches?.(
          '[role="pagination"], [aria-label*="pagination" i], [aria-label*="breadcrumb" i], nav[aria-label*="breadcrumb" i], [class*="breadcrumb" i]'
        )
      ) {
        return null;
      }

      if (el.tagName === 'BODY' || el.tagName === 'HTML') break;
    }

    let anchor = null;
    for (const el of path) {
      if (el && el instanceof Element && (el.tagName === 'A' || el.tagName === 'AREA')) {
        anchor = el;
        break;
      }
      if (el && (el.tagName === 'BODY' || el.tagName === 'HTML')) break;
    }

    if (!anchor) return null;

    const rawHref = anchor.getAttribute?.('href') || anchor.href;
    if (!rawHref) return null;

    if (anchor.hasAttribute?.('download')) return null;

    if (
      anchor.matches?.(
        '[rel="prev"], [rel="next"], [aria-label*="next page" i], [aria-label*="prev page" i], [aria-label*="pagination" i]'
      )
    ) {
      return null;
    }

    const currentOrigin = currentLoc && currentLoc.origin && currentLoc.origin !== 'null' ? currentLoc.origin : 'https://example.com';

    let parsedUrl;
    try {
      parsedUrl = new URL(rawHref, currentLoc ? currentLoc.href : currentOrigin);
    } catch {
      return null;
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return null;
    }

    if (currentLoc) {
      if (
        parsedUrl.origin === currentLoc.origin &&
        parsedUrl.pathname === currentLoc.pathname &&
        parsedUrl.search === currentLoc.search
      ) {
        return null;
      }
      if (parsedUrl.href === currentLoc.href) {
        return null;
      }
    }

    if (urlUtils.isGenericDownloadUrl && urlUtils.isGenericDownloadUrl(parsedUrl.href)) {
      return null;
    }

    if (urlUtils.isGenericAuthOrActionUrl && urlUtils.isGenericAuthOrActionUrl(parsedUrl.href)) {
      return null;
    }

    const isInsideArticle = Boolean(anchor.closest?.('article, [role="article"]'));
    const isHeading = Boolean(
      anchor.closest?.('h1, h2, h3, h4, h5, h6') ||
      anchor.querySelector?.('h1, h2, h3, h4, h5, h6')
    );

    const hasMainElement =
      typeof document !== 'undefined' &&
      Boolean(document.querySelector?.('main, [role="main"]'));

    const isMainOrFeed =
      isInsideArticle ||
      Boolean(anchor.closest?.('main, [role="main"], [role="feed"]')) ||
      (!hasMainElement && Boolean(anchor.closest?.('body')));

    const anchorText = (anchor.textContent || '').trim();
    const hasDistinctDestination =
      !currentLoc ||
      parsedUrl.origin !== currentLoc.origin ||
      parsedUrl.pathname !== currentLoc.pathname;

    let qualifies = false;
    if (isInsideArticle || isHeading) {
      qualifies = true;
    } else if (isMainOrFeed && anchorText.length >= 15 && hasDistinctDestination) {
      qualifies = true;
    }

    if (!qualifies) {
      return null;
    }

    return normalizeGenericUrl(parsedUrl.href);
  }

  const NavigationResolver = {
    resolvePath(path, target, location) {
      if (!path || !Array.isArray(path) || path.length === 0) return null;
      const currentLoc = location || (typeof window !== 'undefined' ? window.location : null);
      const hostname = currentLoc?.hostname?.toLowerCase() || '';

      if (hostname === 'reddit.com' || hostname.endsWith('.reddit.com')) {
        return resolveReddit(path, target, currentLoc);
      }

      if (
        hostname === 'x.com' ||
        hostname.endsWith('.x.com') ||
        hostname === 'twitter.com' ||
        hostname.endsWith('.twitter.com')
      ) {
        return resolveX(path, target, currentLoc);
      }

      return resolveGeneric(path, target, currentLoc);
    },

    resolveClick(event) {
      if (!event) return null;
      if (event.button !== 0) return null;
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return null;

      const path = event.composedPath ? event.composedPath() : [];
      const target = path[0] || event.target;
      if (!target || !(target instanceof Element)) return null;

      const selection = typeof window !== 'undefined' && window.getSelection ? window.getSelection() : null;
      if (selection && selection.toString().trim().length > 0) {
        return null;
      }

      return this.resolvePath(path, target, typeof window !== 'undefined' ? window.location : null);
    }
  };

  if (typeof globalThis !== 'undefined') {
    globalThis.NavigationResolver = NavigationResolver;
    globalThis.SplitViewPlatformPolicies = {
      RedditPolicy: {
        matches: (h) => h === 'reddit.com' || (typeof h === 'string' && h.endsWith('.reddit.com')),
        resolveNavigation: (p, t) => resolveReddit(p, t, typeof window !== 'undefined' ? window.location : null)
      },
      XPolicy: {
        matches: (h) => typeof h === 'string' && (h === 'x.com' || h.endsWith('.x.com') || h === 'twitter.com' || h.endsWith('.twitter.com')),
        resolveNavigation: (p, t) => resolveX(p, t, typeof window !== 'undefined' ? window.location : null)
      },
      GenericPolicy: {
        matches: (h) => Boolean(h),
        resolveNavigation: (p, t) => resolveGeneric(p, t, typeof window !== 'undefined' ? window.location : null)
      },
      getPolicyForHostname: (h) => {
        if (!h) return null;
        if (h === 'reddit.com' || h.endsWith('.reddit.com')) return globalThis.SplitViewPlatformPolicies.RedditPolicy;
        if (h === 'x.com' || h.endsWith('.x.com') || h === 'twitter.com' || h.endsWith('.twitter.com')) return globalThis.SplitViewPlatformPolicies.XPolicy;
        return globalThis.SplitViewPlatformPolicies.GenericPolicy;
      }
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = NavigationResolver;
  }
})();
