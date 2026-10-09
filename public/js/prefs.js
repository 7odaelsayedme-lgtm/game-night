// إعدادات المستخدم المحلية: الصوت، تقليل الحركة، والاسم الأخير
const read = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

const systemReduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export const prefs = {
  sound: read('gn:sound', true),
  reduceMotion: read('gn:reduce', systemReduce),
  nickname: read('gn:name', ''),
  set(key, value) {
    this[key] = value;
    write({ sound: 'gn:sound', reduceMotion: 'gn:reduce', nickname: 'gn:name' }[key], value);
    if (key === 'reduceMotion') applyMotion();
  },
};

export function applyMotion() {
  document.documentElement.classList.toggle('reduce-motion', !!prefs.reduceMotion);
}

// أصوات خفيفة مولّدة بالمتصفح، بلا ملفات صوتية
let ctx = null;
function tone(freq, dur = 0.09, type = 'sine', gain = 0.08, delay = 0) {
  if (!prefs.sound) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  } catch { /* الصوت اختياري */ }
}

export const sfx = {
  tap: () => tone(520, 0.05, 'triangle', 0.05),
  placeX: () => tone(660, 0.1, 'triangle'),
  placeO: () => tone(440, 0.12, 'sine'),
  join: () => { tone(523, 0.08); tone(784, 0.1, 'sine', 0.08, 0.08); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.09, i * 0.11)),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.2, 'sine', 0.07, i * 0.14)),
  draw: () => { tone(440, 0.14); tone(440, 0.14, 'sine', 0.08, 0.18); },
  error: () => tone(180, 0.12, 'square', 0.03),
};

export const buzz = (ms = 12) => { if (prefs.sound) navigator.vibrate?.(ms); };
