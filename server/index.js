// نقطة تشغيل الخادم: يخدم ملفات الموقع ويدير الاتصال اللحظي عبر Socket.IO
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { RoomManager, normalizeCode } from './rooms.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function createServer() {
  const app = express();
  app.disable('x-powered-by');
  const server = http.createServer(app);
  const io = new Server(server, { maxHttpBufferSize: 10_000, pingInterval: 20_000, pingTimeout: 20_000 });

  const rooms = new RoomManager({
    onChange(room) {
      for (const p of room.players.values()) {
        if (p.socketId) io.to(p.socketId).emit('room:state', rooms.viewFor(room, p.id));
      }
    },
  });

  app.use(express.static(path.join(root, 'public'), { extensions: ['html'], maxAge: 0 }));
  app.use('/shared', express.static(path.join(root, 'shared'), { maxAge: 0 }));
  // ملف إثبات ملكية الموقع لتطبيق أندرويد (يُنشئه PWABuilder). ضعه في public/.well-known/assetlinks.json
  app.get('/.well-known/assetlinks.json', (_req, res) => {
    res.sendFile(path.join(root, 'public', '.well-known', 'assetlinks.json'), (err) => {
      if (err && !res.headersSent) res.status(404).json([]);
    });
  });
  app.get('/sw.js', (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(root, 'public', 'sw.js'));
  });
  app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.rooms.size }));
  const sendIndex = (_req, res) => res.sendFile(path.join(root, 'public', 'index.html'));
  app.get(['/', '/create', '/join', '/r/:code'], sendIndex);
  app.use((_req, res) => res.status(404).sendFile(path.join(root, 'public', 'index.html')));

  io.on('connection', (socket) => {
    // كل اتصال مرتبط بلاعب واحد في غرفة واحدة كحد أقصى
    let session = null; // { code, playerId }

    // تحديد بسيط لعدد الطلبات لمنع الإغراق
    let bucket = 0;
    const refill = setInterval(() => { bucket = 0; }, 1000);
    const limited = () => ++bucket > 25;

    const bind = (res) => {
      if (!res.ok) return res;
      if (session && (session.code !== res.room.code || session.playerId !== res.player.id)) {
        rooms.disconnect(session.code, session.playerId);
      }
      // لو كان اللاعب متصلًا من تبويب آخر، نفصل الاتصال القديم
      if (res.player.socketId && res.player.socketId !== socket.id) {
        io.sockets.sockets.get(res.player.socketId)?.emit('session:replaced');
      }
      res.player.socketId = socket.id;
      session = { code: res.room.code, playerId: res.player.id };
      socket.emit('room:state', rooms.viewFor(res.room, res.player.id));
      return { ok: true, code: res.room.code, token: res.player.token, playerId: res.player.id };
    };

    const handle = (event, fn) => {
      socket.on(event, (payload, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        if (limited()) return reply({ ok: false, error: 'rate_limited' });
        try {
          reply(fn(payload || {}) || { ok: true });
        } catch (err) {
          console.error(`[${event}]`, err);
          reply({ ok: false, error: 'server_error' });
        }
      });
    };

    const needSession = (fn) => (payload) => {
      if (!session) return { ok: false, error: 'not_in_room' };
      const player = rooms.rooms.get(session.code)?.players.get(session.playerId);
      if (!player) { session = null; return { ok: false, error: 'not_in_room' }; }
      if (player.socketId !== socket.id) return { ok: false, error: 'session_replaced' };
      return fn(payload);
    };

    handle('room:create', (p) => bind(rooms.create({ nickname: p.nickname, maxPlayers: p.maxPlayers })));
    handle('room:peek', (p) => rooms.peek(p.code));
    handle('room:join', (p) => bind(rooms.join(p.code, p.nickname)));
    handle('room:resume', (p) => bind(rooms.resume(p.code, p.token)));
    handle('room:leave', needSession(() => {
      rooms.leave(session.code, session.playerId);
      session = null;
      return { ok: true };
    }));
    handle('room:selectGame', needSession((p) => rooms.selectGame(session.code, session.playerId, p.gameId)));
    handle('game:start', needSession(() => rooms.start(session.code, session.playerId)));
    handle('game:action', needSession((p) => rooms.action(session.code, session.playerId, p)));
    handle('room:lobby', needSession(() => rooms.backToLobby(session.code, session.playerId)));

    socket.on('disconnect', () => {
      clearInterval(refill);
      if (!session) return;
      const room = rooms.rooms.get(session.code);
      const player = room?.players.get(session.playerId);
      // لا نعتبره منقطعًا إذا كان قد انتقل لاتصال أحدث
      if (player && player.socketId === socket.id) rooms.disconnect(session.code, session.playerId);
    });
  });

  const sweeper = setInterval(() => rooms.sweep(), 5000);
  server.on('close', () => clearInterval(sweeper));

  return { app, server, io, rooms, normalizeCode };
}

// تشغيل مباشر: node server/index.js
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server } = createServer();
  const port = Number(process.env.PORT) || 3000;
  server.listen(port, () => console.log(`Game Night يعمل على http://localhost:${port}`));
}
