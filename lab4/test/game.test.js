const test = require('node:test');
const assert = require('node:assert/strict');
const { createRoom, addPlayer, applyAction, publicRoom } = require('../game');

const now = 1_700_000_000_000;

const fill = (room, playerId) => {
  const player = room.players.find((item) => item.id === playerId);
  assert.equal(
    applyAction(room, playerId, { actionId: `random-${playerId}`, op: 'random', expectedVersion: player.fleetVersion }, now).ok,
    true
  );
  assert.equal(
    applyAction(room, playerId, { actionId: `ready-${playerId}`, op: 'ready', expectedVersion: player.fleetVersion }, now).ok,
    true
  );
};

test('the first shot into one cell is kept', () => {
  const room = createRoom('ABCD', now);
  const first = addPlayer(room, 'Аня', now);
  const second = addPlayer(room, 'Борис', now);
  fill(room, first.player.id);
  fill(room, second.player.id);
  const cell = second.player.grid[0];
  const ok = applyAction(
    room,
    first.player.id,
    { actionId: 'shot-first', op: 'shot', cellId: cell.id, expectedVersion: 0 },
    now
  );
  const conflict = applyAction(
    room,
    first.player.id,
    { actionId: 'shot-second', op: 'shot', cellId: cell.id, expectedVersion: 0 },
    now
  );

  assert.equal(ok.ok, true);
  assert.equal(conflict.conflict, true);
  assert.equal(conflict.resolution, 'keep-first');
  assert.equal(cell.version, 1);
});

test('a repeated call sign asks for a choice and can then be overwritten', () => {
  const room = createRoom('ABCD', now);
  const first = addPlayer(room, 'Аня', now);
  const second = addPlayer(room, 'Борис', now);
  assert.equal(
    applyAction(room, first.player.id, { actionId: 'banner-a', op: 'banner', text: 'Северный флот', expectedVersion: 0 }, now).ok,
    true
  );
  const conflict = applyAction(
    room,
    second.player.id,
    { actionId: 'banner-b', op: 'banner', text: 'Южный флот', expectedVersion: 0 },
    now
  );
  assert.equal(conflict.conflict, true);
  assert.equal(conflict.resolution, 'choose');
  assert.equal(room.banner.text, 'Северный флот');

  const overwrite = applyAction(
    room,
    second.player.id,
    { actionId: 'banner-c', op: 'banner', text: 'Южный флот', expectedVersion: conflict.current.version },
    now
  );
  assert.equal(overwrite.ok, true);
  assert.equal(room.banner.text, 'Южный флот');
});

test('ships stay hidden until they sink, and a full fleet win is saved once', () => {
  const room = createRoom('ABCD', now);
  const first = addPlayer(room, 'Аня', now);
  const second = addPlayer(room, 'Борис', now);

  assert.equal(
    applyAction(room, first.player.id, { actionId: 'place-ship', op: 'place', x: 0, y: 0, dir: 'h', expectedVersion: 0 }, now).ok,
    true
  );
  assert.equal(
    applyAction(room, first.player.id, { actionId: 'place-touch', op: 'place', x: 0, y: 1, dir: 'h', expectedVersion: 1 }, now).code,
    'BAD_PLACE'
  );

  fill(room, first.player.id);
  fill(room, second.player.id);
  assert.equal(room.phase, 'battle');
  assert.equal(room.turn, first.player.id);

  const hidden = publicRoom(room, second.player.id);
  assert.equal(JSON.stringify(hidden).includes(first.player.token), false);
  assert.equal(hidden.enemy.cells.some((cell) => cell.ship), false);

  for (const ship of second.player.ships) {
    for (const id of ship.cells) {
      const cell = second.player.grid.find((item) => item.id === id);
      const shot = applyAction(
        room,
        first.player.id,
        { actionId: `sink-${id}-go`, op: 'shot', cellId: id, expectedVersion: cell.version },
        now
      );
      assert.equal(shot.ok, true);
    }
  }

  assert.equal(room.phase, 'over');
  assert.equal(room.winnerId, first.player.id);
  assert.equal(first.player.score, 1);

  const last = second.player.ships[0].cells[0];
  const again = applyAction(
    room,
    first.player.id,
    { actionId: `sink-${last}-go`, op: 'shot', cellId: last, expectedVersion: 1 },
    now
  );
  assert.equal(again.duplicate, true);

  const revealed = publicRoom(room, first.player.id);
  assert.equal(revealed.enemy.cells.filter((cell) => cell.ship).length, 20);
});
