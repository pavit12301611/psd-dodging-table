/* ============================================================
   DodgeTables — random dodging-table practice for students
   - Fully random questions from configurable ranges
   - Typed, MCQ, matching and missing-number questions
   - Configurable: difficulty, question count, timer, mode
   - Full in-site report after submission
   ============================================================ */

(() => {
  "use strict";

  /* ---------------- DOM ---------------- */
  const $ = (id) => document.getElementById(id);

  const setupScreen = $("setupScreen");
  const quizScreen = $("quizScreen");
  const reportScreen = $("reportScreen");

  /* ---------------- State ---------------- */
  const settings = {
    difficulty: "medium",
    tableMin: 2, tableMax: 10,
    multMin: 2, multMax: 10,
    qCount: 20,
    timerMode: "total",          // none | total | perq
    totalTime: 180,              // seconds
    perqTime: 10,                // seconds
    order: "random",             // random | norepeat
    mode: "mul",                 // mul | mixed
    questionType: "typed",       // typed | mcq | match | missing | variety
    sound: true,
  };

  // HARD LIMITS — dodging tables are strictly 2 se 10 tak, kabhi aage nahi.
  const TABLE_ABS_MIN = 2, TABLE_ABS_MAX = 10;
  const MULT_ABS_MIN = 2, MULT_ABS_MAX = 10;

  const DIFF_PRESETS = {
    easy:   { tableMin: 2, tableMax: 5,  multMin: 2, multMax: 10 },
    medium: { tableMin: 2, tableMax: 10, multMin: 2, multMax: 10 },
    hard:   { tableMin: 6, tableMax: 10, multMin: 2, multMax: 10 },
  };

  // Safety net: no matter how settings got set, questions can NEVER
  // go outside tables 2–10 (and multipliers 1–10).
  function enforceLimits() {
    settings.tableMin = Math.min(TABLE_ABS_MAX, Math.max(TABLE_ABS_MIN, settings.tableMin));
    settings.tableMax = Math.min(TABLE_ABS_MAX, Math.max(TABLE_ABS_MIN, settings.tableMax));
    settings.multMin  = Math.min(MULT_ABS_MAX,  Math.max(MULT_ABS_MIN,  settings.multMin));
    settings.multMax  = Math.min(MULT_ABS_MAX,  Math.max(MULT_ABS_MIN,  settings.multMax));
  }

  let quiz = null;               // active quiz object
  let tickInterval = null;

  /* ---------------- Helpers ---------------- */
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const fmtTime = (s) => {
    s = Math.max(0, Math.round(s));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const fmtSec = (s) => (s < 10 ? s.toFixed(1) : Math.round(s).toString()) + "s";

  /* ---------------- Sound (WebAudio, no files) ---------------- */
  let audioCtx = null;
  function beep(freq, dur = 0.12, type = "sine", vol = 0.18, delay = 0) {
    if (!settings.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t = audioCtx.currentTime + delay;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + dur);
    } catch (e) { /* audio not available — ignore */ }
  }
  const sfx = {
    correct: () => { beep(660, 0.1, "sine", 0.16); beep(990, 0.14, "sine", 0.14, 0.08); },
    wrong:   () => beep(180, 0.25, "square", 0.1),
    click:   () => beep(440, 0.05, "sine", 0.08),
    tick:    () => beep(880, 0.04, "sine", 0.06),
    finish:  () => { beep(523, .12); beep(659, .12, "sine", .16, .12); beep(784, .18, "sine", .16, .24); beep(1047, .3, "sine", .14, .36); },
  };

  /* ---------------- Screen switching ---------------- */
  function showScreen(name) {
    [setupScreen, quizScreen, reportScreen].forEach((s) => s.classList.remove("active"));
    $(name).classList.add("active");
    $("homeBtn").classList.toggle("hidden", name === "setupScreen");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ============================================================
     SETUP SCREEN LOGIC
     ============================================================ */
  function wireChips(containerId, key, onPick) {
    const container = $(containerId);
    container.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      container.querySelectorAll(".chip").forEach((c) => c.classList.remove("selected"));
      chip.classList.add("selected");
      sfx.click();
      onPick(chip.dataset[key]);
    });
  }

  wireChips("difficultyChips", "diff", (val) => {
    settings.difficulty = val;
    const custom = $("customRanges");
    if (val === "custom") {
      custom.classList.remove("collapsed");
    } else {
      custom.classList.add("collapsed");
      Object.assign(settings, DIFF_PRESETS[val]);
      syncRangeInputs();
    }
    updateCombosNote();
  });

  wireChips("timerChips", "timer", (val) => {
    settings.timerMode = val;
    $("totalTimeField").classList.toggle("hidden", val !== "total");
    $("perqTimeField").classList.toggle("hidden", val !== "perq");
  });

  wireChips("orderChips", "order", (val) => { settings.order = val; updateCombosNote(); });
  wireChips("modeChips", "mode", (val) => { settings.mode = val; });
  wireChips("questionTypeChips", "qtype", (val) => { settings.questionType = val; });

  // sliders
  function bindRange(id, outId, key, fmt = (v) => v, after) {
    const el = $(id);
    el.addEventListener("input", () => {
      settings[key] = parseInt(el.value, 10);
      $(outId).textContent = fmt(settings[key]);
      if (after) after();
    });
  }

  function clampTableRange() {
    if (settings.tableMin > settings.tableMax) {
      settings.tableMax = settings.tableMin;
      $("tableMax").value = settings.tableMax;
      $("tableMaxOut").textContent = settings.tableMax;
    }
  }
  function clampMultRange() {
    if (settings.multMin > settings.multMax) {
      settings.multMax = settings.multMin;
      $("multMax").value = settings.multMax;
      $("multMaxOut").textContent = settings.multMax;
    }
  }

  bindRange("tableMin", "tableMinOut", "tableMin", (v) => v, () => { settings.difficulty = "custom"; markCustom(); clampTableRange(); updateCombosNote(); });
  bindRange("tableMax", "tableMaxOut", "tableMax", (v) => v, () => { settings.difficulty = "custom"; markCustom(); clampTableRange(); updateCombosNote(); });
  bindRange("multMin", "multMinOut", "multMin", (v) => v, () => { settings.difficulty = "custom"; markCustom(); clampMultRange(); updateCombosNote(); });
  bindRange("multMax", "multMaxOut", "multMax", (v) => v, () => { settings.difficulty = "custom"; markCustom(); clampMultRange(); updateCombosNote(); });
  bindRange("qCount", "qCountOut", "qCount", (v) => v, updateCombosNote);
  bindRange("totalTime", "totalTimeOut", "totalTime", fmtTime);
  bindRange("perqTime", "perqTimeOut", "perqTime", (v) => v);

  function markCustom() {
    const chips = $("difficultyChips").querySelectorAll(".chip");
    chips.forEach((c) => c.classList.toggle("selected", c.dataset.diff === "custom"));
    $("customRanges").classList.remove("collapsed");
  }

  function syncRangeInputs() {
    $("tableMin").value = settings.tableMin;
    $("tableMax").value = settings.tableMax;
    $("multMin").value = settings.multMin;
    $("multMax").value = settings.multMax;
    $("tableMinOut").textContent = settings.tableMin;
    $("tableMaxOut").textContent = settings.tableMax;
    $("multMinOut").textContent = settings.multMin;
    $("multMaxOut").textContent = settings.multMax;
  }

  function totalCombos() {
    return (settings.tableMax - settings.tableMin + 1) * (settings.multMax - settings.multMin + 1);
  }

  function updateCombosNote() {
    const n = totalCombos();
    const extra = settings.qCount > n ? " — repeat questions will appear since you asked for more than that" : "";
    $("combosNote").textContent = `${n} unique combinations available in this range${extra}`;
  }

  /* ============================================================
     QUESTION GENERATION
     ============================================================ */
  function makeChoices(answer) {
    const values = new Set([answer]);
    while (values.size < 4) {
      const offset = rand(-10, 10);
      const candidate = answer + (offset === 0 ? rand(1, 5) : offset);
      if (candidate >= 2 && candidate <= 100) values.add(candidate);
    }
    return shuffle([...values]);
  }

  function makeQuestion(a, b, forceMode) {
    let op = "×";
    let answer = a * b;
    let text = `${a} × ${b}`;
    const mode = forceMode || settings.mode;
    let questionType = settings.questionType === "variety"
      ? ["typed", "mcq", "match", "missing"][rand(0, 3)]
      : settings.questionType;

    if (questionType === "missing") {
      answer = b;
      text = `${a} × ? = ${a * b}`;
    } else if (mode === "mixed" && Math.random() < 0.5) {
      const p = a * b;
      op = "÷";
      answer = b;
      text = `${p} ÷ ${a}`;
    }
    if (questionType === "match") text = `Match ${text} to its answer`;
    const choices = questionType === "mcq" || questionType === "match" ? makeChoices(answer) : null;
    return { text, answer, base: a, mult: b, op, questionType, choices };
  }

  function generateQuestions() {
    const qs = [];
    if (settings.order === "norepeat") {
      // Build all unique pairs, shuffle, take what we need (cycle if asked for more)
      let pairs = [];
      for (let a = settings.tableMin; a <= settings.tableMax; a++)
        for (let b = settings.multMin; b <= settings.multMax; b++)
          pairs.push([a, b]);
      pairs = shuffle(pairs);
      for (let i = 0; i < settings.qCount; i++) {
        const [a, b] = pairs[i % pairs.length];
        qs.push(makeQuestion(a, b));
      }
      return shuffle(qs); // re-shuffle so cycles don't cluster
    }
    // fully random — every combination is possible, pure chance
    for (let i = 0; i < settings.qCount; i++) {
      qs.push(makeQuestion(rand(settings.tableMin, settings.tableMax), rand(settings.multMin, settings.multMax)));
    }
    return qs;
  }

  /* ============================================================
     QUIZ ENGINE
     ============================================================ */
  function startQuiz(questionsOverride, isRetry = false) {
    enforceLimits(); // strictly 2–10 tables, uske aage ek bhi nahi
    const questions = questionsOverride || generateQuestions();
    quiz = {
      questions,
      index: 0,
      results: [],
      streak: 0,
      bestStreak: 0,
      startTime: Date.now(),
      qStartTime: Date.now(),
      timeLeft: settings.timerMode === "total" ? settings.totalTime : settings.timerMode === "perq" ? settings.perqTime : null,
      perqLeft: settings.timerMode === "perq" ? settings.perqTime : null,
      isRetry,
      finished: false,
    };

    $("qTotal").textContent = questions.length;
    $("progressFill").style.width = "0%";
    $("quizTimer").textContent =
      settings.timerMode === "none" ? "∞" : fmtTime(quiz.timeLeft);
    $("quizTimer").classList.remove("low");
    $("perqRingWrap").classList.toggle("hidden", settings.timerMode !== "perq");

    updateStreakUI();
    showScreen("quizScreen");
    renderQuestion();
    startTicker();
  }

  function renderQuestion() {
    const q = quiz.questions[quiz.index];
    $("qIndex").textContent = quiz.index + 1;
    $("questionText").textContent = q.text;
    $("progressFill").style.width = `${(quiz.index / quiz.questions.length) * 100}%`;

    const input = $("answerInput");
    const form = $("answerForm");
    const choiceGrid = $("choiceGrid");
    const usesChoices = q.questionType === "mcq" || q.questionType === "match";
    input.value = "";
    input.classList.remove("shake", "flash-good");
    form.classList.toggle("hidden", usesChoices);
    choiceGrid.classList.toggle("hidden", !usesChoices);
    choiceGrid.innerHTML = "";
    if (usesChoices) {
      q.choices.forEach((choice) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = q.questionType === "match" ? "choice-btn match-choice" : "choice-btn";
        btn.textContent = q.questionType === "match" ? `→  ${choice}` : choice;
        btn.addEventListener("click", () => submitAnswer(false, choice));
        choiceGrid.appendChild(btn);
      });
    } else {
      setTimeout(() => input.focus(), 60);
    }
    $("quizHint").textContent = usesChoices
      ? (q.questionType === "match" ? "Choose the matching answer" : "Choose one answer")
      : (q.questionType === "missing" ? "Type the missing number" : "Type the answer & press Enter");

    quiz.qStartTime = Date.now();
    if (settings.timerMode === "perq") {
      quiz.perqLeft = settings.perqTime;
      updatePerqRing();
    }
  }

  function updatePerqRing() {
    const C = 2 * Math.PI * 26; // r=26
    const frac = quiz.perqLeft / settings.perqTime;
    const fg = $("perqRingFg");
    fg.style.strokeDashoffset = String(C * (1 - Math.max(0, frac)));
    fg.classList.toggle("low", quiz.perqLeft <= 3);
    $("perqNum").textContent = Math.ceil(Math.max(0, quiz.perqLeft));
  }

  function startTicker() {
    clearInterval(tickInterval);
    let lastWhole = null;
    tickInterval = setInterval(() => {
      if (!quiz || quiz.finished) return clearInterval(tickInterval);

      if (settings.timerMode === "total") {
        quiz.timeLeft -= 0.1;
        const w = Math.ceil(quiz.timeLeft);
        if (w !== lastWhole) {
          lastWhole = w;
          $("quizTimer").textContent = fmtTime(quiz.timeLeft);
          $("quizTimer").classList.toggle("low", quiz.timeLeft <= 15);
          if (quiz.timeLeft <= 5.5 && quiz.timeLeft > 0) sfx.tick();
        }
        if (quiz.timeLeft <= 0) return finishQuiz(true);
      } else if (settings.timerMode === "perq") {
        quiz.perqLeft -= 0.1;
        const w = Math.ceil(quiz.perqLeft);
        if (w !== lastWhole) {
          lastWhole = w;
          updatePerqRing();
          if (quiz.perqLeft <= 3.5 && quiz.perqLeft > 0) sfx.tick();
        }
        if (quiz.perqLeft <= 0) return submitAnswer(true); // auto-submit (counts blank as wrong)
      }
    }, 100);
  }

  function submitAnswer(timedOut = false, selectedAnswer = null) {
    if (!quiz || quiz.finished) return;

    const input = $("answerInput");
    const raw = selectedAnswer === null ? input.value.trim() : String(selectedAnswer);
    const q = quiz.questions[quiz.index];
    const elapsed = (Date.now() - quiz.qStartTime) / 1000;

    // Empty & NOT timed out → shake, don't accept
    if (raw === "" && !timedOut) {
      input.classList.remove("shake");
      void input.offsetWidth;
      input.classList.add("shake");
      sfx.wrong();
      return;
    }

    const given = raw === "" ? null : parseInt(raw, 10);
    const correct = given === q.answer;

    quiz.results.push({
      ...q,
      given,
      correct,
      time: elapsed,
      timedOut,
    });

    if (correct) {
      quiz.streak++;
      quiz.bestStreak = Math.max(quiz.bestStreak, quiz.streak);
      sfx.correct();
      input.classList.remove("flash-good");
      void input.offsetWidth;
      input.classList.add("flash-good");
    } else {
      quiz.streak = 0;
      sfx.wrong();
      input.classList.remove("shake");
      void input.offsetWidth;
      input.classList.add("shake");
    }
    updateStreakUI();

    quiz.index++;
    if (quiz.index >= quiz.questions.length) {
      finishQuiz(false);
    } else {
      setTimeout(renderQuestion, correct ? 180 : 350);
    }
  }

  function updateStreakUI() {
    const s = quiz ? quiz.streak : 0;
    const correctCount = quiz ? quiz.results.filter((r) => r.correct).length : 0;
    $("streakPill").textContent = `🔥 Streak: ${s}`;
    $("scorePill").textContent = `✅ ${correctCount} correct`;
    $("streakPill").classList.toggle("hot", s >= 3);
  }

  $("answerForm").addEventListener("submit", (e) => {
    e.preventDefault();
    submitAnswer(false);
  });

  // Digits only — the answer can ONLY be a number, no options anywhere
  $("answerInput").addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/[^0-9]/g, "").slice(0, 6);
  });

  $("endEarlyBtn").addEventListener("click", () => {
    if (quiz && quiz.results.length === 0) {
      stopQuizToSetup();
      return;
    }
    finishQuiz(false, true);
  });

  $("homeBtn").addEventListener("click", stopQuizToSetup);

  function stopQuizToSetup() {
    if (quiz) quiz.finished = true;
    clearInterval(tickInterval);
    showScreen("setupScreen");
  }

  $("soundToggle").addEventListener("click", () => {
    settings.sound = !settings.sound;
    $("soundToggle").textContent = settings.sound ? "🔊" : "🔇";
    if (settings.sound) sfx.click();
  });

  /* ============================================================
     FINISH & REPORT
     ============================================================ */
  function finishQuiz(timeUp, endedEarly = false) {
    if (!quiz || quiz.finished) return;
    quiz.finished = true;
    clearInterval(tickInterval);
    quiz.totalTimeTaken = (Date.now() - quiz.startTime) / 1000;
    quiz.timeUp = timeUp;
    quiz.endedEarly = endedEarly;

    buildReport();
    saveHistory();
    renderHistory();
    showScreen("reportScreen");

    const acc = quiz.results.length ? quiz.results.filter((r) => r.correct).length / quiz.results.length : 0;
    if (acc >= 0.8 && quiz.results.length >= 5) {
      sfx.finish();
      launchConfetti();
    }
  }

  function gradeOf(acc) {
    if (acc >= 0.98) return ["S", "Legendary! 🏆"];
    if (acc >= 0.9) return ["A", "Excellent work! 🌟"];
    if (acc >= 0.75) return ["B", "Great job! 💪"];
    if (acc >= 0.55) return ["C", "Good effort — keep going! 📈"];
    if (acc >= 0.35) return ["D", "Warming up… practice more! 🔁"];
    return ["E", "Don't give up — dodge again! ⚡"];
  }

  function buildReport() {
    const r = quiz.results;
    const total = r.length;
    const correct = r.filter((x) => x.correct).length;
    const acc = total ? correct / total : 0;
    const [grade, praise] = gradeOf(acc);

    $("gradeBadge").textContent = grade;
    $("reportTitle").textContent = praise;

    let sub = `${correct} of ${total} correct`;
    if (quiz.timeUp) sub += " — ⏰ time ran out!";
    else if (quiz.endedEarly) sub += " — ended early";
    if (quiz.isRetry) sub += " • (retry of wrong questions)";
    $("reportSub").textContent = sub;

    $("statScore").textContent = `${correct}/${total}`;
    $("statAcc").textContent = `${Math.round(acc * 100)}%`;
    $("statTime").textContent = fmtTime(quiz.totalTimeTaken);
    $("statAvg").textContent = total ? fmtSec(quiz.totalTimeTaken / total) : "—";

    const correctOnes = r.filter((x) => x.correct);
    $("statFastest").textContent = correctOnes.length
      ? fmtSec(Math.min(...correctOnes.map((x) => x.time)))
      : "—";
    $("statStreak").textContent = quiz.bestStreak;

    // per-question table
    const body = $("reportBody");
    body.innerHTML = "";
    r.forEach((res, i) => {
      const tr = document.createElement("tr");
      tr.className = res.correct ? "right" : "wrong";
      const givenTxt = res.given === null ? (res.timedOut ? "⏰ —" : "skipped") : res.given;
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${res.text}</td>
        <td class="${res.correct ? "ans-right" : "ans-wrong"}">${givenTxt}</td>
        <td>${res.answer}</td>
        <td>${fmtSec(res.time)}</td>
        <td class="mark">${res.correct ? "✅" : "❌"}</td>`;
      body.appendChild(tr);
    });

    buildWeakSpots();

    const wrongCount = total - correct;
    $("retryWrongBtn").classList.toggle("hidden", wrongCount === 0);
  }

  function buildWeakSpots() {
    const list = $("weakList");
    list.innerHTML = "";
    const wrong = quiz.results.filter((x) => !x.correct);

    if (wrong.length === 0) {
      list.innerHTML = `<p class="weak-ok">Perfect — no weak spots! Every table is dodged. 🎉</p>`;
      return;
    }

    // group misses by base table number
    const byTable = {};
    wrong.forEach((w) => {
      const key = w.op === "÷" ? `${w.base} (÷)` : `${w.base}`;
      byTable[key] = (byTable[key] || 0) + 1;
    });

    Object.entries(byTable)
      .sort((a, b) => b[1] - a[1])
      .forEach(([table, count]) => {
        const chip = document.createElement("span");
        chip.className = "weak-chip";
        chip.textContent = `Table of ${table}: ${count} miss${count > 1 ? "es" : ""}`;
        list.appendChild(chip);
      });
  }

  $("retryWrongBtn").addEventListener("click", () => {
    const wrongQs = quiz.results
      .filter((x) => !x.correct)
      .map((w) => makeQuestion(w.base, w.mult, settings.mode));
    startQuiz(shuffle(wrongQs), true);
  });

  $("newTestBtn").addEventListener("click", () => showScreen("setupScreen"));

  $("startBtn").addEventListener("click", () => {
    sfx.click();
    startQuiz();
  });

  /* ============================================================
     HISTORY (localStorage)
     ============================================================ */
  const HIST_KEY = "dodgeTables.history.v1";

  function saveHistory() {
    try {
      const hist = JSON.parse(localStorage.getItem(HIST_KEY) || "[]");
      const r = quiz.results;
      const correct = r.filter((x) => x.correct).length;
      hist.unshift({
        date: Date.now(),
        score: correct,
        total: r.length,
        acc: r.length ? correct / r.length : 0,
        time: Math.round(quiz.totalTimeTaken),
        grade: gradeOf(r.length ? correct / r.length : 0)[0],
        diff: settings.difficulty,
      });
      localStorage.setItem(HIST_KEY, JSON.stringify(hist.slice(0, 12)));
    } catch (e) { /* storage unavailable */ }
  }

  function renderHistory() {
    const list = $("historyList");
    let hist = [];
    try { hist = JSON.parse(localStorage.getItem(HIST_KEY) || "[]"); } catch (e) {}

    if (!hist.length) {
      list.innerHTML = `<p class="history-empty">No attempts yet — your reports will show up here.</p>`;
      $("clearHistoryBtn").classList.add("hidden");
      return;
    }
    $("clearHistoryBtn").classList.remove("hidden");

    const gradeColors = { S: "#ffd700", A: "#2fdd8f", B: "#4ab0ff", C: "#ffb020", D: "#ff8c42", E: "#ff5470" };
    list.innerHTML = "";
    hist.forEach((h) => {
      const d = new Date(h.date);
      const item = document.createElement("div");
      item.className = "history-item";
      const color = gradeColors[h.grade] || "#8b93a7";
      item.innerHTML = `
        <div class="history-grade" style="color:${color};border:1px solid ${color}55;background:${color}14">${h.grade}</div>
        <div class="history-meta">
          <div class="history-score">${h.score}/${h.total} • ${Math.round(h.acc * 100)}% • ${fmtTime(h.time)}</div>
          <div class="history-date">${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} • ${h.diff}</div>
        </div>`;
      list.appendChild(item);
    });
  }

  $("clearHistoryBtn").addEventListener("click", () => {
    localStorage.removeItem(HIST_KEY);
    renderHistory();
  });

  /* ============================================================
     CONFETTI 🎉
     ============================================================ */
  function launchConfetti() {
    const canvas = $("confettiCanvas");
    const ctx = canvas.getContext("2d");
    canvas.width = innerWidth;
    canvas.height = innerHeight;

    const colors = ["#7c5cff", "#00e0b8", "#ff5470", "#ffb020", "#4ab0ff", "#ffffff"];
    const parts = Array.from({ length: 160 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.5,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      vy: 2 + Math.random() * 3.5,
      vx: -1.5 + Math.random() * 3,
      rot: Math.random() * Math.PI,
      vr: -0.12 + Math.random() * 0.24,
      color: colors[(Math.random() * colors.length) | 0],
    }));

    let frames = 0;
    (function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      parts.forEach((p) => {
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      frames++;
      if (frames < 260) requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    })();
  }

  /* ---------------- Learning tables (strictly 2–10) ---------------- */
  function buildLearningTables() {
    const wrap = $("learningTables");
    for (let table = 2; table <= 10; table++) {
      const card = document.createElement("details");
      card.className = "learn-table";
      card.innerHTML = `<summary><span>${table}</span> Table of ${table}<b>+</b></summary>
        <div class="facts">${Array.from({ length: 9 }, (_, i) => {
          const multiplier = i + 2;
          return `<div><span>${table} × ${multiplier}</span><strong>${table * multiplier}</strong></div>`;
        }).join("")}</div>`;
      wrap.appendChild(card);
    }
  }

  $("toggleTablesBtn").addEventListener("click", () => {
    const cards = [...document.querySelectorAll(".learn-table")];
    const openAll = cards.some((card) => !card.open);
    cards.forEach((card) => { card.open = openAll; });
    $("toggleTablesBtn").textContent = openAll ? "Hide all" : "Show all";
  });

  /* ---------------- init ---------------- */
  buildLearningTables();
  syncRangeInputs();
  $("customRanges").classList.add("collapsed");
  updateCombosNote();
  renderHistory();
})();
