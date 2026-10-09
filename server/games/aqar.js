// لعبة «ملك العقار» (على طريقة بنك الحظ): شراء مدن، تحصيل إيجار، بناء بيوت، بطاقات حظ، سجن، وإفلاس.
// الخادم يرمي النرد ويحسب كل المبالغ. اللعبة تنتهي بإفلاس الجميع إلا واحدًا، أو بعد 15 جولة ويفوز الأغنى.
import crypto from 'node:crypto';
import {
  BOARD, JAIL, GO_JAIL, START_CASH, SALARY, JAIL_FINE, STATION_RENT, MAX_HOUSES, MAX_ROUNDS, CHANCE, CHEST,
} from '../../shared/aqar-board.js';

export const TURN_MS = 40_000;
const rand = (n) => crypto.randomInt(n);
const shuffled = (n) => { const a = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const rollDie = () => rand(6) + 1;

const groupOf = (g) => BOARD.map((sq, i) => (sq.g === g ? i : -1)).filter((i) => i >= 0);
const ownsGroup = (s, pid, g) => groupOf(g).every((i) => s.owner[i] === pid);
const active = (s) => s.order.filter((p) => !s.bankrupt.includes(p));
const log = (s, e) => { s.log.push({ ...e, seq: ++s.seq }); if (s.log.length > 12) s.log.shift(); };

export function rentFor(s, sq, dice = 7) {
  const b = BOARD[sq];
  const owner = s.owner[sq];
  if (!owner || s.mortgaged[sq]) return 0;
  if (b.t === 'station') {
    const n = BOARD.filter((x, i) => x.t === 'station' && s.owner[i] === owner).length;
    return STATION_RENT[n - 1];
  }
  const h = s.houses[sq] || 0;
  if (h > 0) return b.rent[h];
  return ownsGroup(s, owner, b.g) ? b.rent[0] * 2 : b.rent[0];
}

export function netWorth(s, pid) {
  let w = s.cash[pid];
  for (const [sq, o] of Object.entries(s.owner)) {
    if (o !== pid) continue;
    const b = BOARD[sq];
    w += s.mortgaged[sq] ? b.price / 2 : b.price;
    w += (s.houses[sq] || 0) * (b.house || 0);
  }
  return w;
}

// جمع المال تلقائيًا عند العجز: بيع البيوت أولًا ثم رهن الممتلكات
function liquidate(s, pid, need) {
  const mine = () => Object.keys(s.owner).map(Number).filter((i) => s.owner[i] === pid);
  while (s.cash[pid] < need) {
    const withHouses = mine().filter((i) => s.houses[i] > 0).sort((a, b) => (s.houses[b] - s.houses[a]) || (BOARD[b].house - BOARD[a].house));
    if (withHouses.length) {
      const i = withHouses[0];
      s.houses[i] -= 1;
      s.cash[pid] += BOARD[i].house / 2;
      continue;
    }
    const free = mine().filter((i) => !s.mortgaged[i]).sort((a, b) => BOARD[a].price - BOARD[b].price);
    if (!free.length) break;
    s.mortgaged[free[0]] = true;
    s.cash[pid] += BOARD[free[0]].price / 2;
  }
}

function goBankrupt(s, pid, creditor) {
  for (const sq of Object.keys(s.owner)) {
    if (s.owner[sq] !== pid) continue;
    delete s.owner[sq];
    delete s.houses[sq];
    delete s.mortgaged[sq];
  }
  s.cash[pid] = 0;
  s.bankrupt.push(pid);
  s.jail[pid] = null;
  log(s, { k: 'bankrupt', pid, to: creditor || null });
  if (active(s).length <= 1) finish(s);
}

// يرجع true إذا دفع، وfalse إذا أفلس
function pay(s, pid, amount, to = null) {
  if (amount <= 0) return true;
  if (s.cash[pid] < amount) liquidate(s, pid, amount);
  if (s.cash[pid] >= amount) {
    s.cash[pid] -= amount;
    if (to) s.cash[to] += amount;
    return true;
  }
  if (to) s.cash[to] += Math.max(0, s.cash[pid]);
  goBankrupt(s, pid, to);
  return false;
}

function finish(s) {
  const alive = active(s);
  const worth = Object.fromEntries(s.order.map((p) => [p, s.bankrupt.includes(p) ? 0 : netWorth(s, p)]));
  const best = Math.max(...alive.map((p) => worth[p]));
  s.result = { winners: alive.filter((p) => worth[p] === best), worth };
  s.phase = 'done';
  s.deadline = null;
}

function moveTo(s, pid, to, { forward = true } = {}) {
  const from = s.pos[pid];
  if (forward && to < from) { s.cash[pid] += SALARY; log(s, { k: 'salary', pid }); }
  s.pos[pid] = to;
}

function sendToJail(s, pid) {
  s.pos[pid] = JAIL;
  s.jail[pid] = 0;
  s.doubles = 0;
  log(s, { k: 'jailed', pid });
}

function drawCard(s, pid, deckName) {
  const deck = deckName === 'chance' ? CHANCE : CHEST;
  const order = s.decks[deckName];
  const i = order.shift();
  order.push(i);
  const c = deck[i];
  log(s, { k: 'card', pid, deck: deckName, i });
  switch (c.k) {
    case 'move': moveTo(s, pid, c.to); return resolve(s, pid);
    case 'station': {
      let p = s.pos[pid];
      do p = (p + 1) % BOARD.length; while (BOARD[p].t !== 'station');
      moveTo(s, pid, p);
      return resolve(s, pid);
    }
    case 'back': s.pos[pid] = (s.pos[pid] - c.n3 + BOARD.length) % BOARD.length; return resolve(s, pid);
    case 'jail': sendToJail(s, pid); return 'jailed';
    case 'gain': s.cash[pid] += c.amount; return null;
    case 'pay': pay(s, pid, c.amount); return null;
    case 'repairs': {
      const houses = Object.entries(s.owner).filter(([, o]) => o === pid).reduce((n, [sq]) => n + (s.houses[sq] || 0), 0);
      pay(s, pid, houses * c.amount);
      return null;
    }
    case 'payEach':
      for (const p of active(s)) if (p !== pid && !s.bankrupt.includes(pid)) pay(s, pid, c.amount, p);
      return null;
    case 'collectEach':
      for (const p of active(s)) if (p !== pid) pay(s, p, c.amount, pid);
      return null;
    default: return null;
  }
}

// ما يحدث عند الوقوف على خانة. يرجع 'buy' إذا ينتظر قرار الشراء، أو 'jailed'
function resolve(s, pid) {
  const sq = s.pos[pid];
  const b = BOARD[sq];
  if (b.t === 'prop' || b.t === 'station') {
    const owner = s.owner[sq];
    if (!owner) return s.cash[pid] >= b.price ? 'buy' : null;
    if (owner !== pid) {
      const rent = rentFor(s, sq);
      if (rent > 0) {
        log(s, { k: 'rent', pid, to: owner, sq, amount: rent });
        pay(s, pid, rent, owner);
      }
    }
    return null;
  }
  if (b.t === 'tax') { log(s, { k: 'tax', pid, amount: b.amount }); pay(s, pid, b.amount); return null; }
  if (b.t === 'chance') return drawCard(s, pid, 'chance');
  if (b.t === 'chest') return drawCard(s, pid, 'chest');
  if (b.t === 'gojail') { sendToJail(s, pid); return 'jailed'; }
  return null;
}

function nextTurn(s, now) {
  if (s.result) return;
  const order = s.order;
  const n = order.length;
  let i = order.indexOf(s.turnId);
  let wrapped = false;
  for (let k = 1; k <= n; k++) {
    const j = (i + k) % n;
    if (j <= i && k > 0 && (i + k) >= n) wrapped = true;
    if (!s.bankrupt.includes(order[j])) { s.turnId = order[j]; break; }
  }
  if (wrapped) {
    s.round += 1;
    if (s.round > MAX_ROUNDS) { finish(s); return; }
  }
  s.phase = 'roll';
  s.doubles = 0;
  s.deadline = now + TURN_MS;
}

function afterMove(s, pid, outcome, isDouble, now) {
  if (s.result) return;
  if (s.bankrupt.includes(pid)) return nextTurn(s, now);
  if (outcome === 'buy') { s.phase = 'buy'; s.deadline = now + TURN_MS; return; }
  if (isDouble && outcome !== 'jailed' && s.jail[pid] === null) {
    s.phase = 'roll';
    s.deadline = now + TURN_MS;
    return;
  }
  nextTurn(s, now);
}

const aqar = {
  id: 'aqar',
  minPlayers: 2,

  setup(roster, prev, { now = Date.now() } = {}) {
    const order = roster.slice(0, 6);
    const start = prev ? (prev.startOffset + 1) % order.length : 0;
    return {
      order,
      startOffset: start,
      cash: Object.fromEntries(order.map((p) => [p, START_CASH])),
      pos: Object.fromEntries(order.map((p) => [p, 0])),
      jail: Object.fromEntries(order.map((p) => [p, null])),
      owner: {}, houses: {}, mortgaged: {},
      bankrupt: [],
      decks: { chance: shuffled(CHANCE.length), chest: shuffled(CHEST.length) },
      turnId: order[start],
      phase: 'roll',
      doubles: 0,
      round: 1,
      dice: null,
      log: [],
      seq: 0,
      deadline: now + TURN_MS,
      result: null,
    };
  },

  action(s, pid, a, { now = Date.now() } = {}, roll = rollDie) {
    if (s.result) return { ok: false, error: 'game_over' };
    if (!s.order.includes(pid) || s.bankrupt.includes(pid)) return { ok: false, error: 'not_a_player' };
    if (s.turnId !== pid) return { ok: false, error: 'not_your_turn' };
    const type = a?.type;

    if (type === 'roll') {
      if (s.phase !== 'roll') return { ok: false, error: 'wrong_phase' };
      const d = [roll(), roll()];
      const isDouble = d[0] === d[1];
      const steps = d[0] + d[1];
      s.dice = { d, pid, seq: ++s.seq };
      log(s, { k: 'rolled', pid, d });

      if (s.jail[pid] !== null) {
        if (isDouble) {
          s.jail[pid] = null;
          log(s, { k: 'freed', pid });
        } else {
          s.jail[pid] += 1;
          if (s.jail[pid] < 3) { nextTurn(s, now); return { ok: true }; }
          if (!pay(s, pid, JAIL_FINE)) { nextTurn(s, now); return { ok: true }; }
          s.jail[pid] = null;
          log(s, { k: 'freed', pid, paid: true });
        }
        moveTo(s, pid, (s.pos[pid] + steps) % BOARD.length);
        afterMove(s, pid, resolve(s, pid), false, now);
        return { ok: true };
      }

      if (isDouble) {
        s.doubles += 1;
        if (s.doubles >= 3) { sendToJail(s, pid); nextTurn(s, now); return { ok: true }; }
      }
      moveTo(s, pid, (s.pos[pid] + steps) % BOARD.length);
      afterMove(s, pid, resolve(s, pid), isDouble, now);
      return { ok: true };
    }

    if (type === 'payJail') {
      if (s.phase !== 'roll' || s.jail[pid] === null) return { ok: false, error: 'wrong_phase' };
      if (s.cash[pid] < JAIL_FINE) return { ok: false, error: 'not_enough_cash' };
      s.cash[pid] -= JAIL_FINE;
      s.jail[pid] = null;
      log(s, { k: 'freed', pid, paid: true });
      return { ok: true };
    }

    if (type === 'buy' || type === 'skip') {
      if (s.phase !== 'buy') return { ok: false, error: 'wrong_phase' };
      const sq = s.pos[pid];
      if (type === 'buy') {
        const price = BOARD[sq].price;
        if (s.cash[pid] < price) return { ok: false, error: 'not_enough_cash' };
        s.cash[pid] -= price;
        s.owner[sq] = pid;
        log(s, { k: 'bought', pid, sq });
      }
      const isDouble = s.dice && s.dice.d[0] === s.dice.d[1] && s.jail[pid] === null && s.doubles > 0;
      afterMove(s, pid, null, isDouble, now);
      return { ok: true };
    }

    // إدارة الممتلكات — في دورك فقط
    const sq = a?.sq;
    if (['build', 'sell', 'mortgage', 'unmortgage'].includes(type)) {
      if (!Number.isInteger(sq) || !BOARD[sq] || s.owner[sq] !== pid) return { ok: false, error: 'not_your_property' };
      const b = BOARD[sq];
      const group = b.g ? groupOf(b.g) : [sq];
      const hs = group.map((i) => s.houses[i] || 0);
      if (type === 'build') {
        if (b.t !== 'prop' || !ownsGroup(s, pid, b.g)) return { ok: false, error: 'need_full_group' };
        if (group.some((i) => s.mortgaged[i])) return { ok: false, error: 'group_mortgaged' };
        const h = s.houses[sq] || 0;
        if (h >= MAX_HOUSES) return { ok: false, error: 'max_houses' };
        if (h > Math.min(...hs)) return { ok: false, error: 'build_evenly' };
        if (s.cash[pid] < b.house) return { ok: false, error: 'not_enough_cash' };
        s.cash[pid] -= b.house;
        s.houses[sq] = h + 1;
        log(s, { k: 'built', pid, sq, n: h + 1 });
        return { ok: true };
      }
      if (type === 'sell') {
        const h = s.houses[sq] || 0;
        if (!h) return { ok: false, error: 'no_houses' };
        if (h < Math.max(...hs)) return { ok: false, error: 'build_evenly' };
        s.houses[sq] = h - 1;
        s.cash[pid] += b.house / 2;
        return { ok: true };
      }
      if (type === 'mortgage') {
        if (s.mortgaged[sq]) return { ok: false, error: 'already_mortgaged' };
        if (hs.some((h) => h > 0)) return { ok: false, error: 'sell_houses_first' };
        s.mortgaged[sq] = true;
        s.cash[pid] += b.price / 2;
        return { ok: true };
      }
      if (type === 'unmortgage') {
        if (!s.mortgaged[sq]) return { ok: false, error: 'not_mortgaged' };
        const cost = Math.round(b.price * 0.55); // الرهن + 10%
        if (s.cash[pid] < cost) return { ok: false, error: 'not_enough_cash' };
        s.cash[pid] -= cost;
        delete s.mortgaged[sq];
        return { ok: true };
      }
    }
    return { ok: false, error: 'bad_action' };
  },

  // انتهاء الوقت: رمي تلقائي، أو رفض الشراء
  tick(s, now) {
    if (s.result || !s.deadline || now < s.deadline) return false;
    if (s.phase === 'buy') this.action(s, s.turnId, { type: 'skip' }, { now });
    else this.action(s, s.turnId, { type: 'roll' }, { now });
    return true;
  },

  outcome(s) {
    if (!s.result) return null;
    if (s.result.void) return { winners: [], draw: true };
    return { winners: s.result.winners, draw: false };
  },

  playerLeft(s, pid, { now = Date.now() } = {}) {
    if (s.result || !s.order.includes(pid) || s.bankrupt.includes(pid)) return;
    const wasTurn = s.turnId === pid;
    goBankrupt(s, pid, null);
    if (!s.result && wasTurn) nextTurn(s, now);
  },

  view(s, pid) {
    return {
      order: s.order,
      you: s.order.includes(pid) && !s.bankrupt.includes(pid) ? pid : null,
      cash: s.cash, pos: s.pos, jail: s.jail,
      owner: s.owner, houses: s.houses, mortgaged: s.mortgaged,
      bankrupt: s.bankrupt,
      turnId: s.turnId, phase: s.phase, round: s.round, maxRounds: MAX_ROUNDS,
      dice: s.dice, log: s.log, deadline: s.deadline, result: s.result,
      worth: Object.fromEntries(s.order.map((p) => [p, s.bankrupt.includes(p) ? 0 : netWorth(s, p)])),
      rents: Object.fromEntries(Object.keys(s.owner).map((sq) => [sq, rentFor(s, Number(sq))])),
    };
  },
};

export default aqar;
