const crypto = require('crypto');
const express = require('express');
const { body } = require('express-validator');
const { LoginChallenge } = require('../models/LoginChallenge');
const { LoginHistory } = require('../models/LoginHistory');
const { User } = require('../models/User');
const { sha256, hashesEqual } = require('../lib/tokens');
const { sendMessage } = require('../lib/mailer');
const clientIp = require('../lib/clientIp');
const HttpError = require('../lib/httpError');
const asyncRoute = require('../lib/asyncRoute');
const validate = require('../middleware/validate');

const router = express.Router();

const recordLogin = (user, req, success) => LoginHistory.create({
  user: user._id,
  success,
  ip: clientIp(req),
  userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
});

const startChallenge = async (user) => {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const challenge = await LoginChallenge.create({
    user: user._id,
    codeHash: sha256(code),
    expiresAt: new Date(Date.now() + 5 * 60000),
  });
  try {
    await sendMessage({
      to: user.email,
      subject: 'Код входа в Task Desk',
      text: `Ваш код входа: ${code}\n\nКод действует 5 минут. Если вы не входили, проигнорируйте письмо.`,
    });
  } catch (err) {
    await LoginChallenge.deleteOne({ _id: challenge._id });
    throw err;
  }
  return String(challenge._id);
};

const registerRoutes = (openSession) => {
  router.post('/verify',
    body('challengeId').isMongoId().withMessage('Некорректный запрос входа'),
    body('code').matches(/^\d{6}$/).withMessage('Введите шестизначный код'),
    validate,
    asyncRoute(async (req, res) => {
      const challenge = await LoginChallenge.findById(req.body.challengeId);
      if (!challenge || challenge.usedAt || challenge.expiresAt <= new Date() || challenge.attempts >= 5) {
        throw new HttpError(401, 'Код истёк или недействителен', { code: 'INVALID_CODE' });
      }
      if (!hashesEqual(challenge.codeHash, sha256(req.body.code))) {
        challenge.attempts += 1;
        await challenge.save();
        const user = await User.findById(challenge.user);
        if (user) await recordLogin(user, req, false);
        throw new HttpError(401, 'Неверный код', { code: 'INVALID_CODE' });
      }
      const claimed = await LoginChallenge.findOneAndUpdate(
        { _id: challenge._id, usedAt: null, attempts: { $lt: 5 } },
        { $set: { usedAt: new Date() } },
        { new: true }
      );
      if (!claimed) throw new HttpError(401, 'Код уже использован', { code: 'INVALID_CODE' });
      const user = await User.findById(challenge.user);
      if (!user) throw new HttpError(401, 'Пользователь не найден', { code: 'UNAUTHORIZED' });
      const tokens = await openSession(user, req);
      await recordLogin(user, req, true);
      res.status(200).json(tokens);
    })
  );
  router.get('/history', require('../middleware/auth').requireAuth, asyncRoute(async (req, res) => {
    const items = await LoginHistory.find({ user: req.user.id }).sort({ at: -1 }).limit(50);
    res.status(200).json(items.map((item) => ({
      id: String(item._id), success: item.success, ip: item.ip, userAgent: item.userAgent, at: item.at,
    })));
  }));
  return router;
};

module.exports = { registerRoutes, startChallenge, recordLogin };
