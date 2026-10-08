import { api } from '../api.js';
import { store, applyTheme } from '../app.js';
import { $, $$, esc, toast } from '../utils.js';

const THEMES = {
  rose: { label: 'Rose bonbon 🌸', preview: 'linear-gradient(135deg,#f472b6,#c084fc)' },
  lavande: { label: 'Lavande 💜', preview: 'linear-gradient(135deg,#a78bfa,#f0abfc)' },
  peche: { label: 'Pêche corail 🍑', preview: 'linear-gradient(135deg,#fb7185,#fdba74)' },
  nuit: { label: 'Nuit étoilée 🌙', preview: 'linear-gradient(135deg,#2c1838,#8b5cf6)' },
};

export async function render(main) {
  const s = store.settings;
  main.innerHTML = `
    <div class="page-head">
      <div><h1 class="page-title">Réglages</h1>
      <p class="page-sub">Fais de ce planner ton petit cocon 🎀</p></div>
    </div>
    <div class="grid" style="max-width:820px">
      <div class="card">
        <h3>👋 Mon prénom</h3>
        <form class="row" id="name-form">
          <input class="input" name="name" value="${esc(s.name)}" placeholder="Ton prénom" required>
          <button class="btn primary">Enregistrer</button>
        </form>
      </div>
      <div class="card">
        <h3>🎨 Mon thème</h3>
        <div class="themes">${Object.entries(THEMES).map(([k, t]) => `
          <div class="theme-card ${s.theme === k ? 'active' : ''}" data-theme-key="${k}">
            <div class="pv" style="background:${t.preview}"></div>${t.label}</div>`).join('')}</div>
      </div>
      <div class="card">
        <h3>💾 Sauvegarde</h3>
        <p class="muted small" style="margin-top:0">Toutes tes données sont stockées sur cet ordinateur, dans <code>data/planner.db</code> (SQLite).
        Tu peux aussi télécharger une copie de tout ton contenu.</p>
        <a class="btn" href="/api/export" download>⬇️ Télécharger une sauvegarde</a>
      </div>
    </div>`;

  $('#name-form', main).onsubmit = async (e) => {
    e.preventDefault();
    s.name = e.target.name.value.trim();
    await api.put('settings', { name: s.name });
    $('#brand-sub').textContent = `pour ${s.name} 💕`;
    toast(`Enchantée ${s.name} !`, '💖');
  };
  $$('.theme-card', main).forEach((card) => {
    card.onclick = async () => {
      s.theme = card.dataset.themeKey;
      applyTheme(s.theme);
      $$('.theme-card', main).forEach((c) => c.classList.toggle('active', c === card));
      await api.put('settings', { theme: s.theme });
      toast('Thème appliqué', '🎨');
    };
  });
}
