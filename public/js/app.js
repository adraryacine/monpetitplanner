import { api } from './api.js';
import { $, $$, quoteOfDay, today } from './utils.js';
import * as dashboard from './views/dashboard.js';
import * as todo from './views/todo.js';
import * as planning from './views/planning.js';
import * as habits from './views/habits.js';
import * as journal from './views/journal.js';
import * as schemas from './views/schemas.js';
import * as stats from './views/stats.js';
import * as settings from './views/settings.js';

const routes = { '': dashboard, todo, planning, habitudes: habits, journal, schemas, stats, reglages: settings };

// Réglages partagés entre les vues
export const store = { settings: { name: 'Warda', theme: 'rose' } };

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme || 'rose';
}

let current = null;

async function router() {
  const [, name = '', ...params] = location.hash.replace(/^#/, '').split('/');
  const view = routes[name] || dashboard;
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === (routes[name] ? name : '')));
  $('#sidebar').classList.remove('open');

  current?.destroy?.();
  current = view;
  const main = $('#view');
  main.innerHTML = '';
  main.scrollTop = 0;
  window.scrollTo(0, 0);
  try {
    await view.render(main, params.map(decodeURIComponent));
  } catch (err) {
    console.error(err);
    main.innerHTML = `<div class="card empty"><span class="big">🥺</span>Oups, quelque chose s'est mal passé : ${err.message}</div>`;
  }
  refreshBadges();
}

/** Nombre de tâches pour aujourd'hui (ou en retard) dans le menu */
export async function refreshBadges() {
  try {
    const tasks = await api.get('tasks');
    const t = today();
    const n = tasks.filter((x) => !x.done && x.due_date && x.due_date <= t).length;
    $('#badge-todo').textContent = n || '';
  } catch { /* serveur indisponible : on ignore */ }
}

async function init() {
  try {
    store.settings = { ...store.settings, ...(await api.get('settings')) };
  } catch { /* valeurs par défaut */ }
  applyTheme(store.settings.theme);
  $('#brand-sub').textContent = `pour ${store.settings.name} 💕`;
  $('#mini-quote').textContent = `« ${quoteOfDay()} »`;
  $('#menu-btn').onclick = () => $('#sidebar').classList.toggle('open');
  window.addEventListener('hashchange', router);
  router();
}

init();
