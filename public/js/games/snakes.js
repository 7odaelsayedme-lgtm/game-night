// واجهة السلم والثعبان: لوحة 100 مربع، سلالم وثعابين مرسومة بـ SVG، نرد متحرك وقطع تتحرك خطوة خطوة.
import { t } from '../i18n.js';
import { h, esc, $ } from '../ui.js';
import { sfx, buzz, prefs } from '../prefs.js';

// إحداثيات مركز المربع n داخل مساحة 100×100 (الصف الأول من الأسفل، والاتجاه يتعرج)
export function cellXY(n) {
  const row = Math.floor((n - 1) / 10);
  let col = (n - 1) % 10;
  if (row % 2 === 1) col = 9 - col;
  return [col * 10 + 5, (9 - row) * 10 + 5];
}

const ladderSvg = (a, b) => {
  const [x1, y1] = cellXY(a);
  const [x2, y2] = cellXY(b);
  const len = Math.hypot(x2 - x1, y2 - y1);
  const nx = -(y2 - y1) / len * 1.8, ny = (x2 - x1) / len * 1.8;
  const rungs = Math.max(2, Math.floor(len / 4.2));
  let r = '';
  for (let i = 1; i < rungs; i++) {
    const k = i / rungs;
    const cx = x1 + (x2 - x1) * k, cy = y1 + (y2 - y1) * k;
    r += `<line x1="${cx - nx}" y1="${cy - ny}" x2="${cx + nx}" y2="${cy + ny}"/>`;
  }
  return `<g class="ladder"><line x1="${x1 - nx}" y1="${y1 - ny}" x2="${x2 - nx}" y2="${y2 - ny}"/><line x1="${x1 + nx}" y1="${y1 + ny}" x2="${x2 + nx}" y2="${y2 + ny}"/>${r}</g>`;
};

const snakeSvg = (head, tail, i) => {
  const [x1, y1] = cellXY(head);
  const [x2, y2] = cellXY(tail);
  const len = Math.hypot(x2 - x1, y2 - y1);
  const nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
  const waves = Math.max(2, Math.round(len / 14));
  const pts = [];
  for (let s = 0; s <= 24; s++) {
    const k = s / 24;
    const amp = Math.sin(k * Math.PI * waves) * 3.2 * (1 - k * 0.4);
    pts.push([x1 + (x2 - x1) * k + nx * amp, y1 + (y2 - y1) * k + ny * amp]);
  }
  const d = pts.map((p, j) => `${j ? 'L' : 'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join('');
  const color = i % 2 ? 'var(--teal)' : 'var(--red)';
  return `<g class="snake" style="--c:${color}"><path d="${d}"/><path class="belly" d="${d}"/>
    <circle cx="${x1}" cy="${y1}" r="2.7"/><circle class="eye" cx="${x1 - 0.9}" cy="${y1 - 0.6}" r="0.55"/><circle class="eye" cx="${x1 + 0.9}" cy="${y1 - 0.6}" r="0.55"/></g>`;
};

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const dieFace = (v) => `<div class="die-face">${Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[v]?.includes(i) ? 'on' : ''}"></i>`).join('')}</div>`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  mount(root, ctx) {
    this.ctx = ctx;
    const g = ctx.room.game;
    this.shown = { ...g.pos };
    this.lastSeq = g.last?.seq || 0;
    this.queue = [];
    this.busy = false;
    this.pending = false;

    const cells = [];
    for (let r = 9; r >= 0; r--) {
      for (let c = 0; c < 10; c++) {
        const n = r * 10 + (r % 2 ? 10 - c : c + 1);
        cells.push(`<div class="sq ${(r + c) % 2 ? 'alt' : ''} ${n === 100 ? 'goal' : ''}"><span>${n}</span></div>`);
      }
    }
    // ترتيب الصفوف أعلاه يرسم المربع 100 أعلى اليسار (عدد زوجي من الصفوف)
    this.el = h(`
      <div class="snl">
        <div class="snl-players"></div>
        <div class="snl-board">
          <div class="sq-grid">${cells.join('')}</div>
          <svg class="snl-art" viewBox="0 0 100 100" aria-hidden="true">
            ${Object.entries(g.ladders).map(([a, b]) => ladderSvg(+a, b)).join('')}
            ${Object.entries(g.snakes).map(([a, b], i) => snakeSvg(+a, b, i)).join('')}
          </svg>
          <div class="tokens"></div>
        </div>
        <div class="snl-controls">
          <div class="die" aria-hidden="true">${dieFace(g.last?.roll || 1)}</div>
          <div class="snl-side">
            <p class="snl-status" aria-live="polite"></p>
            <p class="snl-event"></p>
            <button class="btn btn-primary btn-xl btn-block roll-btn">${t('roll')}</button>
          </div>
        </div>
      </div>`);
    root.append(this.el);
    $(this.el, '.roll-btn').addEventListener('click', () => this.roll());
    this.renderTokens();
    this.update(ctx);
  },

  async roll() {
    const g = this.ctx.room.game;
    if (this.pending || this.busy || g.result || g.turnId !== g.you) return;
    this.pending = true;
    buzz();
    this.paintControls();
    const res = await this.ctx.act({ type: 'roll' });
    this.pending = false;
    if (!res.ok) this.ctx.onError(res.error);
    this.paintControls();
  },

  update(ctx) {
    this.ctx = ctx;
    const g = ctx.room.game;
    // حركات جديدة تُعرض بالترتيب
    if (g.last && g.last.seq > this.lastSeq) {
      this.lastSeq = g.last.seq;
      this.queue.push({ ...g.last });
      this.runQueue();
    } else if (!this.busy) {
      // مزامنة كاملة (مثلًا بعد إعادة الاتصال أو خروج لاعب)
      this.shown = { ...g.pos };
      this.renderTokens();
    }
    this.paintPlayers();
    this.paintControls();
  },

  async runQueue() {
    if (this.busy) return;
    this.busy = true;
    const fast = prefs.reduceMotion;
    while (this.queue.length) {
      const m = this.queue.shift();
      const name = this.ctx.byId(m.playerId)?.name || '';
      const die = $(this.el, '.die');
      die.classList.add('rolling');
      sfx.dice();
      if (!fast) {
        for (let i = 0; i < 6; i++) { die.innerHTML = dieFace(1 + Math.floor(Math.random() * 6)); await wait(60); }
      }
      die.innerHTML = dieFace(m.roll);
      die.classList.remove('rolling');
      $(this.el, '.snl-event').textContent = m.playerId === this.ctx.room.you ? t('youRolled', { n: m.roll }) : t('rolled', { name, n: m.roll });

      // خطوة خطوة حتى مربع الوقوف (مع الارتداد إن تجاوز 100)
      const path = [];
      let p = m.from;
      let dir = 1;
      for (let i = 0; i < m.roll; i++) {
        if (p === 100) dir = -1;
        p += dir;
        path.push(p);
      }
      if (!fast) {
        for (const sq of path) { this.shown[m.playerId] = sq; this.renderTokens(); sfx.step(); await wait(170); }
      }
      this.shown[m.playerId] = m.landing;
      this.renderTokens();
      const notes = [];
      if (m.bounced) notes.push(t('bounced'));
      if (m.via) {
        await wait(fast ? 0 : 250);
        (m.via === 'ladder' ? sfx.up : sfx.down)();
        this.shown[m.playerId] = m.to;
        this.renderTokens(true);
        notes.push(t(m.via === 'ladder' ? 'climbed' : 'slid', { n: m.to }));
        await wait(fast ? 0 : 450);
      }
      if (m.extra) notes.push(t('extraRoll'));
      if (notes.length) $(this.el, '.snl-event').textContent += ` — ${notes.join('، ')}`;
      await wait(fast ? 0 : 150);
    }
    this.busy = false;
    this.shown = { ...this.ctx.room.game.pos };
    this.renderTokens();
    this.paintPlayers();
    this.paintControls();
  },

  renderTokens(slide = false) {
    const layer = $(this.el, '.tokens');
    const g = this.ctx.room.game;
    const bySquare = {};
    for (const id of g.order) {
      const sq = this.shown[id] ?? 0;
      if (sq > 0) (bySquare[sq] ||= []).push(id);
    }
    const seen = new Set();
    for (const [sq, ids] of Object.entries(bySquare)) {
      const [x, y] = cellXY(+sq);
      ids.forEach((id, i) => {
        seen.add(id);
        let tok = layer.querySelector(`[data-id="${id}"]`);
        if (!tok) {
          tok = h(`<span class="token" data-id="${id}"></span>`);
          layer.append(tok);
        }
        const p = this.ctx.byId(id);
        tok.style.background = p?.color || 'var(--cream)';
        const off = ids.length > 1 ? [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]][i] : [0, 0];
        tok.classList.toggle('slide', slide);
        tok.style.left = `${x + off[0]}%`;
        tok.style.top = `${y + off[1]}%`;
        tok.classList.toggle('mine', id === this.ctx.room.you);
      });
    }
    layer.querySelectorAll('.token').forEach((tok) => { if (!seen.has(tok.dataset.id)) tok.remove(); });
  },

  paintPlayers() {
    const g = this.ctx.room.game;
    $(this.el, '.snl-players').innerHTML = g.order.map((id) => {
      const p = this.ctx.byId(id);
      const sq = this.busy ? this.shown[id] : g.pos[id];
      return `<div class="snl-chip ${!g.result && g.turnId === id ? 'active' : ''} ${p && !p.connected ? 'is-off' : ''}">
        <i style="background:${p?.color || 'var(--line)'}"></i>
        <span class="nm">${esc(p?.name || '—')}${id === this.ctx.room.you ? ` <small>(${t('you')})</small>` : ''}</span>
        <b>${sq ? sq : '·'}</b></div>`;
    }).join('');
  },

  paintControls() {
    const g = this.ctx.room.game;
    const btn = $(this.el, '.roll-btn');
    const status = $(this.el, '.snl-status');
    const turnP = this.ctx.byId(g.turnId);
    const mine = !g.result && g.turnId === g.you;
    btn.hidden = !g.you || !!g.result;
    btn.disabled = !mine || this.busy || this.pending;
    btn.textContent = this.pending ? t('rolling') : mine ? t('roll') : t('waitTurn');
    this.el.classList.toggle('my-turn', mine && !this.busy);
    if (g.result) { status.textContent = ''; return; }
    if (turnP && !turnP.connected) {
      status.textContent = t('waitingFor', { name: turnP.name, s: Math.ceil((turnP.graceLeftMs || 0) / 1000) });
    } else if (mine) {
      status.innerHTML = `<strong>${t('yourTurn')}</strong>`;
    } else {
      status.textContent = `${g.you ? '' : `${t('spectating')} · `}${t('theirTurn', { name: turnP?.name || '' })}`;
    }
  },

  unmount() { this.el?.remove(); },

  resultNote() { return ''; },
};
