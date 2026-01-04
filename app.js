const LS = "wordmemo_cards";
let cards = JSON.parse(localStorage.getItem(LS) || "[]");
let showing = false;

const $ = id => document.getElementById(id);

function save() {
  localStorage.setItem(LS, JSON.stringify(cards));
}

function parseText(text) {
  return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(line => {
    let [a, b] = line.includes("\t")
      ? line.split("\t")
      : line.split("-");
    if (!a || !b) return null;
    return {
      id: crypto.randomUUID(),
      term: a.trim(),
      meaning: b.trim(),
      level: 0,
      due: Date.now()
    };
  }).filter(Boolean);
}

function dueCards() {
  return cards.filter(c => c.due <= Date.now());
}

function nextDue(level) {
  const days = [0, 1, 3, 7, 14, 30];
  return level === 0
    ? Date.now() + 10 * 60 * 1000
    : Date.now() + days[level] * 86400000;
}

function updateUI() {
  $("stat").textContent = `Cards: ${cards.length}`;
  const due = dueCards();
  $("due").textContent = `Due: ${due.length}`;

  if (!due.length) {
    $("prompt").textContent = "No cards due 🎉";
    $("answer").classList.add("hidden");
    return;
  }

  const card = due[0];
  $("prompt").textContent = card.term;

  if (showing) {
    $("answer").textContent = card.meaning;
    $("answer").classList.remove("hidden");
    $("gradeRow").classList.remove("hidden");
    $("btnShow").classList.add("hidden");
  } else {
    $("answer").classList.add("hidden");
    $("gradeRow").classList.add("hidden");
    $("btnShow").classList.remove("hidden");
  }
}

$("btnImport").onclick = async () => {
  const file = $("file").files[0];
  if (!file) return;
  const text = await file.text();
  cards = cards.concat(parseText(text));
  save();
  updateUI();
};

$("btnClear").onclick = () => {
  if (!confirm("Clear all?")) return;
  cards = [];
  save();
  updateUI();
};

$("btnShow").onclick = () => {
  showing = true;
  updateUI();
};

$("btnKnew").onclick = () => {
  const c = dueCards()[0];
  c.level = Math.min(c.level + 1, 5);
  c.due = nextDue(c.level);
  showing = false;
  save();
  updateUI();
};

$("btnForgot").onclick = () => {
  const c = dueCards()[0];
  c.level = 0;
  c.due = nextDue(0);
  showing = false;
  save();
  updateUI();
};

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}

updateUI();
