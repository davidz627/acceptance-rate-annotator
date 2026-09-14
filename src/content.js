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
    for (const s of [school.name, ...(school.aliases || [])]) {
      if (!s) continue;
      const prev = dedupe.get(s);
      if (!prev || (school.size || 0) > (prev.size || 0)) dedupe.set(s, school);
    }
  }
  for (const [text, school] of dedupe) {
    const first = firstToken(text);
    if (!first) continue;
    if (!index.has(first)) index.set(first, []);
    index.get(first).push({ text, school });
  }
  for (const list of index.values()) list.sort((a, b) => b.text.length - a.text.length);

  function firstToken(s) {
    const m = /^[A-Za-z0-9&]+/.exec(s);
    return m ? m[0] : null;
  }

  // ---------- Matching ----------
  function findMatches(text) {
    const out = [];
    const re = /[A-Za-z0-9&]+/g;
    let m;
    while ((m = re.exec(text))) {
      const start = m.index;
      const cands = index.get(m[0]);
      if (!cands) continue;
      if (start > 0 && WORD_CHAR.test(text[start - 1])) continue; // mid-word
      for (const c of cands) {
        if (!text.startsWith(c.text, start)) continue;
        const end = start + c.text.length;
        if (end < text.length && WORD_CHAR.test(text[end])) continue; // e.g. "MITs"
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
  function tier(rate) {
    if (rate < 0.1) return "t1";
    if (rate < 0.25) return "t2";
    if (rate < 0.5) return "t3";
    return "t4";
  }
  function makeBadge(school) {
    const b = document.createElement("span");
    b.className = `${BADGE_CLASS} ${BADGE_CLASS}-${tier(school.rate)}`;
    b.textContent = formatRate(school.rate);
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
