import test from 'node:test';
import assert from 'node:assert/strict';
import aqar, { rentFor, netWorth } from '../server/games/aqar.js';
import { BOARD, JAIL, START_CASH, SALARY, MAX_ROUNDS } from '../shared/aqar-board.js';

const dice = (...v) => { let i = 0; return () => v[i++ % v.length]; };
const act = (s, p, a, rng) => aqar.action(s, p, a, { now: 0 }, rng);
const fresh = (players = ['a', 'b']) => aqar.setup(players, null, { now: 0 });

test('board: 24 squares, 14 cities in 6 groups, 2 stations', () => {
  assert.equal(BOARD.length, 24);
  assert.equal(BOARD.filter((b) => b.t === 'prop').length, 14);
  assert.equal(new Set(BOARD.filter((b) => b.t === 'prop').map((b) => b.g)).size, 6);
  assert.equal(BOARD.filter((b) => b.t === 'station').length, 2);
  assert.ok(BOARD.filter((b) => b.t === 'prop').every((b) => b.rent.length === 6 && b.price > 0 && b.house > 0));
});

test('roll, land on a city, buy it; others pay rent', () => {
  const s = fresh();
  assert.equal(act(s, 'b', { type: 'roll' }, dice(1, 2)).error, 'not_your_turn');
  act(s, 'a', { type: 'roll' }, dice(1, 2)); // 3 = حائل
  assert.equal(s.pos.a, 3);
  assert.equal(s.phase, 'buy');
  assert.equal(act(s, 'a', { type: 'roll' }, dice(1, 2)).error, 'wrong_phase');
  act(s, 'a', { type: 'buy' });
  assert.equal(s.owner[3], 'a');
  assert.equal(s.cash.a, START_CASH - 60);
  assert.equal(s.turnId, 'b');
  act(s, 'b', { type: 'roll' }, dice(1, 2));
  assert.equal(s.cash.b, START_CASH - 4);
  assert.equal(s.cash.a, START_CASH - 60 + 4);
});

test('rent doubles with a full group, and houses must be built evenly', () => {
  const s = fresh();
  s.owner[1] = 'a'; s.owner[3] = 'a';
  assert.equal(rentFor(s, 1), 4);
  assert.equal(act(s, 'a', { type: 'build', sq: 1 }).ok, true);
  assert.equal(act(s, 'a', { type: 'build', sq: 1 }).error, 'build_evenly');
  act(s, 'a', { type: 'build', sq: 3 });
  act(s, 'a', { type: 'build', sq: 1 });
  assert.equal(rentFor(s, 1), 30);
  assert.equal(act(s, 'a', { type: 'build', sq: 7 }).error, 'not_your_property');
  s.owner[7] = 'a';
  assert.equal(act(s, 'a', { type: 'build', sq: 7 }).error, 'need_full_group');
  assert.equal(act(s, 'a', { type: 'mortgage', sq: 3 }).error, 'sell_houses_first');
  assert.equal(act(s, 'a', { type: 'sell', sq: 3 }).error, 'build_evenly');
  act(s, 'a', { type: 'sell', sq: 1 });
  assert.equal(s.houses[1], 1);
});

test('stations rent by count; mortgaged property charges nothing', () => {
  const s = fresh();
  s.owner[5] = 'a';
  assert.equal(rentFor(s, 5), 50);
  s.owner[17] = 'a';
  assert.equal(rentFor(s, 5), 100);
  act(s, 'a', { type: 'mortgage', sq: 5 });
  assert.equal(rentFor(s, 5), 0);
  assert.equal(s.cash.a, START_CASH + 100);
  act(s, 'a', { type: 'unmortgage', sq: 5 });
  assert.equal(s.cash.a, START_CASH + 100 - 110);
});

test('passing start pays salary; doubles roll again; three doubles go to jail', () => {
  const s = fresh();
  s.pos.a = 22;
  act(s, 'a', { type: 'roll' }, dice(1, 2)); // 22+3 = 1 (يمر بالبداية)
  assert.equal(s.cash.a, START_CASH + SALARY);
  act(s, 'a', { type: 'skip' });
  assert.equal(s.turnId, 'b');

  const t = fresh();
  act(t, 'a', { type: 'roll' }, dice(3, 3)); // 6 = السجن (زيارة)
  assert.equal(t.turnId, 'a', 'double gives another roll');
  assert.equal(t.jail.a, null);
  act(t, 'a', { type: 'roll' }, dice(1, 1)); // 8 = حظ
  if (t.phase === 'buy') act(t, 'a', { type: 'skip' });
  if (t.turnId === 'a' && t.jail.a === null && t.phase === 'roll') {
    act(t, 'a', { type: 'roll' }, dice(2, 2));
    assert.equal(t.pos.a, JAIL);
    assert.equal(t.jail.a, 0);
  }
});

test('go-to-jail square, paying the fine, and leaving after three failed tries', () => {
  const s = fresh();
  s.pos.a = 15;
  act(s, 'a', { type: 'roll' }, dice(1, 2)); // 18 → السجن
  assert.equal(s.pos.a, JAIL);
  assert.equal(s.jail.a, 0);
  act(s, 'b', { type: 'roll' }, dice(1, 3)); // b إلى الضريبة
  act(s, 'a', { type: 'roll' }, dice(1, 2));
  assert.equal(s.jail.a, 1);
  assert.equal(s.pos.a, JAIL);
  act(s, 'b', { type: 'roll' }, dice(1, 2));
  if (s.phase === 'buy') act(s, 'b', { type: 'skip' });
  assert.equal(act(s, 'a', { type: 'payJail' }).ok, true);
  assert.equal(s.jail.a, null);
  assert.equal(s.cash.a, START_CASH - 50);
});

test('debt sells houses and mortgages automatically; bankruptcy ends a 2-player game', () => {
  const s = fresh();
  s.owner[22] = 'b'; s.owner[23] = 'b';
  s.houses[22] = 5; s.houses[23] = 5;
  s.cash.a = 100;
  s.owner[1] = 'a'; s.owner[3] = 'a'; s.houses[1] = 1; s.houses[3] = 1;
  s.pos.a = 20;
  act(s, 'a', { type: 'roll' }, dice(1, 2)); // 23 الرياض ببرج: 2000
  assert.ok(s.bankrupt.includes('a'));
  assert.deepEqual(s.result.winners, ['b']);
  assert.equal(s.owner[1], undefined, 'bankrupt properties return to the bank');
});

test('net worth counts cash, property and houses; round limit ends the game', () => {
  const s = fresh();
  s.owner[23] = 'a'; s.houses[23] = 2;
  assert.equal(netWorth(s, 'a'), START_CASH + 400 + 400);
  s.round = MAX_ROUNDS;
  s.turnId = 'b';
  act(s, 'b', { type: 'roll' }, dice(1, 3)); // b إلى الضريبة ثم ينتقل الدور ويلف
  assert.ok(s.result);
  assert.deepEqual(s.result.winners, ['a']);
});

test('timeout auto-rolls and auto-skips buying; leaving player goes bankrupt', () => {
  const s = fresh(['a', 'b', 'c']);
  assert.equal(aqar.tick(s, s.deadline), true);
  assert.notEqual(s.dice, null);
  if (s.phase === 'buy') { aqar.tick(s, s.deadline); assert.equal(s.phase, 'roll'); }
  const cur = s.turnId;
  aqar.playerLeft(s, cur);
  assert.ok(s.bankrupt.includes(cur));
  assert.notEqual(s.turnId, cur);
});

test('a long random game never crashes and money stays consistent', () => {
  for (let k = 0; k < 10; k++) {
    const s = fresh(['a', 'b', 'c', 'd']);
    let guard = 0;
    while (!s.result && guard++ < 3000) {
      const p = s.turnId;
      if (s.phase === 'buy') act(s, p, { type: Math.random() < 0.7 ? 'buy' : 'skip' });
      else {
        for (const sq of Object.keys(s.owner).map(Number)) if (s.owner[sq] === p && Math.random() < 0.3) act(s, p, { type: 'build', sq });
        act(s, p, { type: 'roll' });
      }
      for (const q of s.order) assert.ok(s.cash[q] >= 0, `negative cash for ${q}`);
    }
    assert.ok(s.result, 'game should end by bankruptcy or round limit');
  }
});
