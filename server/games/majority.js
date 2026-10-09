// منطق لعبة «رأي الأغلبية»: سؤال بخيارين، كل اللاعبين يختارون معًا،
// ومن اختار ما اختاره أكثر اللاعبين يأخذ نقطة. بعد 7 أسئلة يفوز صاحب أعلى مجموع.
import crypto from 'node:crypto';
import { QUESTIONS } from './majority-deck.js';

export const QUESTIONS_PER_MATCH = 7;
export const TIMES = { ANSWER: 20_000, REVEAL: 7_000 };

const rand = (n) => crypto.randomInt(n);
function sample(n, exclude = []) {
  const pool = [...QUESTIONS.keys()].filter((i) => !exclude.includes(i));
  for (let i = pool.length - 1; i > 0; i--) { const j = rand(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, n);
}

function openQuestion(state, now) {
  state.phase = 'question';
  state.answers = {};
  state.reveal = null;
  state.deadline = now + TIMES.ANSWER;
}

function reveal(state, now) {
  const counts = { A: 0, B: 0 };
  for (const c of Object.values(state.answers)) counts[c] += 1;
  let majority = null;
  if (counts.A !== counts.B) majority = counts.A > counts.B ? 'A' : 'B';
  const gained = majority ? Object.keys(state.answers).filter((p) => state.answers[p] === majority) : [];
  for (const p of gained) state.scores[p] = (state.scores[p] || 0) + 1;
  state.reveal = { counts, majority, answers: { ...state.answers }, gained };
  state.phase = 'reveal';
  state.deadline = now + TIMES.REVEAL;
}

function advance(state, now) {
  state.index += 1;
  if (state.index >= state.questions.length) {
    state.phase = 'done';
    state.deadline = null;
    state.result = { done: true };
  } else {
    openQuestion(state, now);
  }
}

const majority = {
  id: 'majority',
  minPlayers: 3,

  setup(roster, prev, { now = Date.now() } = {}) {
    const used = prev?.used || [];
    const questions = sample(QUESTIONS_PER_MATCH, used.length > QUESTIONS.length - 20 ? [] : used);
    const state = {
      players: roster.slice(0, 8),
      questions,
      used: [...(used.length > QUESTIONS.length - 20 ? [] : used), ...questions],
      index: 0,
      scores: Object.fromEntries(roster.slice(0, 8).map((p) => [p, 0])),
      answers: {},
      reveal: null,
      phase: 'question',
      deadline: null,
      result: null,
      skipsLeft: 2,
    };
    openQuestion(state, now);
    return state;
  },

  action(state, pid, a, { now = Date.now() } = {}) {
    if (state.result) return { ok: false, error: 'game_over' };
    if (!state.players.includes(pid)) return { ok: false, error: 'not_a_player' };
    if (a?.type === 'answer') {
      if (state.phase !== 'question') return { ok: false, error: 'wrong_phase' };
      if (a.choice !== 'A' && a.choice !== 'B') return { ok: false, error: 'bad_action' };
      state.answers[pid] = a.choice; // يمكن تغيير الاختيار حتى ينتهي الوقت
      return { ok: true };
    }
    if (a?.type === 'skip') {
      // تخطي سؤال غير مناسب (مرتين في المباراة)
      if (state.phase !== 'question') return { ok: false, error: 'wrong_phase' };
      if (state.skipsLeft <= 0) return { ok: false, error: 'no_skips_left' };
      const [fresh] = sample(1, state.used);
      if (fresh === undefined) return { ok: false, error: 'no_skips_left' };
      state.questions[state.index] = fresh;
      state.used.push(fresh);
      state.skipsLeft -= 1;
      openQuestion(state, now);
      return { ok: true };
    }
    return { ok: false, error: 'bad_action' };
  },

  tick(state, now, connected = new Set(state.players)) {
    if (state.result) return false;
    const expired = state.deadline && now >= state.deadline;
    if (state.phase === 'question') {
      const online = state.players.filter((p) => connected.has(p));
      if (expired || (online.length && online.every((p) => state.answers[p]))) { reveal(state, now); return true; }
    } else if (state.phase === 'reveal' && expired) {
      advance(state, now);
      return true;
    }
    return false;
  },

  outcome(state) {
    if (!state.result) return null;
    if (state.result.void) return { winners: [], draw: true };
    const best = Math.max(0, ...state.players.map((p) => state.scores[p] || 0));
    if (best === 0) return { winners: [], draw: true };
    const winners = state.players.filter((p) => state.scores[p] === best);
    return { winners, draw: false };
  },

  playerLeft(state, pid) {
    if (state.result || !state.players.includes(pid)) return;
    state.players = state.players.filter((p) => p !== pid);
    delete state.answers[pid];
    if (state.players.length < 2) {
      state.phase = 'done';
      state.deadline = null;
      state.result = { void: true };
    }
  },

  view(state, pid) {
    const q = QUESTIONS[state.questions[state.index]] || QUESTIONS[state.questions.at(-1)];
    return {
      phase: state.phase,
      deadline: state.deadline,
      players: state.players,
      you: state.players.includes(pid) ? pid : null,
      number: Math.min(state.index + 1, state.questions.length),
      total: state.questions.length,
      question: { ar: q.slice(0, 3), en: q.slice(3, 6) },
      answeredIds: Object.keys(state.answers),
      myChoice: state.answers[pid] || null,
      // اختيارات الآخرين لا تُكشف إلا بعد انتهاء السؤال
      reveal: state.reveal,
      scores: state.scores,
      skipsLeft: state.skipsLeft,
      result: state.result,
    };
  },
};

export default majority;
