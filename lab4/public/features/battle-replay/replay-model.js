((root) => {
  const buildFrame = (replay, requestedStep) => {
    const step = Math.max(0, Math.min(replay.shots.length, Math.trunc(Number(requestedStep) || 0)));
    const boards = replay.players.map((player) => ({
      id: player.id,
      name: player.name,
      cells: Array.from({ length: 100 }, (_, index) => {
        const id = `${index % 10}:${Math.floor(index / 10)}`;
        return { id, ship: player.ships.some((ship) => ship.cells.includes(id)), shot: null, last: false };
      }),
    }));
    for (const shot of replay.shots.slice(0, step)) {
      const board = boards.find((item) => item.id === shot.targetId);
      const cell = board?.cells.find((item) => item.id === shot.cellId);
      if (!cell) continue;
      cell.shot = shot.result;
      if (shot.result === 'sunk') {
        const target = replay.players.find((item) => item.id === shot.targetId);
        const ship = target.ships.find((item) => item.cells.includes(shot.cellId));
        if (ship) for (const part of board.cells) if (ship.cells.includes(part.id)) part.shot = 'sunk';
      }
    }
    const lastShot = step ? replay.shots[step - 1] : null;
    if (lastShot) {
      const board = boards.find((item) => item.id === lastShot.targetId);
      const cell = board?.cells.find((item) => item.id === lastShot.cellId);
      if (cell) cell.last = true;
    }
    return { step, boards, lastShot, finished: step === replay.shots.length };
  };

  root.SeaReplayModel = { buildFrame };
  if (typeof module !== 'undefined' && module.exports) module.exports = { buildFrame };
})(globalThis);
