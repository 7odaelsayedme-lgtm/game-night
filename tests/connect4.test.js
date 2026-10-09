import test from 'node:test';
import assert from 'node:assert/strict';
import c4, { COLS, ROWS } from '../server/games/connect4.js';

const drop = (s, col) => c4.action(s, s.turn === 'X' ? s.players.X : s.players.O, { type: 'drop', col });
const playAll = (s, cols) => cols.forEach((c) => assert.equal(drop(s, c).ok, true, `col ${c}`));

test('discs fall to the lowest empty row', () => {
  const s = c4.setup(['a', 'b']);
  drop(s, 3); drop(s, 3);
  assert.equal(s.board[(ROWS - 1) * COLS + 3], 'X');
  assert.equal(s.board[(ROWS - 2) * COLS + 3], 'O');
});

test('horizontal, vertical and both diagonal wins', () => {
  let s = c4.setup(['a', 'b']);
  playAll(s, [0, 0, 1, 1, 2, 2, 3]);
  assert.equal(s.result.winner, 'a');
  assert.equal(s.result.line.length, 4);

  s = c4.setup(['a', 'b']);
  playAll(s, [0, 1, 0, 1, 0, 1, 0]);
  assert.equal(s.result.winner, 'a');

  s = c4.setup(['a', 'b']); // قطر صاعد لـ X
  playAll(s, [0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]);
  assert.equal(s.result.winner, 'a');

  s = c4.setup(['a', 'b']); // قطر نازل لـ X
  playAll(s, [6, 5, 5, 4, 4, 3, 4, 3, 3, 0, 3]);
  assert.equal(s.result.winner, 'a');
});

test('O can win and the line contains exactly the winning cells', () => {
  const s = c4.setup(['a', 'b']);
  playAll(s, [0, 6, 0, 6, 1, 6, 1, 6]);
  assert.equal(s.result.winner, 'b');
  assert.ok(s.result.line.every((i) => s.board[i] === 'O'));
});

test('invalid moves: full column, bad column, out of turn, outsiders', () => {
  const s = c4.setup(['a', 'b', 'c']);
  playAll(s, [2, 2, 2, 2, 2, 2]);
  assert.equal(drop(s, 2).error, 'column_full');
  assert.equal(drop(s, 7).error, 'bad_cell');
  assert.equal(drop(s, -1).error, 'bad_cell');
  assert.equal(c4.action(s, 'b', { type: 'drop', col: 0 }).error, 'not_your_turn');
  assert.equal(c4.action(s, 'c', { type: 'drop', col: 0 }).error, 'not_a_player');
});

test('full board without four is a draw', () => {
  const s = c4.setup(['a', 'b']);
  // نمط يملأ اللوحة بلا أربعة متتالية
  const order = [0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 2, 3, 2, 3, 2, 3, 3, 2, 3, 2, 3, 2, 4, 5, 4, 5, 4, 5, 5, 4, 5, 4, 5, 4, 6, 6, 6, 6, 6, 6];
  for (const c of order) {
    const r = drop(s, c);
    if (!r.ok || s.result) break;
  }
  assert.equal(s.moves, 42);
  assert.deepEqual(c4.outcome(s), { winners: [], draw: true });
});

test('forfeit and rotation work like tic-tac-toe', () => {
  const s = c4.setup(['a', 'b']);
  c4.playerLeft(s, 'b');
  assert.equal(s.result.winner, 'a');
  const s2 = c4.setup(['a', 'b'], s);
  assert.deepEqual(s2.players, { X: 'b', O: 'a' });
});
