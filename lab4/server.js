const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { createStore } = require('./store');
const { createRoom, cleanName, addPlayer, applyAction, publicRoom } = require('./game');

const PORT = Number(process.env.PORT || 8090);
const publicDir = path.join(__dirname, 'public');
const store = createStore(process.env.DATA_FILE || path.join(__dirname, 'data', 'state.json'));
const loaded = store.load();

const world = {
  rooms: (loaded.rooms || []).filter(
    (room) =>
      room &&
      room.game === 'sea' &&
      room.code &&
      Array.isArray(room.players) &&
      room.players.every((player) => Array.isArray(player.grid))
  ),
};

for (const room of world.rooms) {
  room.applied = Array.isArray(room.applied) ? room.applied.slice(-200) : [];
  room.log = Array.isArray(room.log) ? room.log.slice(-30) : [];
  room.banner = room.banner && typeof room.banner.text === 'string' ? room.banner : { text: '', version: 0 };
  for (const player of room.players) player.connected = false;
}

const tokens = new Map();
const sockets = new Map();

const indexTokens = () => {
  tokens.clear();
  for (const room of world.rooms) {
    for (const player of room.players) {
      tokens.set(player.token, { code: room.code, playerId: player.id });
    }
  }
};

indexTokens();

const log = (msg, fields = {}) => {
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), service: 'lab4', msg, ...fields })}\n`);
};

const persist = () => {
  store.save({ rooms: world.rooms });
};

const findRoom = (code) => world.rooms.find((room) => room.code === code) || null;

const roomSockets = (code) => {
  if (!sockets.has(code)) sockets.set(code, new Set());
  return sockets.get(code);
};

const send = (socket, payload) => {
  if (socket.readyState === 1) socket.send(JSON.stringify(payload));
};

const sendState = (room, except) => {
  for (const socket of roomSockets(room.code)) {
    if (socket === except) continue;
    send(socket, { type: 'state', room: publicRoom(room, socket.playerId) });
  }
};

const detach = (socket, announce = true) => {
  if (!socket.roomCode) return;
  const code = socket.roomCode;
  const room = findRoom(code);
  roomSockets(code).delete(socket);
  if (room) {
    const player = room.players.find((item) => item.id === socket.playerId);
    const still = [...roomSockets(code)].some((item) => item.playerId === socket.playerId);
    if (player && !still) player.connected = false;
    if (announce) sendState(room);
  }
  socket.roomCode = null;
  socket.playerId = null;
  persist();
};

const attach = (socket, room, player) => {
  if (socket.roomCode && socket.roomCode !== room.code) detach(socket, true);
  else if (socket.roomCode === room.code) roomSockets(room.code).delete(socket);
  socket.roomCode = room.code;
  socket.playerId = player.id;
  player.connected = true;
  roomSockets(room.code).add(socket);
};

const makeCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let code = '';
    for (let index = 0; index < 4; index += 1) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    if (!findRoom(code)) return code;
  }
  return `R${Date.now().toString(36).toUpperCase().slice(-4)}`;
};

const trimRooms = () => {
  if (world.rooms.length <= 30) return;
  const idle = world.rooms.filter((room) => roomSockets(room.code).size === 0);
  while (world.rooms.length > 30 && idle.length) {
    const room = idle.shift();
    const index = world.rooms.indexOf(room);
    if (index >= 0) world.rooms.splice(index, 1);
    for (const player of room.players) tokens.delete(player.token);
  }
};

const welcome = (socket, room, player) => {
  send(socket, {
    type: 'welcome',
    token: player.token,
    playerId: player.id,
    room: publicRoom(room, player.id),
  });
  sendState(room, socket);
};

const handle = (socket, msg) => {
  if (!msg || typeof msg !== 'object') {
    send(socket, { type: 'error', code: 'BAD_JSON' });
    return;
  }

  if (msg.type === 'ping') {
    send(socket, { type: 'pong' });
    return;
  }

  if (msg.type === 'hello') {
    const link = tokens.get(msg.token);
    const room = link ? findRoom(link.code) : null;
    const player = room && room.players.find((item) => item.id === link.playerId);
    if (!room || !player) {
      send(socket, { type: 'error', code: 'UNKNOWN_TOKEN' });
      return;
    }
    attach(socket, room, player);
    persist();
    welcome(socket, room, player);
    return;
  }

  if (msg.type === 'create') {
    const name = cleanName(msg.name);
    if (!name) {
      send(socket, { type: 'error', code: 'BAD_NAME' });
      return;
    }
    const now = Date.now();
    const room = createRoom(makeCode(), now);
    const added = addPlayer(room, name, now);
    world.rooms.push(room);
    tokens.set(added.player.token, { code: room.code, playerId: added.player.id });
    trimRooms();
    attach(socket, room, added.player);
    persist();
    welcome(socket, room, added.player);
    return;
  }

  if (msg.type === 'join') {
    const name = cleanName(msg.name);
    const code = String(msg.code || '').trim().toUpperCase();
    if (!name) {
      send(socket, { type: 'error', code: 'BAD_NAME' });
      return;
    }
    const room = findRoom(code);
    if (!room) {
      send(socket, { type: 'error', code: 'NO_ROOM' });
      return;
    }
    const added = addPlayer(room, name, Date.now());
    if (!added.ok) {
      send(socket, { type: 'error', code: added.code });
      return;
    }
    tokens.set(added.player.token, { code: room.code, playerId: added.player.id });
    attach(socket, room, added.player);
    persist();
    welcome(socket, room, added.player);
    return;
  }

  if (msg.type === 'sync') {
    const room = socket.roomCode ? findRoom(socket.roomCode) : null;
    if (!room) {
      send(socket, { type: 'error', code: 'NO_ROOM' });
      return;
    }
    send(socket, { type: 'state', room: publicRoom(room, socket.playerId) });
    return;
  }

  if (msg.type === 'action') {
    const room = socket.roomCode ? findRoom(socket.roomCode) : null;
    if (!room || !socket.playerId) {
      send(socket, { type: 'error', code: 'NO_ROOM' });
      return;
    }
    const result = applyAction(room, socket.playerId, msg, Date.now());
    if (result.ok || result.conflict) persist();
    send(socket, {
      type: 'ack',
      actionId: msg.actionId,
      ok: Boolean(result.ok),
      conflict: Boolean(result.conflict),
      duplicate: Boolean(result.duplicate),
      code: result.code || null,
      resolution: result.resolution || null,
      current: msg.op === 'banner' ? { text: room.banner.text, version: room.banner.version } : null,
      room: publicRoom(room, socket.playerId),
    });
    if (result.ok && !result.duplicate) sendState(room, socket);
    return;
  }

  send(socket, { type: 'error', code: 'BAD_TYPE' });
};

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const root = path.resolve(publicDir);
  const file = path.resolve(root, relativePath);
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(file);
  if (!types[ext]) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': types[ext], 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, maxPayload: 32 * 1024 });

wss.on('connection', (socket) => {
  socket.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(socket, { type: 'error', code: 'BAD_JSON' });
      return;
    }
    try {
      handle(socket, msg);
    } catch (err) {
      log('message_failed', { message: err.message });
      send(socket, { type: 'error', code: 'INTERNAL' });
    }
  });
  socket.on('close', () => detach(socket));
  socket.on('error', () => {});
});

setInterval(() => {
  const now = Date.now();
  for (const room of world.rooms) {
    const group = roomSockets(room.code);
    if (!group.size) continue;
    for (const socket of group) {
      send(socket, {
        type: 'tick',
        version: room.version,
        players: publicRoom(room, socket.playerId).players,
      });
    }
  }
}, 2000).unref();

server.listen(PORT, '0.0.0.0', () => {
  log('server_started', { port: PORT, rooms: world.rooms.length });
});

const shutdown = () => {
  persist();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
