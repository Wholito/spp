const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { body, param } = require('express-validator');
const { Task, STATUSES, PRIORITIES } = require('../models/Tasks');
const HttpError = require('../lib/httpError');
const asyncRoute = require('../lib/asyncRoute');
const { canMutateTask } = require('../lib/roles');
const validate = require('../middleware/validate');

const validateUploaded = (req, res, next) => {
  validate(req, res, (err) => {
    if (err && req.file) removeFile(req.file.filename);
    next(err);
  });
};
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      const error = new Error('Неподдерживаемый тип файла');
      error.code = 'UNSUPPORTED_MEDIA';
      error.status = 415;
      return cb(error);
    }
    return cb(null, true);
  },
});

const handleUpload = (req, res, next) => {
  upload.single('attachment')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new HttpError(413, 'Файл больше 5 МБ', { code: 'PAYLOAD_TOO_LARGE' }));
      }
      return next(new HttpError(400, 'Не удалось принять файл', { code: 'BAD_UPLOAD' }));
    }
    if (err.code === 'UNSUPPORTED_MEDIA' || err.status === 415) {
      return next(new HttpError(415, 'Неподдерживаемый тип файла. Допустимы изображения, PDF, TXT, DOC, DOCX', {
        code: 'UNSUPPORTED_MEDIA',
      }));
    }
    return next(new HttpError(400, err.message || 'Не удалось принять файл', { code: 'BAD_UPLOAD' }));
  });
};

const taskValidators = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Название обязательно')
    .isLength({ min: 2, max: 120 })
    .withMessage('Название: от 2 до 120 символов'),
  body('description')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Описание не длиннее 2000 символов'),
  body('status')
    .optional({ nullable: true, checkFalsy: true })
    .isIn(STATUSES)
    .withMessage(`Статус: ${STATUSES.join(', ')}`),
  body('priority')
    .optional({ nullable: true, checkFalsy: true })
    .isIn(PRIORITIES)
    .withMessage(`Приоритет: ${PRIORITIES.join(', ')}`),
  body('dueDate')
    .optional({ nullable: true, checkFalsy: true })
    .isISO8601()
    .withMessage('Дата должна быть в формате ISO 8601'),
];

const idValidator = param('id').isMongoId().withMessage('Некорректный идентификатор задачи');

const removeFile = (storedName) => {
  if (!storedName) return;
  const filePath = path.join(uploadsDir, storedName);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

const buildPayload = (bodyData, file, existing) => {
  const payload = {
    title: bodyData.title,
    description: bodyData.description ?? existing?.description ?? '',
    status: bodyData.status || existing?.status || 'todo',
    priority: bodyData.priority || existing?.priority || 'medium',
    dueDate: bodyData.dueDate ? new Date(bodyData.dueDate) : existing?.dueDate ?? null,
  };

  if (file) {
    payload.attachment = {
      originalName: file.originalname,
      storedName: file.filename,
      mimeType: file.mimetype,
      size: file.size,
    };
  }

  return payload;
};

const loadTask = async (id) => Task.findById(id).populate('owner', 'name');

router.use(requireAuth);

router.get(
  '/',
  asyncRoute(async (_req, res) => {
    const tasks = await Task.find().populate('owner', 'name').sort({ createdAt: -1 });
    res.status(200).json(tasks);
  })
);

router.get(
  '/:id',
  idValidator,
  validate,
  asyncRoute(async (req, res) => {
    const task = await loadTask(req.params.id);
    if (!task) {
      throw new HttpError(404, 'Задача не найдена', { code: 'NOT_FOUND' });
    }
    res.status(200).json(task);
  })
);

router.post(
  '/',
  requireRole('editor', 'admin'),
  handleUpload,
  taskValidators,
  validateUploaded,
  asyncRoute(async (req, res) => {
    try {
      const task = await Task.create({
        ...buildPayload(req.body, req.file),
        owner: req.user.id,
      });
      await task.populate('owner', 'name');
      res.status(201).json(task);
    } catch (err) {
      if (req.file) removeFile(req.file.filename);
      throw err;
    }
  })
);

router.put(
  '/:id',
  requireRole('editor', 'admin'),
  handleUpload,
  idValidator,
  taskValidators,
  validateUploaded,
  asyncRoute(async (req, res) => {
    try {
      const existing = await Task.findById(req.params.id);
      if (!existing) {
        if (req.file) removeFile(req.file.filename);
        throw new HttpError(404, 'Задача не найдена', { code: 'NOT_FOUND' });
      }
      if (!canMutateTask(req.user.role, req.user.id, existing)) {
        if (req.file) removeFile(req.file.filename);
        throw new HttpError(403, 'Можно изменять только свои задачи', { code: 'FORBIDDEN' });
      }

      const oldFile = existing.attachment?.storedName;
      Object.assign(existing, buildPayload(req.body, req.file, existing));
      await existing.save();
      if (req.file && oldFile) removeFile(oldFile);
      await existing.populate('owner', 'name');
      res.status(200).json(existing);
    } catch (err) {
      if (req.file) removeFile(req.file.filename);
      throw err;
    }
  })
);

router.delete(
  '/:id',
  requireRole('editor', 'admin'),
  idValidator,
  validate,
  asyncRoute(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) {
      throw new HttpError(404, 'Задача не найдена', { code: 'NOT_FOUND' });
    }
    if (!canMutateTask(req.user.role, req.user.id, task)) {
      throw new HttpError(403, 'Можно удалять только свои задачи', { code: 'FORBIDDEN' });
    }

    await task.deleteOne();
    removeFile(task.attachment?.storedName);
    res.status(200).json({ message: 'Задача удалена', id: task._id });
  })
);

module.exports = router;
