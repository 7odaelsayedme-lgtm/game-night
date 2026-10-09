// واجهة إكس أو. ترسم ما يرسله الخادم فقط، وترسل طلب الحركة عند اللمس.
import { t } from '../i18n.js';
import { h, esc, $, $$ } from '../ui.js';
import { sfx, buzz } from '../prefs.js';

const CENTER = [50, 150, 250];
const pos = (i) => [CENTER[i % 3], CENTER[Math.floor(i / 3)]];

const markSvg = (mark) => (mark === 'X'
  ? '<svg viewBox="0 0 100 100" class="mark mark-x" aria-hidden="true"><path d="M24 24 76 76"/><path d="M76 24 24 76"/></svg>'
  : '<svg viewBox="0 0 100 100" class="mark mark-o" aria-hidden="true"><circle cx="50" cy="50" r="27"/></svg>');

export default {
  mount(root, ctx) {
    this.ctx = ctx;
    this.pending = false;
    this.lineDrawn = false;
    this.el = h(`
      <div class="ttt">
        <div class="versus"></div>
        <p class="turn-line" aria-live="polite"></p>
        <div class="ttt-board" role="grid">
          ${Array.from({ length: 9 }, (_, i) => `<button class="cell" data-i="${i}" aria-label="${t('cellLabel', { n: i + 1 })}"></button>`).join('')}
          <svg class="win-line" viewBox="0 0 300 300" aria-hidden="true"><line x1="0" y1="0" x2="0" y2="0"/></svg>
        </div>
        <p class="queue-line"></p>
      </div>`);
    root.append(this.el);
    $$(this.el, '.cell').forEach((btn) => btn.addEventListener('click', () => this.tap(Number(btn.dataset.i))));
    this.update(ctx);
  },

  async tap(i) {
    const g = this.ctx.room.game;
    if (this.pending || g.result || g.you !== g.turn || g.board[i]) return;
    this.pending = true;
    buzz();
    const cell = $(this.el, `.cell[data-i="${i}"]`);
    cell.classList.add('pressed');
    const res = await this.ctx.act({ type: 'place', cell: i });
    cell.classList.remove('pressed');
    this.pending = false;
    if (!res.ok) this.ctx.onError(res.error);
  },

  update(ctx) {
    this.ctx = ctx;
    const { room } = ctx;
    const g = room.game;
    const name = (id) => esc(ctx.byId(id)?.name ?? '—');
    const color = (id) => ctx.byId(id)?.color ?? 'var(--line)';

    // شريط اللاعبين
    const chip = (mark) => {
      const id = g.players[mark];
      const p = ctx.byId(id);
      const active = !g.result && g.turn === mark;
      return `<div class="vs-chip ${active ? 'active' : ''} ${p && !p.connected ? 'is-off' : ''}" data-mark="${mark}">
        <span class="vs-mark">${markSvg(mark)}</span>
        <span class="vs-name"><i style="background:${color(id)}"></i>${name(id)}${id === room.you ? ` <small>(${t('you')})</small>` : ''}</span>
      </div>`;
    };
    $(this.el, '.versus').innerHTML = chip('X') + '<span class="vs-sep" aria-hidden="true">×</span>' + chip('O');

    // سطر الدور
    let line = '';
    const turnId = g.players[g.turn];
    const turnPlayer = ctx.byId(turnId);
    if (!g.result) {
      if (turnPlayer && !turnPlayer.connected) {
        line = t('waitingFor', { name: esc(turnPlayer.name), s: Math.ceil((turnPlayer.graceLeftMs || 0) / 1000) });
      } else if (g.you === g.turn) {
        line = `<strong>${t('yourTurn')}</strong>`;
      } else if (g.you) {
        line = t('theirTurn', { name: name(turnId) });
      } else {
        line = `${t('spectating')} · ${t('theirTurn', { name: name(turnId) })}`;
      }
    }
    const lineEl = $(this.el, '.turn-line');
    lineEl.innerHTML = line;
    lineEl.classList.toggle('mine', !g.result && g.you === g.turn);

    // الخانات
    const myTurn = !g.result && g.you && g.you === g.turn && turnPlayer?.connected !== false;
    g.board.forEach((mark, i) => {
      const cell = $(this.el, `.cell[data-i="${i}"]`);
      if (mark && !cell.dataset.mark) {
        cell.dataset.mark = mark;
        cell.innerHTML = markSvg(mark);
        cell.setAttribute('aria-label', t(mark === 'X' ? 'cellX' : 'cellO', { n: i + 1 }));
        if (g.lastMove?.cell === i) {
          cell.classList.add('fresh');
          (mark === 'X' ? sfx.placeX : sfx.placeO)();
        }
      }
      cell.disabled = !myTurn || !!mark;
      cell.classList.toggle('playable', myTurn && !mark);
      cell.classList.toggle('in-line', !!g.result?.line?.includes(i));
    });
    this.el.classList.toggle('my-turn', !!myTurn);
    this.el.dataset.mark = g.you || '';

    // خط الفوز
    if (g.result?.line && !this.lineDrawn) {
      this.lineDrawn = true;
      const [a, , c] = g.result.line;
      let [x1, y1] = pos(a);
      let [x2, y2] = pos(c);
      const dx = Math.sign(x2 - x1) * 30, dy = Math.sign(y2 - y1) * 30;
      x1 -= dx; y1 -= dy; x2 += dx; y2 += dy;
      const svg = $(this.el, '.win-line');
      const ln = svg.querySelector('line');
      Object.entries({ x1, y1, x2, y2 }).forEach(([k, v]) => ln.setAttribute(k, v));
      svg.classList.add('show');
      svg.style.setProperty('--win-color', g.result.mark === 'X' ? 'var(--red)' : 'var(--teal)');
    }

    // المنتظرون
    const waiting = (g.queue || []).filter((id) => id !== g.players.X && id !== g.players.O && ctx.byId(id));
    $(this.el, '.queue-line').innerHTML = waiting.length ? t('nextUp', { names: waiting.map(name).join('، ') }) : '';
  },

  unmount() { this.el?.remove(); },

  // نص النتيجة الخاص بهذه اللعبة (يُستخدم في لوحة النتائج)
  resultNote(ctx) {
    const r = ctx.room.game?.result;
    if (r?.forfeit) {
      const loserId = ctx.room.game.players.X === r.winner ? ctx.room.game.players.O : ctx.room.game.players.X;
      return t('forfeit', { name: esc(ctx.byId(loserId)?.name ?? '') });
    }
    return '';
  },
};
