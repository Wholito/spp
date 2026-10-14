const { User } = require('./models/User');
const { Task } = require('./models/Tasks');
const { hashPassword } = require('./lib/passwords');
const logger = require('./lib/logger');

const DEMO = [
  { name: 'Администратор', email: 'admin@taskdesk.local', password: 'Admin12345', role: 'admin' },
  { name: 'Редактор', email: 'editor@taskdesk.local', password: 'Editor12345', role: 'editor' },
  { name: 'Наблюдатель', email: 'viewer@taskdesk.local', password: 'Viewer12345', role: 'viewer' },
];

const seed = async () => {
  const existing = await User.countDocuments();
  if (existing === 0) {
    for (const item of DEMO) {
      await User.create({
        name: item.name,
        email: item.email,
        role: item.role,
        passwordHash: await hashPassword(item.password),
      });
    }
    logger.info('seed_users_created', { count: DEMO.length });
  }

  const admin = await User.findOne({ role: 'admin' });
  if (!admin) return;

  const result = await Task.updateMany(
    { $or: [{ owner: { $exists: false } }, { owner: null }] },
    { $set: { owner: admin._id } }
  );
  if (result.modifiedCount) {
    logger.info('tasks_owner_backfill', { count: result.modifiedCount });
  }
};

module.exports = seed;
