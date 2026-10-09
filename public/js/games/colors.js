// واجهة «ألوان»: يدك في الأسفل، الطاولة في الوسط، وعدد أوراق الآخرين في الأعلى.
// الخادم يرسل أوراقك فقط؛ أوراق الآخرين لا تصل لجهازك.
import { t } from '../i18n.js';
import { h, esc, $, $$ } from '../ui.js';
import { sfx, buzz } from '../prefs.js';

const SYMBOL = { skip: '⊘', rev: '⇄', '+2': '+2', wild: '', '+4': '+4' };
export const cardHtml = (c, extra = '') => {
  const sym = SYMBOL[c.v] ?? c.v;
  const wild = c.v === 'wild' || c.v === '+4';
  const cls = `ucard c-${wild && c.c === 'w' ? 'w' : c.c} ${wild ? 'is-wild' : ''} ${/^\d$/.test(c.v) ? 'num' : 'act'}`;
  return `<span class="${cls}" ${extra}><i class="corner">${sym || '★'}</i><b>${sym || '★'}</b><i class="corner end">${sym || '★'}</i></span>`;
};

export default {
  mount(root, ctx) {
    this.ctx = ctx;
    this.pending = false;
    this.wildCard = null;
    this.lastSeq = ctx.room.game.last?.seq || 0;
    this.el = h(`
      <div class="cg">
        <div class="cg-opps"></div>
        <div class="cg-table">
          <button class="cg-deck" aria-label="${t('drawCard')}"><span class="ucard back"></span><small></small></button>
          <div class="cg-top"></div>
          <div class="cg-color"><span class="swatch"></span><small></small></div>
        </div>
        <p class="turn-line" aria-live="polite"></p>
        <p class="cg-event"></p>
        <div class="spy-timer"><div class="bar"><i></i></div><span></span></div>
        <div class="cg-actions"></div>
        <div class="cg-hand-wrap"><div class="cg-hand"></div></div>
        <div class="cg-picker" hidden>
          <p>${t('chooseColor')}</p>
          <div>${['r', 'y', 'g', 'b'].map((c) => `<button class="pick-color c-${c}" data-color="${c}" aria-label="${t(`col_${c}`)}"></button>`).join('')}</div>
          <button class="btn btn-text" data-cancel>${t('back')}</button>
        </div>
      </div>`);
    root.append(this.el);
    $(this.el, '.cg-deck').addEventListener('click', () => this.send({ type: 'draw' }));
    $$(this.el, '.pick-color').forEach((b) => b.addEventListener('click', () => {
      const id = this.wildCard;
      this.wildCard = null;
      $(this.el, '.cg-picker').hidden = true;
      this.send({ type: 'play', cardId: id, color: b.dataset.color });
    }));
    $(this.el, '[data-cancel]').addEventListener('click', () => { this.wildCard = null; $(this.el, '.cg-picker').hidden = true; });
    this.timer = setInterval(() => this.paintTimer(), 250);
    this.update(ctx);
  },

  unmount() { clearInterval(this.timer); this.el?.remove(); },

  get g() { return this.ctx.room.game; },
  name(id) { return this.ctx.byId(id)?.name || '—'; },

  async send(payload) {
    if (this.pending) return;
    this.pending = true;
    buzz();
    const res = await this.ctx.act(payload);
    this.pending = false;
    if (!res.ok) this.ctx.onError(res.error);
  },

  playable(c) {
    const g = this.g;
    if (g.turnId !== g.you || g.result) return false;
    if (g.drawn !== null && c.id !== g.drawn) return false;
    return c.c === 'w' || c.c === g.color || c.v === g.top.v;
  },

  update(ctx) {
    this.ctx = ctx;
    const g = this.g;
    const me = ctx.room.you;
    const mine = !g.result && g.turnId === me;

    // الخصوم
    $(this.el, '.cg-opps').innerHTML = g.order.map((id) => {
      const p = ctx.byId(id);
      return `<div class="opp ${g.turnId === id && !g.result ? 'active' : ''} ${p && !p.connected ? 'is-off' : ''} ${id === me ? 'me' : ''}">
        <i style="background:${p?.color || 'var(--line)'}"></i><span class="nm">${esc(this.name(id))}</span>
        <b class="count">${g.counts[id]}</b>${g.called.includes(id) && g.counts[id] <= 2 ? '<em>!</em>' : ''}</div>`;
    }).join('');

    // الطاولة
    $(this.el, '.cg-top').innerHTML = cardHtml(g.top);
    $(this.el, '.cg-deck small').textContent = t('deckLeft', { n: g.deckCount });
    $(this.el, '.cg-deck').disabled = !mine || g.drawn !== null;
    $(this.el, '.cg-color').className = `cg-color c-${g.color}`;
    $(this.el, '.cg-color small').textContent = `${t(`col_${g.color}`)} ${g.dir === 1 ? '↻' : '↺'}`;

    // سطر الدور
    const line = $(this.el, '.turn-line');
    const tp = ctx.byId(g.turnId);
    line.classList.toggle('mine', mine);
    if (g.result) line.textContent = '';
    else if (tp && !tp.connected) line.textContent = t('waitingFor', { name: tp.name, s: Math.ceil((tp.graceLeftMs || 0) / 1000) });
    else if (mine) line.innerHTML = `<strong>${t('yourTurn')}</strong>${g.drawn !== null ? ` · ${t('drawnPlayable')}` : ''}`;
    else line.textContent = `${g.you ? '' : `${t('spectating')} · `}${t('theirTurn', { name: this.name(g.turnId) })}`;

    // آخر حدث
    const L = g.last;
    if (L && L.seq !== this.lastSeq) {
      this.lastSeq = L.seq;
      if (L.type === 'play') (L.pid === me ? sfx.placeX : sfx.placeO)();
      if (L.type === 'caught') sfx.down();
      if (L.victim === me || (L.type === 'caught' && L.victim === me)) buzz(60);
    }
    let ev = '';
    if (L?.type === 'play') ev = `${t('cPlayed', { name: this.name(L.pid) })}${L.victim ? ` · ${t('cHit', { victim: this.name(L.victim), n: L.card.v === '+4' ? 4 : 2 })}` : ''}`;
    else if (L?.type === 'draw') ev = t('cDrew', { name: this.name(L.pid) });
    else if (L?.type === 'timeout') ev = t('cTimeout', { name: this.name(L.pid) });
    else if (L?.type === 'caught') ev = t('cCaught', { name: this.name(L.pid), victim: this.name(L.victim) });
    $(this.el, '.cg-event').textContent = ev;

    // الأزرار
    const actions = [];
    const myCount = g.counts[me] ?? 99;
    if (g.you && !g.result && myCount <= 2) {
      const done = g.called.includes(me);
      actions.push(`<button class="btn ${done ? 'btn-ghost' : 'btn-primary'} call-btn" data-call ${done ? 'disabled' : ''}>${done ? t('called') : t('callColors')}</button>`);
    }
    if (mine && g.drawn !== null) actions.push(`<button class="btn btn-ghost" data-pass>${t('passTurn')}</button>`);
    if (g.you && g.exposed && g.exposed !== me && !g.result) actions.push(`<button class="btn btn-spy" data-catch>${esc(t('catchIt', { name: this.name(g.exposed) }))}</button>`);
    const box = $(this.el, '.cg-actions');
    const sig = actions.join('');
    if (box.dataset.sig !== sig) {
      box.dataset.sig = sig;
      box.innerHTML = sig;
      $(box, '[data-call]')?.addEventListener('click', () => this.send({ type: 'call' }));
      $(box, '[data-pass]')?.addEventListener('click', () => this.send({ type: 'pass' }));
      $(box, '[data-catch]')?.addEventListener('click', () => this.send({ type: 'catch' }));
    }

    // يدي
    const hand = $(this.el, '.cg-hand');
    hand.classList.toggle('my-turn', mine);
    const order = { r: 0, y: 1, g: 2, b: 3, w: 4 };
    const sorted = [...g.hand].sort((a, b) => (order[a.c] - order[b.c]) || String(a.v).localeCompare(String(b.v), 'en', { numeric: true }));
    const hsig = `${sorted.map((c) => c.id).join(',')}|${mine}|${g.drawn}|${g.color}|${g.top.id}`;
    if (hand.dataset.sig !== hsig) {
      hand.dataset.sig = hsig;
      hand.innerHTML = sorted.map((c) => `<button class="hand-card ${this.playable(c) ? 'ok' : ''} ${g.drawn === c.id ? 'drawn' : ''}" data-id="${c.id}">${cardHtml(c)}</button>`).join('');
      $$(hand, '.hand-card').forEach((b) => b.addEventListener('click', () => {
        const c = g.hand.find((x) => x.id === Number(b.dataset.id));
        if (!c || !this.playable(c)) return this.ctx.onError(g.turnId !== me ? 'not_your_turn' : 'cant_play');
        if (c.c === 'w') { this.wildCard = c.id; $(this.el, '.cg-picker').hidden = false; return; }
        this.send({ type: 'play', cardId: c.id });
      }));
    }
    this.el.classList.toggle('spectator', !g.you);
    this.paintTimer();
  },

  paintTimer() {
    const g = this.g;
    const el = $(this.el, '.spy-timer');
    if (!g.deadline || g.result) { el.hidden = true; return; }
    el.hidden = false;
    const left = Math.max(0, g.deadline - this.ctx.now());
    $(el, 'i').style.width = `${Math.min(100, (left / 30000) * 100)}%`;
    $(el, 'span').textContent = t('secondsLeft', { s: Math.ceil(left / 1000) });
    el.classList.toggle('low', left < 8000);
  },

  resultNote() { return ''; },
};
