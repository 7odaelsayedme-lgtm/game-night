// منطق لعبة «مين الجاسوس؟».
// الخادم وحده يعرف من الجاسوس وما هو المكان، ويرسل لكل لاعب ما يخصه فقط.
import crypto from 'node:crypto';
import { LOCATIONS } from './spy-deck.js';

export const TIMES = {
  REVEAL: 30_000,  // وقت مشاهدة البطاقة
  ASK: 60_000,     // وقت كتابة السؤال
  ANSWER: 45_000,  // وقت كتابة الجواب
  VOTE: 45_000,    // وقت التصويت
  GUESS: 30_000,   // فرصة الجاسوس الأخيرة لتخمين المكان
};
export const OPTIONS_COUNT = 20;
export const SKIPS_PER_ROUND = 2;
export const TEXT_MAX = 120;

const rand = (n) => crypto.randomInt(n);
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const cleanText = (s) => (typeof s === 'string'
  ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, TEXT_MAX) : '');

function startAsking(state, now) {
  state.phase = 'ask';
  state.asker = state.players[rand(state.players.length)];
  state.target = null;
  state.question = null;
  state.lastAsker = null;
  state.deadline = now + TIMES.ASK;
}

function nextTurn(state, now, nextAsker) {
  state.turnsLeft -= 1;
  if (state.turnsLeft <= 0) return startVote(state, now);
  state.lastAsker = state.asker;
  state.asker = nextAsker;
  state.target = null;
  state.question = null;
  state.phase = 'ask';
  state.deadline = now + TIMES.ASK;
}

const nextInOrder = (state, id) => {
  const i = state.players.indexOf(id);
  return state.players[(i + 1) % state.players.length];
};

function startVote(state, now) {
  state.phase = 'vote';
  state.votes = {};
  state.asker = null;
  state.target = null;
  state.question = null;
  state.deadline = now + TIMES.VOTE;
}

function tally(state, now) {
  const counts = {};
  for (const s of Object.values(state.votes)) counts[s] = (counts[s] || 0) + 1;
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  state.voteCounts = counts;
  if (!ranked.length || (ranked[1] && ranked[1][1] === ranked[0][1])) {
    return finish(state, 'spy', 'no_majority');
  }
  state.accused = ranked[0][0];
  if (state.accused !== state.spyId) return finish(state, 'spy', 'wrong_accused');
  state.phase = 'guess';
  state.deadline = now + TIMES.GUESS;
}

function finish(state, winner, reason) {
  state.phase = 'done';
  state.deadline = null;
  state.result = { winner, reason };
}

const spy = {
  id: 'spy',
  minPlayers: 3,

  setup(roster, _prev, { now = Date.now() } = {}) {
    const players = roster.slice(0, 8);
    const options = shuffle([...LOCATIONS.keys()]).slice(0, OPTIONS_COUNT);
    return {
      players,
      spyId: players[rand(players.length)],
      options,
      locIdx: options[rand(options.length)],
      locVersion: 1,
      skipped: [],
      skipsLeft: SKIPS_PER_ROUND,
      phase: 'reveal',
      deadline: now + TIMES.REVEAL,
      ready: [],
      asker: null,
      target: null,
      question: null,
      lastAsker: null,
      turnsLeft: Math.min(8, Math.max(players.length, 5)),
      feed: [],
      voteRequests: [],
      votes: {},
      voteCounts: null,
      accused: null,
      guess: null,
      result: null,
    };
  },

  action(state, pid, a, { now = Date.now() } = {}) {
    if (state.result) return { ok: false, error: 'game_over' };
    if (!state.players.includes(pid)) return { ok: false, error: 'not_a_player' };
    const type = a?.type;

    if (type === 'ready') {
      if (state.phase !== 'reveal') return { ok: false, error: 'wrong_phase' };
      if (!state.ready.includes(pid)) state.ready.push(pid);
      if (state.ready.length >= state.players.length) startAsking(state, now);
      return { ok: true };
    }

    if (type === 'skip_location') {
      if (state.phase !== 'reveal') return { ok: false, error: 'wrong_phase' };
      if (state.skipsLeft <= 0) return { ok: false, error: 'no_skips_left' };
      state.skipped.push(state.locIdx);
      state.options = state.options.filter((i) => i !== state.locIdx);
      // نضيف مكانًا جديدًا للقائمة حتى يبقى عدد الخيارات ثابتًا
      const fresh = shuffle([...LOCATIONS.keys()].filter((i) => !state.options.includes(i) && !state.skipped.includes(i)))[0];
      if (fresh !== undefined) state.options.push(fresh);
      state.locIdx = state.options[rand(state.options.length)];
      state.skipsLeft -= 1;
      state.locVersion += 1;
      state.ready = [];
      state.deadline = now + TIMES.REVEAL;
      return { ok: true };
    }

    if (type === 'ask') {
      if (state.phase !== 'ask') return { ok: false, error: 'wrong_phase' };
      if (pid !== state.asker) return { ok: false, error: 'not_your_turn' };
      const text = cleanText(a.text);
      if (!text) return { ok: false, error: 'text_required' };
      const t = a.target;
      if (!state.players.includes(t) || t === pid) return { ok: false, error: 'bad_target' };
      const others = state.players.filter((x) => x !== pid && x !== state.lastAsker);
      if (t === state.lastAsker && others.length) return { ok: false, error: 'no_ask_back' };
      state.target = t;
      state.question = text;
      state.phase = 'answer';
      state.deadline = now + TIMES.ANSWER;
      return { ok: true };
    }

    if (type === 'answer') {
      if (state.phase !== 'answer') return { ok: false, error: 'wrong_phase' };
      if (pid !== state.target) return { ok: false, error: 'not_your_turn' };
      const text = cleanText(a.text);
      if (!text) return { ok: false, error: 'text_required' };
      state.feed.push({ asker: state.asker, target: state.target, q: state.question, a: text });
      nextTurn(state, now, state.target);
      return { ok: true };
    }

    if (type === 'request_vote') {
      if (state.phase !== 'ask' && state.phase !== 'answer') return { ok: false, error: 'wrong_phase' };
      if (!state.voteRequests.includes(pid)) state.voteRequests.push(pid);
      if (state.voteRequests.length > state.players.length / 2) startVote(state, now);
      return { ok: true };
    }

    if (type === 'vote') {
      if (state.phase !== 'vote') return { ok: false, error: 'wrong_phase' };
      if (!state.players.includes(a.suspect) || a.suspect === pid) return { ok: false, error: 'bad_target' };
      state.votes[pid] = a.suspect;
      if (state.players.every((p) => state.votes[p])) tally(state, now);
      return { ok: true };
    }

    if (type === 'spy_guess') {
      if (pid !== state.spyId) return { ok: false, error: 'not_the_spy' };
      if (!['ask', 'answer', 'vote', 'guess'].includes(state.phase)) return { ok: false, error: 'wrong_phase' };
      if (!state.options.includes(a.loc)) return { ok: false, error: 'bad_location' };
      state.guess = a.loc;
      if (a.loc === state.locIdx) finish(state, 'spy', 'guessed');
      else finish(state, 'agents', 'wrong_guess');
      return { ok: true };
    }

    return { ok: false, error: 'bad_action' };
  },

  // يُستدعى كل ثانية: انتهاء الأوقات، أو اكتمال الجاهزين/المصوتين من المتصلين فقط
  tick(state, now, connected = new Set(state.players)) {
    if (state.result) return false;
    const online = state.players.filter((p) => connected.has(p));
    const expired = state.deadline && now >= state.deadline;
    switch (state.phase) {
      case 'reveal':
        if (expired || (online.length && online.every((p) => state.ready.includes(p)))) { startAsking(state, now); return true; }
        return false;
      case 'ask':
        if (expired) {
          state.feed.push({ asker: state.asker, skipped: true });
          nextTurn(state, now, nextInOrder(state, state.asker));
          return true;
        }
        return false;
      case 'answer':
        if (expired) {
          state.feed.push({ asker: state.asker, target: state.target, q: state.question, a: null });
          nextTurn(state, now, state.target);
          return true;
        }
        return false;
      case 'vote':
        if (expired || (online.length && online.every((p) => state.votes[p]))) { tally(state, now); return true; }
        return false;
      case 'guess':
        if (expired) { finish(state, 'agents', 'caught'); return true; }
        return false;
      default:
        return false;
    }
  },

  outcome(state) {
    if (!state.result) return null;
    if (state.result.winner === 'void') return { winners: [], draw: true };
    if (state.result.winner === 'spy') return { winners: [state.spyId], draw: false, points: { [state.spyId]: 2 } };
    const agents = state.players.filter((p) => p !== state.spyId);
    return { winners: agents, draw: false, points: Object.fromEntries(agents.map((p) => [p, 1])) };
  },

  playerLeft(state, pid, { now = Date.now() } = {}) {
    if (state.result || !state.players.includes(pid)) return;
    if (pid === state.spyId) return finish(state, 'void', 'spy_left');
    const following = nextInOrder(state, pid);
    state.players = state.players.filter((p) => p !== pid);
    state.ready = state.ready.filter((p) => p !== pid);
    state.voteRequests = state.voteRequests.filter((p) => p !== pid);
    delete state.votes[pid];
    for (const [v, s] of Object.entries(state.votes)) if (s === pid) delete state.votes[v];
    if (state.players.length < 3) return finish(state, 'void', 'not_enough');
    if (state.lastAsker === pid) state.lastAsker = null;
    if ((state.phase === 'ask' && state.asker === pid) || (state.phase === 'answer' && (state.asker === pid || state.target === pid))) {
      state.asker = state.phase === 'answer' && state.asker !== pid ? state.asker : following;
      state.target = null;
      state.question = null;
      state.phase = 'ask';
      state.deadline = now + TIMES.ASK;
    }
  },

  view(state, pid) {
    const isPlayer = state.players.includes(pid);
    const role = !isPlayer ? 'spectator' : pid === state.spyId ? 'spy' : 'agent';
    const done = state.phase === 'done';
    return {
      phase: state.phase,
      deadline: state.deadline,
      players: state.players,
      role,
      you: isPlayer ? pid : null,
      location: role === 'agent' || done ? LOCATIONS[state.locIdx] : null,
      locVersion: state.locVersion,
      options: state.options.map((i) => ({ id: i, name: LOCATIONS[i] })),
      skipsLeft: state.skipsLeft,
      readyIds: state.ready,
      asker: state.asker,
      target: state.target,
      question: state.question,
      lastAsker: state.lastAsker,
      turnsLeft: state.turnsLeft,
      feed: state.feed,
      voteRequests: state.voteRequests,
      votedIds: Object.keys(state.votes),
      myVote: state.votes[pid] || null,
      accused: state.phase === 'guess' || done ? state.accused : null,
      // معلومات الجولة السرية تُكشف للجميع فقط بعد انتهائها
      spyId: done ? state.spyId : null,
      votes: done ? state.votes : null,
      voteCounts: done || state.phase === 'guess' ? state.voteCounts : null,
      guess: done && state.guess !== null ? LOCATIONS[state.guess] : null,
      result: state.result,
    };
  },
};

export default spy;
