// الصفحة الرئيسية: الهوية، الأزرار الرئيسية، وقائمة الألعاب مع البحث والفلاتر
import { t, pick } from '../i18n.js';
import { h, esc, $, $$, icon } from '../ui.js';
import { GAMES, CATEGORIES } from '/shared/catalog.js';
import { THUMBS } from '../thumbs.js';
import { canInstall, onInstallChange, promptInstall } from '../pwa.js';

// عزل الأرقام والنطاقات حتى لا تنقلب في الاتجاه العربي (2–4 لا تصبح 4–2)
export const ltr = (v) => `\u2066${v}\u2069`;

export const playersLabel = (g) => {
  const base = g.minPlayers === g.maxPlayers
    ? (g.maxPlayers === 2 ? t('players2') : t('playersN', { n: g.maxPlayers }))
    : t('playersN', { n: ltr(`${g.minPlayers}–${g.maxPlayers}`) });
  return g.spectators ? `${base} ${t('spectatorsOk')}` : base;
};

export const gameCard = (g, extra = '') => `
  <article class="game-card ${g.status === 'ready' ? 'is-ready' : 'is-soon'}" data-id="${g.id}">
    <div class="thumb">${THUMBS[g.id] || ''}${g.status !== 'ready' ? `<span class="badge-soon">${t('soon')}</span>` : ''}</div>
    <div class="game-body">
      <h3>${esc(pick(g.name))}</h3>
      <p>${esc(pick(g.desc))}</p>
      <div class="meta"><span>${icon.users}${playersLabel(g)}</span><span>${icon.clock}${t('minutesShort', { m: ltr(g.minutes) })}</span></div>
      ${extra}
    </div>
  </article>`;

const SIZE_FILTERS = [
  { key: 'any', test: () => true },
  { key: '2', test: (g) => g.minPlayers <= 2 },
  { key: '3-4', test: (g) => g.maxPlayers >= 3 && g.minPlayers <= 4 },
  { key: '5-8', test: (g) => g.maxPlayers >= 5 },
];

export default {
  mount(root, app) {
    this.filter = { q: '', cat: 'all', size: 'any' };
    this.el = h(`
      <main class="home">
        <section class="hero">
          <h1 class="wordmark" aria-label="${t('brand')}">
            <span class="wm-top">${t('brandTop')}</span>
            <span class="wm-bottom">${t('brandBottom')}</span>
          </h1>
          <p class="tagline">${t('tagline')}</p>
          <div class="hero-actions">
            <a href="/create" class="btn btn-primary btn-xl" data-link>${t('createRoom')}</a>
            <a href="/join" class="btn btn-ghost btn-xl" data-link>${t('joinRoom')}</a>
          </div>
          <a href="#games" class="browse-link">${t('browseGames')}</a>
          <button type="button" class="install-btn" hidden>${t('installApp')}</button>
        </section>
        <div class="sadu" aria-hidden="true"></div>
        <section class="games" id="games">
          <h2>${t('games')}</h2>
          <div class="filters">
            <label class="search">${icon.search}<input type="search" placeholder="${t('search')}" aria-label="${t('search')}"></label>
            <div class="chips" role="group" data-kind="cat">
              <button class="chip on" data-v="all">${t('allCategories')}</button>
              ${Object.entries(CATEGORIES).map(([k, v]) => `<button class="chip" data-v="${k}">${esc(pick(v))}</button>`).join('')}
            </div>
            <div class="chips" role="group" data-kind="size">
              ${SIZE_FILTERS.map((f, i) => `<button class="chip ${i === 0 ? 'on' : ''}" data-v="${f.key}">${f.key === 'any' ? t('anyPlayers') : f.key === '2' ? t('players2') : t('playersN', { n: ltr(f.key.replace('-', '–')) })}</button>`).join('')}
            </div>
          </div>
          <div class="game-grid"></div>
        </section>
      </main>`);
    root.append(this.el);

    $(this.el, 'input[type=search]').addEventListener('input', (e) => { this.filter.q = e.target.value.trim(); this.renderGrid(app); });
    $$(this.el, '.chips').forEach((group) => group.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      $$(group, '.chip').forEach((c) => c.classList.toggle('on', c === btn));
      this.filter[group.dataset.kind] = btn.dataset.v;
      this.renderGrid(app);
    }));
    $(this.el, '.browse-link').addEventListener('click', (e) => {
      e.preventDefault();
      $(this.el, '#games').scrollIntoView({ behavior: document.documentElement.classList.contains('reduce-motion') ? 'auto' : 'smooth' });
    });
    const installBtn = $(this.el, '.install-btn');
    const sync = () => { installBtn.hidden = !canInstall(); };
    this.offInstall = onInstallChange(sync);
    sync();
    installBtn.addEventListener('click', () => promptInstall());
    this.renderGrid(app);
  },

  renderGrid(app) {
    const { q, cat, size } = this.filter;
    const sizeTest = SIZE_FILTERS.find((f) => f.key === size).test;
    const needle = q.toLowerCase();
    const list = GAMES
      .filter((g) => cat === 'all' || g.category === cat)
      .filter(sizeTest)
      .filter((g) => !needle || [g.name.ar, g.name.en, g.desc.ar, g.desc.en].some((s) => s.toLowerCase().includes(needle)))
      .sort((a, b) => (a.status === 'ready' ? 0 : 1) - (b.status === 'ready' ? 0 : 1));
    const grid = $(this.el, '.game-grid');
    if (!list.length) {
      grid.innerHTML = `<div class="empty"><p>${t('noGames')}</p><button class="btn btn-ghost" data-clear>${t('clearFilters')}</button></div>`;
      $(grid, '[data-clear]').onclick = () => {
        this.filter = { q: '', cat: 'all', size: 'any' };
        $(this.el, 'input[type=search]').value = '';
        $$(this.el, '.chips').forEach((g) => $$(g, '.chip').forEach((c, i) => c.classList.toggle('on', i === 0)));
        this.renderGrid(app);
      };
      return;
    }
    grid.innerHTML = list.map((g) => gameCard(g, g.status === 'ready' ? `<a href="/create" data-link class="btn btn-primary btn-sm">${t('playNow')}</a>` : '')).join('');
  },

  unmount() { this.offInstall?.(); this.el?.remove(); },
};
