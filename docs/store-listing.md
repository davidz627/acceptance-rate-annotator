# Chrome Web Store listing

Copy/paste material for https://chrome.google.com/webstore/devconsole

## Store listing

**Name:** Acceptance Rate Annotator

**Summary (132 chars max):**
Shows the admission rate next to every U.S. college or university name on any web page. Data from the College Scorecard.

**Description:**
Whenever a U.S. college or university name appears on a page, this extension appends a small badge with that school's admission rate — green for the most selective schools, red for the least. Hover a badge to see the full school name, location, exact rate, and the date of the data.

• Covers ~1,360 bachelor's-degree-granting U.S. schools, plus common short names (MIT, UC Berkeley, Georgia Tech, Penn State…)
• Works on any page, including content that loads after the page (feeds, search results)
• Leaves form fields, editors, and code blocks alone
• One-click on/off toggle in the popup

Data source: U.S. Department of Education College Scorecard (ADM_RATE, most recent institution-level file). Rates are the overall first-time undergraduate admission rate. The dataset ships inside the extension; nothing is fetched from the network and nothing about your browsing is collected or sent anywhere.

**Category:** Education
**Language:** English

## Privacy tab

**Single purpose:**
Annotate college and university names on web pages with their admission rate.

**Permission justifications:**
- `storage` — stores the on/off toggle so it persists (synced across the user's Chrome profiles).
- Host permissions (`http://*/*`, `https://*/*`) — the content script has to run on every page to find college names in the text. It reads page text locally, inserts badge elements, and makes no network requests.

**Remote code:** No, I am not using remote code. All code and data are packaged in the extension.

**Data usage:** Check none of the data-collection boxes. Certify:
- Not selling data to third parties
- Not using data for purposes unrelated to the single purpose
- Not using data to determine creditworthiness or for lending

**Privacy policy URL:** (repo is public so this URL resolves):
https://github.com/davidz627/acceptance-rate-annotator/blob/main/PRIVACY.md

## Distribution

**Visibility:** *Unlisted* — installable from the store link, not searchable. Keeps it "just for me" while avoiding Chrome's "disable developer-mode extensions" nag and getting automatic updates.

## Assets

- Icon: `icons/icon128.png` (128×128)
- Screenshot: `dist/screenshot-1280x800.png` (regenerate by loading the extension and capturing any page at 1280×800)
- Upload zip: run `scripts/package.sh` → `dist/acceptance-rate-annotator-<version>.zip`
