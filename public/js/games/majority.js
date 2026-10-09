// واجهة «رأي الأغلبية»: سؤال بخيارين، اختيار سري، ثم كشف بالأسماء والنقاط.
import { t, lang } from '../i18n.js';
import { h, esc, $, $$ } from '../ui.js';
import { sfx, buzz } from '../prefs.js';

const PHASE_MS = { question: 20, reveal: 7 };

export default {
  mount(root, ctx) {
    this.ctx = ctx;
    this.key = null;
    this.el = h(`
      <div class="maj">
        <div class="maj-head"><span class="maj-count"></span><span class="maj-skip-slot"></span></div>
        <div class="spy-timer"><div class="bar"><i></i></div><span></span></div>
        <h2 class="maj-q"></h2>
        <div class="maj-options">
          <button class="maj-opt" data-c="A"><span class="opt-label"></span><span class="opt-meta"></span><span class="opt-names"></span></button>
          <button class="maj-opt" data-c="B"><span class="opt-label"></span><span class="opt-meta"></span><span class="opt-names"></span></button>
        </div>
        <p class="maj-status muted" aria-live="polite"></p>
        <section class="maj-scores"><h3>${t('matchScores')}</h3><ol></ol></section>
      </div>`);
    root.append(this.el);
    $$(this.el, '.maj-opt').forEach((b) => b.addEventListener('click', () => this.pick(b.dataset.c)));
    this.timer = setInterval(() => this.paintTimer(), 250);
    this.update(ctx);
  },

  unmount() { clearInterval(this.timer); this.el?.remove(); },

  get g() { return this.ctx.room.game; },
  q() { return this.g.question[lang() === 'en' ? 'en' : 'ar']; },
  optText(c) { return this.q()[c === 'A' ? 1 : 2]; },

  async pick(c) {
    const g = this.g;
    if (g.phase !== 'question' || !g.you) return;
    buzz();
    sfx.tap();
    const res = await this.ctx.act({ type: 'answer', choice: c });
    if (!res.ok) this.ctx.onError(res.error);
  },

  update(ctx) {
    this.ctx = ctx;
    const g = this.g;
    const key = `${g.number}|${g.phase}|${g.question.ar[0]}${g.question.ar[1]}`;
    const changed = key !== this.key;
    this.key = key;

    $(this.el, '.maj-count').textContent = t('questionOf', { n: g.number, total: g.total });
    $(this.el, '.maj-q').textContent = this.q()[0];
    this.el.dataset.phase = g.phase;

    const r = g.reveal;
    const showReveal = g.phase === 'reveal' || (g.phase === 'done' && r);
    $$(this.el, '.maj-opt').forEach((b) => {
      const c = b.dataset.c;
      $(b, '.opt-label').textContent = this.optText(c);
      b.classList.toggle('picked', g.myChoice === c && g.phase === 'question');
      b.setAttribute('aria-pressed', String(g.myChoice === c));
      b.disabled = g.phase !== 'question' || !g.you;
      b.classList.toggle('majority', !!showReveal && r?.majority === c);
      b.classList.toggle('minority', !!showReveal && !!r?.majority && r.majority !== c);
      const meta = $(b, '.opt-meta');
      const names = $(b, '.opt-names');
      if (showReveal) {
        const total = Math.max(1, r.counts.A + r.counts.B);
        b.style.setProperty('--share', `${(r.counts[c] / total) * 100}%`);
        meta.innerHTML = `<b>${r.counts[c]}</b>${r.majority === c ? `<em>${t('majorityTag')}</em>` : ''}`;
        names.innerHTML = Object.entries(r.answers).filter(([, v]) => v === c)
          .map(([id]) => `<span class="nm-chip ${r.gained.includes(id) ? 'gain' : ''}"><i style="background:${this.ctx.byId(id)?.color || 'var(--line)'}"></i>${esc(this.ctx.byId(id)?.name || '—')}${r.gained.includes(id) ? ' +1' : ''}</span>`).join('');
      } else {
        b.style.removeProperty('--share');
        meta.innerHTML = '';
        names.innerHTML = '';
      }
    });

    // سطر الحالة
    const status = $(this.el, '.maj-status');
    if (g.phase === 'question') {
      const base = !g.you ? t('spectatingMaj') : g.myChoice ? t('yourPick', { c: this.optText(g.myChoice) }) : t('pickHint');
      status.textContent = `${base} · ${t('answeredCount', { n: g.answeredIds.length, total: g.players.length })}`;
    } else if (g.phase === 'reveal') {
      status.textContent = `${r.majority ? t('majorityWas', { c: this.optText(r.majority) }) : t('tieNoPoints')} · ${t('nextSoon')}`;
    } else {
      status.textContent = '';
    }
    if (changed && g.phase === 'reveal') {
      (r.gained.includes(this.ctx.room.you) ? sfx.up : r.majority ? sfx.down : sfx.draw)();
    }

    // زر التخطي
    const slot = $(this.el, '.maj-skip-slot');
    const showSkip = g.phase === 'question' && g.you && g.skipsLeft > 0;
    slot.innerHTML = showSkip ? `<button class="btn btn-text btn-sm" data-skip>${t('skipQuestion', { n: g.skipsLeft })}</button>` : '';
    $(slot, '[data-skip]')?.addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      const res = await this.ctx.act({ type: 'skip' });
      if (!res.ok) this.ctx.onError(res.error);
    });

    // نقاط المباراة
    const ranked = [...g.players].sort((a, b) => (g.scores[b] || 0) - (g.scores[a] || 0));
    $(this.el, '.maj-scores ol').innerHTML = ranked.map((id) => `
      <li class="${id === this.ctx.room.you ? 'me' : ''}"><i class="pdot" style="background:${this.ctx.byId(id)?.color || 'var(--line)'}"></i>
      <span class="pname">${esc(this.ctx.byId(id)?.name || '—')}</span>
      ${g.phase === 'question' ? `<span class="tick ${g.answeredIds.includes(id) ? 'on' : ''}" aria-hidden="true"></span>` : ''}
      <b>${g.scores[id] || 0}</b></li>`).join('');
    this.paintTimer();
  },

  paintTimer() {
    const g = this.g;
    const el = $(this.el, '.spy-timer');
    if (!g.deadline || g.phase === 'done') { el.hidden = true; return; }
    el.hidden = false;
    const left = Math.max(0, g.deadline - this.ctx.now());
    $(el, 'i').style.width = `${Math.min(100, (left / ((PHASE_MS[g.phase] || 20) * 1000)) * 100)}%`;
    $(el, 'span').textContent = t('secondsLeft', { s: Math.ceil(left / 1000) });
    el.classList.toggle('low', g.phase === 'question' && left < 6000);
  },

  resultNote() { return ''; },
};
