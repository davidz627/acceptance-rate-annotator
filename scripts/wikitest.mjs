// Runs the extension's real matcher (lifted from src/content.js) over the plain text of
// Wikipedia articles and reports likely false positives and false negatives. It is a
// real-world smoke test for alias changes, not a unit test: read the output and judge.
//
// Usage: node scripts/wikitest.mjs [--refresh] [Page title ...]
// Page text is fetched via the Wikipedia API and cached in data/.cache/wiki/.
// With no titles it runs the built-in list: college-heavy pages (recall) plus "bait" pages
// where a college name means something else (precision).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, "data", ".cache", "wiki");
mkdirSync(CACHE, { recursive: true });

// ---- load the matcher out of src/content.js so the test can't drift from the extension ----
const src = readFileSync(join(ROOT, "src", "content.js"), "utf8");
const from = src.indexOf("  const index = new Map();");
const to = src.indexOf("  // ---------- DOM ----------");
if (from < 0 || to < 0) throw new Error("content.js markers not found");
const ctx = vm.createContext({ window: {} });
vm.runInContext(readFileSync(join(ROOT, "data", "colleges.js"), "utf8"), ctx);
vm.runInContext(`const DATA = window.COLLEGE_DATA; const WORD_CHAR = /[A-Za-z0-9]/;\n${src.slice(from, to)}\nthis.findMatches = findMatches;`, ctx);
const { findMatches } = ctx;

const DEFAULT_PAGES = [
  // college-heavy pages (recall)
  "Ivy League", "Little Ivies", "Public Ivy", "Hidden Ivies", "Seven Sisters (colleges)", "Claremont Colleges", "Colonial colleges",
  "Association of American Universities", "Big Ten Conference", "Southeastern Conference", "Atlantic Coast Conference", "Big 12 Conference",
  "Pac-12 Conference", "New England Small College Athletic Conference", "Patriot League", "Big East Conference",
  "List of historically black colleges and universities", "Association of Jesuit Colleges and Universities", "University of California",
  "California State University", "State University of New York", "City University of New York", "Liberal arts colleges in the United States",
  "List of research universities in the United States", "Five College Consortium", "Work college", "Rhodes Scholarship",
  "Nobel laureates by university affiliation", "Ivy Plus", "Southern Ivies", "Black Ivy League",
  "Texas A&M University", "University of Massachusetts Amherst", "University of Illinois Urbana-Champaign", "University of Nebraska–Lincoln",
  "Rutgers University", "Ohio State University", "Pennsylvania State University", "University of Colorado Boulder", "Miami University",
  "University of Miami", "Boston College", "Boston University", "Wake Forest University", "Notre Dame", "William & Mary", "Virginia Tech",
  "Georgia Tech", "Caltech", "Rice University", "Duke University", "Brown University", "Columbia University",
  "Washington University in St. Louis", "St. John's University (New York City)", "Saint Louis University", "Emory & Henry College",
  // bait pages: the name means something else here (precision)
  "Ralph Waldo Emerson", "Emerson Electric", "Colgate-Palmolive", "Purdue Pharma", "Yale (company)", "Louis Brandeis", "Chris Cornell",
  "Drexel Burnham Lambert", "Georgetown (Washington, D.C.)", "Georgetown, Guyana", "Syracuse, New York", "Berkeley, California",
  "Princeton, New Jersey", "Lehigh Valley", "Fordham, Bronx", "Clemson, South Carolina", "Marquette, Michigan", "Wellesley, Massachusetts",
  "Villanova, Pennsylvania", "Tufts (surname)", "Northwestern United States", "Northeastern United States", "Ultra-wideband",
  "Kennedy Space Center", "Sales force automation", "MIT License", "Harvard Business Review", "Stanford prison experiment",
  "Duke Ellington", "Brown (color)", "Columbia River", "Trinity College Dublin", "Trinity College", "King's College London",
  "University College London", "Imperial College London", "University of Toronto", "McGill University", "Union College",
  "Westminster College", "Columbia College",
];

const args = process.argv.slice(2);
const refresh = args.includes("--refresh");
const pages = args.filter((a) => a !== "--refresh");
const PAGES = pages.length ? pages : DEFAULT_PAGES;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchText(title) {
  const f = join(CACHE, title.replace(/[^A-Za-z0-9]+/g, "_") + ".txt");
  if (existsSync(f) && !refresh) return readFileSync(f, "utf8");
  const u = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&titles=${encodeURIComponent(title)}`;
  let json;
  for (let attempt = 0; ; attempt++) {
    const body = await (await fetch(u, { headers: { "User-Agent": "acceptance-rate-annotator wikitest (local dev)" } })).text();
    try { json = JSON.parse(body); break; } catch { if (attempt >= 4) throw new Error(body.slice(0, 80)); await sleep(8000 * (attempt + 1)); }
  }
  await sleep(1500); // be polite to the API
  const text = Object.values(json.query.pages)[0].extract || "";
  writeFileSync(f, text);
  return text;
}

// Heuristics for what to surface. Ambiguous = single word or very short alias.
// "Continues" = the match is followed by a capitalised word that isn't a common suffix,
// which often means a longer, different institution name ("Trinity College Dublin").
const AMBIG = (s) => !/\s/.test(s) || s.length <= 5;
const COMMON_SUFFIX = /^(University|College|School|Press|Medical|Law|Business|Hospital|Health|Athletics|Alumni|Board|Department|Professor|President|Library|Museum|Campus|Stadium|Arena|Center|Centre|Student|Students|Football|Basketball|The|In|On|And|Of|For|At|A|An|Is|Was|He|She|It|They|This|That|Its|His|Her|Their|As|By|With|From|To|But|Or|Hall|Institute)$/;
const NAME_RE = /\b(?:(?:The )?University of (?:the )?[A-Z][\w.'&-]*(?:[ ,-]+(?:at |in |of )?[A-Z][\w.'&-]*)*|[A-Z][\w.'&-]*(?: (?:of |and |& |the )?[A-Z][\w.'&-]*)* (?:University|College|Institute of Technology|Polytechnic Institute))\b/g;

const fp = [], fnCount = new Map(), fnExample = new Map();
let placements = 0;
for (const title of PAGES) {
  let text;
  try { text = await fetchText(title); } catch (e) { console.error(`fetch failed: ${title}: ${e.message}`); continue; }
  if (!text) { console.error(`empty page: ${title}`); continue; }
  for (const line of text.split(/\n+/)) {
    const ms = findMatches(line);
    placements += ms.length;
    for (const m of ms) {
      const s = line.slice(m.start, m.end);
      const cont = /^[ ,]+(?:of |in |at |& |and )?([A-Z][A-Za-z.'&-]*)/.exec(line.slice(m.end));
      const continues = cont && !COMMON_SUFFIX.test(cont[1]);
      if (AMBIG(s) || continues) fp.push({ title, s, school: m.school.name, ctx: line.slice(Math.max(0, m.start - 45), m.end + 45).replace(/\s+/g, " ") });
    }
    NAME_RE.lastIndex = 0;
    let n;
    while ((n = NAME_RE.exec(line))) {
      const a = n.index, b = a + n[0].length;
      if (ms.some((m) => m.start < b && m.end > a)) continue;
      fnCount.set(n[0], (fnCount.get(n[0]) || 0) + 1);
      if (!fnExample.has(n[0])) fnExample.set(n[0], title);
    }
  }
}

console.log(`pages: ${PAGES.length}   badge placements: ${placements}`);
console.log("\n=== POSSIBLE FALSE POSITIVES, grouped by alias (ambiguous alias, or the name continues) ===");
const groups = new Map();
for (const r of fp) { const k = `${r.s} -> ${r.school}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
for (const [k, rows] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
  const byPage = new Map();
  for (const r of rows) byPage.set(r.title, (byPage.get(r.title) || 0) + 1);
  console.log(`\n## ${k}  (${rows.length}: ${[...byPage].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t, c]) => `${t} ×${c}`).join(", ")})`);
  const seen = new Set();
  for (const r of rows) { if (seen.size >= 3 || seen.has(r.ctx)) continue; seen.add(r.ctx); console.log(`    …${r.ctx}…`); }
}
console.log("\n=== POSSIBLE FALSE NEGATIVES (institution-like phrase with no match): count, phrase, example page ===");
for (const [k, c] of [...fnCount].sort((a, b) => b[1] - a[1])) if (c >= 2) console.log(String(c).padStart(4), k, ` <${fnExample.get(k)}>`);
