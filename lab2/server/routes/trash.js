const express = require('express');
const fs = require('fs');
const path = require('path');
const { param, validationResult } = require('express-validator');
const { Task } = require('../models/Tasks');

const router = express.Router();
const uploadsDir = path.join(__dirname, '..', 'uploads');
const validateId = param('id').isMongoId().withMessage('Invalid task id');

router.get('/', async (_req, res, next) => {
  try {
    res.status(200).json(await Task.find({ deletedAt: { $ne: null } }).sort({ deletedAt: -1 }));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/restore', validateId, async (req, res, next) => {
  if (!validationResult(req).isEmpty()) return res.status(400).json({ error: 'Invalid task id' });
  try {
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, deletedAt: { $ne: null } },
      { $set: { deletedAt: null } },
      { new: true }
    );
    if (!task) return res.status(404).json({ error: 'Task not found in trash' });
    return res.status(200).json(task);
  } catch (err) {
    return next(err);
  }
});

router.delete('/:id', validateId, async (req, res, next) => {
  if (!validationResult(req).isEmpty()) return res.status(400).json({ error: 'Invalid task id' });
  try {
    const task = await Task.findOneAndDelete({ _id: req.params.id, deletedAt: { $ne: null } });
    if (!task) return res.status(404).json({ error: 'Task not found in trash' });
    const storedName = task.attachment?.storedName;
    if (storedName) {
      try {
        await fs.promises.unlink(path.join(uploadsDir, path.basename(storedName)));
      } catch (err) {
        if (err.code !== 'ENOENT') return next(err);
      }
    }
    return res.status(200).json({ message: 'Task deleted permanently', id: task._id });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
