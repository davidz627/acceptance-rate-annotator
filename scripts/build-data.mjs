// Builds data/colleges.js from the U.S. Dept. of Education College Scorecard bulk
// "Most Recent Institution-Level Data" CSV (no API key or rate limit needed).
//
// Usage: node scripts/build-data.mjs [--refresh]
// The zip is cached in data/.cache/; pass --refresh to re-download the latest file.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const CACHE = join(DATA_DIR, ".cache");
const ZIP = join(CACHE, "institution.zip");
const CSV = join(CACHE, "Most-Recent-Cohorts-Institution.csv");
const MIN_UNDERGRADS = 500;

mkdirSync(CACHE, { recursive: true });

if (!existsSync(CSV) || process.argv.includes("--refresh")) {
  // The download link on the data page carries a date stamp, so discover it each time.
  const page = await (await fetch("https://collegescorecard.ed.gov/data/")).text();
  const m = page.match(/https?:\/\/[^"']*Most-Recent-Cohorts-Institution[^"']*\.zip/);
  if (!m) throw new Error("Could not find the institution-level zip link on collegescorecard.ed.gov/data");
  process.stderr.write(`downloading ${m[0]}\n`);
  const res = await fetch(m[0]);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  writeFileSync(ZIP, Buffer.from(await res.arrayBuffer()));
  execFileSync("unzip", ["-o", "-q", ZIP, "Most-Recent-Cohorts-Institution.csv", "-d", CACHE]);
}

// ---- minimal RFC4180-ish CSV parser (handles quoted fields with commas/newlines) ----
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", i = 0, inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

process.stderr.write("parsing csv…\n");
const rows = parseCSV(readFileSync(CSV, "utf8"));
const header = rows[0];
const col = Object.fromEntries(header.map((h, i) => [h, i]));
for (const need of ["UNITID", "INSTNM", "CITY", "STABBR", "PREDDEG", "ADM_RATE", "UGDS", "ALIAS"]) {
  if (!(need in col)) throw new Error(`missing column ${need}`);
}
const num = (v) => (v === "" || v === "NA" || v === "NULL" || v === "PrivacySuppressed" ? null : Number(v));

const overrides = JSON.parse(readFileSync(join(DATA_DIR, "aliases.json"), "utf8"));
const blocklist = new Set(overrides._blocklist || []);

const schools = [];
for (const r of rows.slice(1)) {
  if (r[col.PREDDEG] !== "3") continue; // predominantly bachelor's-degree granting
  const rate = num(r[col.ADM_RATE]);
  const size = num(r[col.UGDS]);
  if (rate == null || rate <= 0 || size == null || size < MIN_UNDERGRADS) continue;
  const name = r[col.INSTNM];
  const aliases = new Set();
  // ALIAS is free text, usually pipe-separated.
  // Only keep ALL-CAPS acronyms (UCLA, NYU) and multi-word phrases (UC Berkeley, Penn State).
  // Single capitalised words are far too noisy ("Iowa", "Hope", "Spartans") and must come from aliases.json.
  for (const a of (r[col.ALIAS] === "NA" ? "" : r[col.ALIAS]).split(/[|;,]/)) {
    const t = a.trim().replace(/\s+/g, " ");
    if (t.length < 3 || t.length > 60 || t === name || blocklist.has(t)) continue;
    const isAcronym = /^[A-Z][A-Z&.-]{1,7}$/.test(t);
    const words = t.split(" ");
    const isPhrase = words.length >= 2 && words.every((w) => w.length >= 2) && /^[A-Z]/.test(t) &&
      !/\b(of|the|at|and|in|Univ|University|College)$/i.test(t) && !/^(University|College|Univ|The) /i.test(t);
    // Drop fragments of the school's own name that don't start it ("New Brunswick", "Main Campus",
    // "College Station" come from comma-splitting "Rutgers, New Brunswick" etc.). Prefixes like
    // "Florida State" or "Rutgers University" are fine.
    const plainName = name.replace(/-/g, " ");
    const idx = plainName.indexOf(t);
    if (idx > 0) continue;
    if (isAcronym || isPhrase) aliases.add(t);
  }
  // "University of California-Berkeley" is also written with ", ", " ", " - ", or en/em dashes
  if (name.includes("-")) {
    for (const sep of [", ", " ", " - ", "\u2013", " \u2013 ", "\u2014", " \u2014 "]) aliases.add(name.replace(/-/g, sep));
  }
  for (const a of overrides[name] || []) aliases.add(a);
  schools.push({
    id: Number(r[col.UNITID]),
    name,
    aliases: [...aliases],
    city: r[col.CITY],
    state: r[col.STABBR],
    rate,
    size,
  });
}
schools.sort((a, b) => b.size - a.size);

const names = new Set(schools.map((s) => s.name));
for (const n of Object.keys(overrides)) {
  if (n.startsWith("_")) continue;
  if (!names.has(n)) process.stderr.write(`WARNING: alias override for unknown school "${n}"\n`);
}

const generated = new Date().toISOString().slice(0, 10);
const out = `// Generated by scripts/build-data.mjs on ${generated}
// Source: U.S. Department of Education College Scorecard, most-recent institution-level file (ADM_RATE)
// ${schools.length} predominantly-bachelor's schools with >= ${MIN_UNDERGRADS} undergrads and a reported admission rate
window.COLLEGE_DATA = ${JSON.stringify({ generated, schools })};
`;
writeFileSync(join(DATA_DIR, "colleges.js"), out);
process.stderr.write(`wrote data/colleges.js (${schools.length} schools)\n`);
