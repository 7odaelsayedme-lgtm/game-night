// تثبيت الموقع كتطبيق على الجوال
let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn(!!deferred));

export const isInstalled = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

export function initPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    notify();
  });
  window.addEventListener('appinstalled', () => { deferred = null; notify(); });
}

export const canInstall = () => !!deferred && !isInstalled();
export const onInstallChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export async function promptInstall() {
  if (!deferred) return false;
  deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  notify();
  return outcome === 'accepted';
}
