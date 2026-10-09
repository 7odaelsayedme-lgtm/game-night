// منطق لعبة أربعة في صف — لوحة 7 أعمدة × 6 صفوف، القرص يسقط لأسفل خانة فارغة.
import { choosePair } from './tictactoe.js';

export const COLS = 7;
export const ROWS = 6;
const idx = (r, c) => r * COLS + c; // الصف 0 هو الأعلى

export function findFour(board, r, c) {
  const mark = board[idx(r, c)];
  if (!mark) return null;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const line = [[r, c]];
    for (const s of [1, -1]) {
      let rr = r + dr * s, cc = c + dc * s;
      while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && board[idx(rr, cc)] === mark) {
        line.push([rr, cc]);
        rr += dr * s; cc += dc * s;
      }
    }
    if (line.length >= 4) return line.map(([a, b]) => idx(a, b)).sort((x, y) => x - y);
  }
  return null;
}

const connect4 = {
  id: 'connect4',
  minPlayers: 2,

  setup(roster, prev) {
    const { X, O, queue } = choosePair(roster, prev);
    return { board: Array(COLS * ROWS).fill(null), players: { X, O }, turn: 'X', moves: 0, lastMove: null, result: null, queue };
  },

  action(state, playerId, action) {
    if (state.result) return { ok: false, error: 'game_over' };
    if (!action || action.type !== 'drop') return { ok: false, error: 'bad_action' };
    const mark = state.players.X === playerId ? 'X' : state.players.O === playerId ? 'O' : null;
    if (!mark) return { ok: false, error: 'not_a_player' };
    if (state.turn !== mark) return { ok: false, error: 'not_your_turn' };
    const col = action.col;
    if (!Number.isInteger(col) || col < 0 || col >= COLS) return { ok: false, error: 'bad_cell' };
    let row = -1;
    for (let r = ROWS - 1; r >= 0; r--) if (!state.board[idx(r, col)]) { row = r; break; }
    if (row < 0) return { ok: false, error: 'column_full' };

    state.board[idx(row, col)] = mark;
    state.moves += 1;
    state.lastMove = { row, col, mark, n: state.moves };
    const line = findFour(state.board, row, col);
    if (line) state.result = { winner: playerId, mark, line };
    else if (state.moves === COLS * ROWS) state.result = { draw: true };
    else state.turn = mark === 'X' ? 'O' : 'X';
    return { ok: true };
  },

  outcome(state) {
    if (!state.result) return null;
    if (state.result.draw) return { winners: [], draw: true };
    return { winners: [state.result.winner], draw: false };
  },

  playerLeft(state, playerId) {
    if (state.result) return;
    const { X, O } = state.players;
    if (playerId === X) state.result = { winner: O, forfeit: true };
    else if (playerId === O) state.result = { winner: X, forfeit: true };
  },

  view(state, playerId) {
    const you = state.players.X === playerId ? 'X' : state.players.O === playerId ? 'O' : null;
    return { board: state.board, players: state.players, turn: state.turn, lastMove: state.lastMove, result: state.result, you, queue: state.queue, cols: COLS, rows: ROWS };
  },
};

export default connect4;
