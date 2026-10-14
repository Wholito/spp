const express = require('express');
const { param } = require('express-validator');
const { Session } = require('../models/Session');
const asyncRoute = require('../lib/asyncRoute');
const HttpError = require('../lib/httpError');
const logger = require('../lib/logger');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const present = (session, currentId) => ({
  id: String(session._id),
  ip: session.ip || '',
  userAgent: session.userAgent || '',
  createdAt: session.createdAt,
  lastSeenAt: session.lastSeenAt,
  expiresAt: session.expiresAt,
  current: String(session._id) === currentId,
  user: session.user && session.user.name
    ? { id: String(session.user._id), name: session.user.name, email: session.user.email }
    : null,
});

router.use(requireAuth);

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const scopeAll = req.query.scope === 'all';
    if (scopeAll && req.user.role !== 'admin') {
      throw new HttpError(403, 'Список всех подключений доступен администратору', { code: 'FORBIDDEN' });
    }

    const query = {
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    };
    if (!scopeAll) query.user = req.user.id;

    const sessions = await Session.find(query).sort({ lastSeenAt: -1 }).populate('user', 'name email');
    res.status(200).json(sessions.map((session) => present(session, req.user.sessionId)));
  })
);

router.post(
  '/revoke-others',
  asyncRoute(async (req, res) => {
    const result = await Session.updateMany(
      { user: req.user.id, _id: { $ne: req.user.sessionId }, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
    logger.info('sessions_revoked_others', {
      reqId: req.id,
      userId: req.user.id,
      count: result.modifiedCount,
    });
    res.status(200).json({ message: 'Остальные подключения закрыты' });
  })
);

router.delete(
  '/:id',
  param('id').isMongoId().withMessage('Некорректный идентификатор сессии'),
  validate,
  asyncRoute(async (req, res) => {
    const query = { _id: req.params.id };
    if (req.user.role !== 'admin') query.user = req.user.id;

    const session = await Session.findOne(query);
    if (!session || session.revokedAt) {
      throw new HttpError(404, 'Подключение не найдено', { code: 'NOT_FOUND' });
    }

    const current = String(session._id) === req.user.sessionId;
    session.revokedAt = new Date();
    await session.save();
    logger.info('session_revoked', {
      reqId: req.id,
      actorId: req.user.id,
      sessionId: String(session._id),
      current,
    });
    res.status(200).json({ message: 'Подключение закрыто', id: String(session._id), current });
  })
);

module.exports = router;
