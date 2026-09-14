# Privacy Policy — Acceptance Rate Annotator

_Last updated: 2026-09-14_

Acceptance Rate Annotator is a Chrome extension that shows the admission rate next to U.S. college and university names on web pages.

## What it does with your data

- **Nothing leaves your browser.** The extension makes no network requests. The school dataset is bundled inside the extension package.
- **Page content is processed locally.** The content script reads the text of pages you visit solely to find college names and insert badge elements next to them. That text is not stored, logged, or transmitted.
- **No collection.** The extension does not collect, store, or share browsing history, personal information, or any analytics.
- **One setting is stored.** The on/off toggle is saved via `chrome.storage.sync`, which Chrome may sync across your signed-in Chrome profiles. That is the only data the extension persists.

## Permissions

- `storage` — to remember the on/off toggle.
- Host access to `http://*/*` and `https://*/*` — so the content script can run on any page and find college names in the text.

## Contact

Open an issue at https://github.com/davidz627/acceptance-rate-annotator/issues.
