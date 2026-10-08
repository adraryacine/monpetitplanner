import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DB_PATH = join(__dirname, 'data', 'planner.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS lists (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  emoji      TEXT DEFAULT '🌸',
  color      TEXT DEFAULT '#f472b6',
  position   INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id    INTEGER REFERENCES lists(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  notes      TEXT DEFAULT '',
  priority   INTEGER DEFAULT 0,          -- 0 normale, 1 importante, 2 urgente
  due_date   TEXT,                       -- YYYY-MM-DD
  subtasks   TEXT DEFAULT '[]',          -- JSON [{text, done}]
  done       INTEGER DEFAULT 0,
  done_at    TEXT,
  position   INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  date       TEXT NOT NULL,              -- YYYY-MM-DD
  start_time TEXT NOT NULL,              -- HH:MM
  end_time   TEXT NOT NULL,              -- HH:MM
  category   TEXT DEFAULT 'perso',
  color      TEXT,
  location   TEXT DEFAULT '',
  notes      TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS habits (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  emoji      TEXT DEFAULT '✨',
  color      TEXT DEFAULT '#c084fc',
  position   INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS habit_logs (
  habit_id INTEGER REFERENCES habits(id) ON DELETE CASCADE,
  date     TEXT NOT NULL,
  PRIMARY KEY (habit_id, date)
);

CREATE TABLE IF NOT EXISTS journal (
  date      TEXT PRIMARY KEY,
  mood      INTEGER,                     -- 1..5
  water     INTEGER DEFAULT 0,           -- verres
  sleep     REAL,                        -- heures
  gratitude TEXT DEFAULT '["","",""]',
  content   TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS diagrams (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  data       TEXT DEFAULT '{"nodes":[],"edges":[]}',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks(list_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due  ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
`);

// ---------- Données de démarrage (premier lancement uniquement) ----------
function localDate(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const isEmpty = db.prepare('SELECT COUNT(*) AS n FROM lists').get().n === 0;
if (isEmpty) {
  const setS = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  setS.run('name', 'Warda');
  setS.run('theme', 'rose');

  const addList = db.prepare('INSERT INTO lists (name, emoji, color, position) VALUES (?, ?, ?, ?)');
  const perso = addList.run('Perso', '🌸', '#f472b6', 0).lastInsertRowid;
  const travail = addList.run('Travail', '💼', '#a78bfa', 1).lastInsertRowid;
  const courses = addList.run('Courses', '🛍️', '#fb7185', 2).lastInsertRowid;
  const beaute = addList.run('Self-care', '💅', '#e879f9', 3).lastInsertRowid;

  const addTask = db.prepare(
    'INSERT INTO tasks (list_id, title, notes, priority, due_date, subtasks, position) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  addTask.run(perso, 'Appeler maman 💕', '', 1, localDate(0), '[]', 0);
  addTask.run(perso, 'Réserver le resto pour samedi', 'Un endroit mignon avec terrasse', 0, localDate(2), '[]', 1);
  addTask.run(travail, 'Finir la présentation', '', 2, localDate(0),
    JSON.stringify([{ text: 'Plan', done: true }, { text: 'Slides', done: false }, { text: 'Relecture', done: false }]), 0);
  addTask.run(travail, 'Répondre aux mails', '', 0, localDate(1), '[]', 1);
  addTask.run(courses, 'Fraises 🍓', '', 0, null, '[]', 0);
  addTask.run(courses, 'Lait d\'avoine', '', 0, null, '[]', 1);
  addTask.run(courses, 'Bougie parfumée 🕯️', '', 0, null, '[]', 2);
  addTask.run(beaute, 'Masque cheveux', '', 0, localDate(0), '[]', 0);
  addTask.run(beaute, 'Prendre RDV manucure', '', 1, localDate(3), '[]', 1);

  const addEvent = db.prepare(
    'INSERT INTO events (title, date, start_time, end_time, category, location) VALUES (?, ?, ?, ?, ?, ?)'
  );
  addEvent.run('Réunion d\'équipe', localDate(0), '10:00', '11:00', 'travail', 'Bureau');
  addEvent.run('Déjeuner avec Sarah 🥗', localDate(0), '12:30', '13:30', 'sortie', 'Café des fleurs');
  addEvent.run('Yoga 🧘‍♀️', localDate(0), '18:30', '19:30', 'sport', 'Studio');
  addEvent.run('Ciné 🎬', localDate(2), '20:00', '22:30', 'sortie', '');
  addEvent.run('Rendez-vous coiffeur', localDate(4), '15:00', '16:00', 'rdv', '');

  const addHabit = db.prepare('INSERT INTO habits (name, emoji, color, position) VALUES (?, ?, ?, ?)');
  const h1 = addHabit.run('Boire 2L d\'eau', '💧', '#93c5fd', 0).lastInsertRowid;
  const h2 = addHabit.run('Skincare', '🧴', '#f9a8d4', 1).lastInsertRowid;
  const h3 = addHabit.run('Lire 20 minutes', '📖', '#c4b5fd', 2).lastInsertRowid;
  const h4 = addHabit.run('Sport / marche', '🏃‍♀️', '#86efac', 3).lastInsertRowid;
  const log = db.prepare('INSERT OR IGNORE INTO habit_logs (habit_id, date) VALUES (?, ?)');
  for (let i = 1; i <= 6; i++) {
    log.run(h1, localDate(-i));
    if (i % 2) log.run(h2, localDate(-i));
    if (i < 4) log.run(h3, localDate(-i));
    if (i % 3 === 0) log.run(h4, localDate(-i));
  }

  const addJournal = db.prepare('INSERT OR IGNORE INTO journal (date, mood, water) VALUES (?, ?, ?)');
  [4, 3, 5, 4, 2, 4].forEach((m, i) => addJournal.run(localDate(-(i + 1)), m, 4 + (i % 4)));

  const demo = {
    nodes: [
      { id: 'n1', x: 365, y: 190, w: 200, h: 170, shape: 'heart', color: '#f9a8d4', text: 'Mes objectifs 2026', fontSize: 15 },
      { id: 'n2', x: 120, y: 80, w: 150, h: 56, shape: 'round', color: '#c4b5fd', text: 'Santé 🧘‍♀️', fontSize: 14 },
      { id: 'n3', x: 640, y: 80, w: 150, h: 56, shape: 'round', color: '#fbcfe8', text: 'Carrière 💼', fontSize: 14 },
      { id: 'n4', x: 120, y: 380, w: 150, h: 56, shape: 'round', color: '#fde68a', text: 'Voyages ✈️', fontSize: 14 },
      { id: 'n5', x: 640, y: 380, w: 150, h: 56, shape: 'round', color: '#a7f3d0', text: 'Finances 💰', fontSize: 14 },
      { id: 'n6', x: 110, y: 0, w: 170, h: 46, shape: 'note', color: '#fef3c7', text: 'Yoga 3x / semaine', fontSize: 13 },
      { id: 'n7', x: 110, y: 470, w: 170, h: 46, shape: 'note', color: '#fef3c7', text: 'Japon au printemps 🌸', fontSize: 13 },
    ],
    edges: [
      { id: 'e1', from: 'n1', to: 'n2', label: '', dashed: false, arrow: true },
      { id: 'e2', from: 'n1', to: 'n3', label: '', dashed: false, arrow: true },
      { id: 'e3', from: 'n1', to: 'n4', label: '', dashed: false, arrow: true },
      { id: 'e4', from: 'n1', to: 'n5', label: '', dashed: false, arrow: true },
      { id: 'e5', from: 'n2', to: 'n6', label: '', dashed: true, arrow: false },
      { id: 'e6', from: 'n4', to: 'n7', label: '', dashed: true, arrow: false },
    ],
  };
  db.prepare('INSERT INTO diagrams (name, data) VALUES (?, ?)').run('Mes objectifs 💖', JSON.stringify(demo));
}
