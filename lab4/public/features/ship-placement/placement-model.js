((root) => {
  const previewPlacement = (ships, x, y, length, dir, shipId) => {
    const cells = [];
    let valid = Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(length) && length > 0 && length <= 4 && (dir === 'h' || dir === 'v');
    if (!valid) return { cells, valid };
    for (let i = 0; i < length; i++) {
      const cx = x + (dir === 'h' ? i : 0);
      const cy = y + (dir === 'v' ? i : 0);
      if (cx < 0 || cy < 0 || cx >= 10 || cy >= 10) valid = false;
      else cells.push(`${cx}:${cy}`);
    }
    for (const ship of ships.filter((item) => item.id !== shipId)) {
      for (const occupied of ship.cells) {
        const [ox, oy] = occupied.split(':').map(Number);
        const touching = cells.some((id) => {
          const [cx, cy] = id.split(':').map(Number);
          return Math.abs(cx - ox) <= 1 && Math.abs(cy - oy) <= 1;
        });
        if (touching) valid = false;
      }
    }
    return { cells, valid };
  };

  const applyLocalPlacement = (action, room) => {
    const own = room.own;
    own.ships = own.ships || [];
    if (action.op === 'place' || action.op === 'move') {
      const moving = action.op === 'move';
      const ship = moving ? own.ships.find((item) => item.id === action.shipId) : null;
      const length = moving ? ship?.length : action.length ?? own.remaining?.[0];
      if (!length || moving && !ship) return false;
      if (!moving && !own.remaining?.includes(length)) return false;
      const result = previewPlacement(own.ships, action.x, action.y, length, action.dir, ship?.id);
      if (!result.valid) return false;
      if (moving) ship.cells = result.cells;
      else own.ships.push({ id: `ship-${action.actionId}`, length, cells: result.cells });
    } else if (action.op === 'unplace') {
      if (!own.ships.pop()) return false;
    } else if (action.op === 'ready' || action.op === 'unready') {
      own.ready = action.op === 'ready';
      const self = room.players.find((player) => player.self);
      if (self) self.ready = own.ready;
      return true;
    } else return true;
    const remaining = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];
    for (const ship of own.ships) {
      const index = remaining.indexOf(ship.length);
      if (index >= 0) remaining.splice(index, 1);
    }
    own.remaining = remaining;
    room.nextShip = remaining[0] || null;
    for (const cell of own.cells) {
      cell.shipId = own.ships.find((ship) => ship.cells.includes(cell.id))?.id || null;
      cell.ship = Boolean(cell.shipId);
    }
    return true;
  };

  root.SeaPlacementModel = { previewPlacement, applyLocalPlacement };
  if (typeof module !== 'undefined' && module.exports) module.exports = { previewPlacement, applyLocalPlacement };
})(globalThis);
