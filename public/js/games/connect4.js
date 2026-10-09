// واجهة أربعة في صف: المس عمودًا ليسقط قرصك. الخادم يقرر الخانة والفوز.
import { t } from '../i18n.js';
import { h, esc, $, $$ } from '../ui.js';
import { sfx, buzz } from '../prefs.js';

const COLOR = { X: 'red', O: 'teal' };
const disc = (mark) => `<span class="disc disc-${COLOR[mark]}"></span>`;

export default {
  mount(root, ctx) {
    this.ctx = ctx;
    this.pending = false;
    const { cols, rows } = ctx.room.game;
    this.cols = cols;
    this.rows = rows;
    this.seen = ctx.room.game.lastMove?.n || 0;
    this.el = h(`
      <div class="c4">
        <div class="versus"></div>
        <p class="turn-line" aria-live="polite"></p>
        <div class="c4-board" style="--cols:${cols};--rows:${rows}">
          ${Array.from({ length: cols }, (_, c) => `
            <button class="c4-col" data-c="${c}" aria-label="${t('c4Column', { n: c + 1 })}">
              ${Array.from({ length: rows }, (_, r) => `<span class="slot" data-i="${r * cols + c}"></span>`).join('')}
            </button>`).join('')}
        </div>
        <p class="queue-line"></p>
      </div>`);
    root.append(this.el);
    $$(this.el, '.c4-col').forEach((b) => b.addEventListener('click', () => this.drop(Number(b.dataset.c))));
    this.update(ctx);
  },

  async drop(col) {
    const g = this.ctx.room.game;
    if (this.pending || g.result || g.you !== g.turn) return;
    if (g.board[col]) { this.ctx.onError('column_full'); return; } // الخانة العليا ممتلئة
    this.pending = true;
    buzz();
    const res = await this.ctx.act({ type: 'drop', col });
    this.pending = false;
    if (!res.ok) this.ctx.onError(res.error);
  },

  update(ctx) {
    this.ctx = ctx;
    const g = ctx.room.game;
    const room = ctx.room;
    const name = (id) => esc(ctx.byId(id)?.name ?? '—');

    const chip = (mark) => {
      const id = g.players[mark];
      const p = ctx.byId(id);
      return `<div class="vs-chip ${!g.result && g.turn === mark ? 'active' : ''} ${p && !p.connected ? 'is-off' : ''}">
        <span class="vs-mark">${disc(mark)}</span>
        <span class="vs-name"><i style="background:${p?.color || 'var(--line)'}"></i>${name(id)}${id === room.you ? ` <small>(${t('you')})</small>` : ''}</span></div>`;
    };
    $(this.el, '.versus').innerHTML = chip('X') + '<span class="vs-sep" aria-hidden="true">×</span>' + chip('O');

    const turnId = g.players[g.turn];
    const turnP = ctx.byId(turnId);
    const mine = !g.result && g.you === g.turn && turnP?.connected !== false;
    const line = $(this.el, '.turn-line');
    line.classList.toggle('mine', mine);
    if (g.result) line.innerHTML = '';
    else if (turnP && !turnP.connected) line.textContent = t('waitingFor', { name: turnP.name, s: Math.ceil((turnP.graceLeftMs || 0) / 1000) });
    else if (mine) line.innerHTML = `<strong>${t('yourTurn')}</strong>`;
    else line.textContent = `${g.you ? '' : `${t('spectating')} · `}${t('theirTurn', { name: turnP?.name || '' })}`;

    // الأقراص
    const fresh = g.lastMove && g.lastMove.n > this.seen ? g.lastMove : null;
    if (fresh) this.seen = fresh.n;
    g.board.forEach((mark, i) => {
      const slot = $(this.el, `.slot[data-i="${i}"]`);
      if (mark && !slot.dataset.mark) {
        slot.dataset.mark = mark;
        slot.innerHTML = disc(mark);
        if (fresh && i === fresh.row * this.cols + fresh.col) {
          slot.firstChild.classList.add('drop');
          slot.firstChild.style.setProperty('--fall', fresh.row + 1);
          (mark === 'X' ? sfx.placeX : sfx.placeO)();
        }
      }
      slot.classList.toggle('win', !!g.result?.line?.includes(i));
    });
    this.el.classList.toggle('my-turn', mine);
    this.el.classList.toggle('has-result', !!g.result);
    $$(this.el, '.c4-col').forEach((b) => {
      b.disabled = !mine || !!g.board[Number(b.dataset.c)];
      b.dataset.preview = mine ? COLOR[g.you] : '';
    });

    const waiting = (g.queue || []).filter((id) => id !== g.players.X && id !== g.players.O && ctx.byId(id));
    $(this.el, '.queue-line').innerHTML = waiting.length ? t('nextUp', { names: waiting.map(name).join('، ') }) : '';
  },

  unmount() { this.el?.remove(); },

  resultNote(ctx) {
    const g = ctx.room.game;
    if (!g?.result?.forfeit) return '';
    const loser = g.players.X === g.result.winner ? g.players.O : g.players.X;
    return t('forfeit', { name: esc(ctx.byId(loser)?.name ?? '') });
  },
};
