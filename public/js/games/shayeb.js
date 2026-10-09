// واجهة «الشايب»: أوراق جارك مقلوبة تسحب منها، وأوراقك مكشوفة لك وحدك.
import { t, lang } from '../i18n.js';
import { h, esc, $, $$, toast } from '../ui.js';
import { sfx, buzz } from '../prefs.js';

const SUIT = { s: '♠', h: '♥', d: '♦', c: '♣' };
const SHAYEB = 'K-s';
export const playingCard = (id) => {
  const [r, s] = id.split('-');
  const red = s === 'h' || s === 'd';
  if (id === SHAYEB) {
    return `<span class="pcard shayeb"><i class="pc-corner">K ${SUIT[s]}</i><b>♚</b><em>${lang() === 'en' ? 'King' : 'الشايب'}</em></span>`;
  }
  return `<span class="pcard ${red ? 'red' : ''}"><i class="pc-corner">${r} ${SUIT[s]}</i><b>${SUIT[s]}</b><em>${r}</em></span>`;
};
const label = (id) => { const [r, s] = id.split('-'); return `${r}${SUIT[s]}`; };

export default {
  mount(root, ctx) {
    this.ctx = ctx;
    this.pending = false;
    this.lastSeq = ctx.room.game.last?.seq || 0;
    this.el = h(`
      <div class="sh">
        <div class="sh-players"></div>
        <p class="turn-line" aria-live="polite"></p>
        <div class="spy-timer"><div class="bar"><i></i></div><span></span></div>
        <section class="sh-target"><h3></h3><div class="sh-backs"></div></section>
        <p class="sh-event"></p>
        <section class="sh-mine">
          <div class="sh-mine-head"><h3>${t('yourHand')}</h3><button class="btn btn-text btn-sm" data-shuffle>${t('shuffleHand')}</button></div>
          <p class="sh-warn" hidden>${t('holdingShayeb')}</p>
          <div class="sh-hand"></div>
        </section>
        <p class="muted sh-pile"></p>
      </div>`);
    root.append(this.el);
    $(this.el, '[data-shuffle]').addEventListener('click', async () => {
      const res = await this.ctx.act({ type: 'shuffle' });
      if (res.ok) { toast(t('shuffled')); sfx.dice(); } else this.ctx.onError(res.error);
    });
    this.timer = setInterval(() => this.paintTimer(), 250);
    this.update(ctx);
  },

  unmount() { clearInterval(this.timer); this.el?.remove(); },
  get g() { return this.ctx.room.game; },
  name(id) { return this.ctx.byId(id)?.name || '—'; },

  async pick(i) {
    const g = this.g;
    if (this.pending || g.result || g.turnId !== g.you) return;
    this.pending = true;
    buzz();
    const res = await this.ctx.act({ type: 'pick', index: i });
    this.pending = false;
    if (!res.ok) this.ctx.onError(res.error);
  },

  update(ctx) {
    this.ctx = ctx;
    const g = this.g;
    const me = ctx.room.you;
    const mine = !g.result && g.turnId === me;

    $(this.el, '.sh-players').innerHTML = g.order.map((id) => {
      const p = ctx.byId(id);
      const cls = [g.turnId === id && !g.result ? 'active' : '', g.targetId === id && !g.result ? 'target' : '', g.safe.includes(id) ? 'safe' : '', p && !p.connected ? 'is-off' : ''].join(' ');
      return `<div class="opp ${cls}"><i style="background:${p?.color || 'var(--line)'}"></i><span class="nm">${esc(this.name(id))}${id === me ? ` <small>(${t('you')})</small>` : ''}</span>
        ${g.safe.includes(id) ? `<em class="safe-tag">${t('safeTag')}</em>` : `<b class="count">${g.counts[id]}</b>`}</div>`;
    }).join('');

    const line = $(this.el, '.turn-line');
    const tp = ctx.byId(g.turnId);
    line.classList.toggle('mine', mine);
    if (g.result) line.textContent = g.result.loser ? t('shayebLoser', { name: this.name(g.result.loser) }) : '';
    else if (tp && !tp.connected) line.textContent = t('waitingFor', { name: tp.name, s: Math.ceil((tp.graceLeftMs || 0) / 1000) });
    else if (mine) line.innerHTML = `<strong>${t('yourTurn')}</strong>`;
    else line.textContent = t('picking', { name: this.name(g.turnId), target: this.name(g.targetId) });

    // أوراق الهدف مقلوبة
    const target = $(this.el, '.sh-target');
    target.hidden = !!g.result || !g.targetId;
    if (!target.hidden) {
      $(target, 'h3').textContent = mine ? t('pickFrom', { name: this.name(g.targetId) }) : t('cardsOf', { name: this.name(g.targetId) });
      const n = g.counts[g.targetId] || 0;
      const sig = `${n}|${mine}|${g.targetId}`;
      const backs = $(target, '.sh-backs');
      if (backs.dataset.sig !== sig) {
        backs.dataset.sig = sig;
        backs.classList.toggle('can-pick', mine);
        backs.style.setProperty('--n', n);
        backs.innerHTML = Array.from({ length: n }, (_, i) => `<button class="back-card" data-i="${i}" ${mine ? '' : 'disabled'} aria-label="${i + 1}"><span class="pcard back"></span></button>`).join('');
        $$(backs, '.back-card').forEach((b) => b.addEventListener('click', () => this.pick(Number(b.dataset.i))));
      }
    }

    // آخر حدث
    const L = g.last;
    let ev = '';
    if (L?.type === 'pick') {
      ev = L.pair ? t('madePair', { name: this.name(L.pid), rank: L.pair[0].split('-')[0] }) : t('noPair', { name: this.name(L.pid), target: this.name(L.target) });
      if (L.pid === me && L.card) ev = `${t('gotCard', { card: label(L.card) })} · ${ev}`;
    }
    $(this.el, '.sh-event').textContent = ev;
    if (L && L.seq !== this.lastSeq) {
      this.lastSeq = L.seq;
      if (L.type === 'pick') {
        if (L.pair) sfx.send(); else sfx.tap();
        if (L.target === me && L.card === null && g.hand.indexOf(SHAYEB) < 0 && this.hadShayeb) { sfx.up(); }
      }
    }
    this.hadShayeb = g.hand.includes(SHAYEB);

    // يدي
    const mineSec = $(this.el, '.sh-mine');
    mineSec.hidden = !g.you;
    $(this.el, '.sh-warn').hidden = !g.hand.includes(SHAYEB) || !!g.result;
    const hand = $(this.el, '.sh-hand');
    const hsig = g.hand.join(',');
    if (hand.dataset.sig !== hsig) {
      hand.dataset.sig = hsig;
      hand.innerHTML = g.hand.length ? g.hand.map((id) => playingCard(id)).join('') : `<p class="muted">${g.safe.includes(me) ? t('safeTag') + ' ✓' : ''}</p>`;
    }
    $(this.el, '[data-shuffle]').hidden = g.hand.length < 2 || !!g.result;
    $(this.el, '.sh-pile').textContent = t('pairsOut', { n: g.pile.length });
    this.paintTimer();
  },

  paintTimer() {
    const g = this.g;
    const el = $(this.el, '.spy-timer');
    if (!g.deadline || g.result) { el.hidden = true; return; }
    el.hidden = false;
    const left = Math.max(0, g.deadline - this.ctx.now());
    $(el, 'i').style.width = `${Math.min(100, (left / 25000) * 100)}%`;
    $(el, 'span').textContent = t('secondsLeft', { s: Math.ceil(left / 1000) });
    el.classList.toggle('low', left < 7000);
  },

  resultNote(ctx) {
    const r = ctx.room.game?.result;
    return r?.loser ? esc(t('shayebLoser', { name: this.name(r.loser) })) : '';
  },
};
