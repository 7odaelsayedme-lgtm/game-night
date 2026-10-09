// منطق لعبة إكس أو — مستقل تمامًا عن الشبكة والواجهة حتى يمكن اختباره وحده.
// كل دالة تتحقق من صحة الحركة قبل أن تغيّر الحالة.

export const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // صفوف
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // أعمدة
  [0, 4, 8], [2, 4, 6],            // أقطار
];

export function findWin(board) {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { mark: board[a], line };
    }
  }
  return null;
}

// اختيار اللاعبَين للجولة: الفائز يبقى، والخاسر يذهب لآخر الطابور.
// مع لاعبَين فقط ينتج عن ذلك تبادل الأدوار ويبدأ الخاسر.
export function choosePair(roster, prev) {
  const queue = (prev?.queue || []).filter((id) => roster.includes(id));
  for (const id of roster) if (!queue.includes(id)) queue.push(id);

  if (!prev) return { X: queue[0], O: queue[1], queue };

  const { X: px, O: po } = prev.players;
  const res = prev.result;
  let stay;
  let out;
  if (res?.winner) {
    stay = res.winner;
    out = res.winner === px ? po : px;
  } else {
    // تعادل أو جولة لم تكتمل: صاحب X يبقى كـ O، وصاحب O يخرج للطابور
    stay = px;
    out = po;
  }
  const i = queue.indexOf(out);
  if (i >= 0) { queue.splice(i, 1); queue.push(out); }

  if (!roster.includes(stay)) stay = null;
  const others = queue.filter((id) => id !== stay);
  if (!stay) return { X: others[0], O: others[1], queue };
  return { X: others[0], O: stay, queue };
}

const tictactoe = {
  id: 'tictactoe',
  minPlayers: 2,

  setup(roster, prev) {
    const { X, O, queue } = choosePair(roster, prev);
    return {
      board: Array(9).fill(null),
      players: { X, O },
      turn: 'X',
      moves: 0,
      lastMove: null,
      result: null,
      queue,
    };
  },

  // يرجع { ok:true } أو { ok:false, error }
  action(state, playerId, action) {
    if (state.result) return { ok: false, error: 'game_over' };
    if (!action || action.type !== 'place') return { ok: false, error: 'bad_action' };
    const mark = state.players.X === playerId ? 'X' : state.players.O === playerId ? 'O' : null;
    if (!mark) return { ok: false, error: 'not_a_player' };
    if (state.turn !== mark) return { ok: false, error: 'not_your_turn' };
    const cell = action.cell;
    if (!Number.isInteger(cell) || cell < 0 || cell > 8) return { ok: false, error: 'bad_cell' };
    if (state.board[cell]) return { ok: false, error: 'cell_taken' };

    state.board[cell] = mark;
    state.moves += 1;
    state.lastMove = { cell, mark };

    const win = findWin(state.board);
    if (win) {
      state.result = { winner: playerId, mark: win.mark, line: win.line };
    } else if (state.moves === 9) {
      state.result = { draw: true };
    } else {
      state.turn = mark === 'X' ? 'O' : 'X';
    }
    return { ok: true };
  },

  // ملخص النتيجة لنظام النقاط في الغرفة
  outcome(state) {
    if (!state.result) return null;
    if (state.result.draw) return { winners: [], draw: true };
    return { winners: [state.result.winner], draw: false };
  },

  // عند خروج لاعب نهائيًا أثناء الجولة: يفوز خصمه
  playerLeft(state, playerId) {
    if (state.result) return;
    const { X, O } = state.players;
    if (playerId === X) state.result = { winner: O, forfeit: true };
    else if (playerId === O) state.result = { winner: X, forfeit: true };
  },

  // كل معلومات إكس أو علنية؛ نضيف فقط دور المشاهد
  view(state, playerId) {
    const you = state.players.X === playerId ? 'X' : state.players.O === playerId ? 'O' : null;
    return {
      board: state.board,
      players: state.players,
      turn: state.turn,
      lastMove: state.lastMove,
      result: state.result,
      you,
      queue: state.queue,
    };
  },
};

export default tictactoe;
