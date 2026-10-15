# Privacy policy for Split It

Last updated: 2026-10-15

Split It is an open-source browser extension that pairs feeds with a reading pane using Chromium's native Split View API.

## Data collection

The extension does not collect, record, transmit, or sell personal data. It does not track browsing history, search queries, keystrokes, form inputs, credentials, or cookies.

## Local processing and storage

All extension logic runs entirely inside your browser:

- In-memory processing. Link detection and URL normalization run locally in the active tab context.
- Session storage. The extension stores active tab pair identifiers and toolbar toggle states in `chrome.storage.session`. This memory-only storage maintains pairings across service worker idle periods and clears when you close the browser.
- External network requests. The extension makes zero network requests. It contacts no analytics servers, telemetry endpoints, or third-party APIs.

## Permissions

The extension requests two permissions in `manifest.json`:

- `activeTab`. Grants temporary access to the active tab URL when you click the toolbar action icon, allowing Split It to display toggle badge feedback.
- `storage`. Retains session tab pairing IDs in session storage and website enablement preferences in local storage.

Host permissions (`<all_urls>`) allow the extension to coordinate tabs and display linked discussions in the paired reader tab across websites.

## Third parties

The extension does not share or sell data to third parties.

## Source code and issues

The source code is public and verifiable:
- Repository: https://github.com/Vidhan31/split-view-reader
- Issue tracker: https://github.com/Vidhan31/split-view-reader/issues

## Contact

For questions about this policy or the extension:
- Email: rautvidhan31@gmail.com
