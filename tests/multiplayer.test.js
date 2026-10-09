// اختبار تكامل: خادم حقيقي + عدة عملاء Socket.IO مستقلين عبر الشبكة المحلية
import test from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { createServer } from '../server/index.js';

let srv, url;
test.before(async () => {
  srv = createServer();
  await new Promise((r) => srv.server.listen(0, r));
  url = `http://localhost:${srv.server.address().port}`;
});
test.after(() => { srv.io.close(); srv.server.close(); });

const client = () => {
  const s = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  s.last = null;
  s.on('room:state', (st) => { s.last = st; });
  return s;
};
const call = (s, ev, p = {}) => new Promise((r) => s.emit(ev, p, r));
const waitFor = (s, pred, ms = 2000) => new Promise((resolve, reject) => {
  if (s.last && pred(s.last)) return resolve(s.last);
  const t = setTimeout(() => { s.off('room:state', h); reject(new Error('timeout')); }, ms);
  const h = (st) => { if (pred(st)) { clearTimeout(t); s.off('room:state', h); resolve(st); } };
  s.on('room:state', h);
});
let k = 0;
const move = (s, cell) => call(s, 'game:action', { actionId: `m${++k}`, type: 'place', cell });

test('two independent clients play a full synchronized match', async () => {
  const a = client(), b = client();
  const created = await call(a, 'room:create', { nickname: 'أحمد', maxPlayers: 2 });
  assert.equal(created.ok, true);
  const peek = await call(b, 'room:peek', { code: created.code });
  assert.equal(peek.hostName, 'أحمد');
  const joined = await call(b, 'room:join', { code: created.code, nickname: 'سارة' });
  assert.equal(joined.ok, true);
  await waitFor(a, (st) => st.players.length === 2);

  assert.equal((await call(b, 'game:start')).error, 'host_only');
  assert.equal((await call(a, 'game:start')).ok, true);
  await waitFor(b, (st) => st.phase === 'playing');
  assert.equal(b.last.game.you, 'O');

  assert.equal((await move(b, 4)).error, 'not_your_turn');
  assert.equal((await move(a, 0)).ok, true);
  const seen = await waitFor(b, (st) => st.game.board[0] === 'X');
  assert.equal(seen.game.turn, 'O');
  assert.equal((await move(b, 0)).error, 'cell_taken');
  await move(b, 3); await move(a, 1); await move(b, 4); await move(a, 2);
  const endA = await waitFor(a, (st) => st.phase === 'results');
  const endB = await waitFor(b, (st) => st.phase === 'results');
  assert.deepEqual(endA.game.result.line, [0, 1, 2]);
  assert.equal(endB.players.find((p) => p.name === 'أحمد').score, 1);

  // جولة جديدة: الخاسر يبدأ
  await call(a, 'game:start');
  const r2 = await waitFor(b, (st) => st.phase === 'playing' && st.round === 2);
  assert.equal(r2.game.you, 'X');
  a.close(); b.close();
});

test('simultaneous duplicate and racing moves: only one is accepted', async () => {
  const a = client(), b = client();
  const { code } = await call(a, 'room:create', { nickname: 'A', maxPlayers: 2 });
  await call(b, 'room:join', { code, nickname: 'B' });
  await call(a, 'game:start');
  const payload = { actionId: 'same-id', type: 'place', cell: 4 };
  const results = await Promise.all([
    call(a, 'game:action', payload),
    call(a, 'game:action', payload),
    call(a, 'game:action', { actionId: 'other', type: 'place', cell: 5 }),
  ]);
  assert.equal(results.filter((r) => r.ok).length, 1);
  const st = await waitFor(b, (s) => s.game && s.game.board.filter(Boolean).length >= 1);
  assert.equal(st.game.board.filter(Boolean).length, 1);
  a.close(); b.close();
});

test('reconnect with the stored token resumes the same seat mid-game', async () => {
  const a = client(), b = client();
  const { code } = await call(a, 'room:create', { nickname: 'A', maxPlayers: 2 });
  const jb = await call(b, 'room:join', { code, nickname: 'B' });
  await call(a, 'game:start');
  await move(a, 0);
  b.close();
  await waitFor(a, (st) => st.players.find((p) => p.id === jb.playerId)?.connected === false);
  const b2 = client();
  const res = await call(b2, 'room:resume', { code, token: jb.token });
  assert.equal(res.playerId, jb.playerId);
  const st = await waitFor(b2, (s) => s.phase === 'playing');
  assert.equal(st.game.you, 'O');
  assert.equal(st.game.board[0], 'X');
  assert.equal((await move(b2, 4)).ok, true);
  await waitFor(a, (s) => s.players.every((p) => p.connected));
  assert.equal((await call(client(), 'room:resume', { code, token: 'forged' })).error, 'session_invalid');
  a.close(); b2.close();
});

test('an outsider cannot act in a room, and room state never contains tokens', async () => {
  const a = client(), b = client(), x = client();
  const { code, token } = await call(a, 'room:create', { nickname: 'A', maxPlayers: 2 });
  await call(b, 'room:join', { code, nickname: 'B' });
  await call(a, 'game:start');
  assert.equal((await move(x, 0)).error, 'not_in_room');
  assert.equal((await call(x, 'game:start')).error, 'not_in_room');
  assert.equal((await call(x, 'room:join', { code, nickname: 'X' })).error, 'room_full');
  assert.ok(!JSON.stringify(b.last).includes(token));
  a.close(); b.close(); x.close();
});

test('three players: third joins as spectator and rotates in after the loser', async () => {
  const a = client(), b = client(), c = client();
  const { code } = await call(a, 'room:create', { nickname: 'A', maxPlayers: 3 });
  const jb = await call(b, 'room:join', { code, nickname: 'B' });
  const jc = await call(c, 'room:join', { code, nickname: 'C' });
  await call(a, 'game:start');
  const sc = await waitFor(c, (s) => s.phase === 'playing');
  assert.equal(sc.game.you, null);
  assert.equal((await move(c, 0)).error, 'not_a_player');
  await move(a, 0); await move(b, 3); await move(a, 1); await move(b, 4); await move(a, 2);
  await waitFor(c, (s) => s.phase === 'results');
  await call(a, 'game:start');
  const r2 = await waitFor(c, (s) => s.round === 2);
  assert.equal(r2.game.you, 'X');
  assert.equal(r2.game.players.O, a.last.you);
  assert.ok(![r2.game.players.X, r2.game.players.O].includes(jb.playerId));
  assert.equal(jc.playerId, r2.you);
  a.close(); b.close(); c.close();
});

test('opening the same seat in a second tab replaces the first connection', async () => {
  const a = client(), b = client();
  const { code, token } = await call(a, 'room:create', { nickname: 'A', maxPlayers: 2 });
  await call(b, 'room:join', { code, nickname: 'B' });
  const a2 = client();
  const replaced = new Promise((r) => a.once('session:replaced', r));
  await call(a2, 'room:resume', { code, token });
  await replaced;
  assert.equal((await call(a, 'game:start')).error, 'session_replaced');
  assert.equal((await call(a2, 'game:start')).ok, true);
  a.close(); a2.close(); b.close();
});

test('find the spy over the network: private roles never leak to other clients', async () => {
  const cs = [client(), client(), client(), client()];
  const { code } = await call(cs[0], 'room:create', { nickname: 'A', maxPlayers: 6 });
  for (const [i, c] of cs.slice(1).entries()) await call(c, 'room:join', { code, nickname: `P${i}` });
  assert.equal((await call(cs[0], 'room:selectGame', { gameId: 'spy' })).ok, true);
  assert.equal((await call(cs[0], 'game:start')).ok, true);
  const views = await Promise.all(cs.map((c) => waitFor(c, (s) => s.phase === 'playing' && s.gameId === 'spy')));
  const spies = views.filter((v) => v.game.role === 'spy');
  const agents = views.filter((v) => v.game.role === 'agent');
  assert.equal(spies.length, 1);
  assert.equal(agents.length, 3);
  const secret = agents[0].game.location;
  assert.ok(agents.every((v) => JSON.stringify(v.game.location) === JSON.stringify(secret)));
  for (const v of views) assert.equal(v.game.spyId, null);
  const spyRaw = JSON.stringify(spies[0]);
  assert.ok(!spyRaw.includes('"location":["'), 'spy must not receive the location');
  // تخمين الجاسوس من خارج دوره مرفوض لغير الجاسوس
  const agentClient = cs[views.indexOf(agents[0])];
  assert.equal((await call(agentClient, 'game:action', { actionId: 'g1', type: 'spy_guess', loc: 0 })).error, 'not_the_spy');
  cs.forEach((c) => c.close());
});

test('snakes over the network: server rolls, turns rotate, others see the move', async () => {
  const a = client(), b = client();
  const { code } = await call(a, 'room:create', { nickname: 'A', maxPlayers: 4 });
  await call(b, 'room:join', { code, nickname: 'B' });
  await call(a, 'room:selectGame', { gameId: 'snakes' });
  await call(a, 'game:start');
  const st = await waitFor(b, (s) => s.phase === 'playing' && s.gameId === 'snakes');
  assert.equal(st.game.turnId, a.last.you);
  assert.equal((await call(b, 'game:action', { actionId: 's1', type: 'roll' })).error, 'not_your_turn');
  assert.equal((await call(a, 'game:action', { actionId: 's2', type: 'roll', value: 6 })).ok, true);
  const after = await waitFor(b, (s) => s.game.last);
  assert.ok(after.game.last.roll >= 1 && after.game.last.roll <= 6);
  assert.equal(after.game.pos[a.last.you], after.game.last.to);
  a.close(); b.close();
});

test('connect four over the network: full game to a vertical win', async () => {
  const a = client(), b = client();
  const { code } = await call(a, 'room:create', { nickname: 'A', maxPlayers: 2 });
  await call(b, 'room:join', { code, nickname: 'B' });
  await call(a, 'room:selectGame', { gameId: 'connect4' });
  await call(a, 'game:start');
  await waitFor(b, (s) => s.phase === 'playing' && s.gameId === 'connect4');
  const d = (c, col) => call(c, 'game:action', { actionId: `c${++k}`, type: 'drop', col });
  assert.equal((await d(b, 0)).error, 'not_your_turn');
  for (const [c, col] of [[a, 3], [b, 4], [a, 3], [b, 4], [a, 3], [b, 4]]) assert.equal((await d(c, col)).ok, true);
  assert.equal((await d(a, 3)).ok, true);
  const end = await waitFor(b, (s) => s.phase === 'results');
  assert.equal(end.game.result.line.length, 4);
  assert.equal(end.players.find((p) => p.name === 'A').score, 1);
  a.close(); b.close();
});

test('guess the majority over the network: picks stay secret until reveal', async () => {
  const cs = [client(), client(), client()];
  const { code } = await call(cs[0], 'room:create', { nickname: 'A', maxPlayers: 4 });
  await call(cs[1], 'room:join', { code, nickname: 'B' });
  await call(cs[2], 'room:join', { code, nickname: 'C' });
  await call(cs[0], 'room:selectGame', { gameId: 'majority' });
  await call(cs[0], 'game:start');
  await waitFor(cs[2], (s) => s.phase === 'playing' && s.gameId === 'majority');
  await call(cs[0], 'game:action', { actionId: 'm-a', type: 'answer', choice: 'A' });
  const mid = await waitFor(cs[1], (s) => s.game.answeredIds.length === 1);
  assert.equal(mid.game.myChoice, null);
  assert.equal(mid.game.reveal, null);
  await call(cs[1], 'game:action', { actionId: 'm-b', type: 'answer', choice: 'A' });
  await call(cs[2], 'game:action', { actionId: 'm-c', type: 'answer', choice: 'B' });
  const rev = await waitFor(cs[2], (s) => s.game.phase === 'reveal', 4000);
  assert.deepEqual(rev.game.reveal.counts, { A: 2, B: 1 });
  assert.equal(rev.game.scores[cs[0].last.you], 1);
  cs.forEach((c) => c.close());
});
