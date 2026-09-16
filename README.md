# Acceptance Rate Annotator

> **Heads up:** this is a vibe-coded personal tool, built with Claude Code in an afternoon. No guarantees of accuracy, maintenance, or support. Admission rates come straight from the College Scorecard dataset and may be stale or wrong for any given school. Use at your own risk.

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
`_notFollowedBy` cancels a match when a given word follows it (`Purdue Pharma`, `Trinity College Dublin`).

After changing aliases, run `node scripts/wikitest.mjs` (page text is cached in `data/.cache/wiki/`). It runs the
extension's real matcher over college-heavy Wikipedia pages and "bait" pages where a name means something else,
and prints the ambiguous matches and the institution-like phrases it missed. Read it and judge; it isn't pass/fail.

## Limitations

- U.S. schools only (Scorecard has no international data).
- Names that double as common words (`Brown`, `Columbia`, `Rice`, `Duke`) only match with "University"/"College" attached.
- Rates are the overall first-time undergraduate rate; no per-major or early-decision breakdown.
- Doesn't annotate inside editable fields, code blocks, or `<pre>`.
- Acronym aliases (`MIT`, `WIT`, `SWT`) are skipped inside ALL-CAPS text, where they're usually just words.
- Short forms (`Cornell`, `Berkeley`, `Penn State`) are skipped when another capitalised word precedes them
  (`Chris Cornell`, `Lawrence Berkeley National Laboratory`, `North Dakota State`).
- `_notFollowedBy` in `data/aliases.json` cancels a match when a specific word follows it (`Purdue Pharma`,
  `Trinity College Dublin`).
- Names shared by several unrelated schools (`Bethel University`, `Westminster College`) are never matched.

## Layout

```
manifest.json          MV3 manifest
src/content.js         finds names in text nodes, inserts badges, watches DOM mutations
src/content.css        badge styles (colour is set inline: green at the lowest rate → red at 50%+)
src/popup.html/.js     on/off toggle
data/colleges.js       generated dataset (committed so the extension works out of the box)
data/aliases.json      curated aliases + blocklist
scripts/build-data.mjs regenerates data/colleges.js from the Scorecard CSV
scripts/make-icons.mjs regenerates the placeholder icons
scripts/wikitest.mjs   runs the matcher over ~100 Wikipedia articles and lists likely false positives/negatives
```

## Privacy

See [PRIVACY.md](PRIVACY.md). Short version: everything runs locally, nothing is collected or sent anywhere.

## Publishing

See [`docs/store-listing.md`](docs/store-listing.md). Build the upload zip with `scripts/package.sh`.
