import { api } from '../api.js';
import { $, $$, esc, today, addDays, formatLong, debounce, MOODS } from '../utils.js';

let state = { date: today() };
let root;
let save;

export async function render(main, [date]) {
  root = main;
  if (date) state.date = date;
  main.innerHTML = `
    <div class="page-head">
      <div><h1 class="page-title">Mon journal</h1>
      <p class="page-sub">Un petit coin rien qu'à toi pour écrire tes pensées 💌</p></div>
    </div>
    <div class="journal-layout">
      <div class="card" id="entry"></div>
      <div class="card"><h3>📚 Mes dernières pages</h3><div id="entries"></div></div>
    </div>`;
  await draw();
}

export function destroy() { save?.flush(); }

async function draw() {
  save?.flush();
  const [entry, entries] = await Promise.all([
    api.get(`journal/${state.date}`),
    api.get(`journal?from=${addDays(today(), -60)}&to=${today()}`),
  ]);
  const grat = JSON.parse(entry.gratitude || '["","",""]');
  const isToday = state.date === today();
  const box = $('#entry', root);

  box.innerHTML = `
    <div class="plan-bar">
      <button class="btn icon" id="prev">‹</button>
      <div class="label-range" style="text-align:center;flex:1">${isToday ? '✨ ' : ''}${formatLong(state.date)}</div>
      <button class="btn icon" id="next" ${isToday ? 'disabled style="opacity:.4"' : ''}>›</button>
    </div>

    <label class="label">Mon humeur</label>
    <div class="moods" id="j-moods">${MOODS.map((m) =>
    `<button type="button" class="${entry.mood === m.v ? 'active' : ''}" data-v="${m.v}" title="${m.t}">${m.e}</button>`).join('')}</div>

    <div class="row" style="margin-bottom:16px;flex-wrap:wrap">
      <div class="field" style="min-width:160px"><label class="label">💧 Verres d'eau</label>
        <input class="input" type="number" min="0" max="20" name="water" value="${entry.water || 0}"></div>
      <div class="field" style="min-width:160px"><label class="label">😴 Heures de sommeil</label>
        <input class="input" type="number" min="0" max="24" step="0.5" name="sleep" value="${entry.sleep ?? ''}" placeholder="ex : 7.5"></div>
    </div>

    <label class="label">🙏 3 choses pour lesquelles je suis reconnaissante</label>
    ${grat.map((g, i) => `<div class="grat"><span>${['🌸', '💖', '✨'][i]}</span>
      <input class="input" data-g="${i}" value="${esc(g)}" placeholder="${['Un moment doux…', 'Une personne…', 'Une petite victoire…'][i]}"></div>`).join('')}

    <label class="label" style="margin-top:16px">📝 Cher journal…</label>
    <textarea class="journal-paper" name="content" placeholder="Raconte-moi ta journée…">${esc(entry.content)}</textarea>
    <div class="saved-ind" id="saved">Enregistrement automatique 💾</div>`;

  let mood = entry.mood;
  const date = state.date;
  save = debounce(async () => {
    await api.put(`journal/${date}`, {
      mood,
      water: Number($('[name=water]', box)?.value) || 0,
      sleep: $('[name=sleep]', box)?.value === '' ? null : Number($('[name=sleep]', box)?.value),
      gratitude: $$('[data-g]', box).map((x) => x.value),
      content: $('[name=content]', box)?.value ?? '',
    });
    const ind = $('#saved', box);
    if (ind) ind.textContent = `Enregistré à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} ✓`;
    drawEntries();
  }, 700);

  box.addEventListener('input', () => { $('#saved', box).textContent = 'Écriture…'; save(); });
  $$('#j-moods button', box).forEach((b) => {
    b.onclick = () => {
      const v = Number(b.dataset.v);
      mood = mood === v ? null : v;
      $$('#j-moods button', box).forEach((x) => x.classList.toggle('active', Number(x.dataset.v) === mood));
      save.now();
    };
  });
  $('#prev', box).onclick = () => { state.date = addDays(state.date, -1); draw(); };
  $('#next', box).onclick = () => { if (!isToday) { state.date = addDays(state.date, 1); draw(); } };

  drawEntries(entries);
}

async function drawEntries(entries) {
  entries ??= await api.get(`journal?from=${addDays(today(), -60)}&to=${today()}`);
  const list = entries.filter((e) => e.mood || e.content || JSON.parse(e.gratitude || '[]').some(Boolean));
  const box = $('#entries', root);
  if (!box) return;
  box.innerHTML = list.length ? list.map((e) => `
    <div class="entry-item ${e.date === state.date ? 'active' : ''}" data-d="${e.date}">
      <span class="m">${MOODS.find((m) => m.v === e.mood)?.e || '📄'}</span>
      <div><div class="d">${formatLong(e.date)}</div><div class="x">${esc(e.content?.slice(0, 60) || 'Pas de texte')}</div></div>
    </div>`).join('') : '<div class="empty"><span class="big">📔</span>Ton journal t\'attend</div>';
  $$('.entry-item', box).forEach((el) => {
    el.onclick = () => { state.date = el.dataset.d; draw(); };
  });
}
