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
const veto = Object.fromEntries(Object.entries(overrides._notFollowedBy || {}).filter(([k]) => !k.startsWith("_")));

// Spelling variants people actually write: drop a leading "The ", and swap St / St. / Saint.
function spellingVariants(s) {
  const out = new Set([s]);
  for (let round = 0; round < 3; round++) {
    for (const t of [...out]) {
      if (/^The /.test(t)) out.add(t.slice(4));
      if (/\bSt\. (?=[A-Z])/.test(t)) { out.add(t.replace(/\bSt\. (?=[A-Z])/g, "St ")); out.add(t.replace(/\bSt\. (?=[A-Z])/g, "Saint ")); }
      if (/\bSt (?=[A-Z])/.test(t)) { out.add(t.replace(/\bSt (?=[A-Z])/g, "St. ")); out.add(t.replace(/\bSt (?=[A-Z])/g, "Saint ")); }
      if (/\bSaint (?=[A-Z])/.test(t)) { out.add(t.replace(/\bSaint (?=[A-Z])/g, "St. ")); out.add(t.replace(/\bSaint (?=[A-Z])/g, "St ")); }
    }
  }
  out.delete(s);
  return [...out];
}

const schools = [];
for (const r of rows.slice(1)) {
  if (r[col.PREDDEG] !== "3") continue; // predominantly bachelor's-degree granting
  const rate = num(r[col.ADM_RATE]);
  const size = num(r[col.UGDS]);
  if (rate == null || rate <= 0 || size == null || size < MIN_UNDERGRADS) continue;
  const name = r[col.INSTNM];
  const aliases = new Set();
  // ALIAS is free text, usually pipe-separated (occasionally "OKWU or OWU").
  // Only keep ALL-CAPS acronyms (UCLA, NYU) and multi-word phrases (UC Berkeley, Penn State).
  // Single capitalised words are far too noisy ("Iowa", "Hope", "Spartans") and must come from aliases.json.
  for (const a of (r[col.ALIAS] === "NA" ? "" : r[col.ALIAS]).split(/[|;,]|\s+or\s+/)) {
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
  // "University of California-Berkeley" is also written with ", ", " ", " - ", " at ", or en/em dashes
  if (name.includes("-")) {
    for (const sep of [", ", " ", " - ", " at ", "\u2013", " \u2013 ", "\u2014", " \u2014 "]) aliases.add(name.replace(/-/g, sep));
  }
  // "Pennsylvania State University-Penn State Harrisburg" -> "Penn State Harrisburg"
  const psu = /^Pennsylvania State University-Penn State (.+)$/.exec(name);
  if (psu) aliases.add(`Penn State ${psu[1]}`);
  for (const a of overrides[name] || []) aliases.add(a);
  const explicit = new Set(aliases);
  for (const s of [name, ...aliases]) for (const v of spellingVariants(s)) if (!blocklist.has(v)) aliases.add(v);
  aliases.delete(name);
  schools.push({
    id: Number(r[col.UNITID]),
    name,
    aliases: [...aliases],
    explicit,
    city: r[col.CITY],
    state: r[col.STABBR],
    rate,
    size,
  });
}
schools.sort((a, b) => b.size - a.size);

// A generated spelling variant must never claim another school's real name or curated alias
// ("Saint John's University" is a school in Minnesota, not a variant of St. John's in New York).
const taken = new Map();
for (const s of schools) { taken.set(s.name, s); for (const a of s.explicit) if (!taken.has(a)) taken.set(a, s); }
for (const s of schools) {
  s.aliases = s.aliases.filter((a) => s.explicit.has(a) || !taken.has(a) || taken.get(a) === s);
  delete s.explicit;
}

// Several unrelated schools share an exact name (three "Bethel University"s). A badge on
// the bare name would be a coin flip, so those names are not matched; their aliases still are.
const nameCount = new Map();
for (const s of schools) nameCount.set(s.name, (nameCount.get(s.name) || 0) + 1);
for (const s of schools) if (nameCount.get(s.name) > 1) s.nomatch = true;
process.stderr.write(`${[...nameCount.values()].filter((n) => n > 1).length} duplicate names marked nomatch\n`);

const names = new Set(schools.map((s) => s.name));
for (const n of Object.keys(overrides)) {
  if (n.startsWith("_")) continue;
  if (!names.has(n)) process.stderr.write(`WARNING: alias override for unknown school "${n}"\n`);
}

const generated = new Date().toISOString().slice(0, 10);
const out = `// Generated by scripts/build-data.mjs on ${generated}
// Source: U.S. Department of Education College Scorecard, most-recent institution-level file (ADM_RATE)
// ${schools.length} predominantly-bachelor's schools with >= ${MIN_UNDERGRADS} undergrads and a reported admission rate
window.COLLEGE_DATA = ${JSON.stringify({ generated, veto, schools })};
`;
writeFileSync(join(DATA_DIR, "colleges.js"), out);
process.stderr.write(`wrote data/colleges.js (${schools.length} schools)\n`);
