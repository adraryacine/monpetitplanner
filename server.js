import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(join(__dirname, 'public')));
app.use('/vendor/chart.js', express.static(join(__dirname, 'node_modules', 'chart.js', 'dist')));

// node:sqlite refuse `undefined` comme paramètre
const val = (v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v);

// Petit wrapper pour renvoyer les erreurs en JSON
const route = (fn) => (req, res) => {
  try {
    const out = fn(req, res);
    if (out !== undefined) res.json(out);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
};

/**
 * Déclare les routes CRUD standard d'une table.
 * fields : colonnes modifiables par l'API
 * hooks.beforeSave(body, existing) : permet d'ajuster les données avant écriture
 */
function crud(path, table, fields, { orderBy = 'id', where, beforeSave } = {}) {
  const getOne = db.prepare(`SELECT * FROM ${table} WHERE id = ?`);

  app.get(`/api/${path}`, route((req) => {
    const { clause, params } = where ? where(req.query) : { clause: '', params: [] };
    return db.prepare(`SELECT * FROM ${table} ${clause} ORDER BY ${orderBy}`).all(...params);
  }));

  app.get(`/api/${path}/:id`, route((req, res) => {
    const row = getOne.get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Introuvable' });
    return row;
  }));

  app.post(`/api/${path}`, route((req) => {
    const body = beforeSave ? beforeSave({ ...req.body }, null) : req.body;
    const cols = fields.filter((f) => body[f] !== undefined);
    const sql = cols.length
      ? `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
      : `INSERT INTO ${table} DEFAULT VALUES`;
    const { lastInsertRowid } = db.prepare(sql).run(...cols.map((c) => val(body[c])));
    return getOne.get(lastInsertRowid);
  }));

  app.put(`/api/${path}/:id`, route((req, res) => {
    const existing = getOne.get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Introuvable' });
    const body = beforeSave ? beforeSave({ ...req.body }, existing) : req.body;
    const cols = fields.filter((f) => body[f] !== undefined);
    if (cols.length) {
      db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
        .run(...cols.map((c) => val(body[c])), req.params.id);
    }
    return getOne.get(req.params.id);
  }));

  app.delete(`/api/${path}/:id`, route((req) => {
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(req.params.id);
    return { ok: true };
  }));
}

// ---------- Listes & tâches ----------
crud('lists', 'lists', ['name', 'emoji', 'color', 'position'], { orderBy: 'position, id' });

crud('tasks', 'tasks',
  ['list_id', 'title', 'notes', 'priority', 'due_date', 'subtasks', 'done', 'done_at', 'position'],
  {
    orderBy: 'done, position, id',
    where: (q) => (q.list_id ? { clause: 'WHERE list_id = ?', params: [q.list_id] } : { clause: '', params: [] }),
    beforeSave(body, existing) {
      if (Array.isArray(body.subtasks)) body.subtasks = JSON.stringify(body.subtasks);
      if (body.due_date === '') body.due_date = null;
      if (body.done !== undefined) {
        const done = Number(Boolean(body.done));
        body.done = done;
        if (done && !(existing && existing.done)) body.done_at = nowLocal();
        if (!done) body.done_at = null;
      }
      return body;
    },
  });

function nowLocal() {
  return db.prepare("SELECT datetime('now','localtime') AS t").get().t;
}

// ---------- Planning ----------
crud('events', 'events',
  ['title', 'date', 'start_time', 'end_time', 'category', 'color', 'location', 'notes'],
  {
    orderBy: 'date, start_time',
    where: (q) => (q.from && q.to
      ? { clause: 'WHERE date BETWEEN ? AND ?', params: [q.from, q.to] }
      : { clause: '', params: [] }),
  });

// ---------- Habitudes ----------
crud('habits', 'habits', ['name', 'emoji', 'color', 'position'], { orderBy: 'position, id' });

app.get('/api/habit-logs', route((req) => {
  const { from = '0000-00-00', to = '9999-99-99' } = req.query;
  return db.prepare('SELECT * FROM habit_logs WHERE date BETWEEN ? AND ? ORDER BY date').all(from, to);
}));

app.post('/api/habits/:id/toggle', route((req) => {
  const { date } = req.body;
  const exists = db.prepare('SELECT 1 FROM habit_logs WHERE habit_id = ? AND date = ?').get(req.params.id, date);
  if (exists) db.prepare('DELETE FROM habit_logs WHERE habit_id = ? AND date = ?').run(req.params.id, date);
  else db.prepare('INSERT INTO habit_logs (habit_id, date) VALUES (?, ?)').run(req.params.id, date);
  return { done: !exists };
}));

// ---------- Journal ----------
const emptyEntry = (date) => ({ date, mood: null, water: 0, sleep: null, gratitude: '["","",""]', content: '' });

app.get('/api/journal', route((req) => {
  const { from = '0000-00-00', to = '9999-99-99' } = req.query;
  return db.prepare('SELECT * FROM journal WHERE date BETWEEN ? AND ? ORDER BY date DESC').all(from, to);
}));

app.get('/api/journal/:date', route((req) =>
  db.prepare('SELECT * FROM journal WHERE date = ?').get(req.params.date) || emptyEntry(req.params.date)));

app.put('/api/journal/:date', route((req) => {
  const date = req.params.date;
  const current = db.prepare('SELECT * FROM journal WHERE date = ?').get(date) || emptyEntry(date);
  const body = { ...req.body };
  if (Array.isArray(body.gratitude)) body.gratitude = JSON.stringify(body.gratitude);
  const merged = { ...current };
  for (const k of ['mood', 'water', 'sleep', 'gratitude', 'content']) if (body[k] !== undefined) merged[k] = body[k];
  db.prepare(`INSERT INTO journal (date, mood, water, sleep, gratitude, content) VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(date) DO UPDATE SET mood = excluded.mood, water = excluded.water, sleep = excluded.sleep,
              gratitude = excluded.gratitude, content = excluded.content`)
    .run(date, val(merged.mood), val(merged.water), val(merged.sleep), merged.gratitude, merged.content);
  return db.prepare('SELECT * FROM journal WHERE date = ?').get(date);
}));

// ---------- Schémas ----------
crud('diagrams', 'diagrams', ['name', 'data', 'updated_at'], {
  orderBy: 'updated_at DESC',
  beforeSave(body) {
    if (body.data && typeof body.data !== 'string') body.data = JSON.stringify(body.data);
    body.updated_at = nowLocal();
    return body;
  },
});

// ---------- Réglages ----------
app.get('/api/settings', route(() =>
  Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, r.value]))));

app.put('/api/settings', route((req) => {
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(req.body)) stmt.run(k, String(v));
  return { ok: true };
}));

// ---------- Statistiques ----------
app.get('/api/stats', route((req) => {
  const { from, to } = req.query; // période de 30 jours fournie par le client (dates locales)
  return {
    doneByDay: db.prepare(`SELECT date(done_at) AS day, COUNT(*) AS n FROM tasks
                           WHERE done = 1 AND date(done_at) BETWEEN ? AND ? GROUP BY day`).all(from, to),
    byList: db.prepare(`SELECT l.id, l.name, l.emoji, l.color,
                          SUM(CASE WHEN t.done = 1 THEN 1 ELSE 0 END) AS done,
                          SUM(CASE WHEN t.done = 0 THEN 1 ELSE 0 END) AS todo
                        FROM lists l LEFT JOIN tasks t ON t.list_id = l.id
                        GROUP BY l.id ORDER BY l.position, l.id`).all(),
    totals: db.prepare(`SELECT COUNT(*) AS total, SUM(done) AS done FROM tasks`).get(),
    mood: db.prepare('SELECT date, mood, water, sleep FROM journal WHERE date BETWEEN ? AND ? ORDER BY date').all(from, to),
    habits: db.prepare(`SELECT h.id, h.name, h.emoji, COUNT(l.date) AS n
                        FROM habits h LEFT JOIN habit_logs l ON l.habit_id = h.id AND l.date BETWEEN ? AND ?
                        GROUP BY h.id ORDER BY h.position, h.id`).all(from, to),
    events: db.prepare('SELECT category, start_time, end_time FROM events WHERE date BETWEEN ? AND ?').all(from, to),
  };
}));

// ---------- Sauvegarde ----------
app.get('/api/export', route((req, res) => {
  const dump = {};
  for (const t of ['settings', 'lists', 'tasks', 'events', 'habits', 'habit_logs', 'journal', 'diagrams']) {
    dump[t] = db.prepare(`SELECT * FROM ${t}`).all();
  }
  res.setHeader('Content-Disposition', 'attachment; filename="mon-planner-sauvegarde.json"');
  res.json(dump);
}));

app.listen(PORT, () => {
  console.log(`\n  🌸  Mon petit planner est prêt !  →  http://localhost:${PORT}\n`);
});
