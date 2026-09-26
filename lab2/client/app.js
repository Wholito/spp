(() => {
  const API_BASE = '/api/tasks';

  const form = document.getElementById('task-form');
  const formTitle = document.getElementById('form-title');
  const titleInput = document.getElementById('title');
  const descriptionInput = document.getElementById('description');
  const statusInput = document.getElementById('status');
  const attachmentInput = document.getElementById('attachment');
  const currentFileEl = document.getElementById('current-file');
  const submitBtn = document.getElementById('submit-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const tasksEl = document.getElementById('tasks');
  const alertEl = document.getElementById('alert');

  const statusLabels = {
    todo: 'К выполнению',
    in_progress: 'В работе',
    done: 'Готово',
  };

  let editingId = null;

  const showAlert = (message, type = 'error') => {
    alertEl.textContent = message;
    alertEl.className = `alert alert-${type}`;
  };

  const hideAlert = () => {
    alertEl.className = 'alert hidden';
    alertEl.textContent = '';
  };

  const parseError = async (response) => {
    try {
      const data = await response.json();
      if (Array.isArray(data.details) && data.details.length) {
        return data.details.join('; ');
      }
      return data.error || `Ошибка ${response.status}`;
    } catch {
      return `Ошибка ${response.status}`;
    }
  };

  const escapeHtml = (value) =>
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const resetForm = () => {
    editingId = null;
    form.reset();
    statusInput.value = 'todo';
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

  const renderTasks = (tasks) => {
    if (!tasks.length) {
      tasksEl.innerHTML = '<div class="empty">Список пуст</div>';
      return;
    }

    tasksEl.innerHTML = tasks
      .map((task) => {
        const fileHtml = task.attachment?.storedName
          ? `<a href="/uploads/${encodeURIComponent(task.attachment.storedName)}" target="_blank" rel="noopener">${escapeHtml(task.attachment.originalName)}</a>`
          : 'без файла';

        return `
          <article class="task" data-id="${task._id}">
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
              ${statusLabels[task.status] || task.status} · ${fileHtml}
            </div>
          </article>
        `;
      })
      .join('');
  };

  const loadTasks = async () => {
    try {
      const response = await fetch(API_BASE);
      if (!response.ok) {
        throw new Error(await parseError(response));
      }
      renderTasks(await response.json());
      hideAlert();
    } catch (err) {
      showAlert(err.message || 'Не удалось загрузить задачи');
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
      showAlert(err.message || 'Не удалось сохранить задачу');
    } finally {
      submitBtn.disabled = false;
    }
  });

  cancelBtn.addEventListener('click', () => {
    resetForm();
    hideAlert();
  });

  tasksEl.addEventListener('click', async (event) => {
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
        showAlert(err.message || 'Не удалось открыть задачу');
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
        showAlert(err.message || 'Не удалось удалить задачу');
      }
    }
  });

  loadTasks();
})();
