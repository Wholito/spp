const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { WebSocket } = require('ws');
const { createRoom, addPlayer, applyAction } = require('../game');

const freePort = async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
};

const connect = async (port) => {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  const messages = [];
  const waiting = new Set();
  socket.on('message', (raw) => {
    const message = JSON.parse(raw);
    const waiter = [...waiting].find((item) => item.match(message));
    if (waiter) { waiting.delete(waiter); clearTimeout(waiter.timer); waiter.resolve(message); }
    else messages.push(message);
  });
  await once(socket, 'open');
  return {
    socket,
    send(message) { socket.send(JSON.stringify(message)); },
    next(match) {
      const index = messages.findIndex(match);
      if (index >= 0) return Promise.resolve(messages.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const item = { match, resolve, timer: setTimeout(() => { waiting.delete(item); reject(new Error('WebSocket response timeout')); }, 5000) };
        waiting.add(item);
      });
    },
    async close() { if (socket.readyState === WebSocket.CLOSED) return; const closed = once(socket, 'close'); socket.close(); await closed; },
  };
};

test('features over WebSocket: запись продолжается после перезапуска и доступна после реванша', { timeout: 30000 }, async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lab4-features-'));
  const file = path.join(dir, 'state.json');
  const port = await freePort();
  const room = createRoom('LIVE', 1000);
  const first = addPlayer(room, 'Аня', 1000).player;
  const second = addPlayer(room, 'Борис', 1000).player;
  let count = 0;
  for (const player of [first, second]) for (const op of ['random', 'ready']) applyAction(room, player.id, { actionId: `prepare-${++count}`, op, expectedVersion: player.fleetVersion }, 1000);
  await fs.writeFile(file, JSON.stringify({ rooms: [room] }));
  let child;
  const clients = [];
  const stop = async () => {
    if (child && child.exitCode === null && child.signalCode === null) { const ended = once(child, 'exit'); child.kill(); await ended; }
  };
  t.after(async () => {
    for (const client of clients) await client.close();
    await stop();
    await fs.rm(dir, { recursive: true, force: true });
  });
  const start = async () => {
    child = spawn(process.execPath, ['server.js'], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, PORT: String(port), DATA_FILE: file, DATABASE_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server start timeout')), 5000);
      child.stdout.on('data', (chunk) => { if (chunk.toString().includes('server_started')) { clearTimeout(timer); resolve(); } });
      child.once('error', reject);
      child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
    });
  };
  await start();
  const client = await connect(port);
  clients.push(client);
  client.send({ type: 'replay', replayId: room.battle.id, requestId: 'unauthorized' });
  assert.equal((await client.next((message) => message.requestId === 'unauthorized')).replay, null);
  client.send({ type: 'hello', token: first.token });
  const welcome = await client.next((message) => message.type === 'welcome');
  assert.equal(welcome.room.enemy.cells.some((cell) => cell.ship), false);
  client.send({ type: 'replay', replayId: room.battle.id, requestId: 'unfinished' });
  assert.equal((await client.next((message) => message.requestId === 'unfinished')).replay, null);
  const targets = second.ships.flatMap((ship) => ship.cells);
  const shoot = async (connection, cellId) => {
    const actionId = `live-shot-${cellId}`;
    connection.send({ type: 'action', op: 'shot', actionId, cellId, expectedVersion: 0 });
    const ack = await connection.next((message) => message.type === 'ack' && message.actionId === actionId);
    assert.equal(ack.ok, true);
    return ack.room;
  };
  await shoot(client, targets[0]);
  await client.close();
  await stop();
  await start();
  const restored = await connect(port);
  clients.push(restored);
  restored.send({ type: 'hello', token: first.token });
  assert.equal((await restored.next((message) => message.type === 'welcome')).room.phase, 'battle');
  let view;
  for (const id of targets.slice(1)) view = await shoot(restored, id);
  assert.equal(view.phase, 'over');
  const replayId = view.replays[0].id;
  restored.send({ type: 'replay', replayId, requestId: 'finished' });
  const result = await restored.next((message) => message.requestId === 'finished');
  assert.equal(result.replay.shots.length, 20);
  assert.equal(result.replay.winnerId, first.id);
  assert.equal(JSON.stringify(result).includes(second.token), false);
  restored.send({ type: 'action', op: 'again', actionId: 'live-rematch', expectedVersion: view.version });
  const rematch = await restored.next((message) => message.type === 'ack' && message.actionId === 'live-rematch');
  assert.equal(rematch.room.phase, 'place');
  assert.equal(rematch.room.replays[0].id, replayId);
  restored.send({ type: 'replay', replayId, requestId: 'after-rematch' });
  assert.equal((await restored.next((message) => message.requestId === 'after-rematch')).replay.shots.length, 20);
});
