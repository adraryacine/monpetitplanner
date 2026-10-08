import { api } from '../api.js';
import { store, refreshBadges } from '../app.js';
import { $, $$, esc, today, formatLong, quoteOfDay, confetti, toast, dueLabel, timeToMin, nowMin, MOODS, tint } from '../utils.js';
import { openTaskModal } from './todo.js';
import { CATEGORIES } from './planning.js';

let root;
let tickTimer;

export async function render(main) {
  root = main;
  const name = store.settings.name || 'toi';
  const h = new Date().getHours();
  const greet = h < 5 ? `Douce nuit ${name} 🌙` : h < 12 ? `Bonjour ${name} ☀️` : h < 18 ? `Coucou ${name} 🌸` : `Bonsoir ${name} 🌙`;

  main.innerHTML = `
    <section class="hero">
      <h1>${esc(greet)}</h1>
      <div class="date">${formatLong(today())}</div>
      <div class="quote">« ${esc(quoteOfDay())} »</div>
    </section>

    <div class="grid dash">
      <div class="card c-tasks">
        <h3>📝 Mes tâches du jour <span class="grow"></span><a class="card-link" href="#/todo">Tout voir →</a></h3>
        <form class="quick-add" id="qa">
          <input class="input" name="title" placeholder="Ajouter une tâche pour aujourd'hui…" autocomplete="off">
          <button class="btn primary icon" aria-label="Ajouter">＋</button>
        </form>
        <div class="scroll-list" id="today-tasks"></div>
      </div>

      <div class="card c-agenda">
        <h3>📅 Mon planning <span class="grow"></span><a class="card-link" href="#/planning">Semaine →</a></h3>
        <div id="agenda"></div>
      </div>

      <div class="card c-progress">
        <h3>🎯 Progression</h3>
        <div id="progress"></div>
      </div>

      <div class="card c-habits">
        <h3>🌱 Mes habitudes <span class="grow"></span><a class="card-link" href="#/habitudes">Gérer →</a></h3>
        <div id="habits"></div>
      </div>

      <div class="card c-mood">
        <h3>💗 Comment je me sens</h3>
        <div class="moods" id="moods"></div>
        <h3 style="margin-top:6px">💧 Hydratation <span class="grow"></span><span class="muted small" id="water-n"></span></h3>
        <div class="water" id="water"></div>
      </div>

      <div class="card c-focus">
        <h3>⏳ Minuteur focus</h3>
        <div class="focus" id="focus"></div>
      </div>
    </div>`;

  $('#qa').onsubmit = async (e) => {
    e.preventDefault();
    const input = e.target.title;
    const title = input.value.trim();
    if (!title) return;
    const lists = await api.get('lists');
    await api.post('tasks', { title, list_id: lists[0]?.id ?? null, due_date: today(), position: Date.now() % 1e9 });
    input.value = '';
    toast('Tâche ajoutée', '🌸');
    loadTasks();
    refreshBadges();
  };

  await Promise.all([loadTasks(), loadAgenda(), loadHabits(), loadMood()]);
  renderFocus();
  tickTimer = setInterval(() => { loadAgenda(); }, 60000);
}

export function destroy() {
  clearInterval(tickTimer);
  focus.onTick = null;
}

// ---------- Tâches + anneau de progression ----------
async function loadTasks() {
  const [tasks, lists] = await Promise.all([api.get('tasks'), api.get('lists')]);
  const t = today();
  const byId = Object.fromEntries(lists.map((l) => [l.id, l]));
  const relevant = tasks.filter((x) => x.due_date && (x.due_date === t || (x.due_date < t && !x.done) || (x.done && x.done_at?.startsWith(t))));
  relevant.sort((a, b) => a.done - b.done || b.priority - a.priority || (a.due_date || '').localeCompare(b.due_date || ''));

  const box = $('#today-tasks', root);
  if (!box) return;
  box.innerHTML = relevant.length
    ? relevant.map((x) => {
      const list = byId[x.list_id];
      const due = dueLabel(x.due_date);
      return `<div class="task-mini ${x.done ? 'done' : ''}" data-id="${x.id}">
          <button class="check ${x.done ? 'done' : ''}" data-act="toggle" aria-label="Terminer"></button>
          <div class="t" data-act="open" style="cursor:pointer">
            <div class="title">${x.priority === 2 ? '🔥 ' : x.priority === 1 ? '⭐ ' : ''}${esc(x.title)}</div>
            <div class="small muted">${list ? `${list.emoji} ${esc(list.name)}` : ''}
              ${due && due.cls === 'late' ? ` · <span class="chip late">${due.text}</span>` : ''}</div>
          </div>
        </div>`;
    }).join('')
    : `<div class="empty"><span class="big">🌷</span>Rien de prévu aujourd'hui… profite !</div>`;

  $$('.task-mini', box).forEach((row) => {
    const task = relevant.find((x) => x.id === Number(row.dataset.id));
    $('[data-act=toggle]', row).onclick = async (e) => {
      const done = !task.done;
      if (done) confetti(e.clientX, e.clientY);
      await api.put(`tasks/${task.id}`, { done });
      loadTasks();
      refreshBadges();
    };
    $('[data-act=open]', row).onclick = () => openTaskModal(task, lists, () => { loadTasks(); refreshBadges(); });
  });

  const done = relevant.filter((x) => x.done).length;
  renderProgress(done, relevant.length);
}

function renderProgress(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const r = 62;
  const c = 2 * Math.PI * r;
  const msg = !total ? 'Ajoute ta première tâche 💕'
    : pct === 100 ? 'Tout est fait, bravo ma belle ! 🎉'
      : pct >= 50 ? 'Plus que la moitié, continue ✨'
        : done ? 'C\'est parti, bien joué 🌸' : 'Une tâche à la fois 🌱';
  $('#progress', root).innerHTML = `
    <div class="progress-ring">
      <svg width="150" height="150" viewBox="0 0 150 150">
        <defs><linearGradient id="pg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#f472b6"/><stop offset="1" stop-color="#c084fc"/></linearGradient></defs>
        <circle cx="75" cy="75" r="${r}" fill="none" stroke="var(--primary-soft)" stroke-width="14"/>
        <circle cx="75" cy="75" r="${r}" fill="none" stroke="url(#pg)" stroke-width="14" stroke-linecap="round"
          stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}" style="transition:stroke-dashoffset .8s"/>
      </svg>
      <div class="val"><b>${pct}%</b><span>${done} / ${total} tâches</span></div>
    </div>
    <div class="progress-msg">${msg}</div>`;
}

// ---------- Agenda du jour ----------
async function loadAgenda() {
  const box = $('#agenda', root);
  if (!box) return;
  const t = today();
  const events = await api.get(`events?from=${t}&to=${t}`);
  const now = nowMin();
  box.innerHTML = events.length
    ? `<div class="timeline scroll-list">${events.map((ev) => {
      const cat = CATEGORIES[ev.category] || CATEGORIES.perso;
      const s = timeToMin(ev.start_time);
      const e = timeToMin(ev.end_time);
      const cls = e <= now ? 'past' : s <= now ? 'now' : '';
      return `<div class="tl-item ${cls}" style="--c:${ev.color || cat.color}">
          <div class="tl-time">${ev.start_time} – ${ev.end_time}${cls === 'now' ? ' · en cours' : ''}</div>
          <div class="tl-title">${cat.emoji} ${esc(ev.title)}</div>
          ${ev.location ? `<div class="tl-loc">📍 ${esc(ev.location)}</div>` : ''}
        </div>`;
    }).join('')}</div>`
    : `<div class="empty"><span class="big">☁️</span>Aucun rendez-vous aujourd'hui<br>
       <a class="card-link" href="#/planning">Planifier quelque chose</a></div>`;
}

// ---------- Habitudes du jour ----------
async function loadHabits() {
  const t = today();
  const [habits, logs] = await Promise.all([api.get('habits'), api.get(`habit-logs?from=${t}&to=${t}`)]);
  const doneSet = new Set(logs.map((l) => l.habit_id));
  const box = $('#habits', root);
  if (!box) return;
  box.innerHTML = habits.length
    ? habits.map((h) => `
      <div class="habit-today ${doneSet.has(h.id) ? 'done' : ''}" data-id="${h.id}" style="${doneSet.has(h.id) ? `background:${tint(h.color, .25)}` : ''}">
        <span class="e">${h.emoji}</span><span class="n">${esc(h.name)}</span>
        <span class="check ${doneSet.has(h.id) ? 'done' : ''}"></span>
      </div>`).join('')
    : `<div class="empty"><span class="big">🌱</span><a class="card-link" href="#/habitudes">Crée ta première habitude</a></div>`;
  $$('.habit-today', box).forEach((row) => {
    row.onclick = async (e) => {
      const r = await api.post(`habits/${row.dataset.id}/toggle`, { date: t });
      if (r.done) confetti(e.clientX, e.clientY, 8);
      loadHabits();
    };
  });
}

// ---------- Humeur & eau ----------
async function loadMood() {
  const entry = await api.get(`journal/${today()}`);
  const moods = $('#moods', root);
  if (!moods) return;
  moods.innerHTML = MOODS.map((m) =>
    `<button class="${entry.mood === m.v ? 'active' : ''}" data-v="${m.v}" title="${m.t}">${m.e}</button>`).join('');
  $$('button', moods).forEach((b) => {
    b.onclick = async () => {
      const v = Number(b.dataset.v);
      await api.put(`journal/${today()}`, { mood: entry.mood === v ? null : v });
      loadMood();
    };
  });

  const goal = 8;
  const water = entry.water || 0;
  $('#water-n', root).textContent = `${water} / ${goal} verres`;
  $('#water', root).innerHTML = Array.from({ length: Math.max(goal, water + 1) }, (_, i) =>
    `<button class="${i < water ? 'full' : ''}" data-i="${i}" title="${i + 1} verre${i ? 's' : ''}">💧</button>`).join('');
  $$('#water button', root).forEach((b) => {
    b.onclick = async () => {
      const i = Number(b.dataset.i);
      const next = i + 1 === water ? i : i + 1;
      await api.put(`journal/${today()}`, { water: next });
      if (next === goal) toast('Objectif hydratation atteint !', '💧');
      loadMood();
    };
  });
}

// ---------- Minuteur Pomodoro (continue même si on change de page) ----------
const focus = {
  modes: { work: { label: 'Concentration', min: 25, emoji: '📚' }, short: { label: 'Petite pause', min: 5, emoji: '☕' }, long: { label: 'Grande pause', min: 15, emoji: '🛋️' } },
  mode: 'work',
  left: 25 * 60,
  running: false,
  timer: null,
  sessions: 0,
  onTick: null,
};

function startFocus() {
  if (focus.running) return;
  focus.running = true;
  focus.timer = setInterval(() => {
    focus.left--;
    if (focus.left <= 0) {
      clearInterval(focus.timer);
      focus.running = false;
      chime();
      if (focus.mode === 'work') {
        focus.sessions++;
        toast('Session terminée, tu mérites une pause !', '🎉');
        setMode(focus.sessions % 4 === 0 ? 'long' : 'short');
      } else {
        toast('Pause terminée, on s\'y remet ?', '💪');
        setMode('work');
      }
    }
    document.title = focus.running ? `${fmt(focus.left)} · ${focus.modes[focus.mode].emoji} Mon petit planner` : 'Mon petit planner';
    focus.onTick?.();
  }, 1000);
}
function pauseFocus() { clearInterval(focus.timer); focus.running = false; document.title = 'Mon petit planner'; }
function setMode(m) { pauseFocus(); focus.mode = m; focus.left = focus.modes[m].min * 60; }
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

function chime() {
  try {
    const ctx = new AudioContext();
    [659, 784, 988].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.type = 'sine';
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.55);
    });
  } catch { /* pas de son disponible */ }
}

function renderFocus() {
  const box = $('#focus', root);
  if (!box) return;
  const m = focus.modes[focus.mode];
  const total = m.min * 60;
  box.innerHTML = `
    <div class="seg">${Object.entries(focus.modes).map(([k, v]) =>
      `<button class="${k === focus.mode ? 'active' : ''}" data-m="${k}">${v.emoji} ${v.min}′</button>`).join('')}</div>
    <div class="time">${fmt(focus.left)}</div>
    <div class="mode">${m.label} · ${focus.sessions} session${focus.sessions > 1 ? 's' : ''} aujourd'hui</div>
    <div class="bar"><i style="width:${(1 - focus.left / total) * 100}%"></i></div>
    <div class="row" style="justify-content:center">
      <button class="btn primary" data-act="go">${focus.running ? '⏸ Pause' : '▶ Démarrer'}</button>
      <button class="btn" data-act="reset">↺</button>
    </div>`;
  $$('[data-m]', box).forEach((b) => { b.onclick = () => { setMode(b.dataset.m); renderFocus(); }; });
  $('[data-act=go]', box).onclick = () => { focus.running ? pauseFocus() : startFocus(); renderFocus(); };
  $('[data-act=reset]', box).onclick = () => { setMode(focus.mode); renderFocus(); };
  focus.onTick = () => {
    const time = $('.time', box);
    if (!time) return;
    if (!focus.running && focus.left === focus.modes[focus.mode].min * 60) return renderFocus();
    time.textContent = fmt(focus.left);
    $('.bar i', box).style.width = `${(1 - focus.left / (focus.modes[focus.mode].min * 60)) * 100}%`;
  };
}
