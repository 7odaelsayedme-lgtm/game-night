// شاشة الغرفة: غرفة الانتظار، ثم شاشة اللعب، ثم النتائج — كلها تُرسم من حالة الخادم
import { t, pick, errText } from '../i18n.js';
import { h, esc, $, $$, toast, copyText, icon } from '../ui.js';
import { call, actionId } from '../net.js';
import { sfx } from '../prefs.js';
import { GAMES, getGameMeta } from '/shared/catalog.js';
import { RENDERERS } from '../games/index.js';
import { gameCard, playersLabel } from './home.js';

const inviteUrl = (code) => `${location.origin}/r/${code}`;

export default {
  mount(root, app) {
    this.app = app;
    this.mode = null;
    this.renderer = null;
    this.resultPlayedFor = null;
    this.lastCount = 0;
    this.rulesOpen = false;
    this.el = h(`
      <main class="room">
        <header class="room-head">
          <button class="code-chip" data-copy-code dir="ltr"></button>
          <span class="round-label"></span>
          <button class="btn btn-text leave-btn">${icon.door}<span>${t('leave')}</span></button>
        </header>
        <div class="room-body"></div>
      </main>`);
    root.append(this.el);
    $(this.el, '.leave-btn').addEventListener('click', () => this.leave());
    $(this.el, '[data-copy-code]').addEventListener('click', async () => {
      if (await copyText(this.room.code)) toast(t('copied'));
    });
    // عدّاد ثوانٍ لمهلة المنقطعين
    this.ticker = setInterval(() => {
      if (this.room?.players.some((p) => !p.connected)) this.update(app);
    }, 1000);
    this.update(app);
  },

  unmount() {
    clearInterval(this.ticker);
    this.renderer?.unmount?.();
    this.el?.remove();
  },

  get room() { return this.app.store.room; },

  byId(id) {
    const p = this.room.players.find((x) => x.id === id);
    if (!p || p.connected) return p;
    const elapsed = Date.now() - this.app.store.receivedAt;
    return { ...p, graceLeftMs: Math.max(0, (p.graceLeftMs || 0) - elapsed) };
  },

  async leave() {
    if (!confirm(t('leaveConfirm'))) return;
    await this.app.leaveRoom();
  },

  update(app) {
    const room = this.room;
    if (!room) return;
    const me = room.players.find((p) => p.id === room.you);
    const isHost = room.hostId === room.you;
    $(this.el, '.code-chip').textContent = room.code;
    $(this.el, '.round-label').textContent = room.phase !== 'lobby' && room.round ? t('round', { n: room.round }) : '';
    if (room.players.length > this.lastCount && this.lastCount) sfx.join();
    this.lastCount = room.players.length;

    const mode = room.phase === 'lobby' ? 'lobby' : `game:${room.gameId}:${room.round}`;
    const body = $(this.el, '.room-body');
    if (mode !== this.mode) {
      this.renderer?.unmount?.();
      this.renderer = null;
      body.innerHTML = '';
      this.mode = mode;
      if (mode === 'lobby') this.buildLobby(body);
      else this.buildGame(body);
    }
    if (mode === 'lobby') this.updateLobby({ room, me, isHost });
    else this.updateGame({ room, me, isHost });
  },

  // ---------------- غرفة الانتظار ----------------
  buildLobby(body) {
    const code = this.room.code;
    body.append(h(`
      <div class="lobby">
        <section class="invite-card">
          <p class="label">${t('roomCode')}</p>
          <div class="code-tiles" dir="ltr">${[...code].map((c) => `<span>${esc(c)}</span>`).join('')}</div>
          <div class="invite-actions">
            <button class="btn btn-primary" data-share>${icon.share}<span>${t('shareInvite')}</span></button>
            <a class="btn btn-whatsapp" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`${t('inviteText', { code })} ${inviteUrl(code)}`)}">${icon.whatsapp}<span>${t('whatsapp')}</span></a>
            <button class="btn btn-ghost" data-copy>${icon.copy}<span>${t('copyLink')}</span></button>
          </div>
        </section>
        <section class="players-card">
          <h2>${t('playersHeading')} <span class="count"></span></h2>
          <ul class="player-list"></ul>
        </section>
        <section class="picker-card">
          <h2 class="picker-title"></h2>
          <div class="picker"></div>
          <details class="rules"><summary>${t('howToPlay')}</summary><ol></ol></details>
        </section>
        <footer class="start-bar"></footer>
      </div>`));
    $(body, '[data-copy]').addEventListener('click', async () => { if (await copyText(inviteUrl(code))) toast(t('copied')); });
    $(body, '[data-share]').addEventListener('click', async () => {
      const data = { title: t('brand'), text: t('inviteText', { code }), url: inviteUrl(code) };
      if (navigator.share) { try { await navigator.share(data); } catch { /* أُلغي */ } } else if (await copyText(inviteUrl(code))) toast(t('copied'));
    });
    const rules = $(body, '.rules');
    rules.open = this.rulesOpen;
    rules.addEventListener('toggle', () => { this.rulesOpen = rules.open; });
  },

  playerRows(room) {
    return room.players.map((p) => {
      const pp = this.byId(p.id);
      return `
      <li class="${p.connected ? '' : 'is-off'}">
        <i class="dot" style="background:${p.color}"></i>
        <span class="pname">${esc(p.name)}</span>
        ${p.id === room.you ? `<span class="tag">${t('you')}</span>` : ''}
        ${p.id === room.hostId ? `<span class="tag tag-host">${icon.crown}${t('host')}</span>` : ''}
        <span class="status">${p.connected ? '' : `${t('offline')} · ${t('reconnectingIn', { s: Math.ceil(pp.graceLeftMs / 1000) })}`}</span>
        ${p.score ? `<span class="score">${t('points', { n: p.score })}</span>` : ''}
      </li>`;
    }).join('');
  },

  updateLobby({ room, isHost }) {
    const body = $(this.el, '.lobby');
    $(body, '.count').textContent = `${room.players.length}/${room.maxPlayers}`;
    $(body, '.player-list').innerHTML = this.playerRows(room);

    const ready = GAMES.filter((g) => g.status === 'ready');
    const meta = getGameMeta(room.gameId);
    $(body, '.picker-title').textContent = isHost ? t('chooseGame') : t('selectedGame');
    const picker = $(body, '.picker');
    const key = `${isHost}:${room.gameId}`;
    if (picker.dataset.key !== key) {
      picker.dataset.key = key;
      picker.innerHTML = isHost
        ? ready.map((g) => `<button class="pick ${g.id === room.gameId ? 'on' : ''}" data-id="${g.id}" aria-pressed="${g.id === room.gameId}">${gameCard(g)}</button>`).join('')
          + `<p class="hint">${t('moreSoon')}</p>`
        : gameCard(meta);
      $$(picker, '.pick').forEach((b) => b.addEventListener('click', async () => {
        const res = await call('room:selectGame', { gameId: b.dataset.id });
        if (!res.ok) toast(errText(res.error), 'error');
      }));
      $(body, '.rules ol').innerHTML = (pick(meta.rules) || []).map((r) => `<li>${esc(r)}</li>`).join('');
    }

    const connected = room.players.filter((p) => p.connected).length;
    const bar = $(body, '.start-bar');
    const host = room.players.find((p) => p.id === room.hostId);
    if (isHost) {
      const enough = connected >= meta.minPlayers;
      const reason = enough ? '' : (meta.minPlayers === 2 ? t('need2') : t('needPlayers', { n: meta.minPlayers }));
      bar.innerHTML = `
        ${reason ? `<p class="bar-note">${reason}</p>` : ''}
        <button class="btn btn-primary btn-xl btn-block" data-start ${enough ? '' : 'disabled'}>${t('start')} · ${esc(pick(meta.name))}</button>`;
      $(bar, '[data-start]').addEventListener('click', (e) => this.start(e.currentTarget));
    } else {
      bar.innerHTML = `<p class="bar-wait"><span class="pulse" aria-hidden="true"></span>${t('waitingHost', { name: esc(host?.name || '') })}</p>`;
    }
  },

  async start(btn) {
    if (btn) btn.disabled = true;
    const res = await call('game:start');
    if (!res.ok) { toast(errText(res.error), 'error'); if (btn) btn.disabled = false; }
  },

  // ---------------- اللعب والنتائج ----------------
  buildGame(body) {
    body.append(h('<div class="game-area"><div class="stage"></div><section class="results" hidden></section></div>'));
    const Renderer = RENDERERS[this.room.gameId];
    if (!Renderer) return;
    this.renderer = Object.create(Renderer);
    this.renderer.mount($(body, '.stage'), this.gameCtx());
  },

  gameCtx() {
    return {
      room: this.room,
      byId: (id) => this.byId(id),
      // تقدير وقت الخادم الحالي لعرض العدادات بدقة
      now: () => Date.now() + ((this.room?.serverNow || Date.now()) - this.app.store.receivedAt),
      act: (payload) => call('game:action', { ...payload, actionId: actionId() }),
      onError: (code) => { sfx.error(); toast(errText(code), 'error'); },
    };
  },

  updateGame({ room, isHost }) {
    const ctx = this.gameCtx();
    this.renderer?.update(ctx);
    const panel = $(this.el, '.results');
    if (room.phase !== 'results') { panel.hidden = true; return; }

    const out = room.outcome || { winners: [], draw: true };
    const iWon = out.winners.includes(room.you);
    const iPlayed = room.game?.you != null;
    let title;
    if (out.draw) title = t('draw');
    else if (iWon) title = t('youWon');
    else if (iPlayed) title = t('youLost');
    else title = t('winnerIs', { name: esc(out.winners.map((id) => this.byId(id)?.name).filter(Boolean).join('، ')) });

    if (this.resultPlayedFor !== this.mode) {
      this.resultPlayedFor = this.mode;
      (out.draw ? sfx.draw : iWon ? sfx.win : iPlayed ? sfx.lose : sfx.tap)();
    }

    const note = this.renderer?.resultNote?.(ctx) || '';
    const ranked = [...room.players].sort((a, b) => b.score - a.score);
    const host = room.players.find((p) => p.id === room.hostId);
    panel.hidden = false;
    panel.className = `results ${out.draw ? 'is-draw' : iWon ? 'is-win' : 'is-loss'}`;
    panel.innerHTML = `
      <h2 class="result-title">${title}</h2>
      ${note ? `<p class="result-note">${note}</p>` : ''}
      <h3>${t('standings')}</h3>
      <ol class="standings">
        ${ranked.map((p, i) => `<li class="${p.id === room.you ? 'me' : ''} ${out.winners.includes(p.id) ? 'winner' : ''}">
          <span class="rank">${i + 1}</span><i class="dot" style="background:${p.color}"></i>
          <span class="pname">${esc(p.name)}</span><span class="score">${t('points', { n: p.score })}</span></li>`).join('')}
      </ol>
      <div class="result-actions">
        ${isHost
          ? `<button class="btn btn-primary btn-xl btn-block" data-again>${t('playAgain')}</button>
             <button class="btn btn-ghost btn-block" data-change>${t('changeGame')}</button>`
          : `<p class="bar-wait"><span class="pulse" aria-hidden="true"></span>${t('waitingNext', { name: esc(host?.name || '') })}</p>`}
      </div>`;
    $(panel, '[data-again]')?.addEventListener('click', (e) => this.start(e.currentTarget));
    $(panel, '[data-change]')?.addEventListener('click', async () => {
      const res = await call('room:lobby');
      if (!res.ok) toast(errText(res.error), 'error');
    });
  },
};

export { playersLabel };
