// لعبة «الشايب» بالكوتشينة: نسحب ثلاثة شياب ويبقى شايب واحد.
// كل لاعب يسحب ورقة مقلوبة من جاره، والأزواج تُرمى، ومن يبقى معه الشايب في النهاية يخسر.
import crypto from 'node:crypto';

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUITS = ['s', 'h', 'd', 'c'];
export const SHAYEB = 'K-s'; // شايب البستوني هو الشايب الوحيد
export const TURN_MS = 25_000;

const rand = (n) => crypto.randomInt(n);
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const rankOf = (id) => id.split('-')[0];

export function buildDeck() {
  const deck = [];
  for (const r of RANKS) for (const s of SUITS) {
    const id = `${r}-${s}`;
    if (r === 'K' && id !== SHAYEB) continue;
    deck.push(id);
  }
  return deck; // 49 ورقة
}

// يرمي كل الأزواج من اليد ويرجع الأزواج المرمية
export function discardPairs(hand) {
  const pairs = [];
  const byRank = {};
  for (const id of hand) (byRank[rankOf(id)] ||= []).push(id);
  for (const ids of Object.values(byRank)) {
    while (ids.length >= 2) pairs.push([ids.shift(), ids.shift()]);
  }
  const keep = new Set(Object.values(byRank).flat());
  return { hand: hand.filter((id) => keep.has(id)), pairs };
}

const active = (state) => state.order.filter((p) => state.hands[p].length > 0);

function nextActive(state, from) {
  const n = state.order.length;
  let i = state.order.indexOf(from);
  for (let k = 1; k <= n; k++) {
    const p = state.order[(i + k) % n];
    if (p !== from && state.hands[p].length > 0) return p;
  }
  return null;
}

function settle(state, now) {
  // من فرغت يده نجا؛ إذا بقي لاعب واحد بأوراق فهو الخاسر
  for (const p of state.order) {
    if (state.hands[p].length === 0 && !state.safe.includes(p)) state.safe.push(p);
  }
  const left = active(state);
  if (left.length <= 1) {
    state.result = { loser: left[0] || null };
    state.deadline = null;
    return;
  }
  if (!left.includes(state.turnId)) state.turnId = nextActive(state, state.turnId) || left[0];
  state.targetId = nextActive(state, state.turnId);
  state.deadline = now + TURN_MS;
}

const shayeb = {
  id: 'shayeb',
  minPlayers: 2,

  setup(roster, prev, { now = Date.now() } = {}) {
    const order = roster.slice(0, 8);
    const deck = shuffle(buildDeck());
    const hands = Object.fromEntries(order.map((p) => [p, []]));
    deck.forEach((id, i) => hands[order[i % order.length]].push(id));
    const pile = [];
    for (const p of order) {
      const r = discardPairs(hands[p]);
      hands[p] = shuffle(r.hand);
      pile.push(...r.pairs.map((pair) => ({ pid: p, pair })));
    }
    const start = prev ? (prev.startOffset + 1) % order.length : 0;
    const state = {
      order, hands, pile, safe: [], startOffset: start,
      turnId: order[start], targetId: null, last: null, seq: 0, deadline: null, result: null,
    };
    settle(state, now);
    return state;
  },

  action(state, pid, a, { now = Date.now() } = {}) {
    if (state.result) return { ok: false, error: 'game_over' };
    if (!state.order.includes(pid)) return { ok: false, error: 'not_a_player' };

    if (a?.type === 'shuffle') {
      // أي لاعب يقدر يخلط أوراقه في أي وقت حتى لا يُعرف مكان الشايب
      shuffle(state.hands[pid]);
      state.last = { type: 'shuffle', pid, seq: ++state.seq };
      return { ok: true };
    }

    if (a?.type === 'pick') {
      if (state.turnId !== pid) return { ok: false, error: 'not_your_turn' };
      const target = state.targetId;
      const th = state.hands[target];
      const i = a.index;
      if (!Number.isInteger(i) || i < 0 || i >= th.length) return { ok: false, error: 'bad_card' };
      const [card] = th.splice(i, 1);
      const mine = state.hands[pid];
      const match = mine.findIndex((id) => rankOf(id) === rankOf(card));
      let pair = null;
      if (match >= 0) {
        pair = [mine.splice(match, 1)[0], card];
        state.pile.push({ pid, pair });
      } else {
        mine.splice(rand(mine.length + 1), 0, card);
      }
      state.last = { type: 'pick', pid, target, pair, seq: ++state.seq, card: pid ? card : null };
      state.turnId = target; // الدور ينتقل لمن سُحب منه (الجار)
      settle(state, now);
      if (!state.result && state.hands[state.turnId].length === 0) {
        state.turnId = nextActive(state, state.turnId);
        settle(state, now);
      }
      return { ok: true };
    }
    return { ok: false, error: 'bad_action' };
  },

  tick(state, now) {
    if (state.result || !state.deadline || now < state.deadline) return false;
    const n = state.hands[state.targetId].length;
    this.action(state, state.turnId, { type: 'pick', index: rand(n) }, { now });
    return true;
  },

  outcome(state) {
    if (!state.result) return null;
    const winners = state.order.filter((p) => p !== state.result.loser);
    return { winners, draw: false };
  },

  playerLeft(state, pid, { now = Date.now() } = {}) {
    if (state.result || !state.order.includes(pid)) return;
    // أوراقه تنتقل للاعب التالي ثم تُرمى الأزواج
    const heir = nextActive(state, pid);
    if (heir) {
      const r = discardPairs([...state.hands[heir], ...state.hands[pid]]);
      state.hands[heir] = shuffle(r.hand);
      state.pile.push(...r.pairs.map((pair) => ({ pid: heir, pair })));
    }
    const wasTurn = state.turnId === pid || state.targetId === pid;
    const following = nextActive(state, pid);
    state.order = state.order.filter((p) => p !== pid);
    delete state.hands[pid];
    state.safe = state.safe.filter((p) => p !== pid);
    if (state.order.length < 2) { state.result = { loser: null, void: true }; state.deadline = null; return; }
    if (wasTurn && state.turnId === pid) state.turnId = following || state.order[0];
    settle(state, now);
  },

  view(state, pid) {
    const last = state.last && {
      ...state.last,
      // الورقة المسحوبة يراها الساحب فقط (إلا إذا كوّنت زوجًا مرميًا علنًا)
      card: state.last.pid === pid ? state.last.card : null,
    };
    return {
      order: state.order,
      you: state.order.includes(pid) ? pid : null,
      hand: state.hands[pid] || [],
      counts: Object.fromEntries(state.order.map((p) => [p, state.hands[p].length])),
      turnId: state.turnId,
      targetId: state.targetId,
      pile: state.pile,
      safe: state.safe,
      last,
      deadline: state.deadline,
      result: state.result,
    };
  },
};

export default shayeb;
