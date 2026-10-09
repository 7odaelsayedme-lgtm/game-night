// شاشات الإنشاء والدخول والدعوة
import { t, errText } from '../i18n.js';
import { h, esc, $, $$ } from '../ui.js';
import { call, saveSession } from '../net.js';
import { prefs, sfx } from '../prefs.js';

const nameField = () => `
  <label class="field">
    <span>${t('nickname')}</span>
    <input name="nickname" maxlength="16" autocomplete="nickname" placeholder="${t('nicknamePh')}" value="${esc(prefs.nickname)}" required>
  </label>`;

function wireForm(form, onSubmit) {
  const btn = $(form, 'button[type=submit]');
  const err = $(form, '.form-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    btn.disabled = true;
    form.classList.add('busy');
    const msg = await onSubmit(new FormData(form));
    btn.disabled = false;
    form.classList.remove('busy');
    if (msg) { err.textContent = msg; sfx.error(); }
  });
}

async function enter(app, res, name) {
  if (!res.ok) return errText(res.error);
  prefs.set('nickname', name);
  saveSession(res.code, res.token);
  app.navigate(`/r/${res.code}`, true);
  return null;
}

export const createScreen = {
  mount(root, app) {
    this.el = h(`
      <main class="panel-page">
        <form class="panel" novalidate>
          <a href="/" data-link class="back-link">${t('back')}</a>
          <h1>${t('createRoom')}</h1>
          ${nameField()}
          <fieldset class="field">
            <legend>${t('maxPlayers')}</legend>
            <div class="seg">${[2, 3, 4, 5, 6, 7, 8].map((n) => `<label><input type="radio" name="max" value="${n}" ${n === 8 ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div>
          </fieldset>
          <p class="form-error" role="alert"></p>
          <button type="submit" class="btn btn-primary btn-xl btn-block">${t('createSubmit')}</button>
        </form>
      </main>`);
    root.append(this.el);
    const form = $(this.el, 'form');
    wireForm(form, async (fd) => {
      const name = String(fd.get('nickname') || '').trim();
      if (!name) return t('err_name_required');
      const res = await call('room:create', { nickname: name, maxPlayers: Number(fd.get('max')) });
      return enter(app, res, name);
    });
    $(form, 'input[name=nickname]').focus();
  },
  unmount() { this.el?.remove(); },
};

export const joinScreen = {
  mount(root, app) {
    this.el = h(`
      <main class="panel-page">
        <form class="panel" novalidate>
          <a href="/" data-link class="back-link">${t('back')}</a>
          <h1>${t('joinRoom')}</h1>
          <label class="field">
            <span>${t('roomCode')}</span>
            <input name="code" class="code-input" maxlength="5" autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="text" dir="ltr" placeholder="${t('roomCodePh')}" required>
          </label>
          ${nameField()}
          <p class="form-error" role="alert"></p>
          <button type="submit" class="btn btn-primary btn-xl btn-block">${t('joinSubmit')}</button>
        </form>
      </main>`);
    root.append(this.el);
    const form = $(this.el, 'form');
    const codeInput = $(form, 'input[name=code]');
    codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    wireForm(form, async (fd) => {
      const code = String(fd.get('code') || '');
      const name = String(fd.get('nickname') || '').trim();
      if (code.length !== 5) return t('err_code_short');
      if (!name) return t('err_name_required');
      return enter(app, await call('room:join', { code, nickname: name }), name);
    });
    codeInput.focus();
  },
  unmount() { this.el?.remove(); },
};

// عند فتح رابط دعوة بدون جلسة سابقة
export const inviteScreen = {
  async mount(root, app, { code, error }) {
    this.el = h(`<main class="panel-page"><div class="panel"><p class="loading">${t('checkingRoom')}</p></div></main>`);
    root.append(this.el);
    const info = error ? { ok: false, error } : await call('room:peek', { code });
    if (!this.el.isConnected) return;
    const panel = $(this.el, '.panel');
    if (!info.ok || info.full) {
      panel.innerHTML = `
        <h1>${t('roomCode')} <bdi class="code-inline">${esc(code)}</bdi></h1>
        <p class="form-error">${errText(info.ok ? 'room_full' : info.error)}</p>
        <div class="stack">
          <a href="/create" data-link class="btn btn-primary btn-block">${t('createRoom')}</a>
          <a href="/join" data-link class="btn btn-ghost btn-block">${t('joinRoom')}</a>
        </div>`;
      return;
    }
    panel.outerHTML = `
      <form class="panel" novalidate>
        <a href="/" data-link class="back-link">${t('goHome')}</a>
        <h1>${t('invitedTo', { name: esc(info.hostName) })}</h1>
        <p class="sub">${t('invitedSub', { count: info.count, max: info.maxPlayers })}</p>
        <div class="code-tiles small" dir="ltr">${[...info.code].map((c) => `<span>${esc(c)}</span>`).join('')}</div>
        ${nameField()}
        <p class="form-error" role="alert"></p>
        <button type="submit" class="btn btn-primary btn-xl btn-block">${t('joinSubmit')}</button>
      </form>`;
    const form = $(this.el, 'form');
    wireForm(form, async (fd) => {
      const name = String(fd.get('nickname') || '').trim();
      if (!name) return t('err_name_required');
      return enter(app, await call('room:join', { code: info.code, nickname: name }), name);
    });
    $(form, 'input[name=nickname]').focus();
  },
  unmount() { this.el?.remove(); },
};

export const messageScreen = {
  mount(root, app, { title, text, actions = [] }) {
    this.el = h(`
      <main class="panel-page"><div class="panel">
        <h1>${title}</h1>${text ? `<p class="sub">${text}</p>` : ''}
        <div class="stack">${actions.map((a, i) => `<button class="btn ${i === 0 ? 'btn-primary' : 'btn-ghost'} btn-block" data-i="${i}">${a.label}</button>`).join('')}</div>
      </div></main>`);
    root.append(this.el);
    $$(this.el, 'button[data-i]').forEach((b) => b.addEventListener('click', () => actions[Number(b.dataset.i)].run()));
  },
  unmount() { this.el?.remove(); },
};
