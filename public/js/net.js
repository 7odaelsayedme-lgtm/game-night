// طبقة الاتصال بالخادم. الواجهة لا تغيّر حالة اللعب بنفسها أبدًا؛ ترسل طلبًا وتنتظر الحالة من الخادم.
const SESSION_KEY = 'gn:session';

export const socket = window.io({ transports: ['websocket', 'polling'] });

export function call(event, payload = {}) {
  return new Promise((resolve) => {
    socket.timeout(8000).emit(event, payload, (err, res) => {
      resolve(err ? { ok: false, error: 'timeout' } : res || { ok: false, error: 'generic' });
    });
  });
}

// معرّف فريد لكل حركة لمنع احتسابها مرتين
export const actionId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

// رمز الجلسة يُحفظ لكل تبويب، فيبقى بعد إعادة تحميل الصفحة ويسمح بالعودة لنفس المقعد
export function saveSession(code, token) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code, token })); } catch { /* ignore */ }
}
export function getSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || null; } catch { return null; }
}
export function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}
