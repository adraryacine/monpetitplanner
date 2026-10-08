import { api } from '../api.js';
import { $, esc, today, addDays, parseDate, timeToMin, MOODS } from '../utils.js';
import { CATEGORIES } from './planning.js';

// Palette catégorielle validée (daltonisme + contraste) — clair / sombre
const PALETTE = {
  light: ['#db2777', '#7c3aed', '#0d9488', '#d97706', '#2563eb', '#65a30d'],
  dark: ['#ec4899', '#8b5cf6', '#0d9488', '#d97706', '#3b82f6', '#65a30d'],
};

let charts = [];
let root;

export function destroy() {
  charts.forEach((c) => c.destroy());
  charts = [];
}

export async function render(main) {
  root = main;
  const t = today();
  const from = addDays(t, -29);
  const [s, logs] = await Promise.all([
    api.get(`stats?from=${from}&to=${t}`),
    api.get(`habit-logs?from=${addDays(t, -400)}&to=${t}`),
  ]);

  // ---------- Indicateurs ----------
  const weekStart = addDays(t, -6);
  const doneWeek = s.doneByDay.filter((d) => d.day >= weekStart).reduce((a, d) => a + d.n, 0);
  const rate = s.totals.total ? Math.round(((s.totals.done || 0) / s.totals.total) * 100) : 0;
  const moods = s.mood.filter((m) => m.mood);
  const avgMood = moods.length ? moods.reduce((a, m) => a + m.mood, 0) / moods.length : null;
  const bestStreak = s.habits.reduce((best, h) => {
    const set = new Set(logs.filter((l) => l.habit_id === h.id).map((l) => l.date));
    let d = set.has(t) ? t : addDays(t, -1);
    let n = 0;
    while (set.has(d)) { n++; d = addDays(d, -1); }
    return n > best.n ? { n, h } : best;
  }, { n: 0, h: null });

  main.innerHTML = `
    <div class="page-head">
      <div><h1 class="page-title">Mes statistiques</h1>
      <p class="page-sub">Regarde tout le chemin parcouru ces 30 derniers jours 🌟</p></div>
    </div>
    <div class="grid kpis">
      <div class="card kpi"><div class="e">✅</div><div><b>${doneWeek}</b><span>tâches terminées en 7 jours</span></div></div>
      <div class="card kpi"><div class="e">🎯</div><div><b>${rate}%</b><span>de toutes mes tâches faites</span></div></div>
      <div class="card kpi"><div class="e">🔥</div><div><b>${bestStreak.n} j</b><span>${bestStreak.h ? `meilleure série : ${esc(bestStreak.h.emoji)} ${esc(bestStreak.h.name)}` : 'série en cours'}</span></div></div>
      <div class="card kpi"><div class="e">${avgMood ? MOODS[Math.round(avgMood) - 1].e : '💗'}</div><div><b>${avgMood ? avgMood.toFixed(1) : '—'}<small style="font-size:14px"> / 5</small></b><span>humeur moyenne</span></div></div>
    </div>
    <div class="grid charts">
      <div class="card chart-card"><h3>📈 Tâches terminées par jour</h3><p class="sub">14 derniers jours</p><div class="chart-box"><canvas id="c-done"></canvas></div></div>
      <div class="card chart-card"><h3>📝 Avancement par liste</h3><p class="sub">Terminées et restantes</p><div class="chart-box"><canvas id="c-lists"></canvas></div></div>
      <div class="card chart-card"><h3>💗 Mon humeur</h3><p class="sub">30 derniers jours (journal & tableau de bord)</p><div class="chart-box"><canvas id="c-mood"></canvas></div></div>
      <div class="card chart-card"><h3>🌱 Régularité des habitudes</h3><p class="sub">Jours réussis sur les 30 derniers jours</p><div class="chart-box"><canvas id="c-habits"></canvas></div></div>
      <div class="card chart-card"><h3>📅 Mon temps par activité</h3><p class="sub">Heures planifiées sur 30 jours</p><div class="chart-box"><canvas id="c-cats"></canvas></div></div>
      <div class="card chart-card"><h3>😴 Sommeil & 💧 eau</h3><p class="sub">Heures de sommeil par nuit (le nombre de verres d'eau est dans l'info-bulle)</p><div class="chart-box"><canvas id="c-sleep"></canvas></div></div>
    </div>`;

  if (!window.Chart) {
    main.insertAdjacentHTML('beforeend', '<p class="muted">Graphiques indisponibles (Chart.js non chargé).</p>');
    return;
  }

  // ---------- Thème des graphiques ----------
  const css = getComputedStyle(document.documentElement);
  const dark = document.documentElement.dataset.theme === 'nuit';
  const P = dark ? PALETTE.dark : PALETTE.light;
  const ink = css.getPropertyValue('--text-2').trim();
  const grid = css.getPropertyValue('--border').trim();
  const surface = css.getPropertyValue('--surface-solid').trim();
  Chart.defaults.font.family = 'Quicksand, Segoe UI, sans-serif';
  Chart.defaults.font.weight = 600;
  Chart.defaults.color = ink;
  Chart.defaults.plugins.tooltip.backgroundColor = dark ? '#fbe7f5' : '#4a2545';
  Chart.defaults.plugins.tooltip.titleColor = dark ? '#301b3d' : '#fff';
  Chart.defaults.plugins.tooltip.bodyColor = dark ? '#301b3d' : '#fff';
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 10;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.maintainAspectRatio = false;

  const axis = (extra = {}) => ({ grid: { color: grid, drawTicks: false }, border: { display: false }, ticks: { padding: 6 }, ...extra });
  const noGrid = (extra = {}) => ({ grid: { display: false }, border: { display: false }, ...extra });
  const label = (d) => { const x = parseDate(d); return `${x.getDate()}/${x.getMonth() + 1}`; };
  const mk = (id, cfg) => charts.push(new Chart($(id, root), cfg));

  // 1. Tâches terminées par jour
  const days14 = Array.from({ length: 14 }, (_, i) => addDays(t, i - 13));
  const doneMap = Object.fromEntries(s.doneByDay.map((d) => [d.day, d.n]));
  mk('#c-done', {
    type: 'bar',
    data: { labels: days14.map(label), datasets: [{ label: 'Tâches terminées', data: days14.map((d) => doneMap[d] || 0), backgroundColor: P[0], borderRadius: 4, maxBarThickness: 26 }] },
    options: { plugins: { legend: { display: false } }, scales: { x: noGrid(), y: axis({ beginAtZero: true, ticks: { precision: 0 } }) } },
  });

  // 2. Avancement par liste (barres empilées horizontales)
  const lists = s.byList;
  mk('#c-lists', {
    type: 'bar',
    data: {
      labels: lists.map((l) => `${l.emoji} ${l.name}`),
      datasets: [
        { label: 'Terminées', data: lists.map((l) => l.done || 0), backgroundColor: P[0], borderRadius: 4, borderColor: surface, borderWidth: { right: 2 }, borderSkipped: false, maxBarThickness: 24 },
        { label: 'À faire', data: lists.map((l) => l.todo || 0), backgroundColor: P[1], borderRadius: 4, maxBarThickness: 24 },
      ],
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { position: 'top', align: 'start' } },
      scales: { x: axis({ stacked: true, beginAtZero: true, ticks: { precision: 0 } }), y: noGrid({ stacked: true }) },
    },
  });

  // 3. Humeur
  const days30 = Array.from({ length: 30 }, (_, i) => addDays(t, i - 29));
  const moodMap = Object.fromEntries(s.mood.map((m) => [m.date, m]));
  mk('#c-mood', {
    type: 'line',
    data: {
      labels: days30.map(label),
      datasets: [{
        label: 'Humeur', data: days30.map((d) => moodMap[d]?.mood ?? null), borderColor: P[1], backgroundColor: P[1],
        borderWidth: 2, cubicInterpolationMode: 'monotone', spanGaps: true, pointRadius: 4, pointHoverRadius: 7, pointBorderColor: surface, pointBorderWidth: 2,
      }],
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${MOODS[c.raw - 1].e} ${MOODS[c.raw - 1].t}` } } },
      scales: {
        x: noGrid({ ticks: { maxTicksLimit: 8 } }),
        y: axis({
          min: 0.6, max: 5.4,
          afterBuildTicks: (ax) => { ax.ticks = MOODS.map((m) => ({ value: m.v })); },
          ticks: { font: { size: 16 }, callback: (v) => MOODS[v - 1]?.e ?? '' },
        }),
      },
    },
  });

  // 4. Habitudes
  mk('#c-habits', {
    type: 'bar',
    data: {
      labels: s.habits.map((h) => `${h.emoji} ${h.name}`),
      datasets: [{ label: 'Jours réussis', data: s.habits.map((h) => h.n), backgroundColor: P[2], borderRadius: 4, maxBarThickness: 22 }],
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.raw} / 30 jours (${Math.round((c.raw / 30) * 100)}%)` } } },
      scales: { x: axis({ min: 0, max: 30 }), y: noGrid() },
    },
  });

  // 5. Temps par catégorie (5 plus grosses + « Autres »)
  const hours = {};
  s.events.forEach((e) => { hours[e.category] = (hours[e.category] || 0) + Math.max(0, timeToMin(e.end_time) - timeToMin(e.start_time)) / 60; });
  let cats = Object.entries(hours).sort((a, b) => b[1] - a[1]);
  if (cats.length > 6) cats = [...cats.slice(0, 5), ['autres', cats.slice(5).reduce((a, c) => a + c[1], 0)]];
  const catName = (k) => (CATEGORIES[k] ? `${CATEGORIES[k].emoji} ${CATEGORIES[k].label}` : '✨ Autres');
  if (cats.length) {
    mk('#c-cats', {
      type: 'doughnut',
      data: {
        labels: cats.map(([k]) => catName(k)),
        datasets: [{ data: cats.map(([, v]) => Math.round(v * 10) / 10), backgroundColor: P.slice(0, cats.length), borderColor: surface, borderWidth: 2, borderRadius: 4 }],
      },
      options: { cutout: '62%', plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: (c) => ` ${c.raw} h` } } } },
    });
  } else {
    $('#c-cats', root).parentElement.innerHTML = '<div class="empty"><span class="big">📅</span>Aucun événement ces 30 derniers jours</div>';
  }

  // 6. Sommeil (une seule échelle : les heures ; l'eau est en info-bulle)
  mk('#c-sleep', {
    type: 'bar',
    data: {
      labels: days30.map(label),
      datasets: [{ label: 'Sommeil (h)', data: days30.map((d) => moodMap[d]?.sleep ?? null), backgroundColor: P[4], borderRadius: 4, maxBarThickness: 14 }],
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => ` 😴 ${c.raw ?? '—'} h`, afterLabel: (c) => ` 💧 ${moodMap[days30[c.dataIndex]]?.water ?? 0} verres` } },
      },
      scales: { x: noGrid({ ticks: { maxTicksLimit: 8 } }), y: axis({ beginAtZero: true, suggestedMax: 10 }) },
    },
  });
}
