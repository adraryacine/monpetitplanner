import { api } from '../api.js';
import { $, $$, esc, debounce, modal, confirmBox, toast } from '../utils.js';

// =========================================================
// Formes, couleurs et rendu SVG (partagé par l'éditeur et les miniatures)
// =========================================================
const NODE_COLORS = ['#fbcfe8', '#f9a8d4', '#fecdd3', '#fed7aa', '#fef3c7', '#fde68a', '#a7f3d0', '#bfdbfe', '#c7d2fe', '#ddd6fe', '#c4b5fd', '#ffffff'];
const EDGE_COLORS = ['#b07aa1', '#ec4899', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#64748b'];
const TEXT_COLOR = '#4a2545';

const SHAPES = {
  round: { label: 'Pilule', w: 150, h: 56 },
  rect: { label: 'Rectangle', w: 150, h: 70 },
  ellipse: { label: 'Ellipse', w: 150, h: 80 },
  diamond: { label: 'Losange', w: 140, h: 100 },
  note: { label: 'Post-it', w: 150, h: 110 },
  heart: { label: 'Cœur', w: 150, h: 130 },
  cloud: { label: 'Nuage', w: 170, h: 100 },
  text: { label: 'Texte', w: 150, h: 40 },
};

const HEART = 'M50 88 C 22 68, 0 50, 0 26 C 0 10, 12 0, 27 0 C 38 0, 46 7, 50 16 C 54 7, 62 0, 73 0 C 88 0, 100 10, 100 26 C 100 50, 78 68, 50 88 Z';
const CLOUD = 'M25 80 C 8 80, 0 68, 4 56 C 0 42, 12 30, 26 34 C 28 16, 46 8, 60 18 C 70 6, 92 10, 92 30 C 104 32, 104 52, 96 58 C 104 72, 90 84, 76 80 Z';

function darken(hex, amt = 0.28) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(v * (1 - amt)).toString(16).padStart(2, '0');
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

function shapeSVG(n) {
  const { w, h } = n;
  const fill = n.color || '#fbcfe8';
  const stroke = n.color === '#ffffff' ? '#e4c6dc' : darken(fill, 0.18);
  const common = `class="shape" fill="${fill}" stroke="${stroke}" stroke-width="2"`;
  switch (n.shape) {
    case 'rect': return `<rect ${common} width="${w}" height="${h}" rx="10"/>`;
    case 'ellipse': return `<ellipse ${common} cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}"/>`;
    case 'diamond': return `<polygon ${common} stroke-linejoin="round" points="${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}"/>`;
    case 'note': return `<path ${common} d="M0 0 H${w} V${h - 16} L${w - 16} ${h} H0 Z"/>
      <path d="M${w} ${h - 16} L${w - 16} ${h - 16} L${w - 16} ${h} Z" fill="${stroke}" opacity=".55"/>`;
    case 'heart': return `<path ${common} vector-effect="non-scaling-stroke" transform="scale(${w / 100} ${h / 88})" d="${HEART}"/>`;
    case 'cloud': return `<path ${common} vector-effect="non-scaling-stroke" transform="scale(${w / 104} ${h / 82})" d="${CLOUD}"/>`;
    case 'text': return `<rect class="shape" width="${w}" height="${h}" fill="transparent"/>`;
    default: return `<rect ${common} width="${w}" height="${h}" rx="${Math.min(h / 2, 28)}"/>`;
  }
}

function wrap(text, maxChars) {
  const out = [];
  for (const para of String(text || '').split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      if (!line) line = word;
      else if ((`${line} ${word}`).length <= maxChars) line += ` ${word}`;
      else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}

function textSVG(n) {
  const fs = n.fontSize || 14;
  // zone de texte utile selon la forme
  const ratio = { diamond: 0.62, heart: 0.66, ellipse: 0.78, cloud: 0.7 }[n.shape] || 0.9;
  const lines = wrap(n.text, Math.max(4, Math.floor((n.w * ratio) / (fs * 0.56))));
  const lh = fs * 1.25;
  const cy = n.shape === 'heart' ? n.h * 0.42 : n.shape === 'cloud' ? n.h * 0.55 : n.h / 2;
  const y0 = cy - ((lines.length - 1) * lh) / 2;
  return `<text x="${n.w / 2}" text-anchor="middle" dominant-baseline="central" font-size="${fs}"
    font-family="Quicksand, Segoe UI, sans-serif" font-weight="${n.bold === false ? 500 : 700}" fill="${n.textColor || TEXT_COLOR}">
    ${lines.map((l, i) => `<tspan x="${n.w / 2}" y="${y0 + i * lh}">${esc(l)}</tspan>`).join('')}</text>`;
}

/** Point où le segment centre → (tx,ty) sort de la forme */
function boundary(n, tx, ty) {
  const cx = n.x + n.w / 2;
  const cy = n.y + n.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const a = n.w / 2 + 4;
  const b = n.h / 2 + 4;
  let t;
  if (n.shape === 'ellipse' || n.shape === 'heart' || n.shape === 'cloud') t = 1 / Math.sqrt((dx / a) ** 2 + (dy / b) ** 2);
  else if (n.shape === 'diamond') t = 1 / (Math.abs(dx) / a + Math.abs(dy) / b);
  else t = Math.min(a / Math.abs(dx || 1e-9), b / Math.abs(dy || 1e-9));
  return { x: cx + dx * t, y: cy + dy * t };
}

function edgeGeometry(e, nodes) {
  const A = nodes.find((n) => n.id === e.from);
  const B = nodes.find((n) => n.id === e.to);
  if (!A || !B) return null;
  const ac = { x: A.x + A.w / 2, y: A.y + A.h / 2 };
  const bc = { x: B.x + B.w / 2, y: B.y + B.h / 2 };
  const p1 = boundary(A, bc.x, bc.y);
  const p2 = boundary(B, ac.x, ac.y);
  if (e.style === 'straight') {
    return { d: `M${p1.x} ${p1.y} L${p2.x} ${p2.y}`, mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } };
  }
  const horiz = Math.abs(bc.x - ac.x) > Math.abs(bc.y - ac.y);
  const k = 0.45;
  const c1 = horiz ? { x: p1.x + (p2.x - p1.x) * k, y: p1.y } : { x: p1.x, y: p1.y + (p2.y - p1.y) * k };
  const c2 = horiz ? { x: p2.x - (p2.x - p1.x) * k, y: p2.y } : { x: p2.x, y: p2.y - (p2.y - p1.y) * k };
  return {
    d: `M${p1.x} ${p1.y} C${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`,
    mid: { x: (p1.x + 3 * c1.x + 3 * c2.x + p2.x) / 8, y: (p1.y + 3 * c1.y + 3 * c2.y + p2.y) / 8 },
  };
}

function defsSVG(edges) {
  const colors = new Set([...edges.map((e) => e.color || EDGE_COLORS[0]), '#ec4899']);
  return `<defs>${[...colors].map((c) => `
    <marker id="arr-${c.slice(1)}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="${c}"/></marker>`).join('')}</defs>`;
}

function edgesSVG(data, selId = null) {
  return data.edges.map((e) => {
    const g = edgeGeometry(e, data.nodes);
    if (!g) return '';
    const sel = e.id === selId;
    const color = sel ? '#ec4899' : e.color || EDGE_COLORS[0];
    const label = e.label ? (() => {
      const w = e.label.length * 7 + 16;
      return `<rect x="${g.mid.x - w / 2}" y="${g.mid.y - 11}" width="${w}" height="22" rx="11" fill="#ffffff" stroke="${color}" stroke-width="1"/>
        <text x="${g.mid.x}" y="${g.mid.y}" text-anchor="middle" dominant-baseline="central" font-size="12" font-weight="600"
          font-family="Quicksand, Segoe UI, sans-serif" fill="${TEXT_COLOR}">${esc(e.label)}</text>`;
    })() : '';
    return `<g class="edge ${sel ? 'sel' : ''}" data-id="${e.id}">
      <path class="hit" d="${g.d}"/>
      <path class="line" d="${g.d}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round"
        ${e.dashed ? 'stroke-dasharray="7 6"' : ''} ${e.arrow !== false ? `marker-end="url(#arr-${color.slice(1)})"` : ''}/>
      ${label}</g>`;
  }).join('');
}

function nodesSVG(data, selId = null, interactive = false) {
  return data.nodes.map((n) => {
    const sel = n.id === selId;
    return `<g class="node ${sel ? 'sel' : ''}" data-id="${n.id}" transform="translate(${n.x} ${n.y})">
      ${shapeSVG(n)}${textSVG(n)}
      ${interactive ? `<rect class="sel-box" x="-6" y="-6" width="${n.w + 12}" height="${n.h + 12}" rx="12"/>` : ''}
      ${interactive && sel ? `
        <circle class="handle link" data-handle="link" cx="${n.w + 16}" cy="${n.h / 2}" r="8"><title>Glisser pour relier</title></circle>
        <rect class="handle resize" data-handle="resize" x="${n.w - 2}" y="${n.h - 2}" width="12" height="12" rx="3"><title>Redimensionner</title></rect>` : ''}
    </g>`;
  }).join('');
}

function bounds(data, pad = 30) {
  if (!data.nodes.length) return { x: 0, y: 0, w: 400, h: 300 };
  const xs = data.nodes.flatMap((n) => [n.x, n.x + n.w]);
  const ys = data.nodes.flatMap((n) => [n.y, n.y + n.h]);
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return { x, y, w: Math.max(...xs) - x + pad, h: Math.max(...ys) - y + pad };
}

/** SVG autonome (miniature ou export) */
function standaloneSVG(data, { background = null, pad = 30 } = {}) {
  const b = bounds(data, pad);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x} ${b.y} ${b.w} ${b.h}" width="${b.w}" height="${b.h}">
    ${defsSVG(data.edges)}
    ${background ? `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${background}"/>` : ''}
    ${edgesSVG(data)}${nodesSVG(data)}</svg>`;
}

const uid = () => Math.random().toString(36).slice(2, 9);

// =========================================================
// Modèles de départ
// =========================================================
const TEMPLATES = {
  vide: { label: 'Page blanche', emoji: '🤍', build: () => ({ nodes: [], edges: [] }) },
  mindmap: {
    label: 'Carte mentale', emoji: '🧠',
    build: () => {
      const c = { id: uid(), x: 330, y: 230, w: 170, h: 130, shape: 'heart', color: '#f9a8d4', text: 'Mon idée', fontSize: 16 };
      const pos = [[60, 80], [600, 80], [60, 420], [600, 420]];
      const cols = ['#c4b5fd', '#fbcfe8', '#a7f3d0', '#fde68a'];
      const kids = pos.map(([x, y], i) => ({ id: uid(), x, y, w: 160, h: 56, shape: 'round', color: cols[i], text: `Branche ${i + 1}`, fontSize: 14 }));
      return { nodes: [c, ...kids], edges: kids.map((k) => ({ id: uid(), from: c.id, to: k.id, arrow: false, style: 'curve' })) };
    },
  },
  process: {
    label: 'Organigramme', emoji: '🔀',
    build: () => {
      const n = [
        { id: uid(), x: 300, y: 0, w: 160, h: 56, shape: 'round', color: '#fbcfe8', text: 'Début ✨' },
        { id: uid(), x: 300, y: 120, w: 160, h: 70, shape: 'rect', color: '#ddd6fe', text: 'Étape 1' },
        { id: uid(), x: 310, y: 250, w: 140, h: 100, shape: 'diamond', color: '#fef3c7', text: 'Question ?' },
        { id: uid(), x: 80, y: 410, w: 160, h: 70, shape: 'rect', color: '#a7f3d0', text: 'Si oui' },
        { id: uid(), x: 520, y: 410, w: 160, h: 70, shape: 'rect', color: '#fecdd3', text: 'Si non' },
        { id: uid(), x: 300, y: 550, w: 160, h: 56, shape: 'round', color: '#fbcfe8', text: 'Fin 🎉' },
      ].map((x) => ({ fontSize: 14, ...x }));
      const e = (a, b, label = '') => ({ id: uid(), from: n[a].id, to: n[b].id, label, arrow: true, style: 'straight' });
      return { nodes: n, edges: [e(0, 1), e(1, 2), e(2, 3, 'oui'), e(2, 4, 'non'), e(3, 5), e(4, 5)] };
    },
  },
  pourcontre: {
    label: 'Pour / Contre', emoji: '⚖️',
    build: () => {
      const q = { id: uid(), x: 250, y: 0, w: 240, h: 70, shape: 'cloud', color: '#ddd6fe', text: 'Ma décision', fontSize: 16 };
      const p = { id: uid(), x: 60, y: 140, w: 180, h: 56, shape: 'round', color: '#a7f3d0', text: '👍 Pour', fontSize: 15 };
      const c = { id: uid(), x: 500, y: 140, w: 180, h: 56, shape: 'round', color: '#fecdd3', text: '👎 Contre', fontSize: 15 };
      const notes = [[60, 240, p, '#ecfdf5'], [60, 360, p, '#ecfdf5'], [500, 240, c, '#fff1f2'], [500, 360, c, '#fff1f2']]
        .map(([x, y, parent, color]) => ({ id: uid(), x, y, w: 180, h: 90, shape: 'note', color, text: 'Argument…', fontSize: 13, parent }));
      return {
        nodes: [q, p, c, ...notes.map(({ parent, ...n }) => n)],
        edges: [
          { id: uid(), from: q.id, to: p.id, arrow: true, style: 'curve' },
          { id: uid(), from: q.id, to: c.id, arrow: true, style: 'curve' },
          ...notes.map((n) => ({ id: uid(), from: n.parent.id, to: n.id, arrow: false, dashed: true, style: 'straight' })),
        ],
      };
    },
  },
};

// =========================================================
// Liste des schémas
// =========================================================
let root;
let editor = null;

export async function render(main, [id]) {
  root = main;
  if (id) return openEditor(Number(id));
  const diagrams = await api.get('diagrams');
  main.innerHTML = `
    <div class="page-head">
      <div><h1 class="page-title">Mes schémas</h1>
      <p class="page-sub">Cartes mentales, organigrammes, idées en vrac… laisse parler ta créativité 🎨</p></div>
      <button class="btn primary" id="new-dia">＋ Nouveau schéma</button>
    </div>
    <div class="grid dia-grid">
      <div class="card dia-new" id="new-dia-2" style="cursor:pointer"><div><div class="big">🎨</div>Créer un schéma</div></div>
      ${diagrams.map((d) => {
    const data = JSON.parse(d.data || '{"nodes":[],"edges":[]}');
    return `<div class="card dia-card" data-id="${d.id}">
          <div class="thumb">${data.nodes.length ? standaloneSVG(data, { pad: 20 }) : '<span style="font-size:40px">🤍</span>'}</div>
          <div class="info"><div class="grow"><b>${esc(d.name)}</b>
            <span class="small muted">${data.nodes.length} élément${data.nodes.length > 1 ? 's' : ''} · modifié le ${d.updated_at.slice(8, 10)}/${d.updated_at.slice(5, 7)}</span></div>
            <button class="btn icon sm ghost" data-act="del" title="Supprimer">🗑️</button></div>
        </div>`;
  }).join('')}
    </div>`;
  $('#new-dia', main).onclick = newDiagram;
  $('#new-dia-2', main).onclick = newDiagram;
  $$('.dia-card', main).forEach((card) => {
    card.onclick = async (e) => {
      if (e.target.closest('[data-act=del]')) {
        e.stopPropagation();
        const d = diagrams.find((x) => x.id === Number(card.dataset.id));
        if (!(await confirmBox(`Le schéma « ${d.name} » sera supprimé définitivement.`))) return;
        await api.del(`diagrams/${d.id}`);
        toast('Schéma supprimé', '🗑️');
        render(main, []);
        return;
      }
      location.hash = `#/schemas/${card.dataset.id}`;
    };
  });
}

function newDiagram() {
  modal({
    title: '🎨 Nouveau schéma',
    body: `
      <div class="field"><label class="label">Nom</label><input class="input" name="name" required placeholder="Ex : Organisation du voyage ✈️"></div>
      <label class="label">Modèle de départ</label>
      <div class="cat-pick" data-name="tpl">
        ${Object.entries(TEMPLATES).map(([k, t], i) => `<button type="button" data-v="${k}" class="${i === 1 ? 'active' : ''}" style="--c:var(--primary);--cb:var(--primary-soft)">${t.emoji} ${t.label}</button>`).join('')}
        <input type="hidden" name="tpl" value="mindmap">
      </div>`,
    submitLabel: 'Créer ✨',
    onOpen: (f) => {
      $$('.cat-pick button', f).forEach((b) => {
        b.onclick = () => { $$('.cat-pick button', f).forEach((x) => x.classList.toggle('active', x === b)); f.tpl.value = b.dataset.v; };
      });
    },
    async onSubmit(f) {
      const d = await api.post('diagrams', { name: f.name.value.trim(), data: TEMPLATES[f.tpl.value].build() });
      location.hash = `#/schemas/${d.id}`;
    },
  });
}

export function destroy() { editor?.destroy(); editor = null; }

// =========================================================
// Éditeur
// =========================================================
async function openEditor(id) {
  let diagram;
  try { diagram = await api.get(`diagrams/${id}`); } catch { location.hash = '#/schemas'; return; }
  const data = JSON.parse(diagram.data || '{"nodes":[],"edges":[]}');
  data.nodes ||= [];
  data.edges ||= [];

  root.innerHTML = `
    <div class="editor-top">
      <a class="btn icon" href="#/schemas" title="Retour">←</a>
      <input class="name" id="dia-name" value="${esc(diagram.name)}">
      <span class="saved-ind" id="dia-saved"></span>
      <span style="flex:1"></span>
      <button class="btn icon" id="undo" title="Annuler (Ctrl+Z)">↶</button>
      <button class="btn icon" id="redo" title="Rétablir (Ctrl+Y)">↷</button>
      <button class="btn" id="link-mode" title="Cliquer une forme puis une autre pour les relier">🔗 Relier</button>
      <button class="btn" id="export">📸 Image</button>
    </div>
    <div class="editor">
      <div class="canvas-wrap" id="wrap">
        <svg id="svg"><g id="vp"></g></svg>
        <div class="canvas-tools">
          <button class="btn icon sm" id="zoom-out" title="Dézoomer">−</button>
          <button class="btn sm" id="zoom-val" title="Recentrer">100%</button>
          <button class="btn icon sm" id="zoom-in" title="Zoomer">＋</button>
        </div>
        <div class="canvas-hint" id="hint">Double-clic sur une forme pour écrire ✍️</div>
      </div>
      <div class="card panel" id="panel"></div>
    </div>`;

  const svg = $('#svg', root);
  const vp = $('#vp', root);
  const wrap = $('#wrap', root);
  const view = { x: 40, y: 40, k: 1 };
  let sel = null; // { type: 'node' | 'edge', id }
  let drag = null;
  let linkMode = false;
  let linkFrom = null;
  let lastDown = { id: null, t: 0 };
  let editing = null;
  const history = [JSON.stringify(data)];
  let hIdx = 0;

  // ---------- Sauvegarde ----------
  const saved = $('#dia-saved', root);
  const save = debounce(async () => {
    await api.put(`diagrams/${id}`, { data });
    saved.textContent = 'Enregistré ✓';
  }, 600);
  function commit() {
    const snap = JSON.stringify(data);
    if (snap === history[hIdx]) return;
    history.splice(hIdx + 1);
    history.push(snap);
    if (history.length > 100) history.shift();
    hIdx = history.length - 1;
    saved.textContent = 'Modifications…';
    save();
  }
  function restore(snap) {
    const d = JSON.parse(snap);
    data.nodes = d.nodes;
    data.edges = d.edges;
    sel = null;
    draw();
    saved.textContent = 'Modifications…';
    save();
  }
  const undo = () => { if (hIdx > 0) restore(history[--hIdx]); };
  const redo = () => { if (hIdx < history.length - 1) restore(history[++hIdx]); };

  $('#dia-name', root).addEventListener('change', async (e) => {
    const name = e.target.value.trim() || 'Sans titre';
    await api.put(`diagrams/${id}`, { name });
    toast('Nom enregistré', '✏️');
  });

  // ---------- Rendu ----------
  const nodeById = (nid) => data.nodes.find((n) => n.id === nid);
  function draw() {
    vp.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);
    vp.innerHTML = defsSVG(data.edges) + edgesSVG(data, sel?.type === 'edge' ? sel.id : null)
      + nodesSVG(data, sel?.type === 'node' ? sel.id : null, true)
      + (linkFrom ? (() => { const n = nodeById(linkFrom); return n ? `<rect x="${n.x - 6}" y="${n.y - 6}" width="${n.w + 12}" height="${n.h + 12}" rx="12" fill="none" stroke="#ec4899" stroke-width="2.5"/>` : ''; })() : '');
    wrap.style.backgroundSize = `${22 * view.k}px ${22 * view.k}px`;
    wrap.style.backgroundPosition = `${view.x}px ${view.y}px`;
    $('#zoom-val', root).textContent = `${Math.round(view.k * 100)}%`;
    $('#undo', root).disabled = hIdx === 0;
    $('#redo', root).disabled = hIdx >= history.length - 1;
  }

  function toWorld(e) {
    const r = svg.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.x) / view.k, y: (e.clientY - r.top - view.y) / view.k };
  }
  function nodeAt(p) {
    for (let i = data.nodes.length - 1; i >= 0; i--) {
      const n = data.nodes[i];
      if (p.x >= n.x && p.x <= n.x + n.w && p.y >= n.y && p.y <= n.y + n.h) return n;
    }
    return null;
  }
  function select(s) { sel = s; draw(); renderPanel(); }

  function fit() {
    const r = svg.getBoundingClientRect();
    if (!data.nodes.length) { view.x = 40; view.y = 40; view.k = 1; return draw(); }
    const b = bounds(data, 40);
    view.k = Math.min(1.4, Math.max(0.2, Math.min(r.width / b.w, r.height / b.h)));
    view.x = (r.width - b.w * view.k) / 2 - b.x * view.k;
    view.y = (r.height - b.h * view.k) / 2 - b.y * view.k;
    draw();
  }
  function zoomAt(factor, cx, cy) {
    const k = Math.min(3, Math.max(0.2, view.k * factor));
    view.x = cx - ((cx - view.x) * k) / view.k;
    view.y = cy - ((cy - view.y) * k) / view.k;
    view.k = k;
    draw();
  }

  // ---------- Création ----------
  function addNode(shape, opts = {}) {
    const r = svg.getBoundingClientRect();
    const def = SHAPES[shape];
    const center = { x: (r.width / 2 - view.x) / view.k, y: (r.height / 2 - view.y) / view.k };
    const n = {
      id: uid(), shape, w: def.w, h: def.h, fontSize: 14,
      x: Math.round(center.x - def.w / 2 + (Math.random() - 0.5) * 60),
      y: Math.round(center.y - def.h / 2 + (Math.random() - 0.5) * 60),
      color: shape === 'note' ? '#fef3c7' : shape === 'text' ? '#ffffff' : NODE_COLORS[data.nodes.length % 11],
      text: shape === 'text' ? 'Texte' : '',
      ...opts,
    };
    data.nodes.push(n);
    commit();
    select({ type: 'node', id: n.id });
    return n;
  }
  /** Ajoute un enfant relié (touche Tab) */
  function addChild(parent) {
    const kids = data.edges.filter((e) => e.from === parent.id).length;
    const n = {
      id: uid(), shape: 'round', w: 150, h: 56, fontSize: 14, color: parent.color, text: '',
      x: parent.x + parent.w + 90, y: parent.y + parent.h / 2 - 28 + kids * 76 - (kids ? 38 : 0),
    };
    data.nodes.push(n);
    data.edges.push({ id: uid(), from: parent.id, to: n.id, arrow: false, style: 'curve' });
    commit();
    select({ type: 'node', id: n.id });
    editText(n);
  }
  function connect(a, b) {
    if (a === b || data.edges.some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a))) return;
    data.edges.push({ id: uid(), from: a, to: b, arrow: true, style: 'curve' });
    commit();
  }
  function removeSelected() {
    if (!sel) return;
    if (sel.type === 'node') {
      data.nodes = data.nodes.filter((n) => n.id !== sel.id);
      data.edges = data.edges.filter((e) => e.from !== sel.id && e.to !== sel.id);
    } else {
      data.edges = data.edges.filter((e) => e.id !== sel.id);
    }
    commit();
    select(null);
  }
  function duplicate() {
    if (sel?.type !== 'node') return;
    const n = nodeById(sel.id);
    const copy = { ...n, id: uid(), x: n.x + 30, y: n.y + 30 };
    data.nodes.push(copy);
    commit();
    select({ type: 'node', id: copy.id });
  }

  // ---------- Édition du texte (zone de saisie posée sur la forme) ----------
  function editText(n) {
    closeEditor(true);
    const ta = document.createElement('textarea');
    ta.className = 'text-edit';
    ta.value = n.text || '';
    const place = () => {
      Object.assign(ta.style, {
        left: `${view.x + n.x * view.k}px`, top: `${view.y + n.y * view.k}px`,
        width: `${Math.max(120, n.w * view.k)}px`, height: `${Math.max(44, n.h * view.k)}px`,
        fontSize: `${(n.fontSize || 14) * view.k}px`,
      });
    };
    place();
    wrap.appendChild(ta);
    ta.focus();
    ta.select();
    editing = { el: ta, node: n };
    ta.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); closeEditor(true); }
      if (e.key === 'Escape') closeEditor(false);
      if (e.key === 'Tab') { e.preventDefault(); closeEditor(true); addChild(n); }
    });
    ta.addEventListener('blur', () => closeEditor(true));
  }
  function closeEditor(keep) {
    if (!editing) return;
    const { el, node } = editing;
    editing = null;
    if (keep && node.text !== el.value) { node.text = el.value; commit(); }
    el.remove();
    draw();
    renderPanel();
  }
  function editEdgeLabel(edge) {
    modal({
      title: '🏷️ Texte du lien',
      body: `<input class="input" name="label" value="${esc(edge.label || '')}" placeholder="Ex : ensuite, oui, non…">`,
      onSubmit(f) { edge.label = f.label.value.trim(); commit(); draw(); renderPanel(); },
    });
  }

  // ---------- Souris / doigt ----------
  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    closeEditor(true);
    const p = toWorld(e);
    const handle = e.target.closest('[data-handle]');
    const nodeEl = e.target.closest('.node');
    const edgeEl = e.target.closest('.edge');

    if (handle) {
      const n = nodeById(nodeEl.dataset.id);
      drag = handle.dataset.handle === 'resize'
        ? { mode: 'resize', node: n, start: p, w: n.w, h: n.h }
        : { mode: 'link', node: n };
      return;
    }
    if (nodeEl) {
      const n = nodeById(nodeEl.dataset.id);
      if (linkMode) {
        if (!linkFrom) { linkFrom = n.id; draw(); } else { connect(linkFrom, n.id); linkFrom = null; select({ type: 'node', id: n.id }); }
        return;
      }
      const now = Date.now();
      if (lastDown.id === n.id && now - lastDown.t < 380) {
        // différé : sinon le clic retire tout de suite le focus de la zone de saisie
        lastDown = { id: null, t: 0 };
        e.preventDefault();
        setTimeout(() => editText(n), 0);
        return;
      }
      lastDown = { id: n.id, t: now };
      // amener au premier plan
      data.nodes = [...data.nodes.filter((x) => x !== n), n];
      if (sel?.id !== n.id) select({ type: 'node', id: n.id });
      drag = { mode: 'move', node: n, start: p, ox: n.x, oy: n.y, moved: false };
      return;
    }
    if (edgeEl) {
      const edge = data.edges.find((x) => x.id === edgeEl.dataset.id);
      const now = Date.now();
      if (lastDown.id === edge.id && now - lastDown.t < 380) { editEdgeLabel(edge); return; }
      lastDown = { id: edge.id, t: now };
      select({ type: 'edge', id: edge.id });
      return;
    }
    linkFrom = null;
    if (sel) select(null);
    drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
    svg.classList.add('panning');
  });

  const onMove = (e) => {
    if (!drag) return;
    const p = toWorld(e);
    if (drag.mode === 'pan') {
      view.x = drag.vx + e.clientX - drag.sx;
      view.y = drag.vy + e.clientY - drag.sy;
      draw();
    } else if (drag.mode === 'move') {
      const nx = Math.round((drag.ox + p.x - drag.start.x) / 5) * 5;
      const ny = Math.round((drag.oy + p.y - drag.start.y) / 5) * 5;
      if (nx !== drag.node.x || ny !== drag.node.y) { drag.moved = true; drag.node.x = nx; drag.node.y = ny; draw(); }
    } else if (drag.mode === 'resize') {
      drag.node.w = Math.max(50, Math.round(drag.w + p.x - drag.start.x));
      drag.node.h = Math.max(30, Math.round(drag.h + p.y - drag.start.y));
      draw();
    } else if (drag.mode === 'link') {
      draw();
      const n = drag.node;
      const target = nodeAt(p);
      const from = boundary(n, p.x, p.y);
      vp.insertAdjacentHTML('beforeend', `<path d="M${from.x} ${from.y} L${p.x} ${p.y}" stroke="#ec4899" stroke-width="2.5" stroke-dasharray="6 5" fill="none"/>
        ${target && target !== n ? `<rect x="${target.x - 6}" y="${target.y - 6}" width="${target.w + 12}" height="${target.h + 12}" rx="12" fill="none" stroke="#ec4899" stroke-width="2.5"/>` : ''}`);
    }
  };
  const onUp = (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    svg.classList.remove('panning');
    if (d.mode === 'move' && d.moved) commit();
    if (d.mode === 'resize') commit();
    if (d.mode === 'link') {
      const target = nodeAt(toWorld(e));
      if (target && target !== d.node) connect(d.node.id, target.id);
      draw();
    }
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  const onKey = (e) => {
    if (editing || e.target.closest('input, textarea, select') || document.querySelector('.modal-back')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    else if (ctrl && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); }
    else if (e.key === 'Tab' && sel?.type === 'node') { e.preventDefault(); addChild(nodeById(sel.id)); }
    else if (e.key === 'Enter' && sel?.type === 'node') { e.preventDefault(); editText(nodeById(sel.id)); }
    else if (e.key === 'Escape') { linkFrom = null; select(null); }
    else if (sel?.type === 'node' && e.key.startsWith('Arrow')) {
      e.preventDefault();
      const n = nodeById(sel.id);
      const step = e.shiftKey ? 20 : 5;
      if (e.key === 'ArrowLeft') n.x -= step;
      if (e.key === 'ArrowRight') n.x += step;
      if (e.key === 'ArrowUp') n.y -= step;
      if (e.key === 'ArrowDown') n.y += step;
      draw();
      commit();
    }
  };
  window.addEventListener('keydown', onKey);
  const onResize = () => draw();
  window.addEventListener('resize', onResize);

  // ---------- Barre du haut ----------
  $('#undo', root).onclick = undo;
  $('#redo', root).onclick = redo;
  $('#zoom-in', root).onclick = () => { const r = svg.getBoundingClientRect(); zoomAt(1.2, r.width / 2, r.height / 2); };
  $('#zoom-out', root).onclick = () => { const r = svg.getBoundingClientRect(); zoomAt(1 / 1.2, r.width / 2, r.height / 2); };
  $('#zoom-val', root).onclick = fit;
  $('#link-mode', root).onclick = (e) => {
    linkMode = !linkMode;
    linkFrom = null;
    e.currentTarget.classList.toggle('on', linkMode);
    svg.classList.toggle('linking', linkMode);
    $('#hint', root).textContent = linkMode ? 'Clique sur une forme, puis sur une autre pour les relier 🔗' : 'Double-clic sur une forme pour écrire ✍️';
    draw();
  };
  $('#export', root).onclick = () => exportPNG(data, $('#dia-name', root).value);

  // ---------- Panneau de droite ----------
  function shapeIcon(shape) {
    const n = { shape, w: 34, h: 26, color: '#f9a8d4' };
    if (shape === 'text') return '<svg viewBox="0 0 34 26"><text x="17" y="18" text-anchor="middle" font-size="16" font-weight="700" fill="#a855f7">Aa</text></svg>';
    return `<svg viewBox="-2 -2 38 30">${shapeSVG(n).replace(/stroke-width="2"/g, 'stroke-width="1.5"')}</svg>`;
  }

  function renderPanel() {
    const panel = $('#panel', root);
    const node = sel?.type === 'node' ? nodeById(sel.id) : null;
    const edge = sel?.type === 'edge' ? data.edges.find((x) => x.id === sel.id) : null;
    let html = `
      <section><h4>Ajouter une forme</h4>
        <div class="shape-btns">${Object.entries(SHAPES).map(([k, s]) =>
    `<button data-add="${k}" title="${s.label}">${shapeIcon(k)}</button>`).join('')}</div>
      </section>`;

    if (node) {
      html += `
        <section><h4>Forme sélectionnée</h4>
          <button class="btn sm" style="width:100%;margin-bottom:10px" data-act="edit">✍️ Modifier le texte</button>
          <div class="shape-btns" style="margin-bottom:12px">${Object.keys(SHAPES).map((k) =>
    `<button data-shape="${k}" class="${node.shape === k ? 'active' : ''}" title="${SHAPES[k].label}">${shapeIcon(k)}</button>`).join('')}</div>
          <label class="label">Couleur</label>
          <div class="swatches" style="margin-bottom:12px">${NODE_COLORS.map((c) =>
    `<button class="swatch ${node.color === c ? 'active' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}</div>
          <label class="label">Taille du texte</label>
          <div class="seg" style="margin-bottom:12px">${[[12, 'S'], [14, 'M'], [17, 'L'], [22, 'XL']].map(([v, l]) =>
    `<button data-fs="${v}" class="${(node.fontSize || 14) === v ? 'active' : ''}">${l}</button>`).join('')}</div>
          <div class="row" style="flex-wrap:wrap;gap:6px">
            <button class="btn sm" data-act="child" title="Tab">🌿 Ajouter un enfant</button>
            <button class="btn sm" data-act="dup" title="Ctrl+D">📄 Dupliquer</button>
            <button class="btn sm danger" data-act="del" title="Suppr">🗑️ Supprimer</button>
          </div>
        </section>`;
    } else if (edge) {
      html += `
        <section><h4>Lien sélectionné</h4>
          <button class="btn sm" style="width:100%;margin-bottom:10px" data-act="label">🏷️ ${edge.label ? 'Modifier le texte' : 'Ajouter un texte'}</button>
          <label class="label">Style</label>
          <div class="seg" style="margin-bottom:12px">
            <button data-style="curve" class="${edge.style !== 'straight' ? 'active' : ''}">〰️ Courbe</button>
            <button data-style="straight" class="${edge.style === 'straight' ? 'active' : ''}">📏 Droit</button>
          </div>
          <div class="row" style="margin-bottom:12px;gap:6px;flex-wrap:wrap">
            <button class="btn sm ${edge.arrow !== false ? 'on' : ''}" data-act="arrow">➜ Flèche</button>
            <button class="btn sm ${edge.dashed ? 'on' : ''}" data-act="dashed">┅ Pointillés</button>
            <button class="btn sm" data-act="flip">⇄ Inverser</button>
          </div>
          <label class="label">Couleur</label>
          <div class="swatches" style="margin-bottom:12px">${EDGE_COLORS.map((c) =>
    `<button class="swatch ${(edge.color || EDGE_COLORS[0]) === c ? 'active' : ''}" data-ecolor="${c}" style="background:${c}"></button>`).join('')}</div>
          <button class="btn sm danger" data-act="del">🗑️ Supprimer le lien</button>
        </section>`;
    } else {
      html += `
        <section><h4>Astuces 💡</h4>
          <div class="small" style="line-height:1.9;color:var(--text-2)">
            🖱️ <b>Double-clic</b> : écrire dans une forme<br>
            🔗 <b>Rond rose</b> : glisser pour relier<br>
            🌿 <b>Tab</b> : ajouter une idée reliée<br>
            ↔️ <b>Glisser le fond</b> : se déplacer<br>
            🔍 <b>Molette</b> : zoomer<br>
            ⌫ <b>Suppr</b> : effacer la sélection<br>
            ↶ <b>Ctrl+Z</b> : annuler
          </div>
        </section>`;
    }
    panel.innerHTML = html;

    panel.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.add) return addNode(b.dataset.add);
      if (node) {
        if (b.dataset.shape) {
          const s = SHAPES[b.dataset.shape];
          if (['diamond', 'heart', 'cloud', 'note'].includes(b.dataset.shape) || ['diamond', 'heart', 'cloud', 'note'].includes(node.shape)) {
            node.x += (node.w - s.w) / 2; node.y += (node.h - s.h) / 2; node.w = s.w; node.h = s.h;
          }
          node.shape = b.dataset.shape;
        }
        if (b.dataset.color) node.color = b.dataset.color;
        if (b.dataset.fs) node.fontSize = Number(b.dataset.fs);
        if (b.dataset.act === 'edit') return editText(node);
        if (b.dataset.act === 'child') return addChild(node);
        if (b.dataset.act === 'dup') return duplicate();
        if (b.dataset.act === 'del') return removeSelected();
      }
      if (edge) {
        if (b.dataset.style) edge.style = b.dataset.style;
        if (b.dataset.ecolor) edge.color = b.dataset.ecolor;
        if (b.dataset.act === 'arrow') edge.arrow = edge.arrow === false;
        if (b.dataset.act === 'dashed') edge.dashed = !edge.dashed;
        if (b.dataset.act === 'flip') [edge.from, edge.to] = [edge.to, edge.from];
        if (b.dataset.act === 'label') return editEdgeLabel(edge);
        if (b.dataset.act === 'del') return removeSelected();
      }
      commit();
      draw();
      renderPanel();
    };
  }

  editor = {
    destroy() {
      save.flush();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    },
  };

  renderPanel();
  requestAnimationFrame(fit);
}

// ---------- Export PNG ----------
function exportPNG(data, name) {
  if (!data.nodes.length) return toast('Le schéma est vide', '🤍');
  const markup = standaloneSVG(data, { background: '#fff7fb', pad: 40 });
  const b = bounds(data, 40);
  const scale = 2;
  const img = new Image();
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = b.w * scale;
    canvas.height = b.h * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, b.w, b.h);
    URL.revokeObjectURL(url);
    const a = document.createElement('a');
    a.download = `${(name || 'schema').replace(/[\\/:*?"<>|]/g, '')}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
    toast('Image téléchargée', '📸');
  };
  img.onerror = () => toast('Impossible de créer l\'image', '🥺');
  img.src = url;
}
