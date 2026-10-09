import test from 'node:test';
import assert from 'node:assert/strict';
import maj, { TIMES, QUESTIONS_PER_MATCH } from '../server/games/majority.js';
import { QUESTIONS } from '../server/games/majority-deck.js';

const P = ['a', 'b', 'c', 'd'];
const act = (s, p, a, now = 0) => maj.action(s, p, a, { now });

test('deck: 100+ unique questions, all bilingual with two options', () => {
  assert.ok(QUESTIONS.length >= 100, `only ${QUESTIONS.length}`);
  assert.ok(QUESTIONS.every((q) => q.length === 6 && q.every((x) => typeof x === 'string' && x.trim())));
  assert.equal(new Set(QUESTIONS.map((q) => q.slice(0, 3).join('|'))).size, QUESTIONS.length);
});

test('choices stay hidden until the reveal', () => {
  const s = maj.setup(P, null, { now: 0 });
  act(s, 'a', { type: 'answer', choice: 'A' });
  const v = maj.view(s, 'b');
  assert.deepEqual(v.answeredIds, ['a']);
  assert.equal(v.myChoice, null);
  assert.equal(v.reveal, null);
  assert.ok(!JSON.stringify(v).includes('"a":"A"'));
});

test('majority gets a point; ties give nobody points; changing answer allowed', () => {
  const s = maj.setup(P, null, { now: 0 });
  act(s, 'a', { type: 'answer', choice: 'B' });
  act(s, 'a', { type: 'answer', choice: 'A' });
  act(s, 'b', { type: 'answer', choice: 'A' });
  act(s, 'c', { type: 'answer', choice: 'A' });
  act(s, 'd', { type: 'answer', choice: 'B' });
  assert.equal(maj.tick(s, 1), true); // الكل أجاب
  assert.equal(s.phase, 'reveal');
  assert.deepEqual(s.reveal.counts, { A: 3, B: 1 });
  assert.deepEqual(s.scores, { a: 1, b: 1, c: 1, d: 0 });
  maj.tick(s, s.deadline);
  assert.equal(s.phase, 'question');
  act(s, 'a', { type: 'answer', choice: 'A' });
  act(s, 'b', { type: 'answer', choice: 'B' });
  maj.tick(s, s.deadline);
  assert.equal(s.reveal.majority, null);
  assert.deepEqual(s.scores, { a: 1, b: 1, c: 1, d: 0 });
});

test('invalid answers rejected; outsiders blocked; answers only during question', () => {
  const s = maj.setup(P, null, { now: 0 });
  assert.equal(act(s, 'a', { type: 'answer', choice: 'C' }).error, 'bad_action');
  assert.equal(act(s, 'z', { type: 'answer', choice: 'A' }).error, 'not_a_player');
  maj.tick(s, TIMES.ANSWER);
  assert.equal(act(s, 'a', { type: 'answer', choice: 'A' }).error, 'wrong_phase');
});

test('a full match of 7 questions ends with the top scorer(s) winning', () => {
  const s = maj.setup(P, null, { now: 0 });
  for (let q = 0; q < QUESTIONS_PER_MATCH; q++) {
    act(s, 'a', { type: 'answer', choice: 'A' });
    act(s, 'b', { type: 'answer', choice: 'A' });
    act(s, 'c', { type: 'answer', choice: q === 0 ? 'A' : 'B' });
    act(s, 'd', { type: 'answer', choice: 'B' });
    maj.tick(s, 1);
    maj.tick(s, s.deadline);
  }
  assert.equal(s.phase, 'done');
  const out = maj.outcome(s);
  // السؤال الأول: الأغلبية A (a,b,c)، والبقية تعادل 2-2
  assert.deepEqual(out.winners.sort(), ['a', 'b', 'c']);
});

test('skipping a question replaces it (twice max) without repeats', () => {
  const s = maj.setup(P, null, { now: 0 });
  const first = s.questions[0];
  act(s, 'a', { type: 'skip' });
  assert.notEqual(s.questions[0], first);
  act(s, 'b', { type: 'skip' });
  assert.equal(act(s, 'c', { type: 'skip' }).error, 'no_skips_left');
  assert.equal(new Set(s.questions).size, s.questions.length);
});

test('disconnected players do not block; next match avoids repeats', () => {
  const s = maj.setup(P, null, { now: 0 });
  ['a', 'b', 'c'].forEach((p) => act(s, p, { type: 'answer', choice: 'A' }));
  assert.equal(maj.tick(s, 1, new Set(['a', 'b', 'c'])), true);
  const s2 = maj.setup(P, s, { now: 0 });
  assert.ok(s2.questions.every((q) => !s.questions.includes(q)));
});

test('leaving below 2 players voids the match', () => {
  const s = maj.setup(['a', 'b', 'c'], null, { now: 0 });
  maj.playerLeft(s, 'a');
  assert.equal(s.result, null);
  maj.playerLeft(s, 'b');
  assert.deepEqual(maj.outcome(s), { winners: [], draw: true });
});
