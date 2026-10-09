import test from 'node:test';
import assert from 'node:assert/strict';
import sh, { buildDeck, discardPairs, SHAYEB } from '../server/games/shayeb.js';

const act = (s, p, a) => sh.action(s, p, a, { now: 0 });

test('deck: 49 cards with exactly one king (the shayeb)', () => {
  const d = buildDeck();
  assert.equal(d.length, 49);
  assert.deepEqual(d.filter((c) => c.startsWith('K-')), [SHAYEB]);
  assert.equal(new Set(d).size, 49);
});

test('pairs are discarded, four of a kind makes two pairs, the king never pairs', () => {
  const r = discardPairs(['7-s', '7-h', '7-d', '7-c', '3-s', 'K-s', '3-h', '9-d']);
  assert.equal(r.pairs.length, 3);
  assert.deepEqual(r.hand.sort(), ['9-d', 'K-s']);
});

test('setup: no pairs left in any hand, all cards accounted for, hands private', () => {
  for (let k = 0; k < 20; k++) {
    const s = sh.setup(['a', 'b', 'c', 'd'], null, { now: 0 });
    let total = s.pile.length * 2;
    for (const p of s.order) {
      const ranks = s.hands[p].map((id) => id.split('-')[0]);
      assert.equal(new Set(ranks).size, ranks.length, 'hand still has a pair');
      total += s.hands[p].length;
    }
    assert.equal(total, 49);
    const v = sh.view(s, 'b');
    assert.deepEqual(v.hand, s.hands.b);
    const json = JSON.stringify(v);
    assert.ok(s.hands.a.every((id) => !json.includes(`"${id}"`) || s.pile.some((x) => x.pair.includes(id))), 'other hands leak');
  }
});

test('turn rules: only the current player picks, from their neighbor, by index', () => {
  const s = sh.setup(['a', 'b', 'c'], null, { now: 0 });
  s.hands = { a: ['2-s', '5-h'], b: ['2-h', '9-c', 'K-s'], c: ['5-d', '9-s'] };
  s.safe = []; s.turnId = 'a'; s.targetId = 'b';
  assert.equal(act(s, 'b', { type: 'pick', index: 0 }).error, 'not_your_turn');
  assert.equal(act(s, 'a', { type: 'pick', index: 5 }).error, 'bad_card');
  act(s, 'a', { type: 'pick', index: 0 }); // يسحب 2-h ويكوّن زوجًا مع 2-s
  assert.deepEqual(s.hands.a, ['5-h']);
  assert.deepEqual(s.pile.at(-1).pair.sort(), ['2-h', '2-s']);
  assert.equal(s.turnId, 'b');
  assert.equal(s.targetId, 'c');
  // الورقة المسحوبة يراها الساحب فقط
  assert.equal(sh.view(s, 'a').last.card, '2-h');
  assert.equal(sh.view(s, 'c').last.card, null);
});

test('players who run out of cards are safe; the last holder of the shayeb loses', () => {
  const s = sh.setup(['a', 'b'], null, { now: 0 });
  s.hands = { a: ['4-s'], b: ['4-h', 'K-s'] };
  s.safe = []; s.turnId = 'a'; s.targetId = 'b';
  const idx = s.hands.b.indexOf('4-h');
  act(s, 'a', { type: 'pick', index: idx });
  assert.deepEqual(s.result, { loser: 'b' });
  assert.deepEqual(sh.outcome(s).winners, ['a']);
});

test('shuffle reorders only your own hand; timeout picks at random', () => {
  const s = sh.setup(['a', 'b', 'c'], null, { now: 0 });
  const before = [...s.hands.b];
  act(s, 'b', { type: 'shuffle' });
  assert.deepEqual([...s.hands.b].sort(), before.sort());
  const total = () => s.order.reduce((n, p) => n + s.hands[p].length, 0) + s.pile.length * 2;
  assert.equal(sh.tick(s, s.deadline), true);
  assert.equal(total(), 49);
});

test('a full random game always ends with exactly one loser holding the shayeb', () => {
  for (let k = 0; k < 30; k++) {
    const s = sh.setup(['a', 'b', 'c', 'd', 'e'], null, { now: 0 });
    let guard = 0;
    while (!s.result && guard++ < 500) sh.tick(s, s.deadline);
    assert.ok(s.result, 'game did not end');
    assert.deepEqual(s.hands[s.result.loser], [SHAYEB]);
    assert.equal(sh.outcome(s).winners.length, 4);
  }
});

test('a player leaving passes their cards on and the game continues', () => {
  const s = sh.setup(['a', 'b', 'c'], null, { now: 0 });
  sh.playerLeft(s, s.turnId);
  assert.equal(s.order.length, 2);
  const total = s.order.reduce((n, p) => n + s.hands[p].length, 0) + s.pile.length * 2;
  assert.equal(total, 49);
  let guard = 0;
  while (!s.result && guard++ < 500) sh.tick(s, s.deadline);
  assert.ok(s.result);
});
