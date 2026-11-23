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

module.exports = { SIZE, FLEET, emptyGrid, lengthsLeft, footprint, paintShips, clearFleet, buildRandomFleet };
