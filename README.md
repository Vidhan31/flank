# Split It

A Manifest V3 extension for Chromium browsers (version 155 or later) that opens clicked feed posts in native Split View while keeping the main feed open on the left.

## Behavior

1. Open a supported feed in the left tab.
2. Click any post or article. The extension opens the link in a paired right tab with the native Split View API (`splitWithTabId`).
3. Clicking another post updates the right tab with `chrome.tabs.update`, leaving the left tab and its scroll position intact.
4. Closing the right tab or dissolving the split clears the pairing. The next click pairs a new reader tab.

Clicks on these elements stay untouched:
- Upvote, downvote, like, repost, reply, and bookmark buttons
- Author profiles, avatars, and user handles
- Community links, hashtags, and search links
- External links
- Video and audio controls
- Text expanders and spoilers
- Text selections and modifier clicks (Ctrl, Cmd, Shift, Alt)

## Requirements

Chromium 155.0.8059.40 or newer with the Split View API enabled.

## Installation

1. Open your browser extensions page (`chrome://extensions` or `brave://extensions`).
2. Turn on Developer mode.
3. Click Load unpacked.
4. Select this directory.
5. Open a supported feed (such as Reddit or X) and click any post in the feed.

## How it works

- **Click interception.** `content.js` listens for clicks during the capture phase on `window`. When you click a post, it checks `composedPath()` to filter out buttons, profiles, and external links. It stops default navigation and sends the normalized post URL to the background worker.
- **Split creation and fallback.** On the first click from a browsing tab, `background.js` calls `chrome.tabs.create` with `splitWithTabId` and `active: false`. If native split view is unavailable, it creates an adjacent reader tab.
- **Tab reuse and serialization.** On subsequent clicks, `background.js` calls `chrome.tabs.update` with the new post URL. An async queue serializes rapid clicks so tabs never duplicate.
- **Deep native reader navigation.** Reader tabs bypass click interception so you can read deeper threads, replies, and quote tweets without reloads.
- **Popup UI & website toggle.** Clicking the toolbar icon opens the popup UI displaying the active website and an accessible ON/OFF toggle switch. Split functionality is enabled by default on Twitter (X) and Reddit, and disabled on other websites. Preferences persist across browser sessions.
- **Session storage.** Tab pair IDs and disabled states stay in `chrome.storage.session`, keeping pairs linked across service worker restarts.
- **Unsplit detection.** The service worker checks `tab.splitViewId`. If the split dissolves or the reader tab closes, the next click creates a new split.
