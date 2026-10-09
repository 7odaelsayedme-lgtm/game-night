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
