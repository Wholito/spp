const crypto = require('crypto');
const express = require('express');
const { body } = require('express-validator');
const { Invitation } = require('../models/Invitation');
const { User } = require('../models/User');
const { sha256 } = require('../lib/tokens');
const { hashPassword, passwordOk } = require('../lib/passwords');
const { sendMessage } = require('../lib/mailer');
const HttpError = require('../lib/httpError');
const asyncRoute = require('../lib/asyncRoute');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const appUrl = () => (process.env.APP_URL || 'http://localhost:8080').replace(/\/$/, '');

router.post('/', requireAuth, requireRole('admin'),
  body('email').trim().isEmail().withMessage('Нужен корректный email'),
  body('role').isIn(['viewer', 'editor']).withMessage('Выберите роль'),
  validate,
  asyncRoute(async (req, res) => {
    const email = req.body.email.trim().toLowerCase();
    if (await User.exists({ email })) throw new HttpError(409, 'Пользователь уже зарегистрирован', { code: 'CONFLICT' });
    const raw = crypto.randomBytes(32).toString('hex');
    const invite = await Invitation.create({
      email, role: req.body.role, tokenHash: sha256(raw), createdBy: req.user.id,
      expiresAt: new Date(Date.now() + 24 * 3600000),
    });
    try {
      await sendMessage({
        to: email,
        subject: 'Приглашение в Task Desk',
        text: `Откройте ссылку, чтобы создать учётную запись. Она действует 24 часа.\n\n${appUrl()}/?invite=${raw}`,
      });
    } catch (err) {
      await Invitation.deleteOne({ _id: invite._id });
      throw err;
    }
    res.status(201).json({ message: 'Приглашение отправлено' });
  })
);

router.post('/accept',
  body('token').isString().isLength({ min: 20, max: 200 }),
  body('name').trim().isLength({ min: 2, max: 40 }),
  body('password').custom((value) => passwordOk(value)),
  validate,
  asyncRoute(async (req, res) => {
    const invite = await Invitation.findOne({ tokenHash: sha256(req.body.token), usedAt: null });
    if (!invite || invite.expiresAt <= new Date()) throw new HttpError(410, 'Приглашение истекло', { code: 'EXPIRED' });
    if (await User.exists({ email: invite.email })) throw new HttpError(409, 'Пользователь уже зарегистрирован', { code: 'CONFLICT' });
    const user = await User.create({
      name: req.body.name.trim(), email: invite.email, role: invite.role,
      passwordHash: await hashPassword(req.body.password),
    });
    await Invitation.updateOne({ _id: invite._id, usedAt: null }, { $set: { usedAt: new Date() } });
    res.status(201).json({ message: 'Аккаунт создан. Теперь войдите' });
  })
);

module.exports = router;
