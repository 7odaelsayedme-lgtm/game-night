// إدارة الغرف واللاعبين. الخادم هو المرجع الوحيد لحالة اللعب:
// الواجهة ترسل "طلبات" فقط، والخادم يقرر إن كانت مقبولة.
import crypto from 'node:crypto';
import { GAME_MODULES } from './games/index.js';
import { getGameMeta } from '../shared/catalog.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // بلا حروف ملتبسة مثل O و0 و I و1
const COLORS = ['#E8505B', '#2BB3A3', '#F2B33D', '#8B7CF6', '#4FA3F7', '#F08A3C', '#6CCB5F', '#E86FB4'];

export const LIMITS = {
  MAX_ROOMS: 1000,
  MAX_PLAYERS: 8,
  NAME_MAX: 16,
  DISCONNECT_GRACE_MS: 60_000,  // مهلة عودة اللاعب المنقطع قبل إخراجه
  HOST_GRACE_MS: 20_000,        // بعدها تنتقل الاستضافة لغيره
  EMPTY_ROOM_TTL_MS: 10 * 60_000,
  IDLE_ROOM_TTL_MS: 3 * 60 * 60_000,
  ACTION_MEMORY: 50,            // عدد معرّفات الحركات المحفوظة لمنع التكرار
};

const randomCode = (len = 5) =>
  Array.from({ length: len }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');

export function cleanName(raw) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.NAME_MAX);
}

export const normalizeCode = (raw) =>
  typeof raw === 'string' ? raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) : '';

const fail = (error) => ({ ok: false, error });

export class RoomManager {
  constructor({ now = () => Date.now(), onChange = () => {} } = {}) {
    this.rooms = new Map();
    this.now = now;
    this.onChange = onChange; // يُستدعى بعد أي تغيير ليرسل الحالة للاعبين
  }

  // ---------- أدوات داخلية ----------
  touch(room) { room.lastActivity = this.now(); }

  orderedPlayers(room) {
    return [...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt);
  }

  connectedIds(room) {
    return this.orderedPlayers(room).filter((p) => p.connected).map((p) => p.id);
  }

  uniqueName(room, name) {
    const taken = new Set([...room.players.values()].map((p) => p.name));
    if (!taken.has(name)) return name;
    for (let n = 2; ; n++) if (!taken.has(`${name} ${n}`)) return `${name} ${n}`;
  }

  addPlayer(room, name) {
    const usedColors = new Set([...room.players.values()].map((p) => p.color));
    const player = {
      id: crypto.randomBytes(6).toString('hex'),
      token: crypto.randomBytes(18).toString('hex'),
      name: this.uniqueName(room, name),
      color: COLORS.find((c) => !usedColors.has(c)) || COLORS[0],
      score: 0,
      connected: true,
      disconnectedAt: null,
      joinedAt: this.now() + room.players.size / 1000, // يضمن ترتيبًا ثابتًا
      socketId: null,
    };
    room.players.set(player.id, player);
    return player;
  }

  // ---------- عمليات عامة ----------
  create({ nickname, maxPlayers }) {
    const name = cleanName(nickname);
    if (!name) return fail('name_required');
    if (this.rooms.size >= LIMITS.MAX_ROOMS) return fail('server_full');
    const max = Math.min(LIMITS.MAX_PLAYERS, Math.max(2, Number.parseInt(maxPlayers, 10) || LIMITS.MAX_PLAYERS));
    let code;
    do code = randomCode(); while (this.rooms.has(code));
    const room = {
      code,
      maxPlayers: max,
      players: new Map(),
      hostId: null,
      phase: 'lobby', // lobby | playing | results
      gameId: 'tictactoe',
      game: null,
      round: 0,
      lastOutcome: null,
      seenActions: new Map(),
      createdAt: this.now(),
      lastActivity: this.now(),
    };
    const player = this.addPlayer(room, name);
    room.hostId = player.id;
    this.rooms.set(code, room);
    return { ok: true, room, player };
  }

  peek(rawCode) {
    const room = this.rooms.get(normalizeCode(rawCode));
    if (!room) return fail('room_not_found');
    const host = room.players.get(room.hostId);
    return {
      ok: true,
      code: room.code,
      hostName: host?.name || '',
      count: room.players.size,
      maxPlayers: room.maxPlayers,
      full: room.players.size >= room.maxPlayers,
    };
  }

  join(rawCode, nickname) {
    const room = this.rooms.get(normalizeCode(rawCode));
    if (!room) return fail('room_not_found');
    const name = cleanName(nickname);
    if (!name) return fail('name_required');
    if (room.players.size >= room.maxPlayers) return fail('room_full');
    const player = this.addPlayer(room, name);
    this.touch(room);
    this.onChange(room);
    return { ok: true, room, player };
  }

  // عودة لاعب بعد انقطاع أو إعادة تحميل الصفحة
  resume(rawCode, token) {
    const room = this.rooms.get(normalizeCode(rawCode));
    if (!room) return fail('room_not_found');
    if (typeof token !== 'string') return fail('session_invalid');
    const player = [...room.players.values()].find((p) => p.token === token);
    if (!player) return fail('session_invalid');
    player.connected = true;
    player.disconnectedAt = null;
    this.touch(room);
    this.onChange(room);
    return { ok: true, room, player };
  }

  disconnect(code, playerId) {
    const room = this.rooms.get(code);
    const player = room?.players.get(playerId);
    if (!player) return;
    player.connected = false;
    player.disconnectedAt = this.now();
    player.socketId = null;
    this.onChange(room);
  }

  leave(code, playerId) {
    const room = this.rooms.get(code);
    if (!room || !room.players.has(playerId)) return;
    this.removePlayer(room, playerId);
  }

  removePlayer(room, playerId) {
    if (room.phase === 'playing' && room.game) {
      const mod = GAME_MODULES[room.gameId];
      mod.playerLeft?.(room.game, playerId, { now: this.now() });
    }
    room.players.delete(playerId);
    room.seenActions.delete(playerId);
    if (room.players.size === 0) {
      this.rooms.delete(room.code);
      return;
    }
    if (room.hostId === playerId) this.reassignHost(room);
    if (room.phase === 'playing') this.checkFinished(room);
    this.touch(room);
    this.onChange(room);
  }

  reassignHost(room) {
    const next = this.orderedPlayers(room).find((p) => p.connected && p.id !== room.hostId)
      || this.orderedPlayers(room).find((p) => p.id !== room.hostId);
    if (next) room.hostId = next.id;
  }

  selectGame(code, playerId, gameId) {
    const room = this.rooms.get(code);
    if (!room) return fail('room_not_found');
    if (room.hostId !== playerId) return fail('host_only');
    if (room.phase === 'playing') return fail('match_in_progress');
    const meta = getGameMeta(gameId);
    if (!meta || meta.status !== 'ready' || !GAME_MODULES[gameId]) return fail('game_unavailable');
    if (room.gameId !== gameId) room.lastOutcome = null;
    room.gameId = gameId;
    room.phase = 'lobby';
    room.game = null;
    this.touch(room);
    this.onChange(room);
    return { ok: true };
  }

  start(code, playerId) {
    const room = this.rooms.get(code);
    if (!room) return fail('room_not_found');
    if (room.hostId !== playerId) return fail('host_only');
    if (room.phase === 'playing') return fail('match_in_progress');
    const mod = GAME_MODULES[room.gameId];
    const meta = getGameMeta(room.gameId);
    if (!mod || meta?.status !== 'ready') return fail('game_unavailable');
    const roster = this.connectedIds(room);
    if (roster.length < mod.minPlayers) return fail('not_enough_players');
    if (!meta.spectators && roster.length > meta.maxPlayers) return fail('too_many_players');
    const prev = room.lastOutcome?.gameId === room.gameId ? room.lastOutcome.state : null;
    room.game = mod.setup(roster, prev, { now: this.now() });
    room.phase = 'playing';
    room.round += 1;
    room.seenActions = new Map();
    this.touch(room);
    this.onChange(room);
    return { ok: true };
  }

  action(code, playerId, payload) {
    const room = this.rooms.get(code);
    if (!room) return fail('room_not_found');
    if (!room.players.has(playerId)) return fail('not_in_room');
    if (room.phase !== 'playing' || !room.game) return fail('no_active_match');
    if (!payload || typeof payload !== 'object') return fail('bad_action');

    // حماية من تكرار نفس الطلب (ضغطتان سريعتان أو إعادة إرسال بعد انقطاع)
    const actionId = typeof payload.actionId === 'string' ? payload.actionId.slice(0, 64) : null;
    if (!actionId) return fail('bad_action');
    const seen = room.seenActions.get(playerId) || [];
    if (seen.includes(actionId)) return fail('duplicate_action');
    seen.push(actionId);
    if (seen.length > LIMITS.ACTION_MEMORY) seen.shift();
    room.seenActions.set(playerId, seen);

    const mod = GAME_MODULES[room.gameId];
    const res = mod.action(room.game, playerId, payload, { now: this.now() });
    if (!res.ok) return res;
    this.checkFinished(room);
    this.touch(room);
    this.onChange(room);
    return { ok: true };
  }

  checkFinished(room) {
    const mod = GAME_MODULES[room.gameId];
    const outcome = mod.outcome(room.game);
    if (!outcome) return;
    // النقاط: إما جدول نقاط تحدده اللعبة، أو نقطة لكل فائز
    const points = outcome.points || Object.fromEntries(outcome.winners.map((id) => [id, 1]));
    for (const [id, n] of Object.entries(points)) {
      const p = room.players.get(id);
      if (p) p.score += n;
    }
    room.phase = 'results';
    room.lastOutcome = { gameId: room.gameId, state: room.game, outcome };
  }

  backToLobby(code, playerId) {
    const room = this.rooms.get(code);
    if (!room) return fail('room_not_found');
    if (room.hostId !== playerId) return fail('host_only');
    if (room.phase === 'playing') return fail('match_in_progress');
    room.phase = 'lobby';
    room.game = null;
    this.touch(room);
    this.onChange(room);
    return { ok: true };
  }

  // مؤقتات الألعاب (مثل وقت السؤال والتصويت) — يُستدعى كل ثانية
  tick() {
    const now = this.now();
    for (const room of this.rooms.values()) {
      if (room.phase !== 'playing' || !room.game) continue;
      const mod = GAME_MODULES[room.gameId];
      if (!mod.tick) continue;
      const connected = new Set(this.connectedIds(room));
      if (mod.tick(room.game, now, connected)) {
        this.checkFinished(room);
        this.onChange(room);
      }
    }
  }

  // تنظيف دوري: إخراج المنقطعين طويلًا، نقل الاستضافة، وحذف الغرف المهجورة
  sweep() {
    const now = this.now();
    for (const room of [...this.rooms.values()]) {
      const players = [...room.players.values()];
      const anyConnected = players.some((p) => p.connected);
      if (!anyConnected) {
        const lastSeen = Math.max(...players.map((p) => p.disconnectedAt || 0), room.lastActivity);
        if (now - lastSeen > LIMITS.EMPTY_ROOM_TTL_MS) this.rooms.delete(room.code);
        continue; // لا نخرج أحدًا إذا كان الجميع منقطعين؛ ربما انقطاع شبكة عام
      }
      if (now - room.lastActivity > LIMITS.IDLE_ROOM_TTL_MS) {
        this.rooms.delete(room.code);
        continue;
      }
      let changed = false;
      const host = room.players.get(room.hostId);
      if (host && !host.connected && now - host.disconnectedAt > LIMITS.HOST_GRACE_MS) {
        this.reassignHost(room);
        changed = true;
      }
      for (const p of players) {
        if (!p.connected && now - p.disconnectedAt > LIMITS.DISCONNECT_GRACE_MS) {
          this.removePlayer(room, p.id);
          changed = false; // removePlayer يرسل التحديث بنفسه
        }
      }
      if (changed && this.rooms.has(room.code)) this.onChange(room);
    }
  }

  // ما يراه لاعب معيّن فقط — لا يتضمن رموز الجلسات أبدًا
  viewFor(room, playerId) {
    const mod = GAME_MODULES[room.gameId];
    const game = room.game && mod ? mod.view(room.game, playerId) : null;
    return {
      code: room.code,
      you: playerId,
      hostId: room.hostId,
      maxPlayers: room.maxPlayers,
      phase: room.phase,
      gameId: room.gameId,
      round: room.round,
      players: this.orderedPlayers(room).map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        score: p.score,
        connected: p.connected,
        graceLeftMs: p.connected ? null : Math.max(0, LIMITS.DISCONNECT_GRACE_MS - (this.now() - p.disconnectedAt)),
      })),
      game,
      serverNow: this.now(),
      outcome: room.phase === 'results' ? room.lastOutcome?.outcome : null,
    };
  }
}
