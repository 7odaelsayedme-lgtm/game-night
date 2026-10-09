// واجهة «مين الجاسوس؟»: بطاقة الدور، الأسئلة والأجوبة بالدور، التصويت، وكشف النتيجة.
// كل ما يظهر هنا يأتي من الخادم؛ الجاسوس لا يستلم اسم المكان أصلًا.
import { t, lang } from '../i18n.js';
import { h, esc, $, $$, toast } from '../ui.js';
import { sfx, buzz } from '../prefs.js';

const PHASE_MS = { reveal: 30, ask: 60, answer: 45, vote: 45, guess: 30 };
const placeName = (pair) => (pair ? (lang() === 'en' ? pair[1] : pair[0]) : '');

export default {
  mount(root, ctx) {
    this.ctx = ctx;
    this.key = null;
    this.target = null;
    this.guessing = false;
    this.cardHidden = false;
    this.feedLen = ctx.room.game.feed.length;
    this.el = h(`
      <div class="spy">
        <section class="spy-card"></section>
        <div class="spy-timer" hidden><div class="bar"><i></i></div><span></span></div>
        <section class="spy-action"></section>
        <div class="spy-tools"></div>
        <section class="spy-feed" hidden><h3>${t('feedTitle')}</h3><ol></ol></section>
        <details class="spy-places"><summary></summary><div class="places"></div></details>
      </div>`);
    root.append(this.el);
    this.timer = setInterval(() => this.paintTimer(), 250);
    sfx.reveal();
    this.update(ctx);
  },

  unmount() { clearInterval(this.timer); this.el?.remove(); },

  get g() { return this.ctx.room.game; },
  name(id) { return esc(this.ctx.byId(id)?.name || '—'); },
  dot(id) { return `<i class="pdot" style="background:${this.ctx.byId(id)?.color || 'var(--line)'}"></i>`; },

  async send(payload, btn) {
    if (btn) btn.disabled = true;
    buzz();
    const res = await this.ctx.act(payload);
    if (btn) btn.disabled = false;
    if (!res.ok) this.ctx.onError(res.error);
    return res.ok;
  },

  update(ctx) {
    this.ctx = ctx;
    const g = this.g;
    if (g.phase !== 'ask' && g.phase !== 'answer' && g.phase !== 'vote' && g.phase !== 'guess') this.guessing = false;
    if (g.role !== 'spy') this.guessing = false;

    this.paintCard();
    const key = [g.phase, g.asker, g.target, g.role, this.guessing, g.locVersion].join('|');
    if (key !== this.key) {
      if (this.key && this.key.split('|')[5] !== String(g.locVersion)) { toast(t('placeChanged')); sfx.reveal(); }
      this.key = key;
      this.buildAction();
    }
    this.refreshAction();
    this.paintTools();
    this.paintFeed();
    this.paintPlaces();
    this.paintTimer();
  },

  // ---------- بطاقة الدور ----------
  paintCard() {
    const g = this.g;
    const card = $(this.el, '.spy-card');
    const big = g.phase === 'reveal';
    let body;
    if (g.phase === 'done') {
      body = '';
    } else if (g.role === 'spectator') {
      body = `<p class="card-sub">${t('spectatorCard')}</p>`;
    } else if (this.cardHidden) {
      body = `<button class="card-reveal" data-show>${t('showCard')}</button>`;
    } else if (g.role === 'spy') {
      body = `<p class="card-label">${t('yourCard')}</p><p class="card-main spy-role">${t('youAreSpy')}</p><p class="card-sub">${t('spyHint')}</p>`;
    } else {
      body = `<p class="card-label">${t('placeIs')}</p><p class="card-main">${esc(placeName(g.location))}</p><p class="card-sub">${t('agentHint')}</p>`;
    }
    const sig = `${body}|${big}`;
    if (card.dataset.sig === sig) return;
    card.dataset.sig = sig;
    card.hidden = !body;
    card.className = `spy-card ${g.role === 'spy' ? 'is-spy' : ''} ${big ? 'big' : 'compact'} ${this.cardHidden ? 'is-hidden' : ''}`;
    card.innerHTML = body + (!this.cardHidden && g.role !== 'spectator' && g.phase !== 'done'
      ? `<button class="btn btn-text card-toggle" data-hide>${t('hideCard')}</button>` : '');
    $(card, '[data-hide]')?.addEventListener('click', () => { this.cardHidden = true; this.paintCard(); });
    $(card, '[data-show]')?.addEventListener('click', () => { this.cardHidden = false; this.paintCard(); });
  },

  // ---------- منطقة الإجراء حسب المرحلة ----------
  buildAction() {
    const g = this.g;
    const me = this.ctx.room.you;
    const box = $(this.el, '.spy-action');
    box.className = `spy-action phase-${g.phase}`;

    if (this.guessing || (g.phase === 'guess' && g.role === 'spy')) {
      box.innerHTML = `
        <h3>${g.phase === 'guess' ? t('youCaught') : t('guessTitle')}</h3>
        <div class="place-grid">${g.options.map((o) => `<button class="place-btn" data-loc="${o.id}">${esc(placeName(o.name))}</button>`).join('')}</div>
        ${g.phase !== 'guess' ? `<button class="btn btn-ghost btn-block" data-cancel>${t('back')}</button>` : ''}`;
      $$(box, '.place-btn').forEach((b) => b.addEventListener('click', () => {
        const opt = g.options.find((o) => String(o.id) === b.dataset.loc);
        if (confirm(t('guessConfirm', { place: placeName(opt.name) }))) this.send({ type: 'spy_guess', loc: opt.id }, b);
      }));
      $(box, '[data-cancel]')?.addEventListener('click', () => { this.guessing = false; this.update(this.ctx); });
      return;
    }

    switch (g.phase) {
      case 'reveal':
        box.innerHTML = g.role === 'spectator' ? '' : `
          <button class="btn btn-primary btn-xl btn-block" data-ready>${t('ready')}</button>
          <p class="muted ready-count"></p>
          ${g.skipsLeft > 0 ? `<button class="btn btn-text skip-btn" data-skip>${t('skipPlace', { n: g.skipsLeft })}</button>` : ''}`;
        $(box, '[data-ready]')?.addEventListener('click', (e) => this.send({ type: 'ready' }, e.currentTarget));
        $(box, '[data-skip]')?.addEventListener('click', (e) => this.send({ type: 'skip_location' }, e.currentTarget));
        break;

      case 'ask':
        if (g.asker === me) {
          const others = g.players.filter((p) => p !== me);
          const blocked = others.length > 1 ? g.lastAsker : null;
          if (!others.includes(this.target) || this.target === blocked) this.target = null;
          box.innerHTML = `
            <h3>${t('askTitle')}</h3>
            <p class="muted">${t('chooseTarget')}</p>
            <div class="target-chips">${others.map((p) => `<button class="tchip" data-id="${p}" ${p === blocked ? 'disabled' : ''}>${this.dot(p)}${this.name(p)}</button>`).join('')}</div>
            <form class="say"><input maxlength="120" placeholder="${t('questionPh')}" enterkeyhint="send" aria-label="${t('questionPh')}"><button class="btn btn-primary" type="submit">${t('send')}</button></form>`;
          $$(box, '.tchip').forEach((b) => b.addEventListener('click', () => { this.target = b.dataset.id; this.refreshAction(); }));
          $(box, 'form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = $(box, 'input');
            if (!this.target) return this.ctx.onError('bad_target');
            if (await this.send({ type: 'ask', target: this.target, text: input.value }, $(box, 'button[type=submit]'))) { sfx.send(); }
          });
        } else {
          box.innerHTML = `<p class="waiting"><span class="pulse"></span>${t('isAsking', { name: this.name(g.asker) })}</p>`;
        }
        break;

      case 'answer': {
        const bubble = `<div class="bubble q"><b>${this.dot(g.asker)}${this.name(g.asker)} ← ${this.dot(g.target)}${this.name(g.target)}</b><p>${esc(g.question)}</p></div>`;
        if (g.target === me) {
          box.innerHTML = `<h3>${t('answerTitle', { name: this.name(g.asker) })}</h3>${bubble}
            <form class="say"><input maxlength="120" placeholder="${t('answerPh')}" enterkeyhint="send" aria-label="${t('answerPh')}"><button class="btn btn-primary" type="submit">${t('sendAnswer')}</button></form>`;
          $(box, 'form').addEventListener('submit', async (e) => {
            e.preventDefault();
            if (await this.send({ type: 'answer', text: $(box, 'input').value }, $(box, 'button[type=submit]'))) sfx.send();
          });
          setTimeout(() => $(box, 'input')?.focus(), 50);
        } else {
          box.innerHTML = `${bubble}<p class="waiting"><span class="pulse"></span>${t('isAnswering', { name: this.name(g.target) })}</p>`;
        }
        break;
      }

      case 'vote':
        box.innerHTML = `<h3>${t('voteTitle')}</h3>
          ${g.role !== 'spectator' ? `<p class="muted">${t('voteHint')}</p>
          <div class="vote-grid">${g.players.filter((p) => p !== me).map((p) => `<button class="vchip" data-id="${p}">${this.dot(p)}${this.name(p)}</button>`).join('')}</div>` : ''}
          <p class="muted voted-count"></p>`;
        $$(box, '.vchip').forEach((b) => b.addEventListener('click', () => this.send({ type: 'vote', suspect: b.dataset.id }, b)));
        break;

      case 'guess':
        box.innerHTML = `<p class="waiting"><span class="pulse"></span>${t('accusedWait', { name: this.name(g.accused) })}</p>`;
        break;

      case 'done': {
        const r = g.result || {};
        const counts = Object.entries(g.voteCounts || {}).sort((a, b) => b[1] - a[1]);
        box.innerHTML = `
          <div class="reveal-box ${r.winner === 'spy' ? 'spy-won' : ''}">
            <p class="reveal-line">${t('spyWas', { name: `${this.dot(g.spyId)}${this.name(g.spyId)}` })}</p>
            <p class="reveal-place">${t('placeWas', { place: esc(placeName(g.location)) })}</p>
            ${counts.length ? `<ul class="vote-counts">${counts.map(([id, n]) => `<li>${t('votesFor', { name: this.name(id), n })}</li>`).join('')}</ul>` : ''}
          </div>`;
        break;
      }
      default:
        box.innerHTML = '';
    }
  },

  // تحديثات صغيرة دون إعادة بناء (حتى لا يضيع ما يكتبه اللاعب)
  refreshAction() {
    const g = this.g;
    const box = $(this.el, '.spy-action');
    const me = this.ctx.room.you;
    const rc = $(box, '.ready-count');
    if (rc) rc.textContent = t('readyCount', { n: g.readyIds.length, total: g.players.length });
    const rb = $(box, '[data-ready]');
    if (rb) { const done = g.readyIds.includes(me); rb.disabled = done; rb.classList.toggle('done', done); }
    $$(box, '.tchip').forEach((b) => { b.classList.toggle('on', b.dataset.id === this.target); b.setAttribute('aria-pressed', String(b.dataset.id === this.target)); });
    $$(box, '.vchip').forEach((b) => { b.classList.toggle('on', b.dataset.id === g.myVote); b.setAttribute('aria-pressed', String(b.dataset.id === g.myVote)); });
    const vc = $(box, '.voted-count');
    if (vc) vc.textContent = t('votedCount', { n: g.votedIds.length, total: g.players.length });
  },

  paintTools() {
    const g = this.g;
    const tools = $(this.el, '.spy-tools');
    const inQuestions = g.phase === 'ask' || g.phase === 'answer';
    const need = Math.floor(g.players.length / 2) + 1;
    const requested = g.voteRequests.includes(this.ctx.room.you);
    const canGuess = g.role === 'spy' && !this.guessing && ['ask', 'answer', 'vote'].includes(g.phase);
    const sig = [inQuestions, g.voteRequests.length, requested, canGuess, g.role].join('|');
    if (tools.dataset.sig === sig) return;
    tools.dataset.sig = sig;
    tools.innerHTML = `
      ${inQuestions && g.role !== 'spectator' ? `<button class="btn btn-ghost" data-vote ${requested ? 'disabled' : ''}>${t(requested ? 'voteRequested' : 'requestVote', { n: g.voteRequests.length, need })}</button>` : ''}
      ${canGuess ? `<button class="btn btn-spy" data-guess>${t('iKnow')}</button>` : ''}`;
    $(tools, '[data-vote]')?.addEventListener('click', (e) => this.send({ type: 'request_vote' }, e.currentTarget));
    $(tools, '[data-guess]')?.addEventListener('click', () => { this.guessing = true; this.update(this.ctx); });
  },

  paintFeed() {
    const g = this.g;
    const sec = $(this.el, '.spy-feed');
    sec.hidden = !g.feed.length;
    if (g.feed.length > this.feedLen) sfx.tap();
    this.feedLen = g.feed.length;
    const left = ['ask', 'answer'].includes(g.phase) ? `<span class="muted"> · ${t('questionsLeft', { n: g.turnsLeft })}</span>` : '';
    $(sec, 'h3').innerHTML = `${t('feedTitle')}${left}`;
    $(sec, 'ol').innerHTML = g.feed.slice().reverse().map((f) => (f.skipped
      ? `<li class="skip">${t('skippedTurn', { name: this.name(f.asker) })}</li>`
      : `<li><div class="bubble q"><b>${this.dot(f.asker)}${this.name(f.asker)} ← ${this.dot(f.target)}${this.name(f.target)}</b><p>${esc(f.q)}</p></div>
         <div class="bubble a"><p>${f.a === null ? `<em>${t('noAnswer')}</em>` : esc(f.a)}</p></div></li>`)).join('');
  },

  paintPlaces() {
    const g = this.g;
    const det = $(this.el, '.spy-places');
    $(det, 'summary').textContent = t('possiblePlaces', { n: g.options.length });
    const sig = `${g.locVersion}|${lang()}`;
    const box = $(det, '.places');
    if (box.dataset.sig !== sig) {
      box.dataset.sig = sig;
      box.innerHTML = g.options.map((o) => `<span>${esc(placeName(o.name))}</span>`).join('');
    }
  },

  paintTimer() {
    const g = this.g;
    const el = $(this.el, '.spy-timer');
    if (!g.deadline || g.phase === 'done') { el.hidden = true; return; }
    el.hidden = false;
    const left = Math.max(0, g.deadline - this.ctx.now());
    const total = (PHASE_MS[g.phase] || 30) * 1000;
    $(el, 'i').style.width = `${Math.min(100, (left / total) * 100)}%`;
    $(el, 'span').textContent = t('secondsLeft', { s: Math.ceil(left / 1000) });
    el.classList.toggle('low', left < 10_000);
  },

  resultNote(ctx) {
    const r = ctx.room.game?.result;
    if (!r) return '';
    return t(`reason_${r.reason}`, { guess: esc(placeName(ctx.room.game.guess)) });
  },
};

