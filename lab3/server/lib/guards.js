const EMAIL_POLICY = { maxAttempts: 5, windowMs: 15 * 60 * 1000, lockMs: 15 * 60 * 1000 };
const IP_POLICY = { maxAttempts: 20, windowMs: 15 * 60 * 1000, lockMs: 15 * 60 * 1000 };
const FORGOT_POLICY = { maxAttempts: 5, windowMs: 15 * 60 * 1000, lockMs: 15 * 60 * 1000 };
const REGISTER_POLICY = { maxAttempts: 10, windowMs: 15 * 60 * 1000, lockMs: 15 * 60 * 1000 };

const evaluateGuard = (record, now) => {
  if (!record || !record.lockedUntil) return { locked: false, retryAt: null };
  const lockedUntil = new Date(record.lockedUntil).getTime();
  if (lockedUntil > now) return { locked: true, retryAt: lockedUntil };
  return { locked: false, retryAt: null };
};

const applyFailure = (record, now, policy) => {
  const prevStart = record && record.windowStart ? new Date(record.windowStart).getTime() : 0;
  const lockedUntil = record && record.lockedUntil ? new Date(record.lockedUntil).getTime() : 0;
  const lockExpired = Boolean(lockedUntil) && lockedUntil <= now;
  const inWindow = Boolean(prevStart) && now - prevStart < policy.windowMs && !lockExpired;
  const windowStart = inWindow ? prevStart : now;
  const fails = inWindow ? Number(record.fails || 0) + 1 : 1;
  const nextLock = fails >= policy.maxAttempts ? now + policy.lockMs : null;
  return { fails, windowStart, lockedUntil: nextLock };
};

const lockErrorParts = (retryAt, now) => {
  const seconds = Math.max(1, Math.ceil((retryAt - now) / 1000));
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return { seconds, minutes };
};

module.exports = {
  EMAIL_POLICY,
  IP_POLICY,
  FORGOT_POLICY,
  REGISTER_POLICY,
  evaluateGuard,
  applyFailure,
  lockErrorParts,
};
