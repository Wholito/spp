const canReadTasks = (role) => role === 'viewer' || role === 'editor' || role === 'admin';

const canCreateTask = (role) => role === 'editor' || role === 'admin';

const ownerId = (task) => {
  if (!task || !task.owner) return '';
  if (typeof task.owner === 'object') return String(task.owner._id || task.owner.id || '');
  return String(task.owner);
};

const canMutateTask = (role, userId, task) => {
  if (role === 'admin') return true;
  if (role === 'editor' && ownerId(task) === String(userId)) return true;
  return false;
};

const canManageUsers = (role) => role === 'admin';

const canViewAllSessions = (role) => role === 'admin';

module.exports = {
  canReadTasks,
  canCreateTask,
  canMutateTask,
  canManageUsers,
  canViewAllSessions,
  ownerId,
};
