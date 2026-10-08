import { api } from '../api.js';
import {
  $, $$, esc, today, addDays, parseDate, startOfWeek, toDateStr, formatLong, DAYS_SHORT, MONTHS,
  timeToMin, minToTime, nowMin, modal, toast, tint, bindPickers,
} from '../utils.js';

export const CATEGORIES = {
  perso: { label: 'Perso', emoji: '🌸', color: '#f472b6' },
  travail: { label: 'Travail', emoji: '💼', color: '#a78bfa' },
  etudes: { label: 'Études', emoji: '📚', color: '#fb923c' },
  sport: { label: 'Sport', emoji: '🧘‍♀️', color: '#34d399' },
  rdv: { label: 'Rendez-vous', emoji: '💆‍♀️', color: '#60a5fa' },
  sortie: { label: 'Sortie', emoji: '🥂', color: '#fbbf24' },
  famille: { label: 'Famille', emoji: '🏡', color: '#f87171' },
};

const START_H = 6;
const END_H = 24;
const HH = 52; // hauteur d'une heure en pixels
const SNAP = 15; // minutes

let state = { view: 'week', cursor: today() };
let root;
let nowTimer;

export async function render(main) {
  root = main;
  main.innerHTML = `
    <div class="page-head">
      <div><h1 class="page-title">Mon planning</h1>
      <p class="page-sub">Clique sur un créneau pour ajouter, glisse un événement pour le déplacer 💫</p></div>
      <button class="btn primary" id="add-ev">＋ Nouvel événement</button>
    </div>
    <div class="plan-bar">
      <button class="btn icon" id="prev" aria-label="Précédent">‹</button>
      <button class="btn icon" id="next" aria-label="Suivant">›</button>
      <button class="btn sm" id="go-today">Aujourd'hui</button>
      <div class="label-range" id="range"></div>
      <span class="grow"></span>
      <div class="seg" id="view-seg">
        <button data-v="week">Semaine</button>
        <button data-v="month">Mois</button>
      </div>
    </div>
    <div id="cal"></div>`;

  $('#add-ev', main).onclick = () => openEventModal({ date: state.view === 'week' && state.cursor ? defaultDay() : today(), start_time: '09:00', end_time: '10:00' });
  $('#prev', main).onclick = () => move(-1);
  $('#next', main).onclick = () => move(1);
  $('#go-today', main).onclick = () => { state.cursor = today(); draw(); };
  $$('#view-seg button', main).forEach((b) => { b.onclick = () => { state.view = b.dataset.v; draw(); }; });
  await draw();
  nowTimer = setInterval(placeNowLine, 60000);
}

export function destroy() { clearInterval(nowTimer); }

function defaultDay() {
  const ws = startOfWeek(state.cursor);
  const t = today();
  return t >= ws && t <= addDays(ws, 6) ? t : ws;
}

function move(dir) {
  if (state.view === 'week') state.cursor = addDays(state.cursor, dir * 7);
  else {
    const d = parseDate(state.cursor);
    state.cursor = toDateStr(new Date(d.getFullYear(), d.getMonth() + dir, 1));
  }
  draw();
}

async function draw() {
  $$('#view-seg button', root).forEach((b) => b.classList.toggle('active', b.dataset.v === state.view));
  if (state.view === 'week') await drawWeek();
  else await drawMonth();
}

// =============== Vue semaine ===============
async function drawWeek() {
  const ws = startOfWeek(state.cursor);
  const we = addDays(ws, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const [events, tasks] = await Promise.all([api.get(`events?from=${ws}&to=${we}`), api.get('tasks')]);
  const t = today();

  const a = parseDate(ws);
  const b = parseDate(we);
  $('#range', root).textContent = a.getMonth() === b.getMonth()
    ? `${a.getDate()} – ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`
    : `${a.getDate()} ${MONTHS[a.getMonth()].slice(0, 4)}. – ${b.getDate()} ${MONTHS[b.getMonth()].slice(0, 4)}. ${b.getFullYear()}`;

  const hours = Array.from({ length: END_H - START_H }, (_, i) => START_H + i);
  $('#cal', root).innerHTML = `
    <div class="card week" style="--hh:${HH}px">
      <div class="week-head">
        <div></div>
        ${days.map((d, i) => {
    const n = tasks.filter((x) => !x.done && x.due_date === d).length;
    return `<div class="d ${d === t ? 'today' : ''}" data-day="${d}" title="Ajouter un événement">
            <div class="dn">${DAYS_SHORT[i]}</div><div class="dd">${parseDate(d).getDate()}</div>
            <div class="dt">${n ? `📝 ${n} tâche${n > 1 ? 's' : ''}` : ''}</div></div>`;
  }).join('')}
      </div>
      <div class="week-body" id="wb">
        <div class="hours">${hours.map((h) => `<div class="h">${h === START_H ? '' : `${h}h`}</div>`).join('')}</div>
        ${days.map((d) => `<div class="day-col ${d === t ? 'today' : ''}" data-day="${d}">
            ${hours.map((h) => `<div class="slot" data-h="${h}"></div>`).join('')}
          </div>`).join('')}
      </div>
    </div>`;

  for (const d of days) layoutDay($(`.day-col[data-day="${d}"]`, root), events.filter((e) => e.date === d));
  placeNowLine();

  // Ouvrir sur l'heure actuelle (ou 8h)
  const wb = $('#wb', root);
  wb.scrollTop = Math.max(0, ((ws <= t && t <= we ? Math.floor(nowMin() / 60) - 1 : 8) - START_H) * HH);

  $$('.slot', root).forEach((s) => {
    s.onclick = () => {
      const h = Number(s.dataset.h);
      openEventModal({ date: s.parentElement.dataset.day, start_time: minToTime(h * 60), end_time: minToTime(Math.min(h + 1, 23) * 60 + (h + 1 > 23 ? 59 : 0)) });
    };
  });
  $$('.week-head .d', root).forEach((d) => {
    d.onclick = () => openEventModal({ date: d.dataset.day, start_time: '09:00', end_time: '10:00' });
  });
  $$('.ev', root).forEach((el) => bindEventDrag(el, events.find((e) => e.id === Number(el.dataset.id))));
}

/** Place les événements d'une journée, en colonnes quand ils se chevauchent */
function layoutDay(col, events) {
  const items = events
    .map((e) => ({ e, s: timeToMin(e.start_time), end: Math.max(timeToMin(e.end_time), timeToMin(e.start_time) + 15) }))
    .sort((x, y) => x.s - y.s || y.end - x.end);
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = [];
    for (const it of cluster) {
      let lane = lanes.findIndex((end) => end <= it.s);
      if (lane === -1) { lane = lanes.length; lanes.push(0); }
      lanes[lane] = it.end;
      it.lane = lane;
    }
    cluster.forEach((it) => { it.lanes = lanes.length; });
    cluster = [];
  };
  for (const it of items) {
    if (it.s >= clusterEnd && cluster.length) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  flush();

  for (const it of items) {
    const cat = CATEGORIES[it.e.category] || CATEGORIES.perso;
    const color = it.e.color || cat.color;
    const top = ((it.s - START_H * 60) / 60) * HH;
    const height = Math.max(((it.end - it.s) / 60) * HH - 2, 20);
    const el = document.createElement('div');
    el.className = 'ev';
    el.dataset.id = it.e.id;
    el.style.cssText = `top:${top}px;height:${height}px;--c:${color};--cb:${tint(color, .28)};
      left:calc(${(it.lane / it.lanes) * 100}% + 3px);width:calc(${100 / it.lanes}% - 6px);right:auto`;
    el.innerHTML = `<b>${cat.emoji} ${esc(it.e.title)}</b>
      <small>${it.e.start_time} – ${it.e.end_time}${it.e.location && height > 50 ? `<br>📍 ${esc(it.e.location)}` : ''}</small>
      <div class="rs"></div>`;
    col.appendChild(el);
  }
}

function placeNowLine() {
  const col = $('.day-col.today', root);
  $$('.now-line', root).forEach((x) => x.remove());
  if (!col) return;
  const m = nowMin();
  if (m < START_H * 60) return;
  const line = document.createElement('div');
  line.className = 'now-line';
  line.style.top = `${((m - START_H * 60) / 60) * HH}px`;
  col.appendChild(line);
}

/** Déplacer (glisser) ou redimensionner (poignée du bas) un événement */
function bindEventDrag(el, ev) {
  el.addEventListener('pointerdown', (down) => {
    if (down.button !== 0) return;
    down.preventDefault();
    const resizing = down.target.classList.contains('rs');
    const cols = $$('.day-col', root);
    const startS = timeToMin(ev.start_time);
    const dur = Math.max(timeToMin(ev.end_time) - startS, 15);
    const origTop = parseFloat(el.style.top);
    const origH = parseFloat(el.style.height);
    let moved = false;
    let newDate = ev.date;
    let newStart = startS;
    let newDur = dur;

    const onMove = (e) => {
      const dy = e.clientY - down.clientY;
      if (!moved && Math.abs(dy) + Math.abs(e.clientX - down.clientX) < 5) return;
      moved = true;
      el.classList.add('dragging');
      const dMin = Math.round(((dy / HH) * 60) / SNAP) * SNAP;
      if (resizing) {
        newDur = Math.max(SNAP, dur + dMin);
        newDur = Math.min(newDur, END_H * 60 - 1 - startS);
        el.style.height = `${Math.max((newDur / 60) * HH - 2, 20)}px`;
        $('small', el).textContent = `${ev.start_time} – ${minToTime(startS + newDur)}`;
        return;
      }
      newStart = Math.min(Math.max(START_H * 60, startS + dMin), END_H * 60 - dur);
      el.style.top = `${origTop + ((newStart - startS) / 60) * HH}px`;
      const col = cols.find((c) => { const r = c.getBoundingClientRect(); return e.clientX >= r.left && e.clientX < r.right; });
      if (col && col !== el.parentElement) { col.appendChild(el); el.style.left = '3px'; el.style.width = 'calc(100% - 6px)'; }
      newDate = el.parentElement.dataset.day;
      $('small', el).textContent = `${minToTime(newStart)} – ${minToTime(newStart + dur)}`;
    };
    const onUp = async () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      el.classList.remove('dragging');
      if (!moved) { el.style.height = `${origH}px`; return openEventModal(ev); }
      const patch = resizing
        ? { end_time: minToTime(startS + newDur) }
        : { date: newDate, start_time: minToTime(newStart), end_time: minToTime(newStart + dur) };
      await api.put(`events/${ev.id}`, patch);
      draw();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}

// =============== Vue mois ===============
async function drawMonth() {
  const c = parseDate(state.cursor);
  const first = toDateStr(new Date(c.getFullYear(), c.getMonth(), 1));
  const gridStart = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const events = await api.get(`events?from=${cells[0]}&to=${cells[41]}`);
  const t = today();
  $('#range', root).textContent = `${MONTHS[c.getMonth()]} ${c.getFullYear()}`;

  $('#cal', root).innerHTML = `
    <div class="card month">
      <div class="month-head">${DAYS_SHORT.map((d) => `<div>${d}</div>`).join('')}</div>
      <div class="month-grid">
        ${cells.map((d) => {
    const evs = events.filter((e) => e.date === d);
    return `<div class="mcell ${parseDate(d).getMonth() !== c.getMonth() ? 'other' : ''} ${d === t ? 'today' : ''}" data-day="${d}">
            <div class="n">${parseDate(d).getDate()}</div>
            ${evs.slice(0, 3).map((e) => {
      const cat = CATEGORIES[e.category] || CATEGORIES.perso;
      const col = e.color || cat.color;
      return `<div class="mev" data-id="${e.id}" style="--c:${col};--cb:${tint(col, .25)}">${e.start_time} ${esc(e.title)}</div>`;
    }).join('')}
            ${evs.length > 3 ? `<div class="mmore">+ ${evs.length - 3} autre${evs.length > 4 ? 's' : ''}</div>` : ''}
          </div>`;
  }).join('')}
      </div>
    </div>`;

  $$('.mcell', root).forEach((cell) => {
    cell.onclick = (e) => {
      const evEl = e.target.closest('.mev');
      if (evEl) return openEventModal(events.find((x) => x.id === Number(evEl.dataset.id)));
      state.cursor = cell.dataset.day;
      state.view = 'week';
      draw();
    };
  });
}

// =============== Modale événement ===============
export function openEventModal(ev, onDone = draw) {
  const isNew = !ev.id;
  const e = { title: '', category: 'perso', location: '', notes: '', ...ev };
  modal({
    title: isNew ? '✨ Nouvel événement' : `${(CATEGORIES[e.category] || CATEGORIES.perso).emoji} Modifier l'événement`,
    body: `
      <div class="field"><label class="label">Titre</label><input class="input" name="title" value="${esc(e.title)}" required placeholder="Ex : Brunch avec les filles 🥞"></div>
      <div class="row">
        <div class="field"><label class="label">Date</label><input class="input" type="date" name="date" value="${e.date}" required></div>
        <div class="field"><label class="label">Début</label><input class="input" type="time" name="start_time" value="${e.start_time}" required step="300"></div>
        <div class="field"><label class="label">Fin</label><input class="input" type="time" name="end_time" value="${e.end_time}" required step="300"></div>
      </div>
      <div class="field"><label class="label">Catégorie</label>
        <div class="cat-pick" data-name="category">
          ${Object.entries(CATEGORIES).map(([k, c]) => `<button type="button" data-v="${k}" class="${k === e.category ? 'active' : ''}" style="--c:${c.color};--cb:${tint(c.color, .3)}">${c.emoji} ${c.label}</button>`).join('')}
          <input type="hidden" name="category" value="${e.category}">
        </div></div>
      <div class="field"><label class="label">Lieu</label><input class="input" name="location" value="${esc(e.location)}" placeholder="Optionnel"></div>
      <div class="field"><label class="label">Notes</label><textarea class="textarea" name="notes" style="min-height:70px">${esc(e.notes)}</textarea></div>
      ${isNew ? '' : `<p class="small muted" style="margin:0">📆 ${formatLong(e.date)}</p>`}`,
    onOpen: (f) => bindPickers(f),
    async onSubmit(f) {
      const data = {
        title: f.title.value.trim(), date: f.date.value, start_time: f.start_time.value, end_time: f.end_time.value,
        category: f.category.value, location: f.location.value.trim(), notes: f.notes.value,
      };
      if (timeToMin(data.end_time) <= timeToMin(data.start_time)) {
        toast('L\'heure de fin doit être après le début', '⏰');
        return false;
      }
      if (isNew) await api.post('events', data);
      else await api.put(`events/${e.id}`, data);
      toast(isNew ? 'Événement ajouté' : 'Événement modifié', '📅');
      onDone();
    },
    onDelete: isNew ? null : async () => {
      await api.del(`events/${e.id}`);
      toast('Événement supprimé', '🗑️');
      onDone();
    },
  });
}
