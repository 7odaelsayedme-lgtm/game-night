import test from 'node:test';
import assert from 'node:assert/strict';
import ttt, { LINES, findWin, choosePair } from '../server/games/tictactoe.js';

const A = 'a', B = 'b', C = 'c';
const play = (state, moves) => {
  for (const cell of moves) {
    const pid = state.turn === 'X' ? state.players.X : state.players.O;
    const r = ttt.action(state, pid, { type: 'place', cell });
    assert.equal(r.ok, true, `move ${cell} rejected: ${r.error}`);
  }
};

test('all 8 winning lines are detected for X and O', () => {
  assert.equal(LINES.length, 8);
  for (const line of LINES) {
    for (const mark of ['X', 'O']) {
      const board = Array(9).fill(null);
      line.forEach((i) => { board[i] = mark; });
      assert.deepEqual(findWin(board), { mark, line });
    }
  }
});

test('each winning line can be reached in a real game, and points go to the winner', () => {
  for (const line of LINES) {
    const s = ttt.setup([A, B]);
    const filler = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((i) => !line.includes(i));
    // X يلعب خانات الخط، وO يلعب أي خانتين أخريين (لا يستطيع الفوز بحركتين)
    const oMoves = filler.slice(0, 2);
    const seq = [line[0], oMoves[0], line[1], oMoves[1], line[2]];
    let ok = true;
    for (const cell of seq) {
      const pid = s.turn === 'X' ? A : B;
      const r = ttt.action(s, pid, { type: 'place', cell });
      if (!r.ok) { ok = false; break; }
    }
    assert.ok(ok);
    assert.equal(s.result.winner, A, `line ${line}`);
    assert.deepEqual(s.result.line, line);
    assert.deepEqual(ttt.outcome(s), { winners: [A], draw: false });
  }
});

test('O can win too', () => {
  const s = ttt.setup([A, B]);
  play(s, [0, 3, 1, 4, 8, 5]);
  assert.equal(s.result.winner, B);
  assert.equal(s.result.mark, 'O');
});

test('full board without a line is a draw', () => {
  const s = ttt.setup([A, B]);
  // X O X / X O O / O X X
  play(s, [0, 1, 2, 4, 3, 5, 7, 6, 8]);
  assert.equal(s.result.draw, true);
  assert.deepEqual(ttt.outcome(s), { winners: [], draw: true });
});

test('win on the 9th move is a win, not a draw', () => {
  const s = ttt.setup([A, B]);
  // X O X / O X O / O X X  -> X wins with 8 on last move (diagonal 0-4-8)
  play(s, [0, 1, 2, 3, 4, 5, 7, 6, 8]);
  assert.equal(s.result.winner, A);
});

test('invalid moves are rejected without changing the board', () => {
  const s = ttt.setup([A, B]);
  assert.equal(ttt.action(s, B, { type: 'place', cell: 0 }).error, 'not_your_turn');
  assert.equal(ttt.action(s, C, { type: 'place', cell: 0 }).error, 'not_a_player');
  assert.equal(ttt.action(s, A, { type: 'place', cell: 9 }).error, 'bad_cell');
  assert.equal(ttt.action(s, A, { type: 'place', cell: -1 }).error, 'bad_cell');
  assert.equal(ttt.action(s, A, { type: 'place', cell: '4' }).error, 'bad_cell');
  assert.equal(ttt.action(s, A, { type: 'place', cell: 1.5 }).error, 'bad_cell');
  assert.equal(ttt.action(s, A, { type: 'boom' }).error, 'bad_action');
  assert.deepEqual(s.board, Array(9).fill(null));
  assert.equal(ttt.action(s, A, { type: 'place', cell: 4 }).ok, true);
  assert.equal(ttt.action(s, B, { type: 'place', cell: 4 }).error, 'cell_taken');
  assert.equal(ttt.action(s, A, { type: 'place', cell: 0 }).error, 'not_your_turn');
});

test('no moves after the game ends', () => {
  const s = ttt.setup([A, B]);
  play(s, [0, 3, 1, 4, 2]);
  assert.equal(ttt.action(s, B, { type: 'place', cell: 8 }).error, 'game_over');
});

test('forfeit when an active player leaves; spectators leaving changes nothing', () => {
  const s = ttt.setup([A, B, C]);
  ttt.playerLeft(s, C);
  assert.equal(s.result, null);
  ttt.playerLeft(s, A);
  assert.equal(s.result.winner, B);
  assert.equal(s.result.forfeit, true);
});

test('rotation: two players swap and the loser starts', () => {
  const s1 = ttt.setup([A, B]);
  assert.deepEqual(s1.players, { X: A, O: B });
  play(s1, [0, 3, 1, 4, 2]); // A wins
  const s2 = ttt.setup([A, B], s1);
  assert.deepEqual(s2.players, { X: B, O: A });
});

test('rotation: draw swaps marks with two players', () => {
  const s1 = ttt.setup([A, B]);
  play(s1, [0, 1, 2, 4, 3, 5, 7, 6, 8]);
  assert.deepEqual(ttt.setup([A, B], s1).players, { X: B, O: A });
});

test('rotation: winner stays, next in line replaces the loser', () => {
  const s1 = ttt.setup([A, B, C]);
  play(s1, [0, 3, 1, 4, 2]); // A beats B
  const s2 = ttt.setup([A, B, C], s1);
  assert.deepEqual(s2.players, { X: C, O: A });
  const pair = choosePair([A, B, C], s2 && { ...s2, result: { winner: C } });
  assert.deepEqual({ X: pair.X, O: pair.O }, { X: B, O: C });
});

test('rotation survives a player leaving the room', () => {
  const s1 = ttt.setup([A, B, C]);
  play(s1, [0, 3, 1, 4, 2]); // A wins
  const s2 = ttt.setup([B, C], s1); // A left
  assert.deepEqual(new Set([s2.players.X, s2.players.O]), new Set([B, C]));
});

test('view marks spectators and exposes no extra data', () => {
  const s = ttt.setup([A, B, C]);
  assert.equal(ttt.view(s, A).you, 'X');
  assert.equal(ttt.view(s, B).you, 'O');
  assert.equal(ttt.view(s, C).you, null);
});
