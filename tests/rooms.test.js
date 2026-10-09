import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager, LIMITS, cleanName } from '../server/rooms.js';

const setup = () => {
  let t = 1_000_000;
  const clock = { now: () => t, advance: (ms) => { t += ms; } };
  const rm = new RoomManager({ now: clock.now });
  return { rm, clock };
};
let n = 0;
const aid = () => `act-${++n}`;

test('create and join rooms; codes are unique and readable', () => {
  const { rm } = setup();
  const codes = new Set();
  for (let i = 0; i < 200; i++) {
    const r = rm.create({ nickname: 'هوست', maxPlayers: 4 });
    assert.match(r.room.code, /^[A-HJ-NP-Z2-9]{5}$/);
    codes.add(r.room.code);
  }
  assert.equal(codes.size, 200);
});

test('join errors: missing room, empty name, full room; duplicate names get a suffix', () => {
  const { rm } = setup();
  const { room } = rm.create({ nickname: 'أحمد', maxPlayers: 3 });
  assert.equal(rm.join('ZZZZZ', 'x').error, 'room_not_found');
  assert.equal(rm.join(room.code, '   ').error, 'name_required');
  assert.equal(rm.join(room.code.toLowerCase(), 'أحمد').player.name, 'أحمد 2');
  assert.equal(rm.join(room.code, 'سارة').ok, true);
  assert.equal(rm.join(room.code, 'خالد').error, 'room_full');
});

test('names are cleaned of markup and length-limited', () => {
  assert.equal(cleanName('  <b>علي</b>  '), 'bعلي/b');
  assert.equal(cleanName('x'.repeat(40)).length, LIMITS.NAME_MAX);
  assert.equal(cleanName(42), '');
});

test('only the host can select games and start; player count is enforced', () => {
  const { rm } = setup();
  const { room, player: host } = rm.create({ nickname: 'H', maxPlayers: 8 });
  assert.equal(rm.start(room.code, host.id).error, 'not_enough_players');
  const { player: guest } = rm.join(room.code, 'G');
  assert.equal(rm.start(room.code, guest.id).error, 'host_only');
  assert.equal(rm.selectGame(room.code, guest.id, 'tictactoe').error, 'host_only');
  assert.equal(rm.selectGame(room.code, host.id, 'connect4').error, 'game_unavailable');
  assert.equal(rm.selectGame(room.code, host.id, 'nope').error, 'game_unavailable');
  assert.equal(rm.start(room.code, host.id).ok, true);
  assert.equal(rm.start(room.code, host.id).error, 'match_in_progress');
});

test('full match: duplicate actions blocked, score awarded once, rematch rotates', () => {
  const { rm } = setup();
  const { room, player: h } = rm.create({ nickname: 'H', maxPlayers: 2 });
  const { player: g } = rm.join(room.code, 'G');
  rm.start(room.code, h.id);
  const id = aid();
  assert.equal(rm.action(room.code, h.id, { actionId: id, type: 'place', cell: 0 }).ok, true);
  assert.equal(rm.action(room.code, h.id, { actionId: id, type: 'place', cell: 0 }).error, 'duplicate_action');
  assert.equal(rm.action(room.code, h.id, { type: 'place', cell: 1 }).error, 'bad_action');
  assert.equal(rm.action(room.code, h.id, { actionId: aid(), type: 'place', cell: 1 }).error, 'not_your_turn');
  for (const [p, c] of [[g, 3], [h, 1], [g, 4], [h, 2]]) {
    assert.equal(rm.action(room.code, p.id, { actionId: aid(), type: 'place', cell: c }).ok, true);
  }
  assert.equal(room.phase, 'results');
  assert.equal(h.score, 1);
  assert.equal(g.score, 0);
  assert.equal(rm.action(room.code, g.id, { actionId: aid(), type: 'place', cell: 8 }).error, 'no_active_match');
  assert.equal(h.score, 1);
  rm.start(room.code, h.id);
  assert.deepEqual(room.game.players, { X: g.id, O: h.id });
  assert.equal(rm.backToLobby(room.code, h.id).error, 'match_in_progress');
});

test('views never leak session tokens', () => {
  const { rm } = setup();
  const { room, player: h } = rm.create({ nickname: 'H', maxPlayers: 2 });
  const { player: g } = rm.join(room.code, 'G');
  const json = JSON.stringify(rm.viewFor(room, g.id));
  assert.ok(!json.includes(h.token));
  assert.ok(!json.includes(g.token));
  assert.ok(!json.includes('token'));
});

test('reconnect with token restores the same player; bad tokens fail', () => {
  const { rm } = setup();
  const { room, player: h } = rm.create({ nickname: 'H', maxPlayers: 2 });
  rm.disconnect(room.code, h.id);
  assert.equal(h.connected, false);
  assert.equal(rm.resume(room.code, 'wrong').error, 'session_invalid');
  assert.equal(rm.resume(room.code, h.token).player.id, h.id);
  assert.equal(h.connected, true);
});

test('disconnected active player forfeits after the grace period', () => {
  const { rm, clock } = setup();
  const { room, player: h } = rm.create({ nickname: 'H', maxPlayers: 2 });
  const { player: g } = rm.join(room.code, 'G');
  rm.start(room.code, h.id);
  rm.disconnect(room.code, g.id);
  clock.advance(LIMITS.DISCONNECT_GRACE_MS - 1000);
  rm.sweep();
  assert.equal(room.phase, 'playing');
  clock.advance(2000);
  rm.sweep();
  assert.equal(room.players.has(g.id), false);
  assert.equal(room.phase, 'results');
  assert.equal(h.score, 1);
});

test('host disconnecting hands host to a connected player; leaving does too', () => {
  const { rm, clock } = setup();
  const { room, player: h } = rm.create({ nickname: 'H', maxPlayers: 4 });
  const { player: g } = rm.join(room.code, 'G');
  rm.disconnect(room.code, h.id);
  clock.advance(LIMITS.HOST_GRACE_MS + 1000);
  rm.sweep();
  assert.equal(room.hostId, g.id);
  const { player: k } = rm.join(room.code, 'K');
  rm.leave(room.code, g.id);
  assert.equal(room.hostId, k.id);
});

test('empty and idle rooms are cleaned up', () => {
  const { rm, clock } = setup();
  const a = rm.create({ nickname: 'A', maxPlayers: 2 }).room;
  const b = rm.create({ nickname: 'B', maxPlayers: 2 }).room;
  rm.disconnect(a.code, [...a.players.keys()][0]);
  clock.advance(LIMITS.EMPTY_ROOM_TTL_MS + 1000);
  rm.sweep();
  assert.equal(rm.rooms.has(a.code), false, 'empty room removed');
  assert.equal(rm.rooms.has(b.code), true, 'active room kept');
  clock.advance(LIMITS.IDLE_ROOM_TTL_MS);
  rm.sweep();
  assert.equal(rm.rooms.has(b.code), false, 'idle room removed');
});

test('last player leaving deletes the room', () => {
  const { rm } = setup();
  const { room, player } = rm.create({ nickname: 'A', maxPlayers: 2 });
  rm.leave(room.code, player.id);
  assert.equal(rm.rooms.size, 0);
});

test('a spectator can join mid-match and sees the board but cannot move', () => {
  const { rm } = setup();
  const { room, player: h } = rm.create({ nickname: 'H', maxPlayers: 3 });
  rm.join(room.code, 'G');
  rm.start(room.code, h.id);
  const { player: s } = rm.join(room.code, 'S');
  assert.equal(rm.viewFor(room, s.id).game.you, null);
  assert.equal(rm.action(room.code, s.id, { actionId: aid(), type: 'place', cell: 0 }).error, 'not_a_player');
});
