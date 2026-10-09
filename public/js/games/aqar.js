// واجهة «ملك العقار»: لوحة 24 خانة حول لوحة تحكم في الوسط، ثم اللاعبون وممتلكاتي.
import { t, lang } from '../i18n.js';
import { h, esc, $, $$ } from '../ui.js';
import { sfx, buzz } from '../prefs.js';
import { BOARD, GROUP_COLORS, CHANCE, CHEST } from '/shared/aqar-board.js';

const N = (pair) => (lang() === 'en' ? pair[1] : pair[0]);
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const die = (v) => `<span class="mini-die">${Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[v]?.includes(i) ? 'on' : ''}"></i>`).join('')}</span>`;
const ICON = { start: '⟲', chance: '؟', chest: '▣', tax: '٪', station: '🚆', jail: '▥', parking: '☕', gojail: '⛓' };
const money = (n) => `<span class="money">${Math.round(n).toLocaleString('en-US')}</span>`;

// موقع الخانة في شبكة 7×7: البداية أسفل اليمين، ثم نتحرك يسارًا وصعودًا
function gridPos(i) {
  if (i <= 6) return [7, 7 - i];
  if (i <= 12) return [7 - (i - 6), 1];
  if (i <= 18) return [1, 1 + (i - 12)];
  return [1 + (i - 18), 7];
}

export default {
  mount(root, ctx) {
    this.ctx = ctx;
    this.pending = false;
    this.selected = null;
    this.lastDice = ctx.room.game.dice?.seq || 0;
    this.lastLog = ctx.room.game.log.at(-1)?.seq || 0;
    this.el = h(`
      <div class="aq">
        <div class="aq-board">
          ${BOARD.map((b, i) => {
            const [r, c] = gridPos(i);
            const strip = b.g ? `<span class="strip" style="background:${GROUP_COLORS[b.g]}"></span>` : `<span class="ico">${ICON[b.t] || ''}</span>`;
            return `<button class="sq2 t-${b.t} ${[0, 6, 12, 18].includes(i) ? 'corner' : ''}" data-i="${i}" style="grid-row:${r};grid-column:${c}">
              ${strip}<span class="nm">${esc(N(b.n))}</span><span class="sub"></span><span class="houses"></span><span class="toks"></span></button>`;
          }).join('')}
          <div class="aq-center">
            <p class="aq-round"></p>
            <div class="aq-dice"></div>
            <p class="aq-status" aria-live="polite"></p>
            <div class="aq-actions"></div>
            <div class="spy-timer"><div class="bar"><i></i></div><span></span></div>
            <p class="aq-log"></p>
          </div>
        </div>
        <section class="aq-detail" hidden></section>
        <section class="aq-players"></section>
        <section class="aq-mine"><h3>${t('myProps')}</h3><p class="muted">${t('manageHint')}</p><div class="aq-props"></div></section>
      </div>`);
    root.append(this.el);
    $$(this.el, '.sq2').forEach((b) => b.addEventListener('click', () => {
      this.selected = this.selected === Number(b.dataset.i) ? null : Number(b.dataset.i);
      this.paintDetail();
    }));
    this.timer = setInterval(() => this.paintTimer(), 250);
    this.update(ctx);
  },

  unmount() { clearInterval(this.timer); this.el?.remove(); },
  get g() { return this.ctx.room.game; },
  name(id) { return this.ctx.byId(id)?.name || '—'; },
  color(id) { return this.ctx.byId(id)?.color || 'var(--line)'; },

  async send(payload) {
    if (this.pending) return;
    this.pending = true;
    buzz();
    const res = await this.ctx.act(payload);
    this.pending = false;
    if (!res.ok) this.ctx.onError(res.error);
  },

  logText(e) {
    const nm = (id) => this.name(id);
    switch (e.k) {
      case 'rolled': return t('l_rolled', { name: nm(e.pid), a: e.d[0], b: e.d[1] });
      case 'bought': return t('l_bought', { name: nm(e.pid), sq: N(BOARD[e.sq].n) });
      case 'rent': return t('l_rent', { name: nm(e.pid), amount: e.amount, to: nm(e.to) });
      case 'tax': return t('l_tax', { name: nm(e.pid), amount: e.amount });
      case 'salary': return t('l_salary', { name: nm(e.pid) });
      case 'jailed': return t('l_jailed', { name: nm(e.pid) });
      case 'freed': return t('l_freed', { name: nm(e.pid) });
      case 'bankrupt': return t('l_bankrupt', { name: nm(e.pid) });
      case 'built': return t('l_built', { name: nm(e.pid), sq: N(BOARD[e.sq].n) });
      case 'card': return t('l_card', { name: nm(e.pid), text: N((e.deck === 'chance' ? CHANCE : CHEST)[e.i].n) });
      default: return '';
    }
  },

  update(ctx) {
    this.ctx = ctx;
    const g = this.g;
    const me = ctx.room.you;
    const mine = !g.result && g.turnId === me;

    // الخانات
    $$(this.el, '.sq2').forEach((cell) => {
      const i = Number(cell.dataset.i);
      const b = BOARD[i];
      const owner = g.owner[i];
      cell.style.setProperty('--owner', owner ? this.color(owner) : 'transparent');
      cell.classList.toggle('owned', !!owner);
      cell.classList.toggle('mortgaged', !!g.mortgaged[i]);
      cell.classList.toggle('selected', this.selected === i);
      const sub = $(cell, '.sub');
      if (b.price) sub.innerHTML = owner ? money(g.rents[i] || 0) : money(b.price);
      else if (b.amount) sub.innerHTML = money(b.amount);
      const hcount = g.houses[i] || 0;
      $(cell, '.houses').innerHTML = hcount === 5 ? '<i class="tower"></i>' : '<i></i>'.repeat(hcount);
      const here = g.order.filter((p) => !g.bankrupt.includes(p) && g.pos[p] === i);
      $(cell, '.toks').innerHTML = here.map((p) => `<i class="${p === g.turnId ? 'cur' : ''} ${g.jail[p] !== null && i === 6 ? 'jailed' : ''}" style="background:${this.color(p)}"></i>`).join('');
    });

    // الوسط
    $(this.el, '.aq-round').textContent = t('roundOf', { n: Math.min(g.round, g.maxRounds), total: g.maxRounds });
    if (g.dice) {
      $(this.el, '.aq-dice').innerHTML = die(g.dice.d[0]) + die(g.dice.d[1]);
      if (g.dice.seq !== this.lastDice) {
        this.lastDice = g.dice.seq;
        sfx.dice();
        $(this.el, '.aq-dice').classList.remove('roll'); void this.el.offsetWidth; $(this.el, '.aq-dice').classList.add('roll');
      }
    }
    const status = $(this.el, '.aq-status');
    const tp = ctx.byId(g.turnId);
    if (g.result) status.textContent = '';
    else if (tp && !tp.connected) status.textContent = t('waitingFor', { name: tp.name, s: Math.ceil((tp.graceLeftMs || 0) / 1000) });
    else if (mine) status.innerHTML = `<strong>${t('yourTurn')}</strong>${g.jail[me] !== null ? ` · ${t('inJail')}` : ''}`;
    else status.textContent = t('theirTurn', { name: this.name(g.turnId) });

    const acts = $(this.el, '.aq-actions');
    let html = '';
    if (mine && g.phase === 'roll') {
      html = `<button class="btn btn-primary btn-block" data-a="roll">${t('rollDice')}</button>`;
      if (g.jail[me] !== null) html += `<button class="btn btn-ghost btn-block btn-sm" data-a="payJail">${t('payFine')}</button>`;
    } else if (mine && g.phase === 'buy') {
      const b = BOARD[g.pos[me]];
      html = `<button class="btn btn-primary btn-block" data-a="buy">${esc(t('buyFor', { name: N(b.n), price: b.price }))}</button>
              <button class="btn btn-ghost btn-block btn-sm" data-a="skip">${t('noThanks')}</button>`;
    }
    if (acts.dataset.sig !== html) {
      acts.dataset.sig = html;
      acts.innerHTML = html;
      $$(acts, '[data-a]').forEach((b) => b.addEventListener('click', () => this.send({ type: b.dataset.a })));
    }
    const last = g.log.slice(-2).map((e) => this.logText(e)).filter(Boolean);
    $(this.el, '.aq-log').innerHTML = last.map((x) => `<span>${esc(x)}</span>`).join('');
    const newest = g.log.at(-1);
    if (newest && newest.seq !== this.lastLog) {
      this.lastLog = newest.seq;
      if (newest.k === 'bought' || newest.k === 'built') sfx.up();
      if (newest.k === 'rent' && newest.pid === me) sfx.down();
      if (newest.k === 'rent' && newest.to === me) sfx.send();
      if (newest.k === 'jailed') sfx.lose();
    }

    // اللاعبون
    $(this.el, '.aq-players').innerHTML = g.order.map((p) => {
      const bk = g.bankrupt.includes(p);
      return `<div class="aq-player ${p === g.turnId && !g.result ? 'active' : ''} ${bk ? 'bk' : ''}">
        <i style="background:${this.color(p)}"></i><span class="nm">${esc(this.name(p))}${p === me ? ` <small>(${t('you')})</small>` : ''}</span>
        ${bk ? `<em>${t('bankruptTag')}</em>` : `${g.jail[p] !== null ? `<em>${t('inJail')}</em>` : ''}<b>${money(g.cash[p])}</b><small class="worth">${t('worthTag', { n: Math.round(g.worth[p]).toLocaleString('en-US') })}</small>`}
      </div>`;
    }).join('');

    this.paintMine(mine);
    this.paintDetail();
    this.paintTimer();
  },

  paintMine(mine) {
    const g = this.g;
    const me = this.ctx.room.you;
    const sec = $(this.el, '.aq-mine');
    sec.hidden = !g.you;
    if (!g.you) return;
    const props = Object.keys(g.owner).map(Number).filter((i) => g.owner[i] === me).sort((a, b) => a - b);
    const box = $(this.el, '.aq-props');
    const sig = JSON.stringify([props, props.map((i) => [g.houses[i] || 0, !!g.mortgaged[i], g.rents[i]]), mine, g.phase, g.cash[me], lang()]);
    if (box.dataset.sig === sig) return;
    box.dataset.sig = sig;
    if (!props.length) { box.innerHTML = `<p class="muted">${t('noProps')}</p>`; return; }
    const can = mine && !g.result;
    box.innerHTML = props.map((i) => {
      const b = BOARD[i];
      const hcount = g.houses[i] || 0;
      const mort = !!g.mortgaged[i];
      return `<div class="prop-row ${mort ? 'mort' : ''}">
        <span class="sw" style="background:${b.g ? GROUP_COLORS[b.g] : 'var(--line)'}"></span>
        <span class="nm">${esc(N(b.n))}${hcount ? ` <small>${hcount === 5 ? t('tower') : '⌂'.repeat(hcount)}</small>` : ''}${mort ? ` <small class="mt">${t('mortgagedTag')}</small>` : ''}</span>
        <span class="rent">${t('rentNow', { n: g.rents[i] || 0 })}</span>
        <span class="btns">
          ${b.t === 'prop' ? `<button class="btn btn-sm btn-ghost" data-a="build" data-sq="${i}" ${can ? '' : 'disabled'}>${t('build')}</button>
          <button class="btn btn-sm btn-ghost" data-a="sell" data-sq="${i}" ${can && hcount ? '' : 'disabled'}>${t('sellHouse')}</button>` : ''}
          <button class="btn btn-sm btn-ghost" data-a="${mort ? 'unmortgage' : 'mortgage'}" data-sq="${i}" ${can ? '' : 'disabled'}>${mort ? t('unmortgage') : t('mortgage')}</button>
        </span></div>`;
    }).join('');
    $$(box, '[data-a]').forEach((b) => b.addEventListener('click', () => this.send({ type: b.dataset.a, sq: Number(b.dataset.sq) })));
  },

  paintDetail() {
    const sec = $(this.el, '.aq-detail');
    const i = this.selected;
    $$(this.el, '.sq2').forEach((c) => c.classList.toggle('selected', Number(c.dataset.i) === i));
    if (i === null) { sec.hidden = true; return; }
    const g = this.g;
    const b = BOARD[i];
    const owner = g.owner[i];
    let body = `<h3>${b.g ? `<span class="sw" style="background:${GROUP_COLORS[b.g]}"></span>` : ''}${esc(N(b.n))}</h3>`;
    if (b.price) {
      body += `<p>${t('priceTag', { n: b.price })}${b.house ? ` · ${t('houseCost', { n: b.house })}` : ''}</p>
        <p>${owner ? `${esc(t('ownerTag', { name: this.name(owner) }))}${g.mortgaged[i] ? ` · ${t('mortgagedTag')}` : ''} · ${t('rentNow', { n: g.rents[i] || 0 })}` : t('unowned')}</p>`;
      if (b.rent) body += `<ol class="rent-table">${b.rent.map((r, k) => `<li class="${(g.houses[i] || 0) === k && owner ? 'cur' : ''}"><span>${k === 0 ? '—' : k === 5 ? t('tower') : '⌂'.repeat(k)}</span><b>${r}</b></li>`).join('')}</ol>`;
    } else if (b.amount) body += `<p>${money(b.amount)}</p>`;
    sec.innerHTML = body;
    sec.hidden = false;
  },

  paintTimer() {
    const g = this.g;
    const el = $(this.el, '.spy-timer');
    if (!g.deadline || g.result) { el.hidden = true; return; }
    el.hidden = false;
    const left = Math.max(0, g.deadline - this.ctx.now());
    $(el, 'i').style.width = `${Math.min(100, (left / 40000) * 100)}%`;
    $(el, 'span').textContent = t('secondsLeft', { s: Math.ceil(left / 1000) });
    el.classList.toggle('low', left < 10000);
  },

  resultNote() {
    const g = this.g;
    if (!g?.result?.worth) return '';
    return g.order.filter((p) => !g.bankrupt.includes(p))
      .map((p) => `${esc(this.name(p))}: ${Math.round(g.result.worth[p]).toLocaleString('en-US')}`).join(' · ');
  },
};
