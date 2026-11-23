const test = require('node:test');
const assert = require('node:assert/strict');
const { createRoom, addPlayer, applyAction, publicRoom } = require('../../game');
const { getReplay, finishRecording, HISTORY_LIMIT } = require('../../features/battle-replay');
const { buildFrame } = require('../../public/features/battle-replay/replay-model');

const battle = () => {
  const room = createRoom('TEST', 1000);
  const first = addPlayer(room, 'Первый', 1000).player;
  const second = addPlayer(room, 'Второй', 1000).player;
  let count = 0;
  const act = (player, action) => applyAction(room, player.id, { actionId: `replay-action-${++count}`, expectedVersion: player.fleetVersion, ...action }, 1000 + count);
  for (const player of [first, second]) { act(player, { op: 'random' }); act(player, { op: 'ready' }); }
  const win = () => {
    for (const ship of second.ships) for (const id of ship.cells) act(first, { op: 'shot', cellId: id, expectedVersion: second.grid.find((cell) => cell.id === id).version });
    return getReplay(room, first.id, room.replays.at(-1).id);
  };
  return { room, first, second, act, win };
};

test('replay: активная запись и чужой флот не передаются до завершения', () => {
  const { room, first, second } = battle();
  assert.ok(room.battle);
  assert.equal(getReplay(room, first.id, room.battle.id), null);
  const view = publicRoom(room, first.id);
  assert.deepEqual(view.replays, []);
  assert.equal(view.battle, undefined);
  assert.equal(view.enemy.ships, undefined);
  assert.ok(view.enemy.cells.every((cell) => !cell.ship && cell.shipId === undefined));
  assert.ok(!JSON.stringify(view).includes(second.token));
});

test('replay: запись содержит только принятые ходы, повтор команды не дублирует выстрел', () => {
  const { room, first, second, act } = battle();
  const id = second.ships[0].cells[0];
  const action = { op: 'shot', actionId: 'unique-recorded-shot', cellId: id, expectedVersion: 0 };
  assert.equal(act(first, action).ok, true);
  assert.equal(act(first, action).duplicate, true);
  assert.equal(act(second, { op: 'shot', cellId: '9:9', expectedVersion: 0 }).code, 'NOT_TURN');
  assert.equal(room.battle.shots.length, 1);
});

test('replay: завершённый бой переживает реванш и просмотр не меняет комнату', () => {
  const { room, first, act, win } = battle();
  const replay = win();
  assert.equal(replay.shots.length, 20);
  assert.equal(replay.winnerId, first.id);
  assert.ok(replay.finishedAt);
  assert.ok(!JSON.stringify(replay).includes(first.token));
  assert.equal(getReplay(room, 'outsider', replay.id), null);
  const snapshot = structuredClone(room);
  buildFrame(replay, 5);
  buildFrame(replay, 20);
  assert.deepEqual(room, snapshot);
  act(first, { op: 'again', expectedVersion: room.version });
  assert.equal(room.phase, 'place');
  assert.equal(getReplay(room, first.id, replay.id).shots.length, 20);
  replay.players[0].name = 'Изменено локально';
  assert.equal(getReplay(room, first.id, replay.id).players[0].name, 'Первый');
});

test('replay: перемотка восстанавливает попадания и потопление на нужном ходе', () => {
  const replay = { players: [{ id: 'a', name: 'А', ships: [] }, { id: 'b', name: 'Б', ships: [{ id: 's', cells: ['0:0', '1:0'] }] }], shots: [{ playerId: 'a', targetId: 'b', cellId: '0:0', result: 'hit' }, { playerId: 'a', targetId: 'b', cellId: '1:0', result: 'sunk' }] };
  assert.ok(buildFrame(replay, 0).boards[1].cells.every((cell) => cell.shot === null));
  assert.equal(buildFrame(replay, 1).boards[1].cells[0].shot, 'hit');
  const end = buildFrame(replay, 2);
  assert.equal(end.boards[1].cells.filter((cell) => cell.shot === 'sunk').length, 2);
  assert.equal(end.boards[1].cells[1].last, true);
  assert.equal(buildFrame(replay, 1).boards[1].cells[1].shot, null);
  assert.equal(buildFrame(replay, -10).step, 0);
  assert.equal(buildFrame(replay, 999).step, 2);
});

test('replay: история ограничена десятью боями и поддерживает старые комнаты', () => {
  const room = { players: [{ id: 'a' }], winnerId: 'a' };
  assert.equal(getReplay(room, 'a', 'missing'), null);
  for (let i = 0; i < 12; i++) {
    room.battle = { id: String(i), players: [], shots: [] };
    finishRecording(room, 1000 + i);
  }
  assert.equal(room.replays.length, HISTORY_LIMIT);
  assert.equal(room.replays[0].id, '2');
});
