import { api } from '../api.js';
import { refreshBadges } from '../app.js';
import {
  $, $$, esc, today, addDays, dueLabel, confetti, toast, modal, confirmBox,
  swatchesHTML, emojisHTML, bindPickers, tint,
} from '../utils.js';

const SMART = {
  today: { name: "Aujourd'hui", emoji: '☀️', color: '#fbbf24', match: (t) => t.due_date && t.due_date <= today() },
  week: { name: 'Cette semaine', emoji: '🗓️', color: '#93c5fd', match: (t) => t.due_date && t.due_date <= addDays(today(), 7) },
  important: { name: 'Importantes', emoji: '⭐', color: '#f472b6', match: (t) => t.priority > 0 },
  all: { name: 'Toutes mes tâches', emoji: '💖', color: '#c084fc', match: () => true },
};

export const PRIORITIES = [
  { v: 0, label: 'Normale', icon: '🌸' },
  { v: 1, label: 'Importante', icon: '⭐' },
  { v: 2, label: 'Urgente', icon: '🔥' },
];

let state = { key: 'today', filter: 'todo', lists: [], tasks: [] };
let root;

export async function render(main, [key]) {
  root = main;
  state.key = key || state.key || 'today';
  main.innerHTML = `
    <div class="page-head">
      <div><h1 class="page-title">Mes to-do lists</h1>
      <p class="page-sub">Organise tout ce que tu as à faire, une liste à la fois ✨</p></div>
    </div>
    <div class="todo-layout">
      <div class="card lists-col" id="lists"></div>
      <div id="tasks-pane"></div>
    </div>`;
  await reload();
}

async function reload() {
  [state.lists, state.tasks] = await Promise.all([api.get('lists'), api.get('tasks')]);
  if (!SMART[state.key] && !state.lists.some((l) => String(l.id) === String(state.key))) state.key = 'today';
  renderLists();
  renderTasks();
  refreshBadges();
}

function renderLists() {
  const count = (fn) => state.tasks.filter((t) => !t.done && fn(t)).length;
  const item = (key, l, n) => `
    <div class="list-item ${String(state.key) === String(key) ? 'active' : ''}" data-key="${key}">
      <span>${l.emoji}</span><span>${esc(l.name)}</span>
      <span class="count">${n || ''}</span>
    </div>`;
  $('#lists', root).innerHTML = `
    ${Object.entries(SMART).map(([k, l]) => item(k, l, count(l.match))).join('')}
    <div class="list-sep">Mes listes</div>
    ${state.lists.map((l) => item(l.id, l, count((t) => t.list_id === l.id))).join('')}
    <button class="btn ghost" style="width:100%;margin-top:8px" id="new-list">＋ Nouvelle liste</button>`;
  $$('.list-item', root).forEach((el) => {
    el.onclick = () => { state.key = el.dataset.key; history.replaceState(null, '', `#/todo/${el.dataset.key}`); renderLists(); renderTasks(); };
  });
  $('#new-list', root).onclick = () => openListModal();
}

function currentList() {
  return SMART[state.key] || state.lists.find((l) => String(l.id) === String(state.key));
}

function renderTasks() {
  const pane = $('#tasks-pane', root);
  const list = currentList();
  const isSmart = Boolean(SMART[state.key]);
  const inList = state.tasks.filter((t) => (isSmart ? list.match(t) : t.list_id === list.id));
  const visible = inList.filter((t) => (state.filter === 'todo' ? !t.done : state.filter === 'done' ? t.done : true));
  if (isSmart) visible.sort((a, b) => a.done - b.done || (a.due_date || '9999').localeCompare(b.due_date || '9999') || b.priority - a.priority);
  const done = inList.filter((t) => t.done).length;
  const byId = Object.fromEntries(state.lists.map((l) => [l.id, l]));

  pane.innerHTML = `
    <div class="card">
      <div class="list-head">
        <div class="e" style="background:${tint(list.color, .3)}">${list.emoji}</div>
        <div><h2>${esc(list.name)}</h2><div class="muted small">${inList.length - done} à faire · ${done} terminée${done > 1 ? 's' : ''}</div></div>
        <span class="grow"></span>
        ${isSmart ? '' : `<button class="btn sm" id="edit-list">✏️ Modifier</button>`}
      </div>

      <form class="add-task" id="add-task">
        <input class="input" name="title" placeholder="Nouvelle tâche… (Entrée pour ajouter)" autocomplete="off" required>
        <select class="select" name="priority">${PRIORITIES.map((p) => `<option value="${p.v}" ${isSmart && state.key === 'important' && p.v === 1 ? 'selected' : ''}>${p.icon} ${p.label}</option>`).join('')}</select>
        <input class="input" type="date" name="due_date" value="${state.key === 'today' ? today() : ''}">
        <button class="btn primary">＋ Ajouter</button>
      </form>

      <div class="row" style="margin-bottom:14px">
        <div class="seg" id="filter">
          <button data-f="todo" class="${state.filter === 'todo' ? 'active' : ''}">À faire</button>
          <button data-f="done" class="${state.filter === 'done' ? 'active' : ''}">Terminées</button>
          <button data-f="all" class="${state.filter === 'all' ? 'active' : ''}">Toutes</button>
        </div>
        <span class="grow" style="flex:1"></span>
        ${done ? `<button class="btn sm ghost" id="clear-done">🧹 Effacer les terminées</button>` : ''}
      </div>

      <div id="task-list">
        ${visible.length ? visible.map((t) => taskHTML(t, isSmart ? byId[t.list_id] : null, byId[t.list_id])).join('')
    : `<div class="empty"><span class="big">${state.filter === 'done' ? '🌱' : '🎀'}</span>
          ${state.filter === 'done' ? 'Aucune tâche terminée pour l\'instant' : 'Rien à faire ici… profite de ton temps libre !'}</div>`}
      </div>
    </div>`;

  $('#add-task', pane).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const listId = isSmart ? state.lists[0]?.id : list.id;
    if (!listId) return toast('Crée d\'abord une liste', '📝');
    await api.post('tasks', {
      title: f.title.value.trim(),
      priority: Number(f.priority.value),
      due_date: f.due_date.value || null,
      list_id: listId,
      position: Math.max(0, ...state.tasks.map((t) => t.position)) + 1,
    });
    toast('Tâche ajoutée', '🌸');
    await reload();
    $('#add-task input[name=title]', root)?.focus();
  };
  $$('#filter button', pane).forEach((b) => { b.onclick = () => { state.filter = b.dataset.f; renderTasks(); }; });
  $('#edit-list', pane)?.addEventListener('click', () => openListModal(list));
  $('#clear-done', pane)?.addEventListener('click', async () => {
    if (!(await confirmBox(`Supprimer les ${done} tâche(s) terminée(s) de cette liste ?`))) return;
    await Promise.all(inList.filter((t) => t.done).map((t) => api.del(`tasks/${t.id}`)));
    toast('Liste toute propre', '🧹');
    reload();
  });

  $$('.task', pane).forEach((el) => {
    const task = state.tasks.find((t) => t.id === Number(el.dataset.id));
    el.onclick = (e) => {
      if (e.target.closest('[data-act]')) return;
      openTaskModal(task, state.lists, reload);
    };
    $('[data-act=toggle]', el).onclick = async (e) => {
      if (!task.done) confetti(e.clientX, e.clientY);
      await api.put(`tasks/${task.id}`, { done: !task.done });
      reload();
    };
    $('[data-act=del]', el).onclick = async () => {
      await api.del(`tasks/${task.id}`);
      toast('Tâche supprimée', '🗑️');
      reload();
    };
  });
  if (!isSmart) enableDrag($('#task-list', pane));
}

function taskHTML(t, showList, list) {
  const due = dueLabel(t.due_date);
  const subs = JSON.parse(t.subtasks || '[]');
  const subDone = subs.filter((s) => s.done).length;
  const prio = PRIORITIES[t.priority] || PRIORITIES[0];
  return `
    <div class="task ${t.done ? 'done' : ''}" data-id="${t.id}" draggable="${!showList}" style="--lc:${list?.color || 'var(--accent)'}">
      <button class="check ${t.done ? 'done' : ''}" data-act="toggle" aria-label="Terminer"></button>
      <div class="body">
        <div class="title">${t.priority ? `<span class="prio">${prio.icon}</span> ` : ''}${esc(t.title)}</div>
        ${t.notes ? `<div class="notes">${esc(t.notes)}</div>` : ''}
        <div class="meta">
          ${due ? `<span class="chip ${t.done ? '' : due.cls}">📅 ${due.text}</span>` : ''}
          ${showList ? `<span class="chip" style="background:${tint(showList.color, .25)};color:var(--text)">${showList.emoji} ${esc(showList.name)}</span>` : ''}
          ${subs.length ? `<span class="small muted">☑️ ${subDone}/${subs.length}</span><span class="subprog"><i style="width:${(subDone / subs.length) * 100}%"></i></span>` : ''}
        </div>
      </div>
      <div class="actions"><button class="btn icon sm ghost" data-act="del" title="Supprimer">🗑️</button></div>
    </div>`;
}

// Glisser-déposer pour réordonner les tâches d'une liste
function enableDrag(container) {
  let dragged = null;
  container.addEventListener('dragstart', (e) => {
    dragged = e.target.closest('.task');
    if (!dragged) return;
    dragged.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    const over = e.target.closest('.task');
    $$('.drop-above', container).forEach((x) => x.classList.remove('drop-above'));
    if (over && over !== dragged) over.classList.add('drop-above');
  });
  container.addEventListener('dragend', () => {
    dragged?.classList.remove('dragging');
    $$('.drop-above', container).forEach((x) => x.classList.remove('drop-above'));
  });
  container.addEventListener('drop', async (e) => {
    e.preventDefault();
    const over = e.target.closest('.task');
    if (!dragged || !over || over === dragged) return;
    container.insertBefore(dragged, over);
    const ids = $$('.task', container).map((x) => Number(x.dataset.id));
    await Promise.all(ids.map((id, i) => api.put(`tasks/${id}`, { position: i })));
    reload();
  });
}

// ---------- Modale d'une liste ----------
function openListModal(list) {
  const isNew = !list;
  const l = list || { name: '', emoji: '🌸', color: '#f9a8d4' };
  modal({
    title: isNew ? '🎀 Nouvelle liste' : '✏️ Modifier la liste',
    body: `
      <div class="field"><label class="label">Nom</label><input class="input" name="name" value="${esc(l.name)}" required placeholder="Ex : Mariage de Lina 💍"></div>
      <div class="field"><label class="label">Emoji</label>${emojisHTML('emoji', l.emoji)}</div>
      <div class="field"><label class="label">Couleur</label>${swatchesHTML('color', l.color)}</div>`,
    onOpen: (f) => bindPickers(f),
    onSubmit: async (f) => {
      const data = { name: f.name.value.trim(), emoji: f.emoji.value, color: f.color.value };
      if (isNew) {
        const created = await api.post('lists', { ...data, position: state.lists.length });
        state.key = String(created.id);
        history.replaceState(null, '', `#/todo/${created.id}`);
      } else {
        await api.put(`lists/${l.id}`, data);
      }
      toast(isNew ? 'Liste créée' : 'Liste modifiée', l.emoji);
      reload();
    },
    onDelete: isNew ? null : async () => {
      if (!(await confirmBox(`La liste « ${l.name} » et toutes ses tâches seront supprimées.`))) return false;
      await api.del(`lists/${l.id}`);
      state.key = 'today';
      history.replaceState(null, '', '#/todo');
      toast('Liste supprimée', '🗑️');
      reload();
    },
  });
}

// ---------- Modale d'une tâche (utilisée aussi par le tableau de bord) ----------
export function openTaskModal(task, lists, onDone) {
  let subs = JSON.parse(task.subtasks || '[]');
  const renderSubs = (f) => {
    $('#subs', f).innerHTML = subs.map((s, i) => `
      <div class="sub-row" data-i="${i}">
        <button type="button" class="check ${s.done ? 'done' : ''}" data-act="sub-toggle"></button>
        <input class="input" value="${esc(s.text)}" data-act="sub-text">
        <button type="button" class="btn icon sm ghost" data-act="sub-del">✕</button>
      </div>`).join('');
  };
  modal({
    title: '🌸 Ma tâche',
    wide: true,
    body: `
      <div class="field"><label class="label">Titre</label><input class="input" name="title" value="${esc(task.title)}" required></div>
      <div class="row">
        <div class="field"><label class="label">Liste</label>
          <select class="select" name="list_id">${lists.map((l) => `<option value="${l.id}" ${l.id === task.list_id ? 'selected' : ''}>${l.emoji} ${esc(l.name)}</option>`).join('')}</select></div>
        <div class="field"><label class="label">Priorité</label>
          <select class="select" name="priority">${PRIORITIES.map((p) => `<option value="${p.v}" ${p.v === task.priority ? 'selected' : ''}>${p.icon} ${p.label}</option>`).join('')}</select></div>
        <div class="field"><label class="label">Échéance</label>
          <input class="input" type="date" name="due_date" value="${task.due_date || ''}"></div>
      </div>
      <div class="field"><label class="label">Notes</label><textarea class="textarea" name="notes" placeholder="Détails, idées, liens…">${esc(task.notes)}</textarea></div>
      <div class="field"><label class="label">Sous-tâches</label>
        <div id="subs"></div>
        <div class="row"><input class="input" id="new-sub" placeholder="Ajouter une étape… (Entrée)"><button type="button" class="btn" id="add-sub">＋</button></div>
      </div>`,
    onOpen(f) {
      renderSubs(f);
      const addSub = () => {
        const input = $('#new-sub', f);
        if (!input.value.trim()) return;
        subs.push({ text: input.value.trim(), done: false });
        input.value = '';
        renderSubs(f);
        input.focus();
      };
      $('#add-sub', f).onclick = addSub;
      $('#new-sub', f).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addSub(); } });
      $('#subs', f).addEventListener('click', (e) => {
        const row = e.target.closest('.sub-row');
        if (!row) return;
        const i = Number(row.dataset.i);
        if (e.target.dataset.act === 'sub-toggle') { subs[i].done = !subs[i].done; renderSubs(f); }
        if (e.target.dataset.act === 'sub-del') { subs.splice(i, 1); renderSubs(f); }
      });
      $('#subs', f).addEventListener('input', (e) => {
        if (e.target.dataset.act === 'sub-text') subs[Number(e.target.closest('.sub-row').dataset.i)].text = e.target.value;
      });
    },
    async onSubmit(f) {
      await api.put(`tasks/${task.id}`, {
        title: f.title.value.trim(),
        list_id: Number(f.list_id.value),
        priority: Number(f.priority.value),
        due_date: f.due_date.value || null,
        notes: f.notes.value,
        subtasks: subs.filter((s) => s.text.trim()),
      });
      toast('Tâche enregistrée', '💾');
      onDone?.();
    },
    async onDelete() {
      await api.del(`tasks/${task.id}`);
      toast('Tâche supprimée', '🗑️');
      onDone?.();
    },
  });
}
