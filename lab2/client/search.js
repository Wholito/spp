window.TaskSearch = (() => {
  const root = document.getElementById('task-search');
  const query = document.getElementById('search-query');
  const status = document.getElementById('search-status');
  const priority = document.getElementById('search-priority');
  const due = document.getElementById('search-due');

  const filter = (tasks) => {
    const term = query.value.trim().toLocaleLowerCase('ru-RU');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return tasks.filter((task) => {
      if (term && !`${task.title} ${task.description || ''}`.toLocaleLowerCase('ru-RU').includes(term)) return false;
      if (status.value && task.status !== status.value) return false;
      if (priority.value && task.priority !== priority.value) return false;
      if (due.value) {
        if (!task.dueDate || task.status === 'done') return false;
        const day = new Date(task.dueDate);
        day.setHours(0, 0, 0, 0);
        if (due.value === 'today' && day.getTime() !== today.getTime()) return false;
        if (due.value === 'late' && day >= today) return false;
      }
      return true;
    });
  };

  const onChange = (callback) => {
    root.addEventListener('input', callback);
    root.addEventListener('change', callback);
  };

  return { filter, onChange };
})();
