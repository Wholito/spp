const { footprint, lengthsLeft, paintShips } = require('../fleet');

const placeOrMoveShip = (player, action) => {
  const moving = action.op === 'move';
  const ship = moving ? player.ships.find((item) => item.id === action.shipId) : null;
  if (moving && !ship) return { ok: false, code: 'NO_SHIP' };
  const length = moving ? ship.length : action.length ?? lengthsLeft(player)[0];
  if (!moving && !lengthsLeft(player).includes(length)) return { ok: false, code: 'BAD_PLACE' };
  const others = moving ? player.ships.filter((item) => item.id !== ship.id) : player.ships;
  const cells = footprint(others, action.x, action.y, length, action.dir);
  if (!cells) return { ok: false, code: 'BAD_PLACE' };
  if (moving) ship.cells = cells;
  else player.ships.push({ id: `ship-${action.actionId}`, length, cells, alive: true });
  paintShips(player);
  return { ok: true, length, moved: moving };
};

module.exports = { placeOrMoveShip };
