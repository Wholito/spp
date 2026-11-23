const crypto = require('crypto');

const HISTORY_LIMIT = 10;

const startRecording = (room, now) => {
  room.battle = {
    id: crypto.randomUUID(),
    startedAt: now,
    finishedAt: null,
    winnerId: null,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      ships: player.ships.map((ship) => ({ id: ship.id, length: ship.length, cells: [...ship.cells] })),
    })),
    shots: [],
  };
};

const recordShot = (room, playerId, targetId, cellId, result, now) => {
  if (!room.battle) return;
  room.battle.shots.push({ playerId, targetId, cellId, result, at: now });
};

const finishRecording = (room, now) => {
  if (!room.battle) return;
  room.battle.finishedAt = now;
  room.battle.winnerId = room.winnerId;
  room.replays = [...(room.replays || []), room.battle].slice(-HISTORY_LIMIT);
  room.battle = null;
};

const replaySummaries = (room) => (room.replays || []).map((replay) => ({
  id: replay.id,
  startedAt: replay.startedAt,
  finishedAt: replay.finishedAt,
  winner: replay.players.find((player) => player.id === replay.winnerId)?.name || '',
  moves: replay.shots.length,
}));

const getReplay = (room, playerId, replayId) => {
  if (!room || !room.players.some((player) => player.id === playerId)) return null;
  const replay = (room.replays || []).find((item) => item.id === replayId && item.finishedAt != null);
  return replay ? structuredClone(replay) : null;
};

module.exports = { HISTORY_LIMIT, startRecording, recordShot, finishRecording, replaySummaries, getReplay };
