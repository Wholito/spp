const { Session } = require('../models/Session');
const { User } = require('../models/User');
const { verifyAccess } = require('../lib/tokens');
const HttpError = require('../lib/httpError');
const clientIp = require('../lib/clientIp');

const authenticate = async (req) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    throw new HttpError(401, 'Нужна аутентификация', { code: 'UNAUTHORIZED' });
  }

  const payload = verifyAccess(token);
  const session = await Session.findById(payload.sid);
  if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
    throw new HttpError(401, 'Сессия неактивна', { code: 'UNAUTHORIZED' });
  }
  if (String(session.user) !== String(payload.sub)) {
    throw new HttpError(401, 'Сессия неактивна', { code: 'UNAUTHORIZED' });
  }

  const user = await User.findById(payload.sub);
  if (!user) {
    throw new HttpError(401, 'Пользователь не найден', { code: 'UNAUTHORIZED' });
  }

  req.user = {
    id: String(user._id),
    role: user.role,
    sessionId: String(session._id),
    name: user.name,
    email: user.email,
  };

  if (Date.now() - new Date(session.lastSeenAt).getTime() > 30000) {
    Session.updateOne(
      { _id: session._id },
      { $set: { lastSeenAt: new Date(), ip: clientIp(req) } }
    ).catch(() => {});
  }
};

const requireAuth = (req, res, next) => {
  authenticate(req).then(() => next()).catch(next);
};

const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new HttpError(403, 'Недостаточно прав для этого действия', { code: 'FORBIDDEN' }));
  }
  return next();
};

module.exports = { requireAuth, requireRole };
