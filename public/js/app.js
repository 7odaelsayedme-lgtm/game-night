// نقطة بداية الواجهة: الشريط العلوي، التنقل بين الشاشات، واستقبال حالة الغرفة من الخادم
import { t, lang, setLang, applyDocumentLang, errText } from './i18n.js';
import { h, $, toast, icon } from './ui.js';
import { socket, call, getSession, saveSession, clearSession } from './net.js';
import { prefs, applyMotion } from './prefs.js';
import home from './screens/home.js';
import { createScreen, joinScreen, inviteScreen, messageScreen } from './screens/forms.js';
import room from './screens/room.js';
import { initPWA } from './pwa.js';

applyDocumentLang();
applyMotion();
initPWA();

const store = { room: null, receivedAt: 0, conn: 'connecting', replaced: false, resuming: false, resumeError: null };
const app = { store, navigate, render, leaveRoom };

// ---------- الهيكل الثابت ----------
const shell = h(`
  <div class="shell">
    <header class="topbar">
      <a href="/" data-link class="logo" aria-label="${t('brand')}"><span class="logo-mark" aria-hidden="true"></span><span class="logo-text"></span></a>
      <span class="conn" role="status"><i></i><span></span></span>
      <button class="icon-btn lang-btn" type="button"></button>
      <div class="settings">
        <button class="icon-btn" type="button" aria-haspopup="true" aria-expanded="false" data-settings>${icon.gear}</button>
        <div class="settings-menu" hidden>
          <label class="switch"><input type="checkbox" data-pref="sound"><span class="sw-label"></span></label>
          <label class="switch"><input type="checkbox" data-pref="reduceMotion"><span class="sw-label"></span></label>
        </div>
      </div>
    </header>
    <div class="offline-banner" hidden></div>
    <div id="screen"></div>
  </div>`);
document.getElementById('app').replaceWith(shell);
const screenRoot = $(shell, '#screen');

function paintShell() {
  $(shell, '.logo-text').textContent = t('brand');
  $(shell, '.lang-btn').textContent = t('language');
  $(shell, '.lang-btn').setAttribute('lang', lang() === 'ar' ? 'en' : 'ar');
  $(shell, '[data-settings]').setAttribute('aria-label', t('settings'));
  const labels = { sound: t('sound'), reduceMotion: t('motion') };
  shell.querySelectorAll('[data-pref]').forEach((inp) => {
    inp.checked = !!prefs[inp.dataset.pref];
    inp.nextElementSibling.textContent = labels[inp.dataset.pref];
  });
  $(shell, '.offline-banner').textContent = t('offlineBanner');
  paintConn();
}

function paintConn() {
  const c = $(shell, '.conn');
  c.dataset.state = store.conn;
  $(c, 'span').textContent = store.conn === 'online' ? t('online') : t('connecting');
  $(shell, '.offline-banner').hidden = store.conn === 'online' || !store.room;
}

$(shell, '.lang-btn').addEventListener('click', () => {
  setLang(lang() === 'ar' ? 'en' : 'ar');
  paintShell();
  render(true);
});
const menuBtn = $(shell, '[data-settings]');
const menu = $(shell, '.settings-menu');
menuBtn.addEventListener('click', () => {
  menu.hidden = !menu.hidden;
  menuBtn.setAttribute('aria-expanded', String(!menu.hidden));
});
document.addEventListener('click', (e) => { if (!e.target.closest('.settings')) { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); } });
shell.querySelectorAll('[data-pref]').forEach((inp) => inp.addEventListener('change', () => prefs.set(inp.dataset.pref, inp.checked)));

// روابط داخلية بدون إعادة تحميل الصفحة
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  navigate(a.getAttribute('href'));
});
window.addEventListener('popstate', () => render());

// ---------- التنقل ----------
let current = null; // { key, screen }

function navigate(path, replace = false) {
  if (replace) history.replaceState(null, '', path); else history.pushState(null, '', path);
  window.scrollTo(0, 0);
  render();
}

function parseRoute() {
  const p = location.pathname;
  const m = p.match(/^\/r\/([A-Za-z0-9]{3,8})\/?$/);
  if (m) return { name: 'room', code: m[1].toUpperCase() };
  if (p === '/create') return { name: 'create' };
  if (p === '/join') return { name: 'join' };
  if (p === '/' || p === '') return { name: 'home' };
  return { name: 'notfound' };
}

function show(key, screen, props) {
  if (current?.key === key) {
    current.screen.update?.(app);
    return;
  }
  current?.screen.unmount?.();
  const instance = Object.create(screen);
  current = { key, screen: instance };
  instance.mount(screenRoot, app, props);
}

function render(force = false) {
  if (force && current) { current.screen.unmount?.(); current = null; }
  const r = parseRoute();

  // إذا كان اللاعب في غرفة وفتح صفحة أخرى، نبقيه في الغرفة حتى يغادر صراحة
  if (r.name !== 'room' && store.room && getSession()?.code === store.room.code) {
    navigate(`/r/${store.room.code}`, true);
    return;
  }

  if (r.name === 'home') return show('home', home);
  if (r.name === 'create') return show('create', createScreen);
  if (r.name === 'join') return show('join', joinScreen);
  if (r.name === 'notfound') {
    return show('notfound', messageScreen, { title: t('notFoundTitle'), actions: [{ label: t('goHome'), run: () => navigate('/') }] });
  }

  // صفحة الغرفة
  if (store.replaced) {
    return show('replaced', messageScreen, {
      title: t('replacedTitle'),
      text: t('replacedText'),
      actions: [
        { label: t('useHere'), run: () => { store.replaced = false; resume(); } },
        { label: t('goHome'), run: () => { store.replaced = false; store.room = null; navigate('/'); } },
      ],
    });
  }
  if (store.room && store.room.code === r.code) return show(`room:${r.code}`, room);
  const session = getSession();
  if (session?.code === r.code && store.resumeError == null) {
    if (!store.resuming && store.conn === 'online') resume();
    return show('resuming', messageScreen, { title: t('connectingRoom'), actions: [] });
  }
  const err = store.resumeError;
  store.resumeError = null;
  return show(`invite:${r.code}`, inviteScreen, { code: r.code, error: err === 'room_not_found' ? err : null });
}

// ---------- الاتصال بالخادم ----------
async function resume() {
  const session = getSession();
  if (!session) return render();
  store.resuming = true;
  const res = await call('room:resume', session);
  store.resuming = false;
  if (!res.ok) {
    clearSession();
    store.room = null;
    store.resumeError = res.error;
    if (res.error === 'session_invalid') toast(errText(res.error), 'error');
    render();
  } else {
    saveSession(res.code, res.token);
  }
}

async function leaveRoom() {
  await call('room:leave');
  clearSession();
  store.room = null;
  navigate('/');
}

socket.on('connect', () => {
  store.conn = 'online';
  paintConn();
  const s = getSession();
  if (s && parseRoute().code === s.code && !store.replaced) resume();
  else render();
});
socket.on('disconnect', () => { store.conn = 'offline'; paintConn(); });
socket.on('room:state', (state) => {
  store.room = state;
  store.receivedAt = Date.now();
  const r = parseRoute();
  if (r.name !== 'room' || r.code !== state.code) navigate(`/r/${state.code}`, true);
  else render();
});
socket.on('session:replaced', () => {
  store.replaced = true;
  store.room = null;
  render();
});

paintShell();
render();
