/*
  Word Memo
  Version: 1.07
  Base: 1.06
  Changelog:
  - Fix: When "Repeat unknown (session)" is clicked, Due now becomes the unknown-only count
  - Add: Repeat-Unknown Mode (temporary queue filter using a snapshot of current sessionUnknownSet)
  - Behavior: Due decreases on every next card within unknown-only mode, then auto-exits back to normal
*/

const DEFAULT_TXT = "words.txt";

// persisted stats
const LS_FORGOT_STATS = "wordmemo_forgot_stats_v1";
const LS_TODAY_STATS = "wordmemo_today_stats_v1"; // { "YYYY-MM-DD": { seen, forgot, knew } }
const LS_REVERSE = "wordmemo_reverse_v1";          // "1" | "0"

let cards = [];
let sessionAllIds = [];
let sessionUnknownSet = new Set();

let showing = false;

// Top10 mode
let top10ModeOn = false;
let top10Set = new Set();

// ✅ Repeat-Unknown mode (NEW)
let repeatUnknownModeOn = false;
let repeatUnknownSet = new Set(); // snapshot at click time

// Reverse mode
let reverseMode = false;

const $ = (id) => document.getElementById(id);

// ---------- Date ----------
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// ---------- Today stats ----------
function loadTodayStatsAll() {
  try { return JSON.parse(localStorage.getItem(LS_TODAY_STATS) || "{}"); }
  catch { return {}; }
}
function saveTodayStatsAll(all) {
  localStorage.setItem(LS_TODAY_STATS, JSON.stringify(all));
}
function getTodayStats() {
  const key = todayKey();
  const all = loadTodayStatsAll();
  if (!all[key]) all[key] = { seen: 0, forgot: 0, knew: 0 };
  return { key, all, stats: all[key] };
}
function bumpToday(field) {
  const { key, all, stats } = getTodayStats();
  stats[field] = (stats[field] || 0) + 1;
  all[key] = stats;
  saveTodayStatsAll(all);
}
function updateStatsUI() {
  const { stats } = getTodayStats();
  if ($("statTodaySeen")) $("statTodaySeen").textContent = `Today Seen: ${stats.seen || 0}`;
  if ($("statTodayForgot")) $("statTodayForgot").textContent = `Forgot: ${stats.forgot || 0}`;
  if ($("statTodayKnew")) $("statTodayKnew").textContent = `Knew: ${stats.knew || 0}`;
}

// ---------- Forgot stats (per-card counts for Top10) ----------
function loadForgotStats() {
  try { return JSON.parse(localStorage.getItem(LS_FORGOT_STATS) || "{}"); }
  catch { return {}; }
}
function saveForgotStats(s) {
  localStorage.setItem(LS_FORGOT_STATS, JSON.stringify(s));
}
function bumpForgotCount(cardId) {
  const k = todayKey();
  const s = loadForgotStats();
  if (!s[k]) s[k] = {};
  s[k][cardId] = (s[k][cardId] || 0) + 1;
  saveForgotStats(s);
}
function getTop10ForgotIdsToday() {
  const day = loadForgotStats()[todayKey()] || {};
  return Object.entries(day)
    .sort((a,b)=>b[1]-a[1])
    .map(e=>e[0])
    .filter(id=>cards.some(c=>c.id===id))
    .slice(0,10);
}

// ---------- Reverse persisted ----------
function loadReverse() {
  try { return localStorage.getItem(LS_REVERSE) === "1"; }
  catch { return false; }
}
function saveReverse(on) {
  localStorage.setItem(LS_REVERSE, on ? "1" : "0");
}

// ---------- Load default ----------
async function loadDefault() {
  if (cards.length) return;
  try {
    const r = await fetch(DEFAULT_TXT);
    if (!r.ok) throw 0;
    cards = parseText(await r.text());
    $("currentFile").textContent = DEFAULT_TXT;
    updateUI();
  } catch {
    $("prompt").textContent = "Failed to load words.txt";
  }
}

// ---------- Parse ----------
function parseText(text) {
  return text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean).map(line=>{
    let t="",m="";
    if (line.includes("\t")) [t,m]=line.split("\t");
    else if (line.includes(" - ")) [t,m]=line.split(" - ");
    else return null;
    return { id:Math.random().toString(36).slice(2), term:t.trim(), meaning:m.trim(), level:0, due:Date.now() };
  }).filter(Boolean);
}

// ---------- SRS ----------
function nextDue(l){ return l===0?Date.now()+600000:Date.now()+[1,3,7,14,30][l-1]*86400000; }

// ✅ Queue priority: RepeatUnknownMode > Top10Mode > Normal
function getQueue(){
  const n=Date.now();

  if (repeatUnknownModeOn) {
    // only repeatUnknownSet cards
    return cards.filter(c => repeatUnknownSet.has(c.id) && c.due <= n);
  }

  if (top10ModeOn) {
    return cards.filter(c => top10Set.has(c.id) && c.due <= n);
  }

  return cards.filter(c => c.due <= n);
}

// ---------- Helpers ----------
function ensureSeenCountedOncePerCard(cardId) {
  const c = cards.find(x => x.id === cardId);
  if (!c) return;
  if (c.__seenTodayKey !== todayKey()) {
    c.__seenTodayKey = todayKey();
    bumpToday("seen");
  }
}

// ✅ Exit helper for repeat-unknown mode when finished
function autoExitRepeatUnknownIfFinished() {
  if (!repeatUnknownModeOn) return;
  if (getQueue().length === 0) {
    repeatUnknownModeOn = false;
    repeatUnknownSet = new Set();
    showing = false;
  }
}

// ---------- UI ----------
function updateUI(){
  // if repeat-unknown mode ended, auto-exit before painting
  autoExitRepeatUnknownIfFinished();

  $("stat").textContent=`Cards: ${cards.length}`;
  $("due").textContent=`Due: ${getQueue().length}`;
  $("unknownCount").textContent=`Unknown: ${sessionUnknownSet.size}`;

  updateStatsUI();

  const q=getQueue();
  if(!q.length){
    $("prompt").textContent="No cards due 🎉";
    $("answer").style.display="none";
    $("btnShow").style.display="none";
    $("gradeRow").style.display="none";
    return;
  }

  const c=q[0];

  ensureSeenCountedOncePerCard(c.id);

  // Reverse mode affects prompt/answer sides
  $("prompt").textContent = reverseMode ? c.meaning : c.term;

  if(showing){
    $("answer").textContent = reverseMode ? c.term : c.meaning;
    $("answer").style.display="block";
    $("gradeRow").style.display="block";
    $("btnShow").style.display="none";
  }else{
    $("answer").style.display="none";
    $("gradeRow").style.display="none";
    $("btnShow").style.display="inline-block";
  }
}

// ---------- Actions ----------
$("btnShow").onclick=()=>{ showing=true; updateUI(); };

$("btnForgot").onclick=()=>{
  const c=getQueue()[0]; if(!c)return;

  bumpToday("forgot");
  bumpForgotCount(c.id);

  sessionAllIds.push(c.id);
  sessionUnknownSet.add(c.id);

  c.level=0; c.due=nextDue(0);

  // In repeat-unknown mode, we still keep the card in the set and it will reappear based on due.
  // Due counter should decrease because this card is no longer due now.
  showing=false; updateUI();
};

$("btnKnew").onclick=()=>{
  const c=getQueue()[0]; if(!c)return;

  bumpToday("knew");

  sessionAllIds.push(c.id);
  sessionUnknownSet.delete(c.id);

  c.level=Math.min(c.level+1,5);
  c.due=nextDue(c.level);

  // In repeat-unknown mode, even if it’s "knew", it drops out of due now and counter decreases.
  showing=false; updateUI();
};

$("btnRepeatAll").onclick=()=>{
  if(!sessionAllIds.length) return;
  if(!confirm("Repeat all (session)?")) return;

  const n=Date.now();
  sessionAllIds.forEach(id=>{ const c=cards.find(x=>x.id===id); if(c)c.due=n; });

  // Leaving other modes for safety
  top10ModeOn=false; top10Set.clear();
  repeatUnknownModeOn=false; repeatUnknownSet.clear();

  showing=false; updateUI();
};

$("btnRepeatUnknown").onclick=()=>{
  if(!sessionUnknownSet.size) return;

  // ✅ Enter repeat-unknown mode using a snapshot of CURRENT unknown ids
  repeatUnknownModeOn = true;
  repeatUnknownSet = new Set(Array.from(sessionUnknownSet));

  // Ensure those unknown cards become due now (only within that set)
  const n=Date.now();
  repeatUnknownSet.forEach(id=>{
    const c = cards.find(x=>x.id===id);
    if (c) c.due = n;
  });

  // Exit other mode if needed
  top10ModeOn=false; top10Set.clear();

  showing=false; updateUI();
};

$("btnTop10Forgot").onclick=()=>{
  const ids=getTop10ForgotIdsToday();
  if(!ids.length) return alert("No 'I forgot' records for today yet.");

  top10ModeOn=true; top10Set=new Set(ids);

  const n=Date.now();
  ids.forEach(id=>{ const c=cards.find(x=>x.id===id); if(c)c.due=n; });

  // Exit repeat-unknown mode if entering top10
  repeatUnknownModeOn=false; repeatUnknownSet.clear();

  showing=false; updateUI();
};

// ---------- Controls ----------
$("btnStats").onclick = () => {
  const panel = $("statsPanel");
  if (!panel) return;
  const isOpen = panel.style.display !== "none";
  panel.style.display = isOpen ? "none" : "block";
  updateStatsUI();
};

$("toggleReverse").onchange = (e) => {
  reverseMode = !!e.target.checked;
  saveReverse(reverseMode);
  showing = false;
  updateUI();
};

// ---------- Import ----------
$("btnImport").onclick=async()=>{
  const f=$("file").files[0]; if(!f)return;
  cards=cards.concat(parseText(await f.text()));
  $("currentFile").textContent=f.name;

  // Exit modes on import
  top10ModeOn=false; top10Set.clear();
  repeatUnknownModeOn=false; repeatUnknownSet.clear();

  showing=false; updateUI();
};

$("btnClear").onclick=async()=>{
  cards=[]; sessionAllIds=[]; sessionUnknownSet.clear();

  top10ModeOn=false; top10Set.clear();
  repeatUnknownModeOn=false; repeatUnknownSet.clear();

  showing=false;

  updateUI();
  await loadDefault();
};

// ---------- Init ----------
(function init(){
  reverseMode = loadReverse();
  if ($("toggleReverse")) $("toggleReverse").checked = reverseMode;
  updateStatsUI();
  loadDefault();
})();
