(() => {
  const API_BASE = '/api/tasks';

  const form = document.getElementById('task-form');
  const formTitle = document.getElementById('form-title');
  const titleInput = document.getElementById('title');
  const descriptionInput = document.getElementById('description');
  const statusInput = document.getElementById('status');
  const priorityInput = document.getElementById('priority');
  const dueDateInput = document.getElementById('due-date');
  const attachmentInput = document.getElementById('attachment');
  const currentFileEl = document.getElementById('current-file');
  const submitBtn = document.getElementById('submit-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const tasksEl = document.getElementById('tasks');
  const boardEl = document.getElementById('board');
  const dayLineEl = document.getElementById('day-line');
  const alertEl = document.getElementById('alert');
  const appEl = document.querySelector('.app');
  const viewListBtn = document.getElementById('view-list');
  const viewBoardBtn = document.getElementById('view-board');

  const statusLabels = {
    todo: 'К выполнению',
    in_progress: 'В работе',
    done: 'Готово',
  };

  const priorityLabels = {
    low: 'Низкий',
    medium: 'Средний',
    high: 'Высокий',
  };

  const columns = ['todo', 'in_progress', 'done'];

  let editingId = null;
  let tasksCache = [];
  let boardMode = false;

  const showAlert = (message, type = 'error') => {
    alertEl.textContent = message;
    alertEl.className = `alert alert-${type}`;
  };

  const hideAlert = () => {
    alertEl.className = 'alert hidden';
    alertEl.textContent = '';
  };

  const statusMessages = {
    400: 'Некорректные данные. Проверьте форму и попробуйте снова',
    404: 'Задача не найдена',
    413: 'Файл слишком большой (максимум 5 МБ)',
    500: 'Внутренняя ошибка сервера',
    502: 'Сервер временно недоступен',
    503: 'Сервис временно недоступен',
    504: 'Превышено время ожидания ответа сервера',
  };

  const parseError = async (response) => {
    try {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        if (Array.isArray(data.details) && data.details.length) {
          return data.details.join('; ');
        }
        if (typeof data.error === 'string' && data.error.trim()) {
          return data.error;
        }
        if (typeof data.message === 'string' && data.message.trim()) {
          return data.message;
        }
      }
    } catch {
    }

    return statusMessages[response.status] || 'Произошла ошибка. Попробуйте ещё раз';
  };

  const networkErrorMessage = (err) => {
    if (err?.name === 'TypeError' || /Failed to fetch|NetworkError/i.test(err?.message || '')) {
      return 'Не удалось связаться с сервером. Проверьте подключение';
    }
    return err?.message || 'Произошла ошибка';
  };

  const escapeHtml = (value) =>
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const dayValue = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  };

  const startOfDay = (date) => {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
  };

  const dueInfo = (task) => {
    if (!task.dueDate) return null;
    const day = startOfDay(new Date(task.dueDate));
    if (Number.isNaN(day.getTime())) return null;
    const today = startOfDay(new Date());
    return {
      text: day.getTime() === today.getTime() ? 'сегодня' : day.toLocaleDateString('ru-RU'),
      late: task.status !== 'done' && day < today,
      today: day.getTime() === today.getTime(),
    };
  };

  const resetForm = () => {
    editingId = null;
    form.reset();
    statusInput.value = 'todo';
    priorityInput.value = 'medium';
    dueDateInput.value = '';
    formTitle.textContent = 'Новая задача';
    submitBtn.textContent = 'Создать';
    cancelBtn.classList.add('hidden');
    currentFileEl.classList.add('hidden');
    currentFileEl.textContent = '';
    attachmentInput.value = '';
  };

  const fillForm = (task) => {
    editingId = task._id;
    titleInput.value = task.title || '';
    descriptionInput.value = task.description || '';
    statusInput.value = task.status || 'todo';
    priorityInput.value = task.priority || 'medium';
    dueDateInput.value = dayValue(task.dueDate);
    formTitle.textContent = 'Редактирование';
    submitBtn.textContent = 'Сохранить';
    cancelBtn.classList.remove('hidden');

    if (task.attachment?.originalName) {
      currentFileEl.classList.remove('hidden');
      currentFileEl.textContent = `Текущий файл: ${task.attachment.originalName}`;
    } else {
      currentFileEl.classList.add('hidden');
      currentFileEl.textContent = '';
    }

    attachmentInput.value = '';
    titleInput.focus();
  };

  const fileHtml = (task) =>
    task.attachment?.storedName
      ? `<a class="file-link" href="/uploads/${encodeURIComponent(task.attachment.storedName)}" target="_blank" rel="noopener">${escapeHtml(task.attachment.originalName)}</a>`
      : '<span class="file-muted">без файла</span>';

  const dueHtml = (task) => {
    const due = dueInfo(task);
    if (!due) return '';
    return `<span class="due${due.late ? ' due-late' : ''}">${escapeHtml(due.text)}</span>`;
  };

  const moveOptions = (task) =>
    columns
      .map(
        (status) =>
          `<option value="${status}" ${status === (task.status || 'todo') ? 'selected' : ''}>${statusLabels[status]}</option>`
      )
      .join('');

  const cardHtml = (task, index, draggable) => {
    const status = task.status || 'todo';
    const priority = task.priority || 'medium';
    return `
      <article class="task" draggable="${draggable ? 'true' : 'false'}" data-id="${task._id}" style="animation-delay: ${Math.min(index, 8) * 40}ms">
        <div class="task-top">
          <div>
            <h3>${escapeHtml(task.title)}</h3>
            <p>${escapeHtml(task.description || '')}</p>
          </div>
          <div class="task-actions">
            <button type="button" data-action="edit">Изменить</button>
            <button type="button" class="danger" data-action="delete">Удалить</button>
          </div>
        </div>
        <div class="meta">
          <span class="badge badge-${escapeHtml(status)}">${statusLabels[status] || status}</span>
          <span class="badge badge-${escapeHtml(priority)}">${priorityLabels[priority] || priority}</span>
          ${dueHtml(task)}
          ${fileHtml(task)}
          <select data-action="move" aria-label="Колонка">${moveOptions(task)}</select>
        </div>
      </article>
    `;
  };

  const renderDayLine = (tasks) => {
    const todayCount = tasks.filter((task) => dueInfo(task)?.today && task.status !== 'done').length;
    const doneCount = tasks.filter((task) => task.status === 'done').length;
    const lateCount = tasks.filter((task) => dueInfo(task)?.late).length;
    const parts = [`Готово ${doneCount}`];
    if (todayCount) parts.push(`сегодня ${todayCount}`);
    if (lateCount) parts.push(`просрочено ${lateCount}`);
    dayLineEl.textContent = parts.join(' · ');
  };

  const renderTasks = (tasks) => {
    renderDayLine(tasks);
    if (!tasks.length) {
      tasksEl.innerHTML = '<div class="empty">Список пуст</div>';
      boardEl.querySelectorAll('.column-body').forEach((column) => {
        column.innerHTML = '<div class="empty">Пусто</div>';
      });
      return;
    }

    tasksEl.innerHTML = tasks.map((task, index) => cardHtml(task, index, false)).join('');
    columns.forEach((status) => {
      const column = boardEl.querySelector(`[data-drop="${status}"]`);
      const items = tasks.filter((task) => (task.status || 'todo') === status);
      column.innerHTML = items.length
        ? items.map((task, index) => cardHtml(task, index, true)).join('')
        : '<div class="empty">Перетащите карточку</div>';
    });
  };

  const setBoardMode = (enabled) => {
    boardMode = enabled;
    tasksEl.classList.toggle('hidden', enabled);
    boardEl.classList.toggle('hidden', !enabled);
    appEl.classList.toggle('app-wide', enabled);
    viewListBtn.classList.toggle('active', !enabled);
    viewBoardBtn.classList.toggle('active', enabled);
  };

  const loadTasks = async () => {
    try {
      const response = await fetch(API_BASE);
      if (!response.ok) {
        throw new Error(await parseError(response));
      }
      tasksCache = await response.json();
      renderTasks(tasksCache);
      hideAlert();
    } catch (err) {
      showAlert(networkErrorMessage(err) || 'Не удалось загрузить задачи');
      tasksEl.innerHTML = '<div class="empty">Ошибка загрузки</div>';
    }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideAlert();

    const title = titleInput.value.trim();
    if (title.length < 2) {
      showAlert('Название обязательно (минимум 2 символа)');
      titleInput.focus();
      return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', descriptionInput.value.trim());
    formData.append('status', statusInput.value);
    formData.append('priority', priorityInput.value);
    formData.append('dueDate', dueDateInput.value);
    if (attachmentInput.files[0]) {
      formData.append('attachment', attachmentInput.files[0]);
    }

    const isEdit = Boolean(editingId);
    const url = isEdit ? `${API_BASE}/${editingId}` : API_BASE;
    const method = isEdit ? 'PUT' : 'POST';

    submitBtn.disabled = true;

    try {
      const response = await fetch(url, { method, body: formData });
      if (!response.ok) {
        throw new Error(await parseError(response));
      }

      showAlert(isEdit ? 'Задача обновлена' : 'Задача создана', 'success');
      resetForm();
      await loadTasks();
    } catch (err) {
      showAlert(networkErrorMessage(err) || 'Не удалось сохранить задачу');
    } finally {
      submitBtn.disabled = false;
    }
  });

  cancelBtn.addEventListener('click', () => {
    resetForm();
    hideAlert();
  });

  const moveTask = async (id, status) => {
    const task = tasksCache.find((item) => item._id === id);
    if (!task || (task.status || 'todo') === status) {
      renderTasks(tasksCache);
      return;
    }

    const formData = new FormData();
    formData.append('title', task.title);
    formData.append('description', task.description || '');
    formData.append('status', status);
    formData.append('priority', task.priority || 'medium');
    formData.append('dueDate', dayValue(task.dueDate));

    try {
      const response = await fetch(`${API_BASE}/${id}`, { method: 'PUT', body: formData });
      if (!response.ok) throw new Error(await parseError(response));
      showAlert(status === 'done' ? 'Карточка в колонке «Готово»' : 'Карточка перенесена', 'success');
      await loadTasks();
    } catch (err) {
      showAlert(networkErrorMessage(err) || 'Не удалось перенести карточку');
      renderTasks(tasksCache);
    }
  };

  const onTaskClick = async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const card = button.closest('.task');
    const id = card?.dataset.id;
    if (!id) return;

    if (button.dataset.action === 'edit') {
      try {
        const response = await fetch(`${API_BASE}/${id}`);
        if (!response.ok) {
          throw new Error(await parseError(response));
        }
        fillForm(await response.json());
        hideAlert();
      } catch (err) {
        showAlert(networkErrorMessage(err) || 'Не удалось открыть задачу');
      }
      return;
    }

    if (button.dataset.action === 'delete') {
      if (!window.confirm('Удалить задачу?')) return;

      try {
        const response = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
        if (!response.ok) {
          throw new Error(await parseError(response));
        }
        if (editingId === id) resetForm();
        showAlert('Задача удалена', 'success');
        await loadTasks();
      } catch (err) {
        showAlert(networkErrorMessage(err) || 'Не удалось удалить задачу');
      }
    }
  };

  const onTaskChange = (event) => {
    const select = event.target.closest('select[data-action="move"]');
    if (!select) return;
    const id = select.closest('.task')?.dataset.id;
    if (!id) return;
    moveTask(id, select.value);
  };

  tasksEl.addEventListener('click', onTaskClick);
  boardEl.addEventListener('click', onTaskClick);
  tasksEl.addEventListener('change', onTaskChange);
  boardEl.addEventListener('change', onTaskChange);

  boardEl.addEventListener('dragstart', (event) => {
    const card = event.target.closest('.task');
    if (!card) return;
    event.dataTransfer.setData('text/plain', card.dataset.id);
    event.dataTransfer.effectAllowed = 'move';
    card.classList.add('dragging');
  });

  boardEl.addEventListener('dragend', (event) => {
    event.target.closest('.task')?.classList.remove('dragging');
    boardEl.querySelectorAll('.column').forEach((column) => column.classList.remove('over'));
  });

  boardEl.addEventListener('dragover', (event) => {
    const column = event.target.closest('.column');
    if (!column) return;
    event.preventDefault();
    boardEl.querySelectorAll('.column').forEach((item) => item.classList.toggle('over', item === column));
  });

  boardEl.addEventListener('drop', (event) => {
    const column = event.target.closest('.column');
    if (!column) return;
    event.preventDefault();
    column.classList.remove('over');
    const id = event.dataTransfer.getData('text/plain');
    if (id) moveTask(id, column.dataset.status);
  });

  viewListBtn.addEventListener('click', () => setBoardMode(false));
  viewBoardBtn.addEventListener('click', () => setBoardMode(true));

  loadTasks();
})();
