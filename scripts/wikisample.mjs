// Precision sample for one alias: picks N random Wikipedia articles that contain the alias
// (via the search API), takes one standalone occurrence per article, and shows whether the
// extension's real matcher badges it. Read the contexts and judge which ones mean the school.
//
// Usage: node scripts/wikisample.mjs <alias> [--n 150] [--resample]
// The sampled title list is saved to data/.cache/wiki/_sample_<alias>.json and article text
// to data/.cache/wiki/<title>.txt (shared with wikitest.mjs), so re-running after a matcher
// change is offline and compares the exact same articles. --resample draws a new title list.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, "data", ".cache", "wiki");
mkdirSync(CACHE, { recursive: true });

const args = process.argv.slice(2);
const resample = args.includes("--resample");
const nIdx = args.indexOf("--n");
const N = nIdx >= 0 ? Number(args[nIdx + 1]) : 150;
const alias = args.find((a, i) => !a.startsWith("--") && !(nIdx >= 0 && i === nIdx + 1));
if (!alias) { console.error("usage: node scripts/wikisample.mjs <alias> [--n 150] [--resample]"); process.exit(1); }

// ---- load the matcher out of src/content.js (same as wikitest.mjs) ----
const src = readFileSync(join(ROOT, "src", "content.js"), "utf8");
const from = src.indexOf("  const index = new Map();");
const to = src.indexOf("  // ---------- DOM ----------");
if (from < 0 || to < 0) throw new Error("content.js markers not found");
const ctx = vm.createContext({ window: {} });
vm.runInContext(readFileSync(join(ROOT, "data", "colleges.js"), "utf8"), ctx);
vm.runInContext(`const DATA = window.COLLEGE_DATA; const WORD_CHAR = /[A-Za-z0-9]/;\n${src.slice(from, to)}\nthis.findMatches = findMatches;`, ctx);
const { findMatches } = ctx;

const UA = { "User-Agent": "acceptance-rate-annotator wikitest (local dev)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(params) {
  const u = `https://en.wikipedia.org/w/api.php?format=json&${params}`;
  for (let attempt = 0; ; attempt++) {
    const body = await (await fetch(u, { headers: UA })).text();
    try {
      const json = JSON.parse(body);
      if (json.query) return json;
      if (attempt >= 4) throw new Error(body.slice(0, 120));
    } catch (e) { if (attempt >= 4) throw e; }
    await sleep(8000 * (attempt + 1));
  }
}
async function fetchText(title) {
  const f = join(CACHE, title.replace(/[^A-Za-z0-9]+/g, "_") + ".txt");
  if (existsSync(f)) return readFileSync(f, "utf8");
  const json = await api(`action=query&prop=extracts&explaintext=1&redirects=1&titles=${encodeURIComponent(title)}`);
  await sleep(800); // be polite to the API
  const text = Object.values(json.query.pages)[0].extract || "";
  writeFileSync(f, text);
  return text;
}

// Seeded so a --resample with the same alias/N draws the same list if search results haven't moved.
let seed = 42;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const hash = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };

// ---- title list: cached, or drawn from random offsets into the search results ----
const sampleFile = join(CACHE, `_sample_${alias.replace(/[^A-Za-z0-9]+/g, "_")}.json`);
let titles;
if (existsSync(sampleFile) && !resample) {
  titles = JSON.parse(readFileSync(sampleFile, "utf8")).titles;
} else {
  const q = encodeURIComponent(`"${alias}"`);
  const first = await api(`action=query&list=search&srsearch=${q}&srnamespace=0&srlimit=1`);
  const total = Math.min(first.query.searchinfo.totalhits, 9990);
  const set = new Set();
  while (set.size < Math.min(N, total)) {
    const off = Math.floor(rnd() * total);
    const r = await api(`action=query&list=search&srsearch=${q}&srnamespace=0&srlimit=5&sroffset=${off}`);
    for (const p of r.query.search) if (set.size < N) set.add(p.title);
    await sleep(500);
  }
  titles = [...set];
  writeFileSync(sampleFile, JSON.stringify({ alias, created: new Date().toISOString(), totalhits: first.query.searchinfo.totalhits, titles }, null, 1));
}

// ---- one standalone occurrence per article ----
// Occurrences inside a longer matched name ("Amherst College", "UMass Amherst") are skipped:
// they say nothing about how the bare alias behaves.
const esc = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rows = [];
let noOcc = 0;
for (const title of titles) {
  let text;
  try { text = await fetchText(title); } catch (e) { console.error(`fetch failed: ${title}: ${e.message}`); continue; }
  const occ = [];
  for (const line of text.split(/\n+/)) {
    const ms = findMatches(line);
    const re = new RegExp(`(?<![A-Za-z0-9])${esc}(?![A-Za-z0-9])`, "g");
    let m;
    while ((m = re.exec(line))) {
      const hit = ms.find((x) => x.start <= m.index && x.end > m.index);
      if (hit && line.slice(hit.start, hit.end) !== alias) continue;
      occ.push({ badged: hit ? hit.school.name : null, ctx: line.slice(Math.max(0, m.index - 70), m.index + alias.length + 70).replace(/\s+/g, " ") });
    }
  }
  if (!occ.length) { noOcc++; continue; }
  rows.push({ title, ...occ[hash(title) % occ.length] });
}

rows.forEach((r, i) => console.log(`${String(i).padStart(3)} ${r.badged ? "B" : "-"} [${r.title}] …${r.ctx}…`));
const badged = rows.filter((r) => r.badged).length;
console.log(`\n"${alias}": ${titles.length} articles sampled, ${rows.length} with a standalone occurrence (${noOcc} only had it inside a longer name)`);
console.log(`badged: ${badged}/${rows.length}` + (badged ? `  (-> ${[...new Set(rows.filter((r) => r.badged).map((r) => r.badged))].join(", ")})` : ""));
