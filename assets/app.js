/* 广东省学位英语（样卷）在线练习 · 交互逻辑 */
/* 题库数据来自 data/exam.js（window.EXAM_DATA）；若缺失则提示 */
if (!window.EXAM_DATA) {
  document.body.innerHTML = '<div style="font:15px/1.9 system-ui;padding:48px;max-width:720px;margin:0 auto">'
    + '<h2>数据文件未加载</h2><p>页面需要 <code>data/exam.js</code>。请确认目录结构完整，'
    + '或运行 <code>python tools/build.py</code> 重新生成。</p></div>';
  throw new Error("EXAM_DATA missing");
}
const EXAM = window.EXAM_DATA;

/* ================= derive ================= */
const LETTERS = ["A", "B", "C", "D"];
const allQ = [];        // {no, partId, options, answer, explain, note, pointsPer}
EXAM.parts.forEach(part => {
  const collect = (list) => list.forEach(q => {
    allQ.push({
      no: q.no, partId: part.id, options: q.options, answer: q.answer,
      explain: q.explain, note: q.note || "",
      grouped: part.kind === "dialogue" || part.kind === "cloze",
      pointsPer: part.points / (part.kind === "reading"
        ? part.passages.reduce((s, p) => s + p.questions.length, 0)
        : (part.questions ? part.questions.length : 1))
    });
  });
  if (part.kind === "dialogue") collect(part.questions);
  else if (part.kind === "reading") part.passages.forEach(p => collect(p.questions));
  else if (part.kind === "single" || part.kind === "cloze") collect(part.questions);
});
allQ.sort((a, b) => a.no - b.no);
const QMAP = new Map(allQ.map(q => [q.no, q]));
const OBJECTIVE_POINTS = allQ.reduce((s, q) => s + q.pointsPer, 0);

/* 完成对话：一段对话 = 一道小题（共用一组选项） */
const GROUPS = [];
EXAM.parts.filter(p => p.kind === "dialogue").forEach(p => {
  p.dialogues.forEach((dg, gi) => {
    const nos = [];
    dg.lines.forEach(l => (l.t.match(/\{(\d+)\}/g) || []).forEach(m => nos.push(Number(m.slice(1, -1)))));
    if (!nos.length) return;
    const first = p.questions.find(q => q.no === nos[0]);
    GROUPS.push({ part: p.id, idx: gi, nos, options: (first && first.options) || [] });
  });
});
const GROUP_OF = new Map();
GROUPS.forEach(g => g.nos.forEach(n => GROUP_OF.set(n, g)));

/* ================= state ================= */
const KEY = "gd-degree-english-sample-v1";
const state = {
  answers: {},         // no -> A/B/C/D
  translation: "",
  essay: "",
  submitted: false,
  remaining: (EXAM.meta.totalMinutes || 120) * 60,
  running: false,
  onlyWrong: false
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s && typeof s === "object") {
      state.answers = s.answers || {};
      state.translation = s.translation || "";
      state.essay = s.essay || "";
      state.submitted = !!s.submitted;
      state.remaining = typeof s.remaining === "number" ? s.remaining : state.remaining;
      state.running = !!s.running && !state.submitted;
    }
  } catch (e) {}
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      answers: state.answers, translation: state.translation, essay: state.essay,
      submitted: state.submitted, remaining: state.remaining, running: state.running
    }));
  } catch (e) {}
}

/* ================= helpers ================= */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function blankHTML(no, label) {
  return `<span class="blank" id="b-${no}" data-no="${no}" role="button" tabindex="0" title="点击选择答案"><span class="num">${label || no}</span><span class="fill" data-fill="${no}"></span></span>`;
}
function inlineBlanks(text) {
  // dialogue: {n}   cloze: {{n}}
  return esc(text)
    .replace(/\{\{(\d+)\}\}/g, (_, n) => blankHTML(n))
    .replace(/\{(\d+)\}/g, (_, n) => blankHTML(n));
}
/* 只作占位的下划线：不弹选项，答案从下面的选项按钮点选 */
function staticBlank(no) {
  return `<span class="blank static" data-blank="${no}"><span class="fill" data-fill="${no}"></span></span>`;
}
function stemHTML(text, no) {
  return esc(text).replace(/_{3,}/g, () => staticBlank(no));
}

/* ================= render ================= */
function optionBlock(q, cls = "") {
  return `<div class="opts ${cls}" data-opts="${q.no}" role="radiogroup" aria-label="第 ${q.no} 题选项">
    ${q.options.map((o, i) => `
      <button class="opt" data-no="${q.no}" data-k="${LETTERS[i]}" type="button" role="radio" aria-checked="false">
        <span class="k">${LETTERS[i]}</span><span class="tx">${esc(o)}</span>
      </button>`).join("")}
  </div>`;
}
function questionBlock(q) {
  return `<div class="q" id="q-${q.no}" data-no="${q.no}">
    <div class="q-head">
      <span class="q-no">${q.no}.</span>
      <div class="q-stem">${stemHTML(q.stem || "", q.no)}<span class="flag-slot" data-flag="${q.no}"></span></div>
    </div>
    ${optionBlock(q)}
    <div class="exp" data-exp="${q.no}" hidden></div>
  </div>`;
}
function optionsOnlyBlock(q, cols) {
  return `<div class="q" id="q-${q.no}" data-no="${q.no}">
    <div class="q-head">
      <span class="q-no">${q.no}.</span>
      <div class="q-stem" style="color:var(--muted);font-size:13px">选择最佳答案<span class="flag-slot" data-flag="${q.no}"></span></div>
    </div>
    ${optionBlock(q, cols || "")}
    <div class="exp" data-exp="${q.no}" hidden></div>
  </div>`;
}
function flagHTML(q, chosen) {
  if (!state.submitted) return "";
  const ok = chosen === q.answer;
  const your = chosen ? `你选 ${chosen}` : "未作答";
  return `<span class="q-flag ${ok ? "right" : "wrong"}">${ok ? "✓ 正确" : "✗ " + your + " · 正确 " + q.answer}</span>`;
}
function expHTML(q) {
  const chosen = state.answers[q.no];
  const ok = chosen === q.answer;
  const head = q.grouped ? `第 ${q.no} 空` : "";
  return `<div class="h">${head} ${ok ? "✓" : "✗"} 正确答案 <span class="ans">${q.answer}</span>
    ${!ok && chosen ? `<span style="color:var(--muted);font-weight:600">（你的答案 ${chosen}）</span>` : ""}
    ${!chosen ? `<span style="color:var(--warn);font-weight:600">（未作答）</span>` : ""}</div>
    <div>${esc(q.explain)}</div>
    ${q.note ? `<div class="note">注：${esc(q.note)}</div>` : ""}`;
}

function render() {
  const main = $("#main");
  let html = "";
  EXAM.parts.forEach(part => {
    html += `<section class="part" id="part-${part.id}">
      <div class="part-head">
        <div class="part-title">
          <span class="tag">${esc(part.label)}</span>
          <h3>${esc(part.cn)}</h3>
          <div class="part-meta"><span>${part.minutes} 分钟</span><span>${part.points} 分</span></div>
        </div>
        <p class="dirs">${esc(part.directions)}</p>
      </div>
      <div class="part-body">`;

    if (part.kind === "dialogue") {
      const blocks = {};
      part.questions.forEach(q => { blocks[q.no] = q; });
      part.dialogues.forEach((dg, gi) => {
        const grp = GROUPS.find(g => g.part === part.id && g.idx === gi);
        const nos = grp ? grp.nos : [];
        const pool = nos.length ? blocks[nos[0]] : null;
        html += `<div class="dialogue" id="grp-${part.id}-${gi}">
          <h4>${esc(dg.title)}<span class="grp-tag">小题 ${gi + 1}</span></h4>`;
        dg.lines.forEach(l => {
          html += `<div class="line"><span class="spk">${esc(l.s)}:</span> ${inlineBlanks(l.t)}</div>`;
        });
        if (pool) {
          const extra = pool.options.length - nos.length;
          html += `<div class="pool" data-pool="${part.id}-${gi}">
              <div class="pool-h">选项（${pool.options.length} 个备选 → ${nos.length} 个空${extra > 0 ? `，${extra} 个不选` : "，每个只用一次"}）· 点句子里的空格即可作答</div>
              <div class="pool-list">
                ${pool.options.map((o, i) => `<div class="pool-item" data-pool-item="${part.id}-${gi}" data-letter="${LETTERS[i]}"><b>${LETTERS[i]}</b><span>${esc(o)}</span></div>`).join("")}
              </div>
            </div>
            <div class="grp-exp">${nos.map(n => `<div class="exp" data-exp="${n}" hidden></div>`).join("")}</div>`;
        }
        html += `</div>`;
      });
    }

    if (part.kind === "reading") {
      part.passages.forEach((pa, pi) => {
        html += `<div class="passage" id="passage-${part.id}-${pi}">
          <h4>${esc(pa.title)}</h4>
          ${pa.guide ? `<p class="guide">文章导读：${esc(pa.guide)}</p>` : ""}
          ${pa.paras.map(p => `<p class="para">${esc(p)}</p>`).join("")}
        </div>`;
        pa.questions.forEach(q => { html += questionBlock(q); });
      });
    }

    if (part.kind === "single") {
      part.questions.forEach(q => { html += questionBlock(q); });
    }

    if (part.kind === "cloze") {
      // 直接点文章里的空格作答，不再重复列出选项
      html += `<div class="passage cloze">${part.paras.map(p => `<p class="para">${inlineBlanks(p)}</p>`).join("")}</div>
        <p class="guide" style="margin-top:6px">点文章中的空格即可选择该空的选项；交卷后此处显示逐空解析。</p>
        <div class="grp-exp" id="cloze-exp">${part.questions.map(q => `<div class="exp" data-exp="${q.no}" hidden></div>`).join("")}</div>`;
    }

    if (part.kind === "translation") {
      html += `<div class="passage">${part.paras.map(p => `<p class="para">${esc(p)}</p>`).join("")}</div>
        <textarea class="work" id="translationInput" placeholder="在此输入你的译文…" spellcheck="false"></textarea>
        <div class="counter"><span>字数：<b id="transCount">0</b></span><span>建议逐句对应原文，注意后置定语与分译。</span></div>
        <div id="translationAnswer"></div>`;
    }

    if (part.kind === "writing") {
      html += `<div class="task-box">
          <h4>写作题目：${esc(part.topic)}</h4>
          <ol class="outline">${part.outline.map(o => `<li>${esc(o)}</li>`).join("")}</ol>
        </div>
        <textarea class="work" id="essayInput" style="min-height:220px" placeholder="在此用英文写作，不少于 120 词…" spellcheck="false"></textarea>
        <div class="counter"><span>词数：<b id="essayCount">0</b> / 120</span><span id="essayWarn"></span></div>
        <div id="essayAnswer"></div>`;
    }

    html += `</div></section>`;
  });
  main.innerHTML = html;

  // textarea bindings
  const ta1 = $("#translationInput"), ta2 = $("#essayInput");
  if (ta1) {
    ta1.value = state.translation;
    ta1.addEventListener("input", () => {
      state.translation = ta1.value; save();
      $("#transCount").textContent = countZh(ta1.value);
    });
    $("#transCount").textContent = countZh(state.translation);
  }
  if (ta2) {
    ta2.value = state.essay;
    ta2.addEventListener("input", () => {
      state.essay = ta2.value; save(); updateEssayCount();
    });
    updateEssayCount();
  }

  // nav + sheet
  renderNav();
  renderSheet();
  syncAll();
}

function countZh(s) {
  const t = (s || "").replace(/\s+/g, "");
  return t.length;
}
function countWords(s) {
  const t = (s || "").trim();
  if (!t) return 0;
  return t.split(/[\s,.;:!?"'()\[\]]+/).filter(Boolean).length;
}
function updateEssayCount() {
  const n = countWords(state.essay);
  const el = $("#essayCount"); if (!el) return;
  el.textContent = n;
  const warn = $("#essayWarn");
  if (warn) warn.innerHTML = n === 0 ? "" : (n < 120 ? `<span class="warn">还差 ${120 - n} 词</span>` : "✓ 已达到词数要求");
}

function renderNav() {
  const nav = $("#navlist");
  nav.innerHTML = EXAM.parts.map(p => {
    const cnt = (p.kind === "translation" || p.kind === "writing")
      ? `${p.points} 分`
      : `${(p.kind === "reading" ? p.passages.reduce((s, x) => s + x.questions.length, 0) : p.questions.length)} 题`;
    return `<a href="#part-${p.id}"><span>${esc(p.label)} ${esc(p.cn)}</span><span class="n">${cnt}</span></a>`;
  }).join("");
}

/* ================= answer sheet ================= */
function renderSheet() {
  const html = allQ.map(q => {
    const a = state.answers[q.no];
    let cls = "cell";
    if (state.submitted) {
      if (!a) cls += " miss wrong";
      else cls += (a === q.answer ? " right" : " wrong");
    } else if (a) cls += " done";
    return `<button class="${cls}" data-goto="${q.no}" title="第 ${q.no} 题">${q.no}</button>`;
  }).join("");
  ["#sheetSide", "#sheetDrawer"].forEach(sel => {
    const el = $(sel); if (el) el.innerHTML = html;
  });
}

/* ================= sync ================= */
function syncQuestion(q) {
  const chosen = state.answers[q.no];
  $$(`.opt[data-no="${q.no}"]`).forEach(btn => {
    const k = btn.dataset.k;
    btn.classList.toggle("sel", chosen === k && !state.submitted);
    btn.classList.remove("ok", "bad");
    if (state.submitted) {
      if (k === q.answer) btn.classList.add("ok");
      else if (k === chosen) btn.classList.add("bad");
    }
    btn.setAttribute("aria-checked", chosen === k ? "true" : "false");
  });
  const opts = $(`[data-opts="${q.no}"]`);
  if (opts) opts.classList.toggle("locked", state.submitted);

  // inline blanks
  $$(`[data-fill="${q.no}"]`).forEach(sp => {
    const opt = chosen ? q.options[LETTERS.indexOf(chosen)] : "";
    const blk = sp.closest(".blank");
    const isStatic = blk && blk.classList.contains("static");
    sp.textContent = chosen ? (isStatic ? opt : `${chosen}. ${opt}`) : "";
    if (blk) {
      blk.classList.toggle("filled", !!chosen);
      blk.classList.remove("ok", "err");
      if (state.submitted) blk.classList.add(chosen === q.answer ? "ok" : "err");
    }
  });

  // flag + explanation
  const flag = $(`[data-flag="${q.no}"]`);
  if (flag) flag.innerHTML = flagHTML(q, chosen);
  const exp = $(`[data-exp="${q.no}"]`);
  if (exp) {
    if (state.submitted) {
      exp.hidden = false;
      exp.innerHTML = expHTML(q);
    } else {
      exp.hidden = true;
      exp.innerHTML = "";
    }
  }
}
function syncPills() {
  GROUPS.forEach(g => {
    const used = new Set(g.nos.map(n => state.answers[n]).filter(Boolean));
    $$(`[data-pool-item="${g.part}-${g.idx}"]`).forEach(el => {
      el.classList.toggle("used", used.has(el.dataset.letter));
    });
  });
}
function syncAll() {
  allQ.forEach(syncQuestion);
  syncPills();
  const done = allQ.filter(q => state.answers[q.no]).length;
  const pct = Math.round(done / allQ.length * 100);
  $("#progText").textContent = done;
  $("#statDone").textContent = done;
  $("#sideDone").textContent = done;
  $("#sideLeft").textContent = allQ.length - done;
  $("#ringPct").textContent = pct + "%";
  const arc = $("#ringArc");
  if (arc) arc.setAttribute("stroke-dashoffset", String(207.3 * (1 - done / allQ.length)));
  renderSheet();
  renderTranslationAnswer();
  renderEssayAnswer();
  updateTimerUI();
}

/* ================= 点空 → 原位弹选项，直接作答 ================= */
let popNo = null;
let popAnchor = null;
function applyAnswer(no, k) {
  if (!QMAP.has(no)) return;
  if (state.answers[no] === k) {
    delete state.answers[no];
  } else {
    const g = GROUP_OF.get(no);
    if (g) g.nos.forEach(m => { if (m !== no && state.answers[m] === k) delete state.answers[m]; });
    state.answers[no] = k;
  }
  save(); syncAll();
}
function positionPop() {
  const pop = $("#pop");
  if (!pop || pop.hidden || !popAnchor) return;
  const r = popAnchor.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  const left = Math.min(Math.max(8, r.left - 8), Math.max(8, window.innerWidth - pw - 8));
  let top = r.bottom + 8;
  if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 8);
  top = Math.min(Math.max(8, top), Math.max(8, window.innerHeight - ph - 8));
  pop.style.left = left + "px";
  pop.style.top = top + "px";
  pop.style.visibility = (r.bottom < -140 || r.top > window.innerHeight + 140) ? "hidden" : "visible";
}
function openPop(no, anchor) {
  const q = QMAP.get(no);
  const pop = $("#pop");
  if (!q || !pop) return;
  const cur = state.answers[no];
  pop.innerHTML =
    `<div class="pop-h"><span>第 ${no} 空 · 点一项直接作答</span><span>${cur ? "已选 " + cur : ""}</span></div>` +
    q.options.map((o, i) => {
      const k = LETTERS[i];
      return `<button class="pop-item ${cur === k ? "sel" : ""}" data-no="${no}" data-k="${k}" type="button">
        <b>${k}</b><span>${esc(o)}</span>${cur === k ? "<i>✓</i>" : ""}</button>`;
    }).join("") +
    (cur ? `<div class="pop-foot"><button type="button" id="popClear" data-no="${no}">清除第 ${no} 空的选择</button></div>` : "");
  pop.hidden = false;
  popNo = no;
  popAnchor = anchor;
  const r = anchor.getBoundingClientRect();
  if (r.bottom < 8 || r.top > window.innerHeight - 8) {
    anchor.scrollIntoView({ block: "center", behavior: "smooth" });
    setTimeout(positionPop, 320);
  }
  positionPop();
  requestAnimationFrame(positionPop);
  setTimeout(positionPop, 60);
}
function closePop() {
  const p = $("#pop");
  if (p) p.hidden = true;
  popNo = null;
  popAnchor = null;
}
function jumpTo(no) {
  const el = document.getElementById(`q-${no}`) || document.getElementById(`b-${no}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.animate?.([{ background: "var(--accent-soft)" }, { background: "transparent" }], { duration: 900 });
}

/* ================= interactions ================= */
document.addEventListener("click", (e) => {
  const popItem = e.target.closest(".pop-item");
  if (popItem) { applyAnswer(Number(popItem.dataset.no), popItem.dataset.k); closePop(); return; }
  if (e.target.closest("#popClear")) {
    const btn = e.target.closest("#popClear");
    const no = Number(btn.dataset.no || popNo);
    if (no) { delete state.answers[no]; save(); syncAll(); }
    closePop();
    return;
  }
  const opt = e.target.closest(".opt");
  if (opt) {
    if (state.submitted) return;
    applyAnswer(Number(opt.dataset.no), opt.dataset.k);
    closePop();
    return;
  }
  const blank = e.target.closest(".blank");
  if (blank) {
    const no = Number(blank.dataset.no);
    if (state.submitted) jumpTo(no);
    else openPop(no, blank);
    return;
  }
  const cell = e.target.closest("[data-goto]");
  if (cell) {
    closeDrawer();
    jumpTo(Number(cell.dataset.goto));
  }
  closePop();
});
document.addEventListener("keydown", (e) => {
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "textarea" || tag === "input") return;
  if (e.key === "Escape") { closePop(); return; }
  const activeBlank = document.activeElement?.closest?.(".blank");
  if (activeBlank && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    if (state.submitted) jumpTo(Number(activeBlank.dataset.no));
    else openPop(Number(activeBlank.dataset.no), activeBlank);
    return;
  }
  const k = e.key.toUpperCase();
  if (!"ABCD".includes(k)) return;
  if (activeBlank && !state.submitted) { e.preventDefault(); applyAnswer(Number(activeBlank.dataset.no), k); return; }
  const opt = document.activeElement?.closest?.(".opt");
  if (opt) { e.preventDefault(); opt.click(); }
});

/* ================= timer ================= */
let timerId = null;
function startTimer() {
  if (state.submitted || state.running) return;
  state.running = true; save();
  tick();
  timerId = setInterval(tick, 1000);
}
function tick() {
  if (!state.running || state.submitted) return;
  state.remaining = Math.max(0, state.remaining - 1);
  updateTimerUI();
  if (state.remaining % 5 === 0) save();
  if (state.remaining <= 0) {
    toast("时间到，已自动交卷");
    submit(true);
  }
}
function fmt(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function updateTimerUI() {
  const t = fmt(state.remaining);
  $("#timerText").textContent = t;
  $("#sideTimer").textContent = state.submitted ? "已交卷" : (state.running ? "计时中 · 剩余 " + t : "未开始计时");
  $("#timerChip").classList.toggle("low", state.remaining <= 300 && !state.submitted);
  $("#timerDot").style.background = state.submitted ? "var(--muted)" : (state.running ? "var(--good)" : "var(--warn)");
}

/* ================= submit ================= */
function submit(auto) {
  if (state.submitted) { toast("已经交过卷了"); return; }
  const unanswered = allQ.filter(q => !state.answers[q.no]).length;
  if (!auto) {
    const msg = unanswered
      ? `还有 ${unanswered} 题未作答，确定交卷吗？`
      : "确定交卷并查看评分与解析吗？";
    if (!confirm(msg)) return;
  }
  state.submitted = true;
  state.running = false;
  save();
  if (timerId) clearInterval(timerId);
  syncAll();
  buildScoreCard();
  $("#scoreCard").scrollIntoView({ behavior: "smooth", block: "start" });
  toast("交卷完成，可查看解析");
}

function buildScoreCard() {
  const card = $("#scoreCard");
  card.classList.add("show");
  let total = 0, right = 0;
  const byPart = {};
  EXAM.parts.forEach(p => byPart[p.id] = { got: 0, total: 0, right: 0, count: 0 });
  allQ.forEach(q => {
    const rec = byPart[q.partId];
    rec.total += q.pointsPer; rec.count += 1;
    if (state.answers[q.no] === q.answer) { total += q.pointsPer; right++; rec.got += q.pointsPer; rec.right++; }
  });
  const doneCount = allQ.filter(q => state.answers[q.no]).length;
  const pctAll = Math.round(total / OBJECTIVE_POINTS * 100);
  const usedMin = Math.round(((EXAM.meta.totalMinutes * 60) - state.remaining) / 60);

  const bars = EXAM.parts.map(p => {
    const r = byPart[p.id];
    if (p.kind === "translation" || p.kind === "writing") {
      return `<div class="bar-row"><span>${esc(p.label)} ${esc(p.cn)}</span>
        <div class="bar"><i style="width:0%"></i></div>
        <span class="pct">自评 ${p.points} 分</span></div>`;
    }
    const pc = Math.round(r.got / r.total * 100);
    return `<div class="bar-row"><span>${esc(p.label)} ${esc(p.cn)}</span>
      <div class="bar"><i style="width:${pc}%"></i></div>
      <span class="pct">${fmtNum(r.got)} / ${r.total} 分</span></div>`;
  }).join("");

  card.innerHTML = `<div class="score-top">
      <div class="big-score">${fmtNum(total)}<small>/ 70 客观题</small></div>
      <div class="txt">
        答对 <b>${right}</b> / ${allQ.length} 题，作答 <b>${doneCount}</b> 题，用时约 <b>${usedMin}</b> 分钟。<br>
        客观题得分率 <b>${pctAll}%</b>；另有英译汉 15 分、写作 15 分请对照参考译文与范文自评。
      </div>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn" id="printBtn">打印/导出 PDF</button>
        <button class="btn primary" id="againBtn">再练一次</button>
      </div>
    </div>
    <div class="bars">${bars}</div>
    <div class="score-hint">提示：点击任意题目的选项区可查看该题解析；侧边答题卡中红色为错题，虚线为未作答。客观题总分 70 分，主观题 30 分。</div>`;

  $("#printBtn").addEventListener("click", () => window.print());
  $("#againBtn").addEventListener("click", () => resetAll(true));
}
function fmtNum(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/* ================= subjective answers ================= */
function renderTranslationAnswer() {
  const box = $("#translationAnswer");
  if (!box) return;
  const part = EXAM.parts.find(p => p.kind === "translation");
  if (!state.submitted) { box.innerHTML = ""; return; }
  box.innerHTML = `<div class="refbox">
      <h4>参考译文</h4><p>${esc(part.reference)}</p>
    </div>
    <div class="exp" style="margin-left:0">
      <div class="h">译点解析</div>
      <ol class="notes">${part.notes.map(n => `<li>${esc(n)}</li>`).join("")}</ol>
    </div>`;
}
function renderEssayAnswer() {
  const box = $("#essayAnswer");
  if (!box) return;
  const part = EXAM.parts.find(p => p.kind === "writing");
  if (!state.submitted) { box.innerHTML = ""; return; }
  box.innerHTML = `<div class="exp" style="margin-left:0"><div class="h">写作思路</div><div>${esc(part.ideas)}</div></div>
    <div class="refbox sample">
      <h4>参考范文（${countWords(part.sample.join(" "))} 词）</h4>
      ${part.sample.map(p => `<p>${esc(p)}</p>`).join("")}
    </div>`;
}

/* ================= misc ui ================= */
let toastId = null;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastId);
  toastId = setTimeout(() => t.classList.remove("show"), 2200);
}
function openDrawer() { $("#drawer").classList.add("open"); }
function closeDrawer() { $("#drawer").classList.remove("open"); }
function resetAll(force) {
  if (!force) {
    if (!confirm("确定要清空所有作答并重新开始吗？")) return;
  }
  localStorage.removeItem(KEY);
  state.answers = {}; state.translation = ""; state.essay = "";
  state.submitted = false; state.running = false;
  state.remaining = EXAM.meta.totalMinutes * 60; state.onlyWrong = false;
  if (timerId) clearInterval(timerId);
  $("#scoreCard").classList.remove("show");
  $("#scoreCard").innerHTML = "";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
  toast("已重置，可重新开始练习");
}

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(KEY + ":theme", t); } catch (e) {}
}

/* ================= boot ================= */
(function init() {
  try {
    const t = localStorage.getItem(KEY + ":theme");
    if (t) applyTheme(t);
    else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) applyTheme("dark");
  } catch (e) {}

  load();
  render();

  $("#submitBtnTop").addEventListener("click", () => submit(false));
  $("#submitBtnSide").addEventListener("click", () => submit(false));
  $("#submitBtnDrawer").addEventListener("click", () => submit(false));
  $("#sheetBtn").addEventListener("click", openDrawer);
  $("#sheetBtn2").addEventListener("click", openDrawer);
  $("#drawerClose").addEventListener("click", closeDrawer);
  $("#drawerMask").addEventListener("click", closeDrawer);
  $("#startBtn").addEventListener("click", () => {
    startTimer();
    document.getElementById("part-p1")?.scrollIntoView({ behavior: "smooth" });
    toast("计时开始，加油！");
  });
  $("#resetBtn").addEventListener("click", () => resetAll(false));
  $("#themeBtn").addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });
  $("#wrongBtn").addEventListener("click", () => {
    if (!state.submitted) { toast("交卷后才能筛选错题"); return; }
    let firstWrong = null;
    // 完成对话：一段对话是一道小题，整段都答对才隐藏，解析里标出每个空
    GROUPS.forEach(g => {
      const grpEl = document.getElementById(`grp-${g.part}-${g.idx}`);
      if (!grpEl) return;
      const anyWrong = g.nos.some(n => state.answers[n] !== QMAP.get(n).answer);
      grpEl.style.display = anyWrong ? "" : "none";
      if (anyWrong && !firstWrong) firstWrong = grpEl;
    });
    allQ.forEach(q => {
      if (GROUP_OF.has(q.no)) return;
      const el = document.getElementById(`q-${q.no}`);
      const isWrong = state.answers[q.no] !== q.answer;
      if (el) {
        el.style.display = isWrong ? "" : "none";
        if (isWrong && !firstWrong) firstWrong = el;
      } else {
        // 完形填空没有独立题块，只收起答对的解析
        const exp = document.querySelector(`[data-exp="${q.no}"]`);
        if (exp) {
          exp.style.display = isWrong ? "" : "none";
          if (isWrong && !firstWrong) firstWrong = exp;
        }
      }
    });
    if (firstWrong) firstWrong.scrollIntoView({ behavior: "smooth", block: "center" });
    toast("已切换到错题视图，刷新页面可恢复");
  });

  window.addEventListener("scroll", () => { if (popNo) positionPop(); }, { passive: true });
  window.addEventListener("resize", () => { if (popNo) positionPop(); });

  if (state.submitted) { buildScoreCard(); $("#scoreCard").classList.add("show"); }
  if (state.running && !state.submitted) {
    timerId = setInterval(tick, 1000);
    updateTimerUI();
  }
  updateTimerUI();
})();
