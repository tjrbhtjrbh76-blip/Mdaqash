import fs from 'fs';
import http from 'http';
import path from 'path';
import express from 'express';
import { Server } from 'socket.io';
import { RoomManager } from './rooms/RoomManager';
import { registerSocket } from './socket';

/**
 * نقطة دخول السيرفر:
 * - Socket.IO للعب الحقيقي Multiplayer
 * - Express لخدمة بناء الواجهة (client/dist) في الإنتاج
 */

const PORT = Number(process.env.PORT) || 3001;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true },
});

const manager = new RoomManager(io);

io.on('connection', (socket) => {
  registerSocket(socket, manager, io);
});

// نقطة فحص الصحة — قبل وسيط الواجهة حتى لا يعترضها
app.get('/health', (_req, res) => {
  res.json({ ok: true, rooms: manager.roomCount });
});

// خدمة الواجهة المبنية — المسار يختلف بين وضع التطوير (tsx) والإنتاج (dist)
const candidates = [
  path.resolve(__dirname, '../client/dist'), // الإنتاج: dist/index.js
  path.resolve(__dirname, '../../client/dist'), // التطوير: server/src/index.ts
];
const clientDist = candidates.find((p) => fs.existsSync(path.join(p, 'index.html')));

if (clientDist) {
  app.use(express.static(clientDist));
  // SPA fallback: أي مسار غير خاص بالسوكت يعيد index.html
  app.use((req, res, next) => {
    if (req.path.startsWith('/socket.io')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.send('مداقش API يعمل — شغّل واجهة التطوير عبر: npm run dev:client');
  });
}

server.listen(PORT, () => {
  console.log(`[mdaqash] listening on :${PORT}`);
});
