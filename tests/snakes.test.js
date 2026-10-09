import test from 'node:test';
import assert from 'node:assert/strict';
import snakes, { computeMove, LADDERS, SNAKES, FINISH } from '../server/games/snakes.js';

const dice = (...vals) => { let i = 0; return () => vals[i++ % vals.length]; };
const roll = (s, pid, rng) => snakes.action(s, pid, { type: 'roll' }, {}, rng);

test('board data is consistent: ladders go up, snakes go down, no overlaps', () => {
  for (const [a, b] of Object.entries(LADDERS)) assert.ok(b > +a && b <= FINISH);
  for (const [a, b] of Object.entries(SNAKES)) assert.ok(b < +a && b >= 1);
  const starts = [...Object.keys(LADDERS), ...Object.keys(SNAKES)];
  assert.equal(new Set(starts).size, starts.length);
  for (const end of [...Object.values(LADDERS), ...Object.values(SNAKES)]) {
    assert.ok(!starts.includes(String(end)), `chain at ${end}`);
  }
  assert.ok(!SNAKES[FINISH] && !LADDERS[FINISH]);
});

test('moves: plain, ladder, snake, exact finish, bounce back', () => {
  assert.deepEqual(computeMove(0, 3), { from: 0, roll: 3, landing: 3, to: 3, via: null, bounced: false });
  assert.equal(computeMove(0, 4).to, 14);
  assert.equal(computeMove(0, 4).via, 'ladder');
  assert.equal(computeMove(12, 4).to, 6);
  assert.equal(computeMove(12, 4).via, 'snake');
  assert.equal(computeMove(96, 4).to, 100);
  const b = computeMove(97, 5); // 102 -> 98 -> snake to 78
  assert.equal(b.bounced, true);
  assert.equal(b.landing, 98);
  assert.equal(b.to, 78);
  assert.equal(computeMove(99, 2).landing, 99); // 101 -> 99
});

test('turn order, out-of-turn and outsiders rejected', () => {
  const s = snakes.setup(['a', 'b', 'c']);
  assert.equal(roll(s, 'b', dice(3)).error, 'not_your_turn');
  assert.equal(roll(s, 'z', dice(3)).error, 'not_a_player');
  assert.equal(snakes.action(s, 'a', { type: 'move', to: 100 }, {}, dice(3)).error, 'bad_action');
  roll(s, 'a', dice(3));
  assert.equal(s.pos.a, 3);
  assert.equal(snakes.view(s, 'a').turnId, 'b');
  roll(s, 'b', dice(2)); roll(s, 'c', dice(2));
  assert.equal(snakes.view(s, 'a').turnId, 'a');
});

test('six gives an extra turn, but at most three sixes in a row', () => {
  const s = snakes.setup(['a', 'b']);
  roll(s, 'a', dice(6));
  assert.equal(s.last.extra, true);
  assert.equal(snakes.view(s, 'a').turnId, 'a');
  roll(s, 'a', dice(6));
  roll(s, 'a', dice(6));
  assert.equal(s.last.extra, false);
  assert.equal(snakes.view(s, 'a').turnId, 'b');
});

test('reaching 100 wins and stops the game', () => {
  const s = snakes.setup(['a', 'b']);
  s.pos.a = 97;
  roll(s, 'a', dice(3));
  assert.deepEqual(snakes.outcome(s), { winners: ['a'], draw: false });
  assert.equal(roll(s, 'b', dice(3)).error, 'game_over');
});

test('only 4 play; the starting player rotates between rounds', () => {
  const s1 = snakes.setup(['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(s1.order, ['a', 'b', 'c', 'd']);
  assert.equal(snakes.view(s1, 'e').you, null);
  const s2 = snakes.setup(['a', 'b', 'c', 'd'], s1);
  assert.equal(s2.order[0], 'b');
});

test('leaving: turn passes correctly; last player standing wins', () => {
  const s = snakes.setup(['a', 'b', 'c']);
  roll(s, 'a', dice(2)); // b's turn
  snakes.playerLeft(s, 'b');
  assert.equal(snakes.view(s, 'a').turnId, 'c');
  snakes.playerLeft(s, 'a');
  assert.equal(s.result.winner, 'c');
});

test('real dice are always 1..6', () => {
  const s = snakes.setup(['a', 'b']);
  for (let i = 0; i < 300 && !s.result; i++) {
    const pid = snakes.view(s, 'a').turnId;
    snakes.action(s, pid, { type: 'roll' }, {});
    assert.ok(s.last.roll >= 1 && s.last.roll <= 6);
  }
});
