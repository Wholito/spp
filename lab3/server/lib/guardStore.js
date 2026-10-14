const { LoginGuard } = require('../models/LoginGuard');
const { evaluateGuard, applyFailure, lockErrorParts } = require('./guards');
const HttpError = require('./httpError');

const assertOpen = async (keys, now) => {
  let retryAt = 0;
  for (const key of keys) {
    const record = await LoginGuard.findOne({ key });
    const state = evaluateGuard(record, now);
    if (state.locked) retryAt = Math.max(retryAt, state.retryAt);
  }
  if (!retryAt) return;
  const { seconds, minutes } = lockErrorParts(retryAt, now);
  throw new HttpError(429, `Слишком много попыток. Повторите через ${minutes} мин.`, {
    code: 'LOCKED',
    headers: { 'Retry-After': String(seconds) },
  });
};

const recordFailures = async (entries, now) => {
  for (const entry of entries) {
    const record = await LoginGuard.findOne({ key: entry.key });
    const nextState = applyFailure(record, now, entry.policy);
    const expireBase = nextState.lockedUntil || nextState.windowStart;
    await LoginGuard.findOneAndUpdate(
      { key: entry.key },
      {
        $set: {
          fails: nextState.fails,
          windowStart: new Date(nextState.windowStart),
          lockedUntil: nextState.lockedUntil ? new Date(nextState.lockedUntil) : null,
          expireAt: new Date(expireBase + entry.policy.lockMs),
        },
      },
      { upsert: true }
    );
  }
};

const clearGuards = async (keys) => {
  await LoginGuard.deleteMany({ key: { $in: keys } });
};

module.exports = { assertOpen, recordFailures, clearGuards };
