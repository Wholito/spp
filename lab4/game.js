const crypto = require('crypto');

const SIZE = 10;
const FLEET = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];

const emptyGrid = () => {
  const grid = [];
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      grid.push({ id: `${x}:${y}`, x, y, shipId: null, shot: null, version: 0 });
    }
  }
  return grid;
};

const createRoom = (code, now) => ({
  code,
  game: 'sea',
  version: 0,
  createdAt: now,
  phase: 'place',
  turn: null,
  winnerId: null,
  banner: { text: '', version: 0 },
  players: [],
  log: [],
  applied: [],
});

const cleanName = (value) => {
  const name = String(value || '').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 16) return '';
  if (/[<>]/.test(name)) return '';
  return name;
};

const pushLog = (room, text, now) => {
  room.log.push({ text, at: now });
  if (room.log.length > 30) room.log.shift();
};

const addPlayer = (room, name, now) => {
  if (room.players.length >= 2) return { ok: false, code: 'ROOM_FULL' };
  const player = {
    id: crypto.randomBytes(8).toString('hex'),
    token: crypto.randomBytes(24).toString('hex'),
    name,
    connected: true,
    ready: false,
    score: 0,
    fleetVersion: 0,
    ships: [],
    grid: emptyGrid(),
    joinedAt: now,
  };
  room.players.push(player);
  pushLog(room, `${name} в игре`, now);
  return { ok: true, player };
};

const foeOf = (room, playerId) => room.players.find((item) => item.id !== playerId) || null;

const lengthsLeft = (player) => {
  const left = FLEET.slice();
  for (const ship of player.ships) {
    const index = left.indexOf(ship.length);
    if (index >= 0) left.splice(index, 1);
  }
  return left;
};

const blockedCells = (ships) => {
  const blocked = new Set();
  for (const ship of ships) {
    for (const id of ship.cells) {
      const [x, y] = id.split(':').map(Number);
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          blocked.add(`${x + dx}:${y + dy}`);
        }
      }
    }
  }
  return blocked;
};

const footprint = (ships, x, y, length, dir) => {
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(length)) return null;
  if (dir !== 'h' && dir !== 'v') return null;
  const cells = [];
  for (let step = 0; step < length; step += 1) {
    const cx = dir === 'h' ? x + step : x;
    const cy = dir === 'v' ? y + step : y;
    if (cx < 0 || cy < 0 || cx >= SIZE || cy >= SIZE) return null;
    cells.push(`${cx}:${cy}`);
  }
  const blocked = blockedCells(ships);
  if (cells.some((id) => blocked.has(id))) return null;
  return cells;
};

const paintShips = (player) => {
  for (const cell of player.grid) cell.shipId = null;
  for (const ship of player.ships) {
    for (const id of ship.cells) {
      const cell = player.grid.find((item) => item.id === id);
      if (cell) cell.shipId = ship.id;
    }
  }
};

const clearFleet = (player) => {
  player.ships = [];
  player.ready = false;
  player.fleetVersion = 0;
  for (const cell of player.grid) {
    cell.shipId = null;
    cell.shot = null;
    cell.version = 0;
  }
};

const remember = (room, action, result) => {
  if (action.actionId && (result.ok || result.conflict)) {
    room.applied.push({
      actionId: action.actionId,
      ok: Boolean(result.ok),
      conflict: Boolean(result.conflict),
      code: result.code || null,
      resolution: result.resolution || null,
    });
    if (room.applied.length > 200) room.applied.splice(0, room.applied.length - 200);
  }
  return result;
};

const shipAlive = (player, ship) => ship.cells.some((id) => {
  const cell = player.grid.find((item) => item.id === id);
  return !cell || (cell.shot !== 'hit' && cell.shot !== 'sunk');
});

const settleShot = (player, cell) => {
  const ship = player.ships.find((item) => item.id === cell.shipId);
  if (!ship) {
    cell.shot = 'miss';
    return 'miss';
  }
  cell.shot = 'hit';
  if (shipAlive(player, ship)) return 'hit';
  for (const id of ship.cells) {
    const part = player.grid.find((item) => item.id === id);
    if (part) part.shot = 'sunk';
  }
  ship.alive = false;
  return 'sunk';
};

const allSunk = (player) => player.ships.length > 0 && player.ships.every((ship) => ship.alive === false);

const buildRandomFleet = () => {
  for (let layout = 0; layout < 40; layout += 1) {
    const ships = [];
    let failed = false;
    for (const length of FLEET) {
      let cells = null;
      for (let attempt = 0; attempt < 100 && !cells; attempt += 1) {
        const dir = Math.random() < 0.5 ? 'h' : 'v';
        const x = Math.floor(Math.random() * SIZE);
        const y = Math.floor(Math.random() * SIZE);
        cells = footprint(ships, x, y, length, dir);
      }
      if (!cells) {
        failed = true;
        break;
      }
      ships.push({
        id: crypto.randomBytes(4).toString('hex'),
        length,
        cells,
        alive: true,
      });
    }
    if (!failed) return ships;
  }
  return null;
};

const applyAction = (room, playerId, action, now) => {
  if (!action || typeof action.actionId !== 'string' || action.actionId.length < 8 || action.actionId.length > 80) {
    return { ok: false, code: 'BAD_ACTION' };
  }

  const known = room.applied.find((item) => item.actionId === action.actionId);
  if (known) return { ...known, duplicate: true };

  const player = room.players.find((item) => item.id === playerId);
  if (!player) return { ok: false, code: 'NO_PLAYER' };
  if (!Number.isInteger(action.expectedVersion) || action.expectedVersion < 0) {
    return { ok: false, code: 'BAD_VERSION' };
  }

  if (action.op === 'banner') {
    const text = String(action.text || '').replace(/\s+/g, ' ').trim();
    if (!text || text.length > 80) return { ok: false, code: 'BAD_TEXT' };
    if (room.banner.version !== action.expectedVersion) {
      return remember(room, action, {
        ok: false,
        conflict: true,
        code: 'CONFLICT',
        resolution: 'choose',
        current: { text: room.banner.text, version: room.banner.version },
      });
    }
    room.banner.text = text;
    room.banner.version += 1;
    room.version += 1;
    pushLog(room, `${player.name} меняет позывной`, now);
    return remember(room, action, { ok: true });
  }

  if (action.op === 'again') {
    if (room.phase !== 'over') return { ok: false, code: 'NOT_OVER' };
    if (room.version !== action.expectedVersion) {
      return remember(room, action, {
        ok: false,
        conflict: true,
        code: 'CONFLICT',
        resolution: 'keep-first',
      });
    }
    for (const item of room.players) clearFleet(item);
    room.phase = 'place';
    room.turn = null;
    room.winnerId = null;
    room.version += 1;
    pushLog(room, `${player.name} начинает новую партию`, now);
    return remember(room, action, { ok: true });
  }

  if (action.op === 'place' || action.op === 'unplace' || action.op === 'random' || action.op === 'ready' || action.op === 'unready') {
    if (room.phase !== 'place') return { ok: false, code: 'NOT_PLACE' };
    if (player.fleetVersion !== action.expectedVersion) {
      return remember(room, action, {
        ok: false,
        conflict: true,
        code: 'CONFLICT',
        resolution: 'keep-first',
      });
    }

    if (action.op === 'unready') {
      if (!player.ready) return { ok: false, code: 'NOT_READY' };
      player.ready = false;
      player.fleetVersion += 1;
      room.version += 1;
      pushLog(room, `${player.name} меняет расстановку`, now);
      return remember(room, action, { ok: true });
    }

    if (player.ready) return { ok: false, code: 'ALREADY_READY' };

    if (action.op === 'unplace') {
      const ship = player.ships.pop();
      if (!ship) return { ok: false, code: 'EMPTY_FLEET' };
      paintShips(player);
      player.fleetVersion += 1;
      room.version += 1;
      pushLog(room, `${player.name} убирает корабль`, now);
      return remember(room, action, { ok: true });
    }

    if (action.op === 'random') {
      const ships = buildRandomFleet();
      if (!ships) return { ok: false, code: 'BAD_PLACE' };
      player.ships = ships;
      paintShips(player);
      player.fleetVersion += 1;
      room.version += 1;
      pushLog(room, `${player.name} расставляет флот`, now);
      return remember(room, action, { ok: true });
    }

    if (action.op === 'ready') {
      if (lengthsLeft(player).length) return { ok: false, code: 'NEED_SHIPS' };
      player.ready = true;
      player.fleetVersion += 1;
      room.version += 1;
      const both = room.players.length === 2 && room.players.every((item) => item.ready);
      if (both) {
        room.phase = 'battle';
        room.turn = room.players[0].id;
        pushLog(room, 'Оба флота в море', now);
      } else {
        pushLog(room, `${player.name} готов к бою`, now);
      }
      return remember(room, action, { ok: true });
    }

    const next = lengthsLeft(player)[0];
    const cells = footprint(player.ships, action.x, action.y, next, action.dir);
    if (!next || !cells) return { ok: false, code: 'BAD_PLACE' };
    player.ships.push({
      id: crypto.randomBytes(4).toString('hex'),
      length: next,
      cells,
      alive: true,
    });
    paintShips(player);
    player.fleetVersion += 1;
    room.version += 1;
    pushLog(room, `${player.name} ставит корабль на ${next}`, now);
    return remember(room, action, { ok: true });
  }

  if (action.op !== 'shot') return { ok: false, code: 'BAD_OP' };

  const foe = foeOf(room, playerId);
  const cell = foe && foe.grid.find((item) => item.id === action.cellId);
  if (!cell) return { ok: false, code: 'NO_CELL' };
  if (cell.version !== action.expectedVersion) {
    return remember(room, action, {
      ok: false,
      conflict: true,
      code: 'CONFLICT',
      resolution: 'keep-first',
    });
  }
  if (room.phase !== 'battle') return { ok: false, code: 'NOT_BATTLE' };
  if (room.turn !== playerId) return { ok: false, code: 'NOT_TURN' };
  if (cell.shot) return { ok: false, code: 'TAKEN' };

  const result = settleShot(foe, cell);
  cell.version += 1;
  room.version += 1;
  if (result === 'miss') {
    room.turn = foe.id;
    pushLog(room, `${player.name}: мимо`, now);
  } else if (result === 'hit') {
    pushLog(room, `${player.name}: попадание`, now);
  } else if (allSunk(foe)) {
    room.phase = 'over';
    room.turn = null;
    room.winnerId = playerId;
    player.score += 1;
    pushLog(room, `${player.name} побеждает`, now);
  } else {
    pushLog(room, `${player.name}: корабль потоплен`, now);
  }
  return remember(room, action, { ok: true, result });
};

const viewCell = (cell, showShip) => ({
  id: cell.id,
  x: cell.x,
  y: cell.y,
  version: cell.version,
  shot: cell.shot,
  ship: Boolean(showShip && cell.shipId),
});

const publicRoom = (room, viewerId) => {
  const self = room.players.find((item) => item.id === viewerId) || null;
  const foe = self ? foeOf(room, viewerId) : room.players[0] || null;
  const sunkIds = new Set();
  if (foe) {
    for (const ship of foe.ships) {
      if (ship.alive === false) ship.cells.forEach((id) => sunkIds.add(id));
    }
  }

  return {
    code: room.code,
    game: room.game,
    version: room.version,
    phase: room.phase,
    turn: room.turn,
    winnerId: room.winnerId,
    banner: { text: room.banner.text, version: room.banner.version },
    you: viewerId,
    nextShip: self ? lengthsLeft(self)[0] || null : null,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      connected: player.connected,
      ready: player.ready,
      score: player.score,
      self: player.id === viewerId,
      shipsLeft: player.ships.filter((ship) => ship.alive !== false).length,
    })),
    own: self
      ? {
          fleetVersion: self.fleetVersion,
          ready: self.ready,
          cells: self.grid.map((cell) => viewCell(cell, true)),
        }
      : null,
    enemy: foe
      ? {
          id: foe.id,
          name: foe.name,
          cells: foe.grid.map((cell) => viewCell(cell, cell.shot === 'hit' || cell.shot === 'sunk' || sunkIds.has(cell.id))),
        }
      : null,
    log: room.log.slice(-12),
  };
};

module.exports = {
  SIZE,
  FLEET,
  createRoom,
  cleanName,
  addPlayer,
  applyAction,
  publicRoom,
  footprint,
};
