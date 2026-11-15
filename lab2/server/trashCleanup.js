const fs = require('fs');
const path = require('path');
const { Task } = require('./models/Tasks');

const RETENTION_DAYS = 30;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const uploadsDir = path.join(__dirname, 'uploads');

const removeAttachment = async (task) => {
  const storedName = task.attachment?.storedName;
  if (!storedName) return;
  try {
    await fs.promises.unlink(path.join(uploadsDir, path.basename(storedName)));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
};

const purgeExpiredTrash = async (now = new Date()) => {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const expired = await Task.find({ deletedAt: { $lte: cutoff } }).select('_id');
  let deleted = 0;

  for (const { _id } of expired) {
    const task = await Task.findOneAndDelete({ _id, deletedAt: { $lte: cutoff } });
    if (!task) continue;
    deleted += 1;
    try {
      await removeAttachment(task);
    } catch (err) {
      console.error(`Failed to remove attachment for expired task ${_id}:`, err);
    }
  }

  return deleted;
};

const startTrashCleanup = () => {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const deleted = await purgeExpiredTrash();
      if (deleted) console.log(`Removed ${deleted} expired tasks from trash`);
    } catch (err) {
      console.error('Failed to clean expired trash:', err);
    } finally {
      running = false;
    }
  };

  void run();
  return setInterval(run, CLEANUP_INTERVAL_MS);
};

module.exports = { removeAttachment, purgeExpiredTrash, startTrashCleanup };
