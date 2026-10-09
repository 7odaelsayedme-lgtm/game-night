import test from 'node:test';
import assert from 'node:assert/strict';
import spy, { TIMES } from '../server/games/spy.js';
import { LOCATIONS } from '../server/games/spy-deck.js';

const P = ['a', 'b', 'c', 'd'];
const act = (s, pid, a, now = 0) => spy.action(s, pid, a, { now });
const setupAt = (players = P) => spy.setup(players, null, { now: 0 });
const allReady = (s) => s.players.forEach((p) => act(s, p, { type: 'ready' }));

test('deck is large, unique and bilingual', () => {
  assert.ok(LOCATIONS.length >= 80);
  assert.equal(new Set(LOCATIONS.map((l) => l[0])).size, LOCATIONS.length);
  assert.ok(LOCATIONS.every((l) => l[0] && l[1]));
});

test('exactly one spy; only agents see the location; secret is among options', () => {
  for (let i = 0; i < 50; i++) {
    const s = setupAt();
    assert.ok(P.includes(s.spyId));
    assert.ok(s.options.includes(s.locIdx));
    assert.equal(s.options.length, 20);
    for (const p of P) {
      const v = spy.view(s, p);
      const json = JSON.stringify(v);
      assert.equal(v.spyId, null, 'spy id must stay hidden');
      if (p === s.spyId) {
        assert.equal(v.role, 'spy');
        assert.equal(v.location, null);
      } else {
        assert.equal(v.role, 'agent');
        assert.deepEqual(v.location, LOCATIONS[s.locIdx]);
      }
      assert.ok(!json.includes('"locIdx"'));
    }
    const outsider = spy.view(s, 'zz');
    assert.equal(outsider.role, 'spectator');
    assert.equal(outsider.location, null);
  }
});

test('everyone ready starts questions; skipping changes the place at most twice', () => {
  const s = setupAt();
  const first = s.locIdx;
  assert.equal(act(s, 'a', { type: 'skip_location' }).ok, true);
  assert.notEqual(s.locIdx, first);
  assert.ok(!s.options.includes(first));
  assert.equal(s.options.length, 20);
  act(s, 'b', { type: 'skip_location' });
  assert.equal(act(s, 'c', { type: 'skip_location' }).error, 'no_skips_left');
  allReady(s);
  assert.equal(s.phase, 'ask');
  assert.equal(act(s, 'a', { type: 'skip_location' }).error, 'wrong_phase');
});

test('ask/answer chain, turn validation, no asking back, text limits', () => {
  const s = setupAt();
  allReady(s);
  const asker = s.asker;
  const other = P.find((p) => p !== asker);
  assert.equal(act(s, other, { type: 'ask', target: asker, text: 'hi' }).error, 'not_your_turn');
  assert.equal(act(s, asker, { type: 'ask', target: asker, text: 'hi' }).error, 'bad_target');
  assert.equal(act(s, asker, { type: 'ask', target: other, text: '   ' }).error, 'text_required');
  assert.equal(act(s, asker, { type: 'ask', target: other, text: 'x'.repeat(500) }).ok, true);
  assert.equal(s.question.length, 120);
  assert.equal(act(s, asker, { type: 'answer', text: 'no' }).error, 'not_your_turn');
  assert.equal(act(s, other, { type: 'answer', text: 'نعم' }).ok, true);
  assert.equal(s.asker, other);
  assert.equal(act(s, other, { type: 'ask', target: asker, text: 'back?' }).error, 'no_ask_back');
});

test('timeouts: skipped asker, unanswered question, vote and guess deadlines', () => {
  const s = setupAt();
  assert.equal(spy.tick(s, TIMES.REVEAL - 1), false);
  assert.equal(spy.tick(s, TIMES.REVEAL), true);
  assert.equal(s.phase, 'ask');
  const before = s.turnsLeft;
  spy.tick(s, s.deadline);
  assert.equal(s.feed.at(-1).skipped, true);
  assert.equal(s.turnsLeft, before - 1);
  const asker = s.asker;
  act(s, asker, { type: 'ask', target: P.find((p) => p !== asker && p !== s.lastAsker), text: 'q' }, 100_000);
  spy.tick(s, s.deadline);
  assert.equal(s.feed.at(-1).a, null);
  while (s.phase !== 'vote') spy.tick(s, s.deadline);
  spy.tick(s, s.deadline); // لا أحد صوّت
  assert.equal(s.result.winner, 'spy');
  assert.equal(s.result.reason, 'no_majority');
});

test('majority vote request ends questions early', () => {
  const s = setupAt();
  allReady(s);
  act(s, 'a', { type: 'request_vote' });
  act(s, 'b', { type: 'request_vote' });
  assert.notEqual(s.phase, 'vote'); // 2 من 4 ليست أغلبية
  act(s, 'c', { type: 'request_vote' });
  assert.equal(s.phase, 'vote');
});

const toVote = () => { const s = setupAt(); allReady(s); ['a', 'b', 'c'].forEach((p) => act(s, p, { type: 'request_vote' })); return s; };

test('catching the spy, then spy guesses wrong -> agents win 1 point each', () => {
  const s = toVote();
  const agents = P.filter((p) => p !== s.spyId);
  assert.equal(act(s, agents[0], { type: 'vote', suspect: agents[0] }).error, 'bad_target');
  for (const p of P) act(s, p, { type: 'vote', suspect: p === s.spyId ? agents[0] : s.spyId });
  assert.equal(s.phase, 'guess');
  assert.equal(spy.view(s, agents[0]).accused, s.spyId);
  assert.equal(act(s, agents[0], { type: 'spy_guess', loc: s.locIdx }).error, 'not_the_spy');
  const wrong = s.options.find((i) => i !== s.locIdx);
  act(s, s.spyId, { type: 'spy_guess', loc: wrong });
  assert.equal(s.result.winner, 'agents');
  const out = spy.outcome(s);
  assert.deepEqual(Object.keys(out.points).sort(), agents.sort());
  assert.ok(Object.values(out.points).every((n) => n === 1));
  const v = spy.view(s, agents[0]);
  assert.equal(v.spyId, s.spyId, 'revealed after the round');
});

test('caught spy who guesses right wins 2 points', () => {
  const s = toVote();
  const agents = P.filter((p) => p !== s.spyId);
  for (const p of P) act(s, p, { type: 'vote', suspect: p === s.spyId ? agents[0] : s.spyId });
  act(s, s.spyId, { type: 'spy_guess', loc: s.locIdx });
  assert.deepEqual(spy.outcome(s).points, { [s.spyId]: 2 });
});

test('accusing an innocent or a tie lets the spy win', () => {
  const s = toVote();
  const agents = P.filter((p) => p !== s.spyId);
  for (const p of P) act(s, p, { type: 'vote', suspect: p === agents[1] ? agents[2] : agents[1] });
  assert.equal(s.result.reason, 'wrong_accused');
});

test('spy can guess any time during questions', () => {
  const s = setupAt();
  allReady(s);
  act(s, s.spyId, { type: 'spy_guess', loc: s.locIdx });
  assert.equal(s.result.reason, 'guessed');
  assert.equal(act(s, 'a', { type: 'ready' }).error, 'game_over');
});

test('leaving: spy leaving voids the round; dropping below 3 voids; asker leaving passes the turn', () => {
  const s1 = setupAt();
  spy.playerLeft(s1, s1.spyId);
  assert.deepEqual(spy.outcome(s1), { winners: [], draw: true });

  const s2 = setupAt(['a', 'b', 'c']);
  const agent = s2.players.find((p) => p !== s2.spyId);
  spy.playerLeft(s2, agent);
  assert.equal(s2.result.reason, 'not_enough');

  const s3 = setupAt();
  allReady(s3);
  const asker = s3.asker;
  if (asker !== s3.spyId) {
    spy.playerLeft(s3, asker);
    assert.equal(s3.phase, 'ask');
    assert.ok(s3.players.includes(s3.asker));
  }
});

test('disconnected players do not block ready or voting', () => {
  const s = setupAt();
  ['a', 'b', 'c'].forEach((p) => act(s, p, { type: 'ready' }));
  assert.equal(spy.tick(s, 1000, new Set(['a', 'b', 'c'])), true);
  assert.equal(s.phase, 'ask');
});
