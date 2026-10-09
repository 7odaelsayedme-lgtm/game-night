import test from 'node:test';
import assert from 'node:assert/strict';
import colors, { buildDeck, canPlay, HAND_SIZE } from '../server/games/colors.js';

const act = (s, p, a) => colors.action(s, p, a, { now: 0 });
const card = (id, c, v) => ({ id, c, v });
// حالة مضبوطة يدويًا للاختبار
function rig(order, hands, top, extra = {}) {
  const s = colors.setup(order, null, { now: 0 });
  for (const p of order) s.hands[p] = hands[p];
  s.discard = [top];
  s.color = top.c;
  s.turn = 0;
  s.dir = 1;
  s.deck = Array.from({ length: 40 }, (_, i) => card(1000 + i, 'g', String(i % 10)));
  Object.assign(s, extra);
  return s;
}

test('deck has 108 cards with the right mix', () => {
  const d = buildDeck();
  assert.equal(d.length, 108);
  assert.equal(d.filter((c) => c.v === '+4').length, 4);
  assert.equal(d.filter((c) => c.v === 'wild').length, 4);
  assert.equal(d.filter((c) => c.v === '0').length, 4);
  assert.equal(d.filter((c) => c.v === 'skip').length, 8);
  assert.equal(new Set(d.map((c) => c.id)).size, 108);
});

test('setup deals 7 each, starts on a number card, hands are private', () => {
  const s = colors.setup(['a', 'b', 'c'], null, { now: 0 });
  assert.ok(['a', 'b', 'c'].every((p) => s.hands[p].length === HAND_SIZE));
  assert.match(s.discard[0].v, /^\d$/);
  const v = colors.view(s, 'b');
  assert.equal(v.hand.length, 7);
  assert.deepEqual(v.counts, { a: 7, b: 7, c: 7 });
  const json = JSON.stringify(v);
  for (const c of s.hands.a) assert.ok(!json.includes(`"id":${c.id},`), 'other hands must not leak');
  assert.equal(v.reveal, null);
});

test('matching rules: color, value, wilds', () => {
  const top = card(1, 'r', '5');
  assert.ok(canPlay(card(2, 'r', '9'), top, 'r'));
  assert.ok(canPlay(card(3, 'b', '5'), top, 'r'));
  assert.ok(canPlay(card(4, 'w', 'wild'), top, 'r'));
  assert.ok(!canPlay(card(5, 'b', '9'), top, 'r'));
});

test('invalid plays rejected: wrong card, not yours, out of turn, wild without color', () => {
  const s = rig(['a', 'b'], { a: [card(1, 'b', '9'), card(2, 'w', 'wild'), card(9, 'r', '1')], b: [card(3, 'r', '2'), card(8, 'g', '1')] }, card(0, 'r', '5'));
  assert.equal(act(s, 'a', { type: 'play', cardId: 1 }).error, 'cant_play');
  assert.equal(act(s, 'a', { type: 'play', cardId: 3 }).error, 'bad_card');
  assert.equal(act(s, 'b', { type: 'play', cardId: 3 }).error, 'not_your_turn');
  assert.equal(act(s, 'a', { type: 'play', cardId: 2 }).error, 'choose_color');
  assert.equal(act(s, 'a', { type: 'play', cardId: 2, color: 'g' }).ok, true);
  assert.equal(s.color, 'g');
  assert.equal(colors.view(s, 'a').turnId, 'b');
});

test('skip, reverse, +2 and +4 effects', () => {
  let s = rig(['a', 'b', 'c'], { a: [card(1, 'r', 'skip'), card(9, 'g', '1')], b: [card(2, 'g', '1')], c: [card(3, 'g', '2')] }, card(0, 'r', '5'));
  act(s, 'a', { type: 'play', cardId: 1 });
  assert.equal(colors.view(s, 'a').turnId, 'c');

  s = rig(['a', 'b', 'c'], { a: [card(1, 'r', 'rev'), card(9, 'g', '1')], b: [card(2, 'g', '1')], c: [card(3, 'g', '2')] }, card(0, 'r', '5'));
  act(s, 'a', { type: 'play', cardId: 1 });
  assert.equal(s.dir, -1);
  assert.equal(colors.view(s, 'a').turnId, 'c');

  s = rig(['a', 'b'], { a: [card(1, 'r', 'rev'), card(9, 'g', '1')], b: [card(2, 'g', '1')] }, card(0, 'r', '5'));
  act(s, 'a', { type: 'play', cardId: 1 });
  assert.equal(colors.view(s, 'a').turnId, 'a', 'reverse acts as skip with two players');

  s = rig(['a', 'b', 'c'], { a: [card(1, 'r', '+2'), card(9, 'g', '1')], b: [card(2, 'g', '1')], c: [card(3, 'g', '2')] }, card(0, 'r', '5'));
  act(s, 'a', { type: 'play', cardId: 1 });
  assert.equal(s.hands.b.length, 3);
  assert.equal(colors.view(s, 'a').turnId, 'c');

  s = rig(['a', 'b', 'c'], { a: [card(1, 'w', '+4'), card(9, 'g', '1')], b: [card(2, 'g', '1')], c: [card(3, 'g', '2')] }, card(0, 'r', '5'));
  act(s, 'a', { type: 'play', cardId: 1, color: 'y' });
  assert.equal(s.hands.b.length, 5);
  assert.equal(s.color, 'y');
  assert.equal(colors.view(s, 'a').turnId, 'c');
});

test('drawing: playable drawn card may be played or passed; others end the turn', () => {
  let s = rig(['a', 'b'], { a: [card(1, 'b', '9')], b: [card(2, 'b', '1')] }, card(0, 'r', '5'));
  s.deck.push(card(50, 'r', '7')); // ورقة قابلة للعب
  assert.equal(act(s, 'a', { type: 'pass' }).error, 'draw_first');
  act(s, 'a', { type: 'draw' });
  assert.equal(colors.view(s, 'a').drawn, 50);
  assert.equal(act(s, 'a', { type: 'play', cardId: 1 }).error, 'play_drawn_only');
  assert.equal(act(s, 'a', { type: 'draw' }).error, 'already_drawn');
  act(s, 'a', { type: 'pass' });
  assert.equal(colors.view(s, 'a').turnId, 'b');

  s = rig(['a', 'b'], { a: [card(1, 'b', '9')], b: [card(2, 'b', '1')] }, card(0, 'r', '5'));
  s.deck.push(card(51, 'g', '8')); // غير قابلة للعب
  act(s, 'a', { type: 'draw' });
  assert.equal(colors.view(s, 'a').turnId, 'b');
});

test('forgetting to call: others can catch you for +2; calling protects you', () => {
  let s = rig(['a', 'b', 'c'], { a: [card(1, 'r', '1'), card(2, 'r', '2')], b: [card(3, 'g', '3')], c: [card(4, 'g', '4')] }, card(0, 'r', '5'));
  act(s, 'a', { type: 'play', cardId: 1 });
  assert.equal(s.exposed, 'a');
  assert.equal(act(s, 'a', { type: 'catch' }).error, 'nothing_to_catch');
  act(s, 'c', { type: 'catch' });
  assert.equal(s.hands.a.length, 3);
  assert.equal(act(s, 'b', { type: 'catch' }).error, 'nothing_to_catch');

  s = rig(['a', 'b'], { a: [card(1, 'r', '1'), card(2, 'r', '2')], b: [card(3, 'g', '3')] }, card(0, 'r', '5'));
  act(s, 'a', { type: 'call' });
  act(s, 'a', { type: 'play', cardId: 1 });
  assert.equal(s.exposed, null);

  s = rig(['a', 'b'], { a: [card(1, 'r', '1'), card(2, 'r', '2'), card(5, 'r', '3')], b: [card(3, 'g', '3')] }, card(0, 'r', '5'));
  assert.equal(act(s, 'a', { type: 'call' }).error, 'too_early');
});

test('emptying your hand wins and reveals hands', () => {
  const s = rig(['a', 'b'], { a: [card(1, 'r', '1')], b: [card(3, 'g', '3')] }, card(0, 'r', '5'));
  act(s, 'a', { type: 'play', cardId: 1 });
  assert.deepEqual(colors.outcome(s), { winners: ['a'], draw: false });
  assert.ok(colors.view(s, 'b').reveal.b);
});

test('turn timeout draws and passes; leaving returns cards and keeps turn valid', () => {
  const s = rig(['a', 'b', 'c'], { a: [card(1, 'b', '9')], b: [card(2, 'b', '1')], c: [card(3, 'b', '2')] }, card(0, 'r', '5'), { deadline: 100 });
  assert.equal(colors.tick(s, 99), false);
  assert.equal(colors.tick(s, 100), true);
  assert.equal(s.hands.a.length, 2);
  assert.equal(colors.view(s, 'a').turnId, 'b');
  colors.playerLeft(s, 'b');
  assert.equal(colors.view(s, 'a').turnId, 'c');
  colors.playerLeft(s, 'c');
  assert.equal(s.result.winner, 'a');
});

test('deck reshuffles from the discard pile when empty', () => {
  const s = rig(['a', 'b'], { a: [card(1, 'b', '9')], b: [card(2, 'b', '1')] }, card(0, 'r', '5'));
  s.deck = [];
  s.discard = [card(10, 'g', '1'), card(11, 'w', 'wild'), card(0, 'r', '5')];
  act(s, 'a', { type: 'draw' });
  assert.equal(s.hands.a.length, 2);
  assert.equal(s.discard.length, 1);
});
