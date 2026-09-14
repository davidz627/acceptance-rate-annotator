# Acceptance Rate Annotator

Personal Chrome extension. Whenever a U.S. college or university name appears on a page, it appends a small badge with that school's admission rate:

> She got into Stanford University <kbd>3.6%</kbd> and UC Berkeley <kbd>11%</kbd> but chose Cal Poly <kbd>29%</kbd>.

Hover a badge for the full school name, location, exact rate, and data date.

## Install (unpacked)

1. `git clone` this repo.
2. Open `chrome://extensions`, turn on **Developer mode** (top right).
3. **Load unpacked** → pick the repo folder.
4. Click the toolbar icon to toggle annotation on/off (setting syncs across your Chrome profiles).

## Data

`data/colleges.js` is generated from the U.S. Department of Education
[College Scorecard](https://collegescorecard.ed.gov/data/) most-recent institution-level file
(`ADM_RATE` = admissions / applicants for the most recent reported cohort). It includes every
predominantly bachelor's-degree school with at least 500 undergrads that reports a rate — about 1,360 schools.

Regenerate (downloads ~25 MB zip, cached in `data/.cache/`):

```sh
node scripts/build-data.mjs            # use cached download
node scripts/build-data.mjs --refresh  # fetch the newest file
```

Matching is exact-case against the Scorecard name, the Scorecard `ALIAS` field, and hand-curated aliases in
`data/aliases.json` (e.g. `MIT`, `UC Berkeley`, `Georgia Tech`). Add aliases there and re-run the build script.
`_blocklist` in that file suppresses Scorecard aliases that are too ambiguous to match on (`Penn`, `Rice`, `Duke`…).

## Limitations

- U.S. schools only (Scorecard has no international data).
- Names that double as common words (`Brown`, `Columbia`, `Rice`, `Duke`) only match with "University"/"College" attached.
- Rates are the overall first-time undergraduate rate; no per-major or early-decision breakdown.
- Doesn't annotate inside editable fields, code blocks, or `<pre>`.

## Layout

```
manifest.json          MV3 manifest
src/content.js         finds names in text nodes, inserts badges, watches DOM mutations
src/content.css        badge styles (green <10% → red 50%+; lower rate = more selective)
src/popup.html/.js     on/off toggle
data/colleges.js       generated dataset (committed so the extension works out of the box)
data/aliases.json      curated aliases + blocklist
scripts/build-data.mjs regenerates data/colleges.js from the Scorecard CSV
scripts/make-icons.mjs regenerates the placeholder icons
```

## Privacy

The extension reads page text locally to find college names and inserts badge elements. It makes no network requests, collects no browsing data, and stores only the on/off toggle in `chrome.storage.sync`.

## Publishing

See [`docs/store-listing.md`](docs/store-listing.md). Build the upload zip with `scripts/package.sh`.
