// Matches /r/<subname>/comments/<id>, /comments/<id>, or /r/<subname>/s/<shareId>
const REDDIT_POST_PATH_REGEX = /^(?:\/r\/[a-zA-Z0-9_]+)?\/(?:comments\/[a-zA-Z0-9]+(?:\/[^\s/?#]*)?|s\/[a-zA-Z0-9]+)/i;

// Matches /<username>/status/<id>, /i/status/<id>, or /i/web/status/<id>
const X_POST_PATH_REGEX = /^(?:\/([a-zA-Z0-9_]+)|\/i(?:\/web)?)\/status\/([0-9]+)/i;

const COMMON_TRACKING_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'msclkid',
  'mc_cid',
  'mc_eid'
];

const REDDIT_TRACKING_KEYS = new Set([
  ...COMMON_TRACKING_KEYS,
  'share_id',
  'rdt',
  'context'
]);

const X_TRACKING_KEYS = new Set([
  ...COMMON_TRACKING_KEYS,
  's',
  't',
  'ref_src',
  'ref_url',
  'mx',
  'cn',
  'twclid'
]);

function cleanQueryString(url, trackingKeys) {
  const cleanParams = new URLSearchParams();
  for (const [key, value] of url.searchParams.entries()) {
    if (!trackingKeys.has(key.toLowerCase())) {
      cleanParams.append(key, value);
    }
  }
  const search = cleanParams.toString();
  return search ? '?' + search : '';
}

function detectPlatform(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return null;
  try {
    const url = new URL(urlStr, 'https://www.reddit.com');
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'reddit.com' || hostname.endsWith('.reddit.com')) {
      return 'reddit';
    }
    if (
      hostname === 'x.com' ||
      hostname.endsWith('.x.com') ||
      hostname === 'twitter.com' ||
      hostname.endsWith('.twitter.com')
    ) {
      return 'x';
    }
    return 'generic';
  } catch {
    return null;
  }
}

function isRedditPostUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;

  try {
    const url = new URL(urlStr, 'https://www.reddit.com');
    const hostname = url.hostname.toLowerCase();
    if (hostname !== 'reddit.com' && !hostname.endsWith('.reddit.com')) {
      return false;
    }

    return REDDIT_POST_PATH_REGEX.test(url.pathname);
  } catch {
    return false;
  }
}

function normalizeRedditPostUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return null;

  try {
    const url = new URL(urlStr, 'https://www.reddit.com');
    const hostname = url.hostname.toLowerCase();
    if (hostname !== 'reddit.com' && !hostname.endsWith('.reddit.com')) {
      return null;
    }

    if (!REDDIT_POST_PATH_REGEX.test(url.pathname)) {
      return null;
    }

    const search = cleanQueryString(url, REDDIT_TRACKING_KEYS);
    return `https://www.reddit.com${url.pathname}${search}${url.hash || ''}`;
  } catch {
    return null;
  }
}

function isXPostUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;

  try {
    const url = new URL(urlStr, 'https://x.com');
    const hostname = url.hostname.toLowerCase();
    if (
      hostname !== 'x.com' &&
      !hostname.endsWith('.x.com') &&
      hostname !== 'twitter.com' &&
      !hostname.endsWith('.twitter.com')
    ) {
      return false;
    }

    return X_POST_PATH_REGEX.test(url.pathname);
  } catch {
    return false;
  }
}

function normalizeXPostUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return null;

  try {
    const url = new URL(urlStr, 'https://x.com');
    const hostname = url.hostname.toLowerCase();
    if (
      hostname !== 'x.com' &&
      !hostname.endsWith('.x.com') &&
      hostname !== 'twitter.com' &&
      !hostname.endsWith('.twitter.com')
    ) {
      return null;
    }

    const match = url.pathname.match(X_POST_PATH_REGEX);
    if (!match) {
      return null;
    }

    const user = match[1] || 'i';
    const statusId = match[2];
    const canonicalPath = `/${user}/status/${statusId}`;

    const search = cleanQueryString(url, X_TRACKING_KEYS);
    return `https://x.com${canonicalPath}${search}${url.hash || ''}`;
  } catch {
    return null;
  }
}

const GENERIC_TRACKING_KEYS = new Set(COMMON_TRACKING_KEYS);

const DOWNLOAD_EXT_REGEX = /\.(pdf|zip|tar|gz|tgz|bz2|7z|rar|dmg|exe|apk|deb|rpm|iso|mp3|mp4|wav|mov|avi|mkv|png|jpe?g|gif|webp|svg|ico|csv|tsv|json|xml|bin|msi)$/i;

const AUTH_ACTION_REGEX = /(?:^|\/|_|-)(?:login|signin|sign-in|logout|signout|sign-out|auth|oauth|register|signup|sign-up|password|forgot-password|reset-password|account|profile|cart|checkout|billing|pay|subscribe|unsubscribe|privacy|terms)(?:\/|_|-|$)/i;

function normalizeGenericUrl(urlStr, baseOrigin) {
  if (!urlStr || typeof urlStr !== 'string') return null;

  try {
    const base = baseOrigin || (typeof window !== 'undefined' && window.location ? window.location.origin : 'https://example.com');
    const url = new URL(urlStr, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    const search = cleanQueryString(url, GENERIC_TRACKING_KEYS);
    return `${url.origin}${url.pathname}${search}${url.hash || ''}`;
  } catch {
    return null;
  }
}

function isGenericDownloadUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  try {
    const url = new URL(urlStr, 'https://example.com');
    return DOWNLOAD_EXT_REGEX.test(url.pathname);
  } catch {
    return false;
  }
}

function isGenericAuthOrActionUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  try {
    const url = new URL(urlStr, 'https://example.com');
    if (AUTH_ACTION_REGEX.test(url.pathname)) return true;
    for (const [key, value] of url.searchParams.entries()) {
      if (
        (key.toLowerCase() === 'action' || key.toLowerCase() === 'mode' || key.toLowerCase() === 'op' || key.toLowerCase() === 'view') &&
        AUTH_ACTION_REGEX.test(value)
      ) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

function isPostUrl(urlStr) {
  return isRedditPostUrl(urlStr) || isXPostUrl(urlStr);
}

function normalizePostUrl(urlStr) {
  if (isRedditPostUrl(urlStr)) {
    return normalizeRedditPostUrl(urlStr);
  }
  if (isXPostUrl(urlStr)) {
    return normalizeXPostUrl(urlStr);
  }
  return normalizeGenericUrl(urlStr);
}

function getSiteKey(urlStr) {
  if (globalThis.SiteSettings?.getSiteKey) {
    return globalThis.SiteSettings.getSiteKey(urlStr);
  }
  if (!urlStr || typeof urlStr !== 'string') return '';
  try {
    let host = '';
    if (urlStr.includes('://')) {
      const url = new URL(urlStr);
      host = url.hostname.toLowerCase();
      if (!host && url.protocol === 'chrome:') {
        host = url.host || url.pathname.replace(/^\/+/g, '');
      }
    } else {
      const url = new URL('https://' + urlStr);
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

function isSiteDefaultEnabled(siteKey) {
  if (globalThis.SiteSettings?.isDefaultEnabled) {
    return globalThis.SiteSettings.isDefaultEnabled(siteKey);
  }
  if (!siteKey || typeof siteKey !== 'string') return false;
  const key = siteKey.toLowerCase();
  return key === 'x.com' || key === 'reddit.com';
}

function isSiteEnabled(siteKey, siteSettings = {}) {
  if (globalThis.SiteSettings?.isEnabled) {
    return globalThis.SiteSettings.isEnabled(siteKey, siteSettings);
  }
  if (!siteKey) return false;
  const key = siteKey.toLowerCase();
  if (siteSettings && typeof siteSettings[key] === 'boolean') {
    return siteSettings[key];
  }
  return isSiteDefaultEnabled(key);
}

function getSiteDisplayName(siteKey) {
  if (globalThis.SiteSettings?.getDisplayName) {
    return globalThis.SiteSettings.getDisplayName(siteKey);
  }
  if (!siteKey) return 'Unknown';
  const key = siteKey.toLowerCase();
  if (key === 'x.com') return 'X (Twitter)';
  if (key === 'reddit.com') return 'Reddit';
  return siteKey;
}

const RedditUrlUtils = {
  isRedditPostUrl,
  normalizeRedditPostUrl
};

const XUrlUtils = {
  isXPostUrl,
  normalizeXPostUrl
};

const SplitViewUrlUtils = {
  detectPlatform,
  isPostUrl,
  normalizePostUrl,
  normalizeGenericUrl,
  isGenericDownloadUrl,
  isGenericAuthOrActionUrl,
  isRedditPostUrl,
  normalizeRedditPostUrl,
  isXPostUrl,
  normalizeXPostUrl,
  getSiteKey,
  isSiteDefaultEnabled,
  isSiteEnabled,
  getSiteDisplayName
};

if (typeof globalThis !== 'undefined') {
  globalThis.RedditUrlUtils = RedditUrlUtils;
  globalThis.XUrlUtils = XUrlUtils;
  globalThis.SplitViewUrlUtils = SplitViewUrlUtils;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SplitViewUrlUtils;
}


