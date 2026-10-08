// ---------- DOM ----------
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function debounce(fn, ms = 400) {
  let t;
  let pending = null;
  const run = () => { const args = pending; pending = null; clearTimeout(t); fn(...args); };
  const d = (...args) => { pending = args; clearTimeout(t); t = setTimeout(run, ms); };
  /** Exécute tout de suite l'appel en attente (s'il y en a un) */
  d.flush = () => { if (pending) run(); };
  /** Force un appel immédiat */
  d.now = (...args) => { pending = args; run(); };
  return d;
}

// ---------- Dates (toujours en heure locale, format YYYY-MM-DD) ----------
const pad = (n) => String(n).padStart(2, '0');
export const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
export const DAYS_SHORT = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
export const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export function toDateStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const today = () => toDateStr(new Date());
export function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(str, n) {
  const d = parseDate(str);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}
export function startOfWeek(str) {
  const d = parseDate(str);
  const dow = (d.getDay() + 6) % 7; // lundi = 0
  d.setDate(d.getDate() - dow);
  return toDateStr(d);
}
export function diffDays(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}
export function formatLong(str) {
  const d = parseDate(str);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
export function formatShort(str) {
  const d = parseDate(str);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 4).replace(/\.$/, '')}.`;
}
/** Libellé humain d'une échéance : "Aujourd'hui", "Demain", "En retard (2 j)"… */
export function dueLabel(str) {
  if (!str) return null;
  const n = diffDays(today(), str);
  if (n === 0) return { text: "Aujourd'hui", cls: 'today' };
  if (n === 1) return { text: 'Demain', cls: '' };
  if (n === -1) return { text: 'Hier', cls: 'late' };
  if (n < 0) return { text: `En retard · ${formatShort(str)}`, cls: 'late' };
  if (n < 7) return { text: DAYS[parseDate(str).getDay()], cls: '' };
  return { text: formatShort(str), cls: '' };
}
export const timeToMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const minToTime = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
export const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

// ---------- Palettes ----------
export const COLORS = ['#f9a8d4', '#f472b6', '#fb7185', '#fda4af', '#e879f9', '#c084fc', '#a78bfa', '#93c5fd', '#67e8f9', '#86efac', '#fde68a', '#fdba74'];
export const EMOJIS = ['🌸', '💖', '✨', '🦋', '🌷', '💼', '🛍️', '💅', '🏡', '📚', '🎀', '🍓', '☕', '🧘‍♀️', '💪', '🎨', '✈️', '💰', '🍰', '🐱', '🌙', '🎵', '🌿', '💌'];

/** Couleur pastel de fond à partir d'une couleur hexadécimale */
export function tint(hex, alpha = 0.22) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// ---------- Toasts ----------
export function toast(msg, emoji = '💖') {
  const zone = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${emoji}</span><span>${esc(msg)}</span>`;
  zone.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 2600);
}

// ---------- Confettis (petite récompense quand on termine une tâche) ----------
export function confetti(x = innerWidth / 2, y = innerHeight / 2, count = 14) {
  const bits = ['💖', '✨', '🌸', '💜', '⭐', '🎀'];
  for (let i = 0; i < count; i++) {
    const el = document.createElement('span');
    el.className = 'confetti';
    el.textContent = bits[i % bits.length];
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const dist = 60 + Math.random() * 70;
    el.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    el.style.setProperty('--dy', `${Math.sin(angle) * dist - 30}px`);
    el.style.setProperty('--rot', `${Math.random() * 360}deg`);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }
}

// ---------- Modale ----------
/**
 * Ouvre une modale.
 * body : HTML du contenu ; onOpen(root) pour brancher des événements ;
 * onSubmit(root) -> false pour garder la modale ouverte ; onDelete(root) optionnel.
 */
export function modal({ title, body, submitLabel = 'Enregistrer', onOpen, onSubmit, onDelete, deleteLabel = 'Supprimer', wide = false }) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `
    <form class="modal" ${wide ? 'style="width:min(680px,100%)"' : ''}>
      <h2>${title}</h2>
      <div class="modal-body">${body}</div>
      <div class="modal-actions">
        ${onDelete ? `<button type="button" class="btn danger left" data-act="delete">🗑️ ${deleteLabel}</button>` : ''}
        <button type="button" class="btn ghost" data-act="cancel">Annuler</button>
        ${onSubmit ? `<button type="submit" class="btn primary">${submitLabel}</button>` : ''}
      </div>
    </form>`;
  document.body.appendChild(back);
  const form = $('form', back);
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  $('[data-act="cancel"]', back).onclick = close;
  if (onDelete) $('[data-act="delete"]', back).onclick = async () => { if ((await onDelete(form)) !== false) close(); };
  form.onsubmit = async (e) => {
    e.preventDefault();
    if ((await onSubmit?.(form)) !== false) close();
  };
  onOpen?.(form);
  setTimeout(() => $('input:not([type=hidden]), textarea', form)?.focus(), 30);
  return { close, root: form };
}

export function confirmBox(message, { title = 'Tu es sûre ? 🥺', ok = 'Oui, supprimer' } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const m = modal({
      title,
      body: `<p style="margin:0;color:var(--text-2)">${esc(message)}</p>`,
      submitLabel: ok,
      onSubmit: () => { answered = true; resolve(true); },
    });
    const obs = new MutationObserver(() => {
      if (!document.body.contains(m.root)) { obs.disconnect(); if (!answered) resolve(false); }
    });
    obs.observe(document.body, { childList: true });
  });
}

/** Petits sélecteurs réutilisables (pastilles de couleurs, emojis) */
export function swatchesHTML(name, selected, colors = COLORS) {
  return `<div class="swatches" data-name="${name}">${colors.map((c) =>
    `<button type="button" class="swatch ${c === selected ? 'active' : ''}" data-v="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}
    <input type="hidden" name="${name}" value="${selected}"></div>`;
}
export function emojisHTML(name, selected, emojis = EMOJIS) {
  return `<div class="emoji-pick" data-name="${name}">${emojis.map((e) =>
    `<button type="button" class="${e === selected ? 'active' : ''}" data-v="${e}">${e}</button>`).join('')}
    <input type="hidden" name="${name}" value="${selected}"></div>`;
}
/** Active les sélecteurs de type pastille/emoji dans un conteneur */
export function bindPickers(root, onChange) {
  $$('.swatches, .emoji-pick, .cat-pick', root).forEach((group) => {
    group.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      $$('button', group).forEach((x) => x.classList.toggle('active', x === b));
      $('input[type=hidden]', group).value = b.dataset.v;
      onChange?.(group.dataset.name, b.dataset.v);
    });
  });
}

// ---------- Citations du jour ----------
export const QUOTES = [
  'Tu es plus forte que tu ne le crois 💪',
  'Un petit pas chaque jour, c\'est déjà beaucoup 🌱',
  'Prends soin de toi, tu es ta plus belle priorité 💖',
  'Les jolies choses prennent du temps 🌸',
  'Crois en toi et tout devient possible ✨',
  'Aujourd\'hui est une belle page à écrire 📖',
  'Sois la raison pour laquelle quelqu\'un sourit aujourd\'hui 😊',
  'Fais de ta vie un rêve, et d\'un rêve une réalité 🦋',
  'La douceur est une force 🌷',
  'Chaque jour est une nouvelle chance de briller ⭐',
  'Le bonheur se cache dans les petites choses ☕',
  'Tu mérites tout l\'amour que tu donnes aux autres 💕',
  'Respire. Tu gères. 🌿',
  'Rien n\'est impossible à un cœur vaillant 💗',
  'Fleuris là où tu es plantée 🌼',
  'Ta seule limite, c\'est toi 🚀',
  'Une to-do list cochée, c\'est un petit bonheur 🎀',
  'Sois fière de chaque progrès, même minuscule 🐾',
  'Ose, rêve, brille 🌟',
  'Le calme est un super-pouvoir 🌙',
];
export function quoteOfDay() {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 0);
  const doy = Math.floor((d - start) / 86400000);
  return QUOTES[doy % QUOTES.length];
}

export const MOODS = [
  { v: 1, e: '😢', t: 'Pas top' },
  { v: 2, e: '😕', t: 'Bof' },
  { v: 3, e: '😐', t: 'Ça va' },
  { v: 4, e: '🙂', t: 'Bien' },
  { v: 5, e: '🥰', t: 'Au top' },
];
