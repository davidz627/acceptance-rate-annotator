// Acceptance Rate Annotator — content script.
// Scans text nodes for known college/university names and appends a small badge
// with the school's admission rate. Data comes from data/colleges.js (window.COLLEGE_DATA).
(() => {
  "use strict";
  if (window.__acceptanceRateAnnotatorLoaded) return;
  window.__acceptanceRateAnnotatorLoaded = true;

  const DATA = window.COLLEGE_DATA;
  if (!DATA || !Array.isArray(DATA.schools)) return;

  const MATCH_CLASS = "car-match";
  const BADGE_CLASS = "car-badge";
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION", "CODE", "PRE", "KBD", "SVG", "CANVAS", "IFRAME", "TITLE"]);
  const WORD_CHAR = /[A-Za-z0-9]/;

  // ---------- Index: first token -> candidate strings (longest first) ----------
  // Matching is exact-case. For each word start in a text node we look up
  // candidates by first token and test startsWith, so cost is tiny per node.
  const index = new Map();
  const dedupe = new Map(); // string -> school (prefer larger school on collision)
  for (const school of DATA.schools) {
    for (const s of [school.nomatch ? null : school.name, ...(school.aliases || [])]) {
      if (!s) continue;
      const prev = dedupe.get(s);
      if (!prev || (school.size || 0) > (prev.size || 0)) dedupe.set(s, school);
    }
  }
  for (const [text, school] of dedupe) {
    const first = firstToken(text);
    if (!first) continue;
    if (!index.has(first)) index.set(first, []);
    index.get(first).push({ text, school, short: isShortForm(text) });
  }
  for (const list of index.values()) list.sort((a, b) => b.text.length - a.text.length);

  // Words that, when they directly follow an alias, cancel the match ("Purdue Pharma",
  // "Trinity College Dublin"). Built from _notFollowedBy in data/aliases.json.
  const VETO = DATA.veto || {};

  // Short forms are single words or nicknames ("Cornell", "Penn State", "Georgia Tech") as
  // opposed to full names containing University/College/etc. A short form preceded by another
  // capitalised word is usually part of a person or place name ("Chris Cornell",
  // "Lawrence Berkeley", "North Dakota State"), so it is skipped. Capitalised function words
  // and sentence starters are exempt so "Both Penn State and ..." still matches.
  function isShortForm(s) {
    return /[a-z]/.test(s) && !/\b(University|College|Institute|School|Academy|Polytechnic|Seminary|Conservatory)\b/.test(s);
  }
  const PREV_OK = new Set(("The A An At In On Of And Or To For With From By As But Is Was Are Were Both Between Including " +
    "Like Unlike Near Nearby Its His Her Their Our Your This That These Those Then Than If So Not No Yes Also Only Even Just " +
    "Where When While After Before Since Until Because Although Though However Meanwhile Later Earlier Here There Now Today " +
    "Former Formerly Current Currently Rival Rivals Versus Vs Many Most Some Several All Each Every Another Other Others Two " +
    "Three Four Five Six Seven Eight Nine Ten Given Eventually Following Among Thus What Which Who Whose Why How Whether " +
    "Neither Either Despite Without Within Through Under Over Against Beyond Across Around About Per Via Instead Perhaps Yet " +
    "Still Once Again Often Sometimes Usually Rarely Never Always Already Finally Recently Historically Originally Traditionally " +
    "Similarly Likewise Consequently Therefore Hence Nevertheless Nonetheless Otherwise Moreover Furthermore Additionally Overall " +
    "Indeed Notably Especially Particularly Specifically Generally Typically Mostly Largely Nearly Almost Previously Subsequently " +
    "Ultimately Initially First Second Third Last Next Notable Visit Visiting Attend Attending Attended Entering Enter Join Joined " +
    "Joining Leaving Left Beat Beating Defeated Defeating Host Hosting Hosted Meet Meets Facing Faces Play Plays Playing Welcome " +
    "Congratulations Go Support Inside Outside Top Best Elite Prestigious Nearby Local Public Private Historic Historically").split(" "));
  const PREV_WORD = /(?:^|[^A-Za-z0-9'\u2019.-])([A-Z][A-Za-z'\u2019.-]*)[ \u00a0]+$/;
  const TITLE_OR_INITIAL = /^(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|Prof|Gen|Sen|Rep|Gov|Rev|Fr|[A-Z])\.$/;
  function precededByName(text, start) {
    const m = PREV_WORD.exec(text.slice(Math.max(0, start - 40), start));
    if (!m) return false;
    const prev = m[1];
    if (PREV_OK.has(prev)) return false;
    if (prev.endsWith(".")) return TITLE_OR_INITIAL.test(prev); // "Awards. Cornell" is a sentence start; "Mr. Cornell" is a person
    return true;
  }
  const NEXT_WORD = /^[ \u00a0]*,?[ \u00a0]*([A-Za-z&][A-Za-z'\u2019.&-]*)/;
  function vetoed(alias, text, end) {
    const words = VETO[alias];
    if (!words) return false;
    const m = NEXT_WORD.exec(text.slice(end, end + 40));
    return !!m && words.includes(m[1]);
  }

  function firstToken(s) {
    const m = /^[A-Za-z0-9&]+/.exec(s);
    return m ? m[0] : null;
  }

  // ---------- Matching ----------
  // In ALL-CAPS text ("THE WIT OF OSCAR WILDE", "SWT" in religious texts) acronym aliases
  // like WIT/MIT/SWT are far more likely to be ordinary words, so skip them there.
  function isShouting(text) {
    let upper = 0, lower = 0;
    for (const ch of text) {
      if (ch >= "A" && ch <= "Z") upper++;
      else if (ch >= "a" && ch <= "z") lower++;
    }
    return upper + lower >= 8 && upper / (upper + lower) > 0.8;
  }
  function findMatches(text) {
    const out = [];
    const re = /[A-Za-z0-9&]+/g;
    const shouting = isShouting(text);
    let m;
    while ((m = re.exec(text))) {
      const start = m.index;
      const cands = index.get(m[0]);
      if (!cands) continue;
      if (start > 0 && WORD_CHAR.test(text[start - 1])) continue; // mid-word
      for (const c of cands) {
        if (shouting && !/[a-z]/.test(c.text)) continue; // acronym in ALL-CAPS text
        if (!text.startsWith(c.text, start)) continue;
        const end = start + c.text.length;
        if (end < text.length && WORD_CHAR.test(text[end])) continue; // e.g. "MITs"
        if (vetoed(c.text, text, end)) continue;
        if (c.short && precededByName(text, start)) continue;
        out.push({ start, end, school: c.school });
        re.lastIndex = end; // don't re-match inside this span
        break;
      }
    }
    return out;
  }

  // ---------- DOM ----------
  function formatRate(rate) {
    const pct = rate * 100;
    return (pct < 10 ? pct.toFixed(1) : Math.round(pct)) + "%";
  }
  // Badge colour: a piecewise OKLCH sweep from green at the lowest rate in the dataset
  // to red at 50%; everything at or above 50% is the same red. Most of the range is
  // spent below 25% so the most selective schools are distinguishable from each other.
  // Lightness stays around 0.5-0.57 so white text remains readable throughout.
  // Stops are [rate, L, C, H]; keep the popup legend gradient in sync.
  const MIN_RATE = Math.min(...DATA.schools.map((s) => s.rate));
  const COLOR_STOPS = [
    [MIN_RATE, 0.50, 0.17, 152],
    [0.08, 0.53, 0.17, 142],
    [0.15, 0.56, 0.17, 110],
    [0.25, 0.57, 0.17, 78],
    [0.35, 0.56, 0.18, 55],
    [0.5, 0.52, 0.21, 27],
  ];
  function badgeColor(rate) {
    let v = COLOR_STOPS[COLOR_STOPS.length - 1].slice(1);
    if (rate <= COLOR_STOPS[0][0]) v = COLOR_STOPS[0].slice(1);
    else {
      for (let i = 1; i < COLOR_STOPS.length; i++) {
        const a = COLOR_STOPS[i - 1], b = COLOR_STOPS[i];
        if (rate <= b[0]) {
          const t = (rate - a[0]) / (b[0] - a[0]);
          v = [1, 2, 3].map((k) => a[k] + t * (b[k] - a[k]));
          break;
        }
      }
    }
    return `oklch(${v[0].toFixed(3)} ${v[1].toFixed(3)} ${v[2].toFixed(1)})`;
  }
  function makeBadge(school) {
    const b = document.createElement("span");
    b.className = BADGE_CLASS;
    b.style.background = badgeColor(school.rate);
    b.textContent = formatRate(school.rate);
    b.setAttribute("role", "img");
    b.setAttribute("aria-label", `admission rate ${formatRate(school.rate)}`);
    b.title = `${school.name} (${school.city}, ${school.state})\nAdmission rate: ${(school.rate * 100).toFixed(1)}%\nSource: College Scorecard, data ${DATA.generated}`;
    return b;
  }

  function shouldSkip(el) {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      if (SKIP_TAGS.has(n.tagName)) return true;
      if (n.isContentEditable) return true;
      if (n.classList && (n.classList.contains(MATCH_CLASS) || n.classList.contains(BADGE_CLASS))) return true;
    }
    return false;
  }

  function annotateTextNode(node) {
    const text = node.nodeValue;
    if (!text || text.length < 3) return;
    const matches = findMatches(text);
    if (!matches.length) return;

    const frag = document.createDocumentFragment();
    let cursor = 0;
    for (const { start, end, school } of matches) {
      if (start > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, start)));
      const wrap = document.createElement("span");
      wrap.className = MATCH_CLASS;
      wrap.textContent = text.slice(start, end);
      frag.appendChild(wrap);
      frag.appendChild(makeBadge(school));
      cursor = end;
    }
    if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));
    node.parentNode.replaceChild(frag, node);
  }

  function annotate(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      if (root.parentElement && !shouldSkip(root.parentElement)) annotateTextNode(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
    if (root.nodeType === Node.ELEMENT_NODE && shouldSkip(root)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p || SKIP_TAGS.has(p.tagName) || p.isContentEditable) return NodeFilter.FILTER_REJECT;
        if (p.classList.contains(MATCH_CLASS) || p.classList.contains(BADGE_CLASS)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
    for (const n of nodes) annotateTextNode(n);
  }

  function removeAll() {
    for (const b of document.querySelectorAll("." + BADGE_CLASS)) b.remove();
    for (const w of document.querySelectorAll("." + MATCH_CLASS)) {
      const parent = w.parentNode;
      while (w.firstChild) parent.insertBefore(w.firstChild, w);
      parent.removeChild(w);
      parent.normalize();
    }
  }

  // ---------- Dynamic content ----------
  let pending = new Set();
  let scheduled = false;
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "characterData") pending.add(r.target);
      for (const n of r.addedNodes) pending.add(n);
    }
    if (!scheduled) {
      scheduled = true;
      requestIdleCallback(flush, { timeout: 1000 });
    }
  });
  function flush() {
    scheduled = false;
    const batch = pending;
    pending = new Set();
    for (const n of batch) if (n.isConnected) annotate(n);
  }

  let enabled = false;
  function start() {
    if (enabled) return;
    enabled = true;
    annotate(document.body);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  function stop() {
    if (!enabled) return;
    enabled = false;
    observer.disconnect();
    removeAll();
  }

  chrome.storage.sync.get({ enabled: true }, ({ enabled: on }) => (on ? start() : stop()));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.enabled) changes.enabled.newValue ? start() : stop();
  });
})();
