// ===== Default TXT =====
const DEFAULT_TXT = "words.txt";

// ===== Storage =====
const LS_CARDS = "wordmemo_cards_v2";
const LS_UNKNOWN = "wordmemo_unknown_ids_v2";
const LS_WORDS_SIG = "wordmemo_words_sig_v1";
const LS_CURRENT_FILE = "wordmemo_current_file";

let cards = JSON.parse(localStorage.getItem(LS_CARDS) || "[]");
let unknownIds = JSON.parse(localStorage.getItem(LS_UNKNOWN) || "[]");

let showing = false;

// ===== Session =====
let sessionAllIds = [];
let sessionUnknownIds = [];

const $ = (id) => document.getElementById(id);

// ===== Utils =====
function saveCards() { localStorage.setItem(LS_CARDS, JSON.stringify(cards)); }
function saveUnknown() { localStorage.setItem(LS_UNKNOWN, JSON.stringify(unknownIds)); }
function pushUnique(arr, id) { if (!arr.includes(id)) arr.push(id); }
function resetSession() { sessionAllIds = []; sessionUnknownIds = []; }

// ===== DONE POPUP =====
function donePopup() {
  alert("Done!");
}

// ===== Current file =====
function setCurrentFile(name) {
  localStorage.setItem(LS_CURRENT_FILE, name);
  $("currentFile").textContent = name;
}
function getCurrentFile() {
  return localStorage.getItem(LS_CURRENT_FILE) || "";
}
function loadCurrentFileLabel() {
  $("currentFile").textContent = getCurrentFile() || "–";
}

// ===== Parse =====
function stripLeadingNumber(s) {
  const m = s.match(/^\s*(\d{1,5})\s*(?:[.)：:]|\-)\s*(.+)$/);
  if (!m) return { num: null, rest: s.trim() };
  return { num: m[1], rest: m[2].trim() };
}

function parseText(text) {
  return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(line => {
    const { num, rest } = stripLeadingNumber(line);
    let term = "", meaning = "";

    if (rest.includes("\t")) {
      [term, meaning] = rest.split("\t");
    } else if (rest.includes(" - ")) {
      [term, meaning] = rest.split(" - ");
    } else if (rest.includes("-")) {
      const i = rest.indexOf("-");
      term = rest.slice(0, i);
      meaning = rest.slice(i + 1);
    } else return null;

    if (!term || !meaning) return null;

    return {
      id: crypto.randomUUID(),
      num,
      term: term.trim(),
      meaning: meaning.trim(),
      level: 0,
      due: Date.now()
    };
  }).filter(Boolean);
}

// ===== SRS =====
function nextDue(level) {
  const days = [0, 1, 3, 7, 14, 30];
  return level === 0
    ? Date.now() + 10 * 60 * 1000
    : Date.now() + days[Math.min(level, 5)] * 86400000;
}

// ===== Study Mode =====
const MODE_DUE = "due";
const MODE_UNKNOWN_SESSION = "unknown_session";
let studyMode = MODE_DUE;

let activeUnknownIds = [];
let activeUnknownSet = new Set();

function setModeUI() {
  $("modeBadge").classList.toggle("hidden", studyMode !== MODE_UNKNOWN_SESSION);
  $("btnExitMode").classList.toggle("hidden", studyMode !== MODE_UNKNOWN_SESSION);
}

function enterUnknownSessionMode() {
  if (!sessionUnknownIds.length) return;

  activeUnknownIds = [...sessionUnknownIds];
  activeUnknownSet = new Set(activeUnknownIds);

  const now = Date.now();
  activeUnknownIds.forEach(id => {
    const c = cards.find(x => x.id === id);
    if (c) c.due = now;
  });

  studyMode = MODE_UNKNOWN_SESSION;
  setModeUI();
  showing = false;
  updateUI();
}

function exitUnknownSessionMode() {
  studyMode = MODE_DUE;
  activeUnknownIds = [];
  activeUnknownSet.clear();
  setModeUI();
  updateUI();
}

function getQueue() {
  const now = Date.now();

  if (studyMode === MODE_UNKNOWN_SESSION) {
    if (activeUnknownSet.size === 0) {
      donePopup();               // ✅ DONE popup
      exitUnknownSessionMode();
      return [];
    }
    return cards.filter(c => activeUnknownSet.has(c.id) && c.due <= now);
  }

  return cards.filter(c => c.due <= now);
}

// ===== UI =====
function updateUI() {
  $("stat").textContent = `Cards: ${cards.length}`;
  $("due").textContent = `Due: ${cards.filter(c => c.due <= Date.now()).length}`;

  $("unknownCount").textContent =
    studyMode === MODE_UNKNOWN_SESSION
      ? `Unknown (session): ${activeUnknownSet.size}`
      : `Unknown: ${unknownIds.length}`;

  setModeUI();

  const queue = getQueue();
  if (!queue.length) {
    $("prompt").textContent = cards.length ? "No cards due 🎉" : "Import a txt file to start.";
    $("answer").classList.add("hidden");
    $("btnShow").classList.add("hidden");
    $("gradeRow").classList.add("hidden");
    return;
  }

  const c = queue[0];
  $("prompt").textContent = c.term;

  if (c.num) {
    $("numBadge").textContent = `#${c.num}`;
    $("numBadge").classList.remove("hidden");
  } else {
    $("numBadge").classList.add("hidden");
  }

  if (showing) {
    $("answer").textContent = c.meaning;
    $("answer").classList.remove("hidden");
    $("gradeRow").classList.remove("hidden");
    $("btnShow").classList.add("hidden");
  } else {
    $("answer").classList.add("hidden");
    $("gradeRow").classList.add("hidden");
    $("btnShow").classList.remove("hidden");
  }
}

// ===== Actions =====
$("btnShow").onclick = () => { showing = true; updateUI(); };

function gradeCurrent(knew) {
  const c = getQueue()[0];
  if (!c) return;

  pushUnique(sessionAllIds, c.id);

  if (!knew) {
    pushUnique(sessionUnknownIds, c.id);
    pushUnique(unknownIds, c.id);
    saveUnknown();
  }

  c.level = knew ? Math.min(c.level + 1, 5) : 0;
  c.due = nextDue(c.level);

  if (studyMode === MODE_UNKNOWN_SESSION && knew) {
    activeUnknownSet.delete(c.id);
    activeUnknownIds = activeUnknownIds.filter(id => id !== c.id);

    if (activeUnknownSet.size === 0) {
      saveCards();
      donePopup();               // ✅ DONE popup
      exitUnknownSessionMode();
      return;
    }
  }

  saveCards();
  showing = false;
  updateUI();
}

$("btnKnew").onclick = () => gradeCurrent(true);
$("btnForgot").onclick = () => gradeCurrent(false);

$("btnRepeatUnknown").onclick = () => enterUnknownSessionMode();
$("btnExitMode").onclick = () => exitUnknownSessionMode();

// ===== Init =====
(async function init() {
  loadCurrentFileLabel();

  if (cards.length === 0) {
    const res = await fetch(`${DEFAULT_TXT}?v=${Date.now()}`);
    const text = await res.text();
    cards = parseText(text);
    saveCards();
    setCurrentFile(DEFAULT_TXT);
  }

  updateUI();
})();
