const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const { body } = require('express-validator');
const { User } = require('../models/User');
const { Session } = require('../models/Session');
const { PasswordReset } = require('../models/PasswordReset');
const { passwordOk, hashPassword, verifyPassword } = require('../lib/passwords');
const { sha256, hashesEqual, signAccess, signRefresh, verifyAccess, verifyRefresh, ttlToMs } = require('../lib/tokens');
const { EMAIL_POLICY, IP_POLICY, FORGOT_POLICY, REGISTER_POLICY } = require('../lib/guards');
const { assertOpen, recordFailures, clearGuards } = require('../lib/guardStore');
const publicUser = require('../lib/publicUser');
const clientIp = require('../lib/clientIp');
const HttpError = require('../lib/httpError');
const logger = require('../lib/logger');
const asyncRoute = require('../lib/asyncRoute');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { sendPasswordReset } = require('../lib/mailer');

const router = express.Router();

const passwordRule = (field) =>
  body(field).custom((value) => {
    if (!passwordOk(value)) {
      throw new Error('Пароль: от 8 символов, нужны буквы и цифры');
    }
    return true;
  });

const registerValidators = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 40 })
    .withMessage('Имя: от 2 до 40 символов')
    .custom((value) => {
      if (/[<>]/.test(value)) throw new Error('Имя содержит недопустимые символы');
      return true;
    }),
  body('email').trim().isEmail().withMessage('Нужен корректный email'),
  passwordRule('password'),
  body('role')
    .optional({ nullable: true, checkFalsy: true })
    .isIn(['viewer', 'editor'])
    .withMessage('При регистрации доступны роли viewer и editor'),
];

const loginValidators = [
  body('email').trim().isEmail().withMessage('Нужен корректный email'),
  body('password').isString().notEmpty().withMessage('Введите пароль'),
];

const emailValidator = [body('email').trim().isEmail().withMessage('Нужен корректный email')];

const resetValidators = [
  body('token').trim().isLength({ min: 20, max: 200 }).withMessage('Ссылка восстановления некорректна'),
  passwordRule('password'),
];

const refreshValidators = [
  body('refreshToken').isString().notEmpty().withMessage('Нет ключа обновления'),
];

const appUrl = () => (process.env.APP_URL || 'http://localhost:8080').replace(/\/$/, '');

const refreshTtl = () => ttlToMs(process.env.JWT_REFRESH_TTL || '7d', 7 * 86400000);

const maxSessions = () => {
  const value = Number(process.env.MAX_SESSIONS || 5);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 5;
};

const openSession = async (user, req) => {
  const now = new Date();
  const active = await Session.find({
    user: user._id,
    revokedAt: null,
    expiresAt: { $gt: now },
  }).sort({ createdAt: 1 });

  const limit = maxSessions();
  while (active.length >= limit) {
    const oldest = active.shift();
    oldest.revokedAt = now;
    await oldest.save();
    logger.info('session_evicted', {
      reqId: req.id,
      userId: String(user._id),
      sessionId: String(oldest._id),
    });
  }

  const id = new mongoose.Types.ObjectId();
  const refreshToken = signRefresh({ sub: String(user._id), sid: String(id) });
  const accessToken = signAccess({
    sub: String(user._id),
    sid: String(id),
    role: user.role,
  });

  await Session.create({
    _id: id,
    user: user._id,
    refreshHash: sha256(refreshToken),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
    ip: clientIp(req),
    lastSeenAt: now,
    expiresAt: new Date(Date.now() + refreshTtl()),
  });

  logger.info('session_opened', {
    reqId: req.id,
    userId: String(user._id),
    sessionId: String(id),
    role: user.role,
  });

  return { accessToken, refreshToken, user: publicUser(user) };
};

router.post(
  '/register',
  registerValidators,
  validate,
  asyncRoute(async (req, res) => {
    const now = Date.now();
    const email = req.body.email.trim().toLowerCase();
    const ip = clientIp(req);
    await assertOpen([`register-ip:${ip}`], now);

    const name = req.body.name.trim();
    const role = req.body.role || 'editor';
    try {
      const user = await User.create({
        name,
        email,
        role,
        passwordHash: await hashPassword(req.body.password),
      });
      await recordFailures([{ key: `register-ip:${ip}`, policy: REGISTER_POLICY }], now);
      const tokens = await openSession(user, req);
      logger.info('user_registered', { reqId: req.id, userId: String(user._id), role });
      res.status(201).json(tokens);
    } catch (err) {
      if (err.code === 11000) {
        await recordFailures([{ key: `register-ip:${ip}`, policy: REGISTER_POLICY }], now);
      }
      throw err;
    }
  })
);

router.post(
  '/login',
  loginValidators,
  validate,
  asyncRoute(async (req, res) => {
    const now = Date.now();
    const email = req.body.email.trim().toLowerCase();
    const ip = clientIp(req);
    const emailKey = `email:${email}`;
    const ipKey = `ip:${ip}`;
    await assertOpen([emailKey, ipKey], now);

    const user = await User.findOne({ email }).select('+passwordHash');
    const matches = user ? await verifyPassword(req.body.password, user.passwordHash) : false;
    if (!matches) {
      await recordFailures(
        [
          { key: emailKey, policy: EMAIL_POLICY },
          { key: ipKey, policy: IP_POLICY },
        ],
        now
      );
      logger.warn('login_failed', { reqId: req.id, email, ip });
      throw new HttpError(401, 'Неверный email или пароль', { code: 'INVALID_CREDENTIALS' });
    }

    await clearGuards([emailKey, ipKey]);
    const tokens = await openSession(user, req);
    logger.info('login_succeeded', { reqId: req.id, userId: String(user._id), role: user.role });
    res.status(200).json(tokens);
  })
);

router.post(
  '/refresh',
  refreshValidators,
  validate,
  asyncRoute(async (req, res) => {
    const payload = verifyRefresh(req.body.refreshToken);
    const session = await Session.findById(payload.sid);
    const currentHash = sha256(req.body.refreshToken);
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now() ||
      String(session.user) !== String(payload.sub) ||
      !hashesEqual(session.refreshHash, currentHash)
    ) {
      throw new HttpError(401, 'Ключ обновления недействителен', { code: 'UNAUTHORIZED' });
    }

    const user = await User.findById(payload.sub);
    if (!user) {
      throw new HttpError(401, 'Пользователь не найден', { code: 'UNAUTHORIZED' });
    }

    const refreshToken = signRefresh({ sub: String(user._id), sid: String(session._id) });
    session.refreshHash = sha256(refreshToken);
    session.expiresAt = new Date(Date.now() + refreshTtl());
    session.lastSeenAt = new Date();
    session.ip = clientIp(req);
    await session.save();

    const accessToken = signAccess({
      sub: String(user._id),
      sid: String(session._id),
      role: user.role,
    });

    logger.info('token_refreshed', { reqId: req.id, userId: String(user._id), sessionId: String(session._id) });
    res.status(200).json({ accessToken, refreshToken, user: publicUser(user) });
  })
);

router.post(
  '/logout',
  asyncRoute(async (req, res) => {
    const header = req.headers.authorization || '';
    const accessToken = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    let session = null;

    if (accessToken) {
      try {
        const payload = verifyAccess(accessToken);
        session = await Session.findById(payload.sid);
      } catch {
        session = null;
      }
    }

    if (!session && req.body && req.body.refreshToken) {
      try {
        const payload = verifyRefresh(req.body.refreshToken);
        const found = await Session.findById(payload.sid);
        if (found && hashesEqual(found.refreshHash, sha256(req.body.refreshToken))) {
          session = found;
        }
      } catch {
        session = null;
      }
    }

    if (session && !session.revokedAt) {
      session.revokedAt = new Date();
      await session.save();
      logger.info('session_closed', { reqId: req.id, sessionId: String(session._id), userId: String(session.user) });
    }

    res.status(200).json({ message: 'Вы вышли из системы' });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncRoute(async (req, res) => {
    res.status(200).json({
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
    });
  })
);

router.post(
  '/forgot',
  emailValidator,
  validate,
  asyncRoute(async (req, res) => {
    const now = Date.now();
    const email = req.body.email.trim().toLowerCase();
    const ip = clientIp(req);
    await assertOpen([`forgot-email:${email}`, `forgot-ip:${ip}`], now);
    await recordFailures(
      [
        { key: `forgot-email:${email}`, policy: FORGOT_POLICY },
        { key: `forgot-ip:${ip}`, policy: FORGOT_POLICY },
      ],
      now
    );

    const user = await User.findOne({ email });
    const body = {
      message: 'Если учётная запись существует, мы отправили письмо для восстановления доступа',
    };

    if (user) {
      const raw = crypto.randomBytes(32).toString('hex');
      await PasswordReset.updateMany(
        { user: user._id, usedAt: null },
        { $set: { usedAt: new Date() } }
      );
      await PasswordReset.create({
        user: user._id,
        tokenHash: sha256(raw),
        expiresAt: new Date(now + 30 * 60 * 1000),
      });
      const resetUrl = `${appUrl()}/?reset=${raw}`;
      const sent = await sendPasswordReset({ to: email, resetUrl });
      if (process.env.MAIL_EXPOSE_PREVIEW === 'true') {
        if (sent.preview) body.previewUrl = sent.preview;
        else if (!sent.delivered && sent.resetUrl) body.resetUrl = sent.resetUrl;
      }
      logger.info('password_reset_requested', { reqId: req.id, userId: String(user._id) });
    } else {
      logger.info('password_reset_unknown_email', { reqId: req.id });
    }

    res.status(202).json(body);
  })
);

router.post(
  '/reset',
  resetValidators,
  validate,
  asyncRoute(async (req, res) => {
    const tokenHash = sha256(req.body.token.trim());
    const reset = await PasswordReset.findOne({ tokenHash });
    if (!reset || reset.usedAt) {
      throw new HttpError(400, 'Ссылка восстановления недействительна', { code: 'BAD_TOKEN' });
    }
    if (reset.expiresAt.getTime() <= Date.now()) {
      throw new HttpError(410, 'Срок ссылки восстановления истёк', { code: 'EXPIRED' });
    }

    const user = await User.findById(reset.user).select('+passwordHash');
    if (!user) {
      throw new HttpError(400, 'Ссылка восстановления недействительна', { code: 'BAD_TOKEN' });
    }

    user.passwordHash = await hashPassword(req.body.password);
    await user.save();
    reset.usedAt = new Date();
    await reset.save();
    await Session.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    logger.info('password_reset_completed', { reqId: req.id, userId: String(user._id) });
    res.status(200).json({ message: 'Пароль обновлён. Войдите с новым паролем' });
  })
);

module.exports = router;
