// لعبة «ألوان» — لعبة ورق بالألوان والأرقام (على طريقة أونو).
// كل يد سرية على الخادم؛ كل لاعب يستلم أوراقه فقط وعدد أوراق الآخرين.
import crypto from 'node:crypto';

export const COLORS = ['r', 'y', 'g', 'b'];
export const HAND_SIZE = 7;
export const TURN_MS = 30_000;
export const CATCH_PENALTY = 2;

const rand = (n) => crypto.randomInt(n);
export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// 108 ورقة: لكل لون 0 مرة، و1-9 وتخطي وعكس و+2 مرتين، ثم 4 ألوان حرة و4 (+4)
export function buildDeck() {
  const deck = [];
  let id = 0;
  for (const c of COLORS) {
    deck.push({ id: id++, c, v: '0' });
    for (const v of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'rev', '+2']) {
      deck.push({ id: id++, c, v }, { id: id++, c, v });
    }
  }
  for (let i = 0; i < 4; i++) deck.push({ id: id++, c: 'w', v: 'wild' }, { id: id++, c: 'w', v: '+4' });
  return deck;
}

export const canPlay = (card, top, color) => card.c === 'w' || card.c === color || card.v === top.v;

function drawCards(state, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    if (!state.deck.length) {
      // إعادة خلط الأوراق الملعوبة ما عدا الورقة الظاهرة
      const top = state.discard.pop();
      state.deck = shuffle(state.discard.map((c) => (c.v === 'wild' || c.v === '+4' ? { ...c, c: 'w' } : c)));
      state.discard = [top];
      if (!state.deck.length) break;
    }
    out.push(state.deck.pop());
  }
  return out;
}

const nextIndex = (state, steps = 1) => {
  const n = state.order.length;
  return (((state.turn + state.dir * steps) % n) + n) % n;
};

function advance(state, now, steps = 1) {
  state.turn = nextIndex(state, steps);
  state.drawn = null;
  state.deadline = now + TURN_MS;
}

const colors = {
  id: 'colors',
  minPlayers: 2,

  setup(roster, prev, { now = Date.now() } = {}) {
    const order = roster.slice(0, 8);
    const deck = shuffle(buildDeck());
    const hands = {};
    for (const p of order) hands[p] = deck.splice(-HAND_SIZE);
    // أول ورقة ظاهرة تكون رقمًا
    let i = deck.findIndex((c) => /^\d$/.test(c.v));
    const [first] = deck.splice(i, 1);
    const startOffset = prev ? (prev.startOffset + 1) % order.length : 0;
    return {
      order,
      hands,
      deck,
      discard: [first],
      color: first.c,
      dir: 1,
      turn: startOffset,
      startOffset,
      drawn: null,
      called: [],      // من ضغط «ألوان!» قبل ورقته قبل الأخيرة
      exposed: null,   // من بقيت له ورقة ولم ينادِ — يمكن الإمساك به
      last: null,
      seq: 0,
      deadline: now + TURN_MS,
      result: null,
    };
  },

  action(state, pid, a, { now = Date.now() } = {}) {
    if (state.result) return { ok: false, error: 'game_over' };
    if (!state.order.includes(pid)) return { ok: false, error: 'not_a_player' };
    const type = a?.type;

    // الإمساك بلاعب نسي النداء — مسموح لأي لاعب آخر في أي وقت قبل أن يلعب التالي
    if (type === 'catch') {
      if (!state.exposed || state.exposed === pid) return { ok: false, error: 'nothing_to_catch' };
      const victim = state.exposed;
      state.hands[victim].push(...drawCards(state, CATCH_PENALTY));
      state.exposed = null;
      state.last = { type: 'caught', pid, victim, seq: ++state.seq };
      return { ok: true };
    }

    // النداء قبل لعب الورقة قبل الأخيرة (أو بعد لعبها مباشرة قبل أن يمسكك أحد)
    if (type === 'call') {
      const hand = state.hands[pid];
      if (hand.length > 2) return { ok: false, error: 'too_early' };
      if (!state.called.includes(pid)) state.called.push(pid);
      if (state.exposed === pid) state.exposed = null;
      return { ok: true };
    }

    if (state.order[state.turn] !== pid) return { ok: false, error: 'not_your_turn' };
    const hand = state.hands[pid];

    if (type === 'draw') {
      if (state.drawn !== null) return { ok: false, error: 'already_drawn' };
      const [card] = drawCards(state, 1);
      if (!card) { advance(state, now); return { ok: true }; }
      hand.push(card);
      state.called = state.called.filter((p) => p !== pid);
      state.last = { type: 'draw', pid, seq: ++state.seq };
      const top = state.discard.at(-1);
      if (canPlay(card, top, state.color)) {
        state.drawn = card.id; // يمكنه لعبها أو التمرير
        state.deadline = now + TURN_MS;
      } else {
        advance(state, now);
      }
      if (state.exposed && state.exposed !== pid) state.exposed = null;
      return { ok: true };
    }

    if (type === 'pass') {
      if (state.drawn === null) return { ok: false, error: 'draw_first' };
      advance(state, now);
      return { ok: true };
    }

    if (type === 'play') {
      const i = hand.findIndex((c) => c.id === a.cardId);
      if (i < 0) return { ok: false, error: 'bad_card' };
      const card = hand[i];
      if (state.drawn !== null && card.id !== state.drawn) return { ok: false, error: 'play_drawn_only' };
      const top = state.discard.at(-1);
      if (!canPlay(card, top, state.color)) return { ok: false, error: 'cant_play' };
      if (card.c === 'w' && !COLORS.includes(a.color)) return { ok: false, error: 'choose_color' };

      hand.splice(i, 1);
      state.discard.push(card.c === 'w' ? { ...card, c: a.color } : card);
      state.color = card.c === 'w' ? a.color : card.c;
      if (state.exposed && state.exposed !== pid) state.exposed = null; // انتهت فرصة الإمساك بالسابق
      state.last = { type: 'play', pid, card: state.discard.at(-1), seq: ++state.seq };

      if (!hand.length) {
        state.result = { winner: pid };
        state.deadline = null;
        return { ok: true };
      }
      if (hand.length === 1 && !state.called.includes(pid)) state.exposed = pid;
      if (hand.length > 1) state.called = state.called.filter((p) => p !== pid);

      const n = state.order.length;
      if (card.v === 'rev') {
        state.dir *= -1;
        advance(state, now, n === 2 ? 2 : 1); // بين لاعبين يعمل كتخطي
      } else if (card.v === 'skip') {
        advance(state, now, 2);
      } else if (card.v === '+2' || card.v === '+4') {
        const victimIdx = nextIndex(state, 1);
        const victim = state.order[victimIdx];
        state.hands[victim].push(...drawCards(state, card.v === '+2' ? 2 : 4));
        state.called = state.called.filter((p) => p !== victim);
        state.last.victim = victim;
        advance(state, now, 2);
      } else {
        advance(state, now, 1);
      }
      return { ok: true };
    }
    return { ok: false, error: 'bad_action' };
  },

  // انتهاء وقت الدور: يسحب ورقة تلقائيًا ثم يمرر
  tick(state, now) {
    if (state.result || !state.deadline || now < state.deadline) return false;
    const pid = state.order[state.turn];
    if (state.drawn === null) {
      const cards = drawCards(state, 1);
      state.hands[pid].push(...cards);
      state.called = state.called.filter((p) => p !== pid);
      state.last = { type: 'timeout', pid, seq: ++state.seq };
    }
    advance(state, now);
    return true;
  },

  outcome(state) {
    if (!state.result) return null;
    if (state.result.void) return { winners: [], draw: true };
    return { winners: [state.result.winner], draw: false };
  },

  playerLeft(state, pid, { now = Date.now() } = {}) {
    const i = state.order.indexOf(pid);
    if (state.result || i < 0) return;
    const wasTurn = i === state.turn;
    state.deck.unshift(...state.hands[pid]);
    delete state.hands[pid];
    state.order.splice(i, 1);
    if (state.exposed === pid) state.exposed = null;
    if (state.order.length === 1) { state.result = { winner: state.order[0], forfeit: true }; return; }
    if (i < state.turn) state.turn -= 1;
    state.turn %= state.order.length;
    if (wasTurn) { state.drawn = null; state.deadline = now + TURN_MS; }
  },

  view(state, pid) {
    const top = state.discard.at(-1);
    return {
      order: state.order,
      you: state.order.includes(pid) ? pid : null,
      hand: state.hands[pid] || [],
      counts: Object.fromEntries(state.order.map((p) => [p, state.hands[p].length])),
      top,
      color: state.color,
      dir: state.dir,
      turnId: state.order[state.turn],
      drawn: state.order[state.turn] === pid ? state.drawn : null,
      deckCount: state.deck.length,
      called: state.called,
      exposed: state.exposed,
      last: state.last,
      deadline: state.deadline,
      result: state.result,
      // عند نهاية الجولة نكشف ما تبقى في الأيدي
      reveal: state.result ? state.hands : null,
    };
  },
};

export default colors;
