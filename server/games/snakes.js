// منطق لعبة السلم والثعبان — مستقل عن الشبكة والواجهة.
// النرد يُرمى على الخادم فقط، فلا يستطيع أي لاعب اختيار رقمه.
import crypto from 'node:crypto';

export const LADDERS = { 1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 99 };
export const SNAKES = { 16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78 };
export const FINISH = 100;
export const MAX_ACTIVE = 4;
export const MAX_SIXES = 3; // بعد ثلاث ستات متتالية ينتهي الدور

export const rollDie = () => crypto.randomInt(1, 7);

// حساب الحركة لرمية واحدة: يجب الوصول إلى 100 بالضبط، والزيادة ترتد للخلف
export function computeMove(from, roll) {
  let landing = from + roll;
  let bounced = false;
  if (landing > FINISH) {
    landing = FINISH - (landing - FINISH);
    bounced = true;
  }
  let to = landing;
  let via = null;
  if (LADDERS[landing]) { to = LADDERS[landing]; via = 'ladder'; }
  else if (SNAKES[landing]) { to = SNAKES[landing]; via = 'snake'; }
  return { from, roll, landing, to, via, bounced };
}

const snakes = {
  id: 'snakes',
  minPlayers: 2,

  setup(roster, prev) {
    // أول أربعة متصلين يلعبون؛ من يزيد يتفرج. بداية الدور تتنقل بين الجولات.
    let order = roster.slice(0, MAX_ACTIVE);
    const offset = prev ? (prev.startOffset + 1) % order.length : 0;
    order = order.slice(offset).concat(order.slice(0, offset));
    return {
      order,
      pos: Object.fromEntries(order.map((id) => [id, 0])),
      turn: 0,
      sixes: 0,
      last: null, // آخر رمية مع تفاصيلها للرسوم
      seq: 0,
      result: null,
      startOffset: offset,
    };
  },

  action(state, playerId, action, _ctx, rng = rollDie) {
    if (state.result) return { ok: false, error: 'game_over' };
    if (!action || action.type !== 'roll') return { ok: false, error: 'bad_action' };
    if (!state.order.includes(playerId)) return { ok: false, error: 'not_a_player' };
    if (state.order[state.turn] !== playerId) return { ok: false, error: 'not_your_turn' };

    const roll = rng();
    const move = computeMove(state.pos[playerId], roll);
    state.pos[playerId] = move.to;
    state.seq += 1;

    let extra = false;
    if (move.to === FINISH) {
      state.result = { winner: playerId };
    } else if (roll === 6 && state.sixes + 1 < MAX_SIXES) {
      state.sixes += 1;
      extra = true; // ستة = رمية إضافية
    } else {
      state.sixes = 0;
      state.turn = (state.turn + 1) % state.order.length;
    }
    state.last = { ...move, playerId, extra, seq: state.seq };
    return { ok: true };
  },

  outcome(state) {
    if (!state.result) return null;
    if (state.result.void) return { winners: [], draw: true };
    return { winners: [state.result.winner], draw: false };
  },

  playerLeft(state, playerId) {
    const i = state.order.indexOf(playerId);
    if (i < 0 || state.result) return;
    const wasTurn = i === state.turn;
    state.order.splice(i, 1);
    delete state.pos[playerId];
    if (state.order.length === 1) {
      state.result = { winner: state.order[0], forfeit: true };
      return;
    }
    if (i < state.turn) state.turn -= 1;
    if (wasTurn) state.sixes = 0;
    state.turn %= state.order.length;
  },

  view(state, playerId) {
    return {
      order: state.order,
      pos: state.pos,
      turnId: state.order[state.turn],
      last: state.last,
      result: state.result,
      you: state.order.includes(playerId) ? playerId : null,
      ladders: LADDERS,
      snakes: SNAKES,
    };
  },
};

export default snakes;
