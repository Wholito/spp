const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const HttpError = require('./httpError');

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

const hashesEqual = (left, right) => {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

const secret = () => process.env.JWT_SECRET || 'lab3-dev-only-secret';

const signAccess = (payload, options = {}) =>
  jwt.sign({ ...payload, typ: 'access' }, options.secret || secret(), {
    expiresIn: options.expiresIn || process.env.JWT_ACCESS_TTL || '15m',
  });

const signRefresh = (payload, options = {}) =>
  jwt.sign({ ...payload, typ: 'refresh' }, options.secret || secret(), {
    expiresIn: options.expiresIn || process.env.JWT_REFRESH_TTL || '7d',
  });

const verifyTyped = (token, type, options = {}) => {
  try {
    const payload = jwt.verify(token, options.secret || secret());
    if (!payload || payload.typ !== type) {
      throw new Error('type');
    }
    return payload;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(401, 'Ключ недействителен или истёк', { code: 'UNAUTHORIZED' });
  }
};

const verifyAccess = (token, options) => verifyTyped(token, 'access', options);

const verifyRefresh = (token, options) => verifyTyped(token, 'refresh', options);

const ttlToMs = (value, fallback) => {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(String(value || '').trim());
  if (!match) return fallback;
  const unit = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]];
  return Number(match[1]) * unit;
};

module.exports = {
  sha256,
  hashesEqual,
  signAccess,
  signRefresh,
  verifyAccess,
  verifyRefresh,
  ttlToMs,
};
