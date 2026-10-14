const express = require('express');
const { body, param } = require('express-validator');
const { User, ROLES } = require('../models/User');
const asyncRoute = require('../lib/asyncRoute');
const HttpError = require('../lib/httpError');
const publicUser = require('../lib/publicUser');
const logger = require('../lib/logger');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireRole('admin'));

router.get(
  '/',
  asyncRoute(async (_req, res) => {
    const users = await User.find().sort({ createdAt: 1 });
    res.status(200).json(users.map(publicUser));
  })
);

router.patch(
  '/:id/role',
  param('id').isMongoId().withMessage('Некорректный идентификатор пользователя'),
  body('role').isIn(ROLES).withMessage('Роль должна быть viewer, editor или admin'),
  validate,
  asyncRoute(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) {
      throw new HttpError(404, 'Пользователь не найден', { code: 'NOT_FOUND' });
    }

    const role = req.body.role;
    if (user.role === 'admin' && role !== 'admin') {
      const admins = await User.countDocuments({ role: 'admin' });
      if (admins <= 1) {
        throw new HttpError(409, 'Нельзя снять роль с последнего администратора', { code: 'CONFLICT' });
      }
    }

    user.role = role;
    await user.save();
    logger.info('role_changed', {
      reqId: req.id,
      actorId: req.user.id,
      userId: String(user._id),
      role,
    });
    res.status(200).json(publicUser(user));
  })
);

module.exports = router;
