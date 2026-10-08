import { api } from '../api.js';
import {
  $, $$, esc, today, addDays, parseDate, startOfWeek, MONTHS, DAYS_SHORT, modal, confirmBox, toast, confetti,
  swatchesHTML, emojisHTML, bindPickers, tint,
} from '../utils.js';

const HABIT_EMOJIS = ['💧', '🧴', '📖', '🏃‍♀️', '🧘‍♀️', '🥗', '😴', '💊', '🦷', '📵', '✍️', '🎸', '🌿', '🙏', '💰', '🧹', '🐶', '🍎', '☀️', '💅'];
let state = { week: startOfWeek(today()) };
let root;

export async function render(main) {
  root = main;
  main.innerHTML = `
    <div class="page-head">
      <div><h1 class="page-title">Mes habitudes</h1>
      <p class="page-sub">Les petites routines font les grandes victoires 🌱</p></div>
      <button class="btn primary" id="new-habit">＋ Nouvelle habitude</button>
    </div>
    <div class="card" style="margin-bottom:20px">
      <div class="plan-bar" style="margin-bottom:6px">
        <button class="btn icon" id="prev">‹</button>
        <button class="btn icon" id="next">›</button>
        <button class="btn sm" id="this-week">Cette semaine</button>
        <div class="label-range" id="range" style="font-size:17px"></div>
      </div>
      <div style="overflow-x:auto"><table class="habit-table" id="table"></table></div>
    </div>
    <div class="card"><h3>🗓️ Les 5 dernières semaines</h3><div class="grid" id="heat" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))"></div></div>`;
  $('#new-habit', main).onclick = () => openHabitModal();
  $('#prev', main).onclick = () => { state.week = addDays(state.week, -7); draw(); };
  $('#next', main).onclick = () => { state.week = addDays(state.week, 7); draw(); };
  $('#this-week', main).onclick = () => { state.week = startOfWeek(today()); draw(); };
  await draw();
}

/** Série en cours : jours consécutifs cochés jusqu'à aujourd'hui (ou hier si pas encore coché aujourd'hui) */
function streak(dates) {
  let d = today();
  if (!dates.has(d)) d = addDays(d, -1);
  let n = 0;
  while (dates.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

async function draw() {
  const t = today();
  const days = Array.from({ length: 7 }, (_, i) => addDays(state.week, i));
  const from = addDays(t, -400) < days[0] ? addDays(t, -400) : days[0];
  const [habits, logs] = await Promise.all([api.get('habits'), api.get(`habit-logs?from=${from}&to=${days[6] > t ? days[6] : t}`)]);
  const byHabit = new Map(habits.map((h) => [h.id, new Set()]));
  logs.forEach((l) => byHabit.get(l.habit_id)?.add(l.date));

  const a = parseDate(days[0]);
  const b = parseDate(days[6]);
  $('#range', root).textContent = `Semaine du ${a.getDate()} ${MONTHS[a.getMonth()]} au ${b.getDate()} ${MONTHS[b.getMonth()]}`;

  const table = $('#table', root);
  if (!habits.length) {
    table.innerHTML = `<tr><td style="border:none;background:none"><div class="empty"><span class="big">🌱</span>
      Ajoute ta première habitude : boire de l'eau, lire, méditer…</div></td></tr>`;
  } else {
    table.innerHTML = `
      <tr><th></th>${days.map((d, i) => `<th class="${d === t ? 'today' : ''}">${DAYS_SHORT[i]}<br>${parseDate(d).getDate()}</th>`).join('')}<th>Série</th><th>Semaine</th></tr>
      ${habits.map((h) => {
    const set = byHabit.get(h.id);
    const weekDone = days.filter((d) => set.has(d)).length;
    const s = streak(set);
    return `<tr data-id="${h.id}">
          <td><div class="hname" data-act="edit" title="Modifier"><span class="e" style="background:${tint(h.color, .3)}">${h.emoji}</span>${esc(h.name)}</div></td>
          ${days.map((d) => `<td><button class="hcell ${set.has(d) ? 'on' : ''} ${d > t ? 'future' : ''}" data-day="${d}" style="--hc:${tint(h.color, .55)}"
              aria-label="${d}">${set.has(d) ? h.emoji : ''}</button></td>`).join('')}
          <td><span class="streak">${s ? `🔥 ${s} j` : '—'}</span></td>
          <td><span class="pct">${weekDone}/7</span></td>
        </tr>`;
  }).join('')}`;
  }

  $$('tr[data-id]', table).forEach((row) => {
    const habit = habits.find((h) => h.id === Number(row.dataset.id));
    $('[data-act=edit]', row).onclick = () => openHabitModal(habit);
    $$('.hcell', row).forEach((cell) => {
      cell.onclick = async (e) => {
        if (cell.classList.contains('future')) return toast('On ne peut pas cocher le futur 😉', '⏳');
        const r = await api.post(`habits/${habit.id}/toggle`, { date: cell.dataset.day });
        if (r.done) confetti(e.clientX, e.clientY, 8);
        const s = streak(new Set([...byHabit.get(habit.id), cell.dataset.day]));
        if (r.done && [7, 14, 21, 30, 50, 100].includes(s)) toast(`${s} jours d'affilée pour « ${habit.name} » ! Bravo !`, '🏆');
        draw();
      };
    });
  });

  // Grille des 35 derniers jours
  const heatDays = Array.from({ length: 35 }, (_, i) => addDays(t, i - 34));
  $('#heat', root).innerHTML = habits.map((h) => {
    const set = byHabit.get(h.id);
    const n = heatDays.filter((d) => set.has(d)).length;
    return `<div>
      <div class="row"><b>${h.emoji} ${esc(h.name)}</b><span class="grow" style="flex:1"></span><span class="small muted">${Math.round((n / 35) * 100)}%</span></div>
      <div class="heat" style="--hc:${h.color}">${heatDays.map((d) => `<i class="${set.has(d) ? 'on' : ''} ${d === t ? 'today' : ''}" title="${d}"></i>`).join('')}</div>
    </div>`;
  }).join('') || '<div class="muted">Pas encore de données</div>';
}

function openHabitModal(habit) {
  const isNew = !habit;
  const h = habit || { name: '', emoji: '💧', color: '#93c5fd' };
  modal({
    title: isNew ? '🌱 Nouvelle habitude' : '✏️ Modifier l\'habitude',
    body: `
      <div class="field"><label class="label">Nom</label><input class="input" name="name" value="${esc(h.name)}" required placeholder="Ex : Méditer 10 minutes"></div>
      <div class="field"><label class="label">Emoji</label>${emojisHTML('emoji', h.emoji, HABIT_EMOJIS)}</div>
      <div class="field"><label class="label">Couleur</label>${swatchesHTML('color', h.color)}</div>`,
    onOpen: (f) => bindPickers(f),
    async onSubmit(f) {
      const data = { name: f.name.value.trim(), emoji: f.emoji.value, color: f.color.value };
      if (isNew) await api.post('habits', { ...data, position: Date.now() % 1e9 });
      else await api.put(`habits/${h.id}`, data);
      toast(isNew ? 'Habitude créée' : 'Habitude modifiée', data.emoji);
      draw();
    },
    onDelete: isNew ? null : async () => {
      if (!(await confirmBox(`L'habitude « ${h.name} » et tout son historique seront supprimés.`))) return false;
      await api.del(`habits/${h.id}`);
      toast('Habitude supprimée', '🗑️');
      draw();
    },
  });
}
