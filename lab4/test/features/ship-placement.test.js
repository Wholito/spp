const test = require('node:test');
const assert = require('node:assert/strict');
const { createRoom, addPlayer, applyAction, publicRoom } = require('../../game');
const { previewPlacement, applyLocalPlacement } = require('../../public/features/ship-placement/placement-model');

const setup = () => {
  const room = createRoom('TEST', 1000);
  const { player } = addPlayer(room, 'Капитан', 1000);
  let count = 0;
  const act = (action) => applyAction(room, player.id, { actionId: `placement-${++count}`, expectedVersion: player.fleetVersion, ...action }, 1000 + count);
  return { room, player, act };
};

test('placement: можно выбрать размер корабля, квоты флота остаются обязательными', () => {
  const { player, act } = setup();
  assert.equal(act({ op: 'place', length: 1, x: 0, y: 0, dir: 'h' }).ok, true);
  assert.equal(player.ships[0].length, 1);
  assert.equal(act({ op: 'place', length: 4, x: 0, y: 3, dir: 'h' }).ok, true);
  assert.equal(act({ op: 'place', length: 4, x: 0, y: 6, dir: 'h' }).code, 'BAD_PLACE');
  assert.equal(act({ op: 'place', length: 5, x: 0, y: 8, dir: 'h' }).code, 'BAD_PLACE');
  assert.equal(player.ships.length, 2);
});

test('placement: перенос сохраняет ID, поворот проверяет границы, соседство и чужие ID', () => {
  const { player, act } = setup();
  act({ op: 'place', x: 0, y: 0, dir: 'h' });
  const ship = player.ships[0];
  assert.equal(act({ op: 'move', shipId: ship.id, x: 6, y: 2, dir: 'v' }).ok, true);
  assert.deepEqual(ship.cells, ['6:2', '6:3', '6:4', '6:5']);
  assert.equal(player.grid.find((cell) => cell.id === '0:0').shipId, null);
  assert.equal(player.grid.find((cell) => cell.id === '6:2').shipId, ship.id);
  const snapshot = structuredClone(player.ships);
  assert.equal(act({ op: 'move', shipId: ship.id, x: 9, y: 9, dir: 'h' }).code, 'BAD_PLACE');
  assert.deepEqual(player.ships, snapshot);
  act({ op: 'place', length: 1, x: 0, y: 0, dir: 'h' });
  assert.equal(act({ op: 'move', shipId: ship.id, x: 1, y: 1, dir: 'v' }).code, 'BAD_PLACE');
  assert.equal(act({ op: 'move', shipId: 'foreign-id', x: 2, y: 2, dir: 'h' }).code, 'NO_SHIP');
});

test('placement: конфликт версий и готовность не позволяют менять принятую расстановку', () => {
  const { room, player, act } = setup();
  act({ op: 'place', x: 0, y: 0, dir: 'h' });
  const ship = player.ships[0];
  assert.equal(act({ op: 'move', shipId: ship.id, x: 2, y: 2, dir: 'h', expectedVersion: 0 }).conflict, true);
  act({ op: 'random' });
  act({ op: 'ready' });
  assert.equal(act({ op: 'move', shipId: player.ships[0].id, x: 2, y: 2, dir: 'h' }).code, 'ALREADY_READY');
  room.phase = 'battle';
  assert.equal(act({ op: 'move', shipId: ship.id, x: 2, y: 2, dir: 'h' }).code, 'NOT_PLACE');
});

test('placement: предпросмотр учитывает собственный корабль и запрещает касание по диагонали', () => {
  const ships = [{ id: 'a', length: 2, cells: ['0:0', '1:0'] }, { id: 'b', length: 1, cells: ['4:4'] }];
  assert.equal(previewPlacement(ships, 0, 0, 2, 'v', 'a').valid, true);
  assert.equal(previewPlacement(ships, 3, 3, 2, 'h', 'a').valid, false);
  assert.equal(previewPlacement(ships, 9, 9, 2, 'h', 'a').valid, false);
});

test('placement: офлайн-расстановка и перенос используют те же ID, что и сервер', () => {
  const { room, player } = setup();
  const local = publicRoom(room, player.id);
  const place = { op: 'place', actionId: 'offline-place', expectedVersion: 0, length: 3, x: 0, y: 0, dir: 'h' };
  assert.equal(applyLocalPlacement(place, local), true);
  assert.equal(applyAction(room, player.id, place, 2000).ok, true);
  const id = local.own.ships[0].id;
  assert.equal(id, player.ships[0].id);
  const move = { op: 'move', actionId: 'offline-move', expectedVersion: 1, shipId: id, x: 5, y: 2, dir: 'v' };
  assert.equal(applyLocalPlacement(move, local), true);
  assert.equal(applyAction(room, player.id, move, 2001).ok, true);
  assert.deepEqual(local.own.ships[0].cells, player.ships[0].cells);
  assert.deepEqual(local.own.remaining, publicRoom(room, player.id).own.remaining);
});
