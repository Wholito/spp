(() => {
  const API_TASKS = '/api/tasks';
  const STORAGE_KEY = 'taskdesk-session';

  const alertEl = document.getElementById('alert');
  const leadEl = document.getElementById('lead');
  const authView = document.getElementById('auth-view');
  const deskView = document.getElementById('desk-view');
  const loginPanel = document.getElementById('login-panel');
  const registerPanel = document.getElementById('register-panel');
  const forgotPanel = document.getElementById('forgot-panel');
  const resetPanel = document.getElementById('reset-panel');
  const sessionChip = document.getElementById('session-chip');
  const identityEl = document.getElementById('identity');
  const editorPanel = document.getElementById('editor-panel');
  const usersPanel = document.getElementById('users-panel');
  const scopeAllBtn = document.getElementById('scope-all-btn');
  const forgotResult = document.getElementById('forgot-result');

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
  const sessionsEl = document.getElementById('sessions');
  const usersEl = document.getElementById('users');

  const statusLabels = {
    todo: 'К выполнению',
    in_progress: 'В работе',
    done: 'Готово',
  };

  const roleLabels = {
    viewer: 'Наблюдатель',
    editor: 'Редактор',
    admin: 'Администратор',
  };

  const roleLeads = {
    viewer: 'Ключ наблюдателя позволяет только читать задачи.',
    editor: 'Ключ редактора позволяет создавать задачи и менять свои.',
    admin: 'Ключ администратора открывает все задачи, роли и подключения.',
  };

  const statusMessages = {
    400: 'Некорректные данные. Проверьте форму и попробуйте снова',
    401: 'Нужно войти в систему',
    403: 'Недостаточно прав',
    404: 'Не найдено',
    409: 'Конфликт данных',
    410: 'Срок ссылки истёк',
    413: 'Файл слишком большой (максимум 5 МБ)',
    415: 'Такой тип файла не поддерживается',
    429: 'Слишком много попыток. Подождите и повторите',
    500: 'Внутренняя ошибка сервера',
    502: 'Сервер временно недоступен',
    503: 'Сервис временно недоступен',
    504: 'Превышено время ожидания ответа сервера',
  };

  let session = {};
  let editingId = null;
  let resetToken = '';
  let sessionsScope = 'mine';
  let refreshTask = null;
  let refreshScheduled = false;
  let clockId = null;

  const loadSession = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      session = raw ? JSON.parse(raw) : {};
    } catch {
      session = {};
    }
  };

  const saveSession = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  };

  const clearSession = () => {
    session = {};
    localStorage.removeItem(STORAGE_KEY);
    refreshScheduled = false;
  };

  const showAlert = (message, type = 'error') => {
    alertEl.textContent = message;
    alertEl.className = `alert alert-${type}`;
  };

  const hideAlert = () => {
    alertEl.className = 'alert hidden';
    alertEl.textContent = '';
  };

  const escapeHtml = (value) =>
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

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

  const decodeJwt = (token) => {
    try {
      const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(part));
    } catch {
      return null;
    }
  };

  const formatClock = (date) =>
    date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const showAuth = (panel) => {
    stopClock();
    authView.classList.remove('hidden');
    deskView.classList.add('hidden');
    sessionChip.classList.add('hidden');
    loginPanel.classList.toggle('hidden', panel !== 'login');
    registerPanel.classList.toggle('hidden', panel !== 'register');
    forgotPanel.classList.toggle('hidden', panel !== 'forgot');
    resetPanel.classList.toggle('hidden', panel !== 'reset');
    leadEl.textContent = 'Вход по временному ключу. Роли: наблюдатель, редактор и администратор.';
  };

  const renderChip = () => {
    const user = session.user;
    if (!user) {
      identityEl.innerHTML = '';
      return;
    }
    const payload = decodeJwt(session.accessToken || '');
    const exp = payload?.exp ? new Date(payload.exp * 1000) : null;
    const left = exp ? Math.max(0, Math.round((exp.getTime() - Date.now()) / 1000)) : null;
    identityEl.innerHTML = `
      <strong>${escapeHtml(user.name)}</strong>
      <span>${escapeHtml(roleLabels[user.role] || user.role)}${left !== null ? ` · ключ ${left} с` : ''}</span>
    `;
  };

  const stopClock = () => {
    if (clockId) clearInterval(clockId);
    clockId = null;
  };

  const startClock = () => {
    stopClock();
    clockId = setInterval(() => {
      renderChip();
      const payload = decodeJwt(session.accessToken || '');
      if (!payload?.exp || refreshScheduled) return;
      if (payload.exp * 1000 - Date.now() < 20000) {
        refreshScheduled = true;
        refreshSession().then((ok) => {
          refreshScheduled = false;
          if (!ok) {
            clearSession();
            showAuth('login');
            showAlert('Сессия истекла. Войдите снова');
            return;
          }
          renderChip();
        });
      }
    }, 1000);
  };

  const refreshSession = () => {
    if (!session.refreshToken) return Promise.resolve(false);
    if (!refreshTask) {
      refreshTask = fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      })
        .then(async (response) => {
          if (!response.ok) return false;
          const data = await response.json();
          session.accessToken = data.accessToken;
          session.refreshToken = data.refreshToken;
          session.user = data.user;
          saveSession();
          return true;
        })
        .catch(() => false)
        .finally(() => {
          refreshTask = null;
        });
    }
    return refreshTask;
  };

  const api = async (path, options = {}) => {
    const headers = new Headers(options.headers || {});
    if (session.accessToken) headers.set('Authorization', `Bearer ${session.accessToken}`);
    let body = options.body;
    if (body && !(body instanceof FormData) && typeof body !== 'string') {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(options.body);
    }
    let response = await fetch(path, { method: options.method || 'GET', headers, body });
    if (response.status === 401 && session.refreshToken && !options.retried) {
      const refreshed = await refreshSession();
      if (refreshed) return api(path, { ...options, retried: true });
      clearSession();
      showAuth('login');
    }
    return response;
  };

  const applyAuth = async (response) => {
    if (!response.ok) throw new Error(await parseError(response));
    const data = await response.json();
    session = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.user,
    };
    saveSession();
    hideAlert();
    await enterDesk();
  };

  const postJson = async (path, payload) => {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return response;
  };

  const canEdit = (task) => {
    const user = session.user;
    if (!user) return false;
    if (user.role === 'admin') return true;
    const ownerId = task.owner?._id || task.owner?.id || task.owner;
    return user.role === 'editor' && String(ownerId) === String(user.id);
  };

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
      .map((task, index) => {
        const status = task.status || 'todo';
        const fileHtml = task.attachment?.storedName
          ? `<a class="file-link" href="/uploads/${encodeURIComponent(task.attachment.storedName)}" target="_blank" rel="noopener">${escapeHtml(task.attachment.originalName)}</a>`
          : '<span class="file-muted">без файла</span>';
        const owner = task.owner?.name ? escapeHtml(task.owner.name) : 'без владельца';
        const actions = canEdit(task)
          ? `<div class="task-actions">
              <button type="button" data-action="edit">Изменить</button>
              <button type="button" class="danger" data-action="delete">Удалить</button>
            </div>`
          : '';

        return `
          <article class="task" data-id="${task._id}" style="animation-delay: ${Math.min(index, 8) * 40}ms">
            <div class="task-top">
              <div>
                <h3>${escapeHtml(task.title)}</h3>
                <p>${escapeHtml(task.description || '')}</p>
              </div>
              ${actions}
            </div>
            <div class="meta">
              <span class="badge badge-${escapeHtml(status)}">${statusLabels[status] || status}</span>
              <span>${owner}</span>
              ${fileHtml}
            </div>
          </article>
        `;
      })
      .join('');
  };

  const renderSessions = (items) => {
    if (!items.length) {
      sessionsEl.innerHTML = '<div class="empty">Активных подключений нет</div>';
      return;
    }
    sessionsEl.innerHTML = items
      .map((item) => {
        const when = item.lastSeenAt ? new Date(item.lastSeenAt).toLocaleString('ru-RU') : '';
        const who = item.user?.name ? `${escapeHtml(item.user.name)} · ` : '';
        return `
          <article class="row-card">
            <div>
              <h3>${who}${item.current ? 'этот ключ' : 'другое подключение'}</h3>
              <p>${escapeHtml(item.ip || 'ip неизвестен')} · ${escapeHtml((item.userAgent || 'клиент').slice(0, 80))}</p>
              <p>активность: ${escapeHtml(when)}</p>
            </div>
            <button type="button" class="secondary" data-revoke="${item.id}">Закрыть</button>
          </article>
        `;
      })
      .join('');
  };

  const renderUsers = (users) => {
    usersEl.innerHTML = users
      .map((user) => `
        <article class="row-card">
          <div>
            <h3>${escapeHtml(user.name)}</h3>
            <p>${escapeHtml(user.email)}</p>
          </div>
          <select data-user="${user.id}" aria-label="Роль ${escapeHtml(user.name)}">
            ${['viewer', 'editor', 'admin']
              .map((role) => `<option value="${role}" ${role === user.role ? 'selected' : ''}>${roleLabels[role]}</option>`)
              .join('')}
          </select>
        </article>
      `)
      .join('');
  };

  const loadTasks = async () => {
    const response = await api(API_TASKS);
    if (!response.ok) throw new Error(await parseError(response));
    renderTasks(await response.json());
  };

  const loadSessions = async () => {
    const query = sessionsScope === 'all' ? '?scope=all' : '';
    const response = await api(`/api/sessions${query}`);
    if (!response.ok) throw new Error(await parseError(response));
    renderSessions(await response.json());
  };

  const loadUsers = async () => {
    if (session.user?.role !== 'admin') return;
    const response = await api('/api/users');
    if (!response.ok) throw new Error(await parseError(response));
    renderUsers(await response.json());
  };

  const enterDesk = async () => {
    authView.classList.add('hidden');
    deskView.classList.remove('hidden');
    sessionChip.classList.remove('hidden');
    editorPanel.classList.toggle('hidden', session.user.role === 'viewer');
    usersPanel.classList.toggle('hidden', session.user.role !== 'admin');
    scopeAllBtn.classList.toggle('hidden', session.user.role !== 'admin');
    leadEl.textContent = roleLeads[session.user.role] || roleLeads.editor;
    renderChip();
    startClock();
    try {
      await loadTasks();
      await loadSessions();
      await loadUsers();
      hideAlert();
    } catch (err) {
      showAlert(networkErrorMessage(err));
    }
  };

  document.getElementById('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    hideAlert();
    const button = document.getElementById('login-btn');
    button.disabled = true;
    try {
      const response = await postJson('/api/auth/login', {
        email: document.getElementById('login-email').value.trim(),
        password: document.getElementById('login-password').value,
      });
      await applyAuth(response);
    } catch (err) {
      showAlert(networkErrorMessage(err));
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById('register-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    hideAlert();
    try {
      const response = await postJson('/api/auth/register', {
        name: document.getElementById('register-name').value.trim(),
        email: document.getElementById('register-email').value.trim(),
        password: document.getElementById('register-password').value,
        role: document.getElementById('register-role').value,
      });
      await applyAuth(response);
    } catch (err) {
      showAlert(networkErrorMessage(err));
    }
  });

  document.getElementById('forgot-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    hideAlert();
    forgotResult.classList.add('hidden');
    try {
      const response = await postJson('/api/auth/forgot', {
        email: document.getElementById('forgot-email').value.trim(),
      });
      const data = response.ok ? await response.json() : null;
      if (!response.ok) throw new Error(await parseError(response));
      let extra = '';
      if (data.previewUrl) {
        extra = ` <a href="${escapeHtml(data.previewUrl)}" target="_blank" rel="noopener">Открыть письмо</a>`;
      } else if (data.resetUrl) {
        extra = ` <a href="${escapeHtml(data.resetUrl)}">Ссылка восстановления</a>`;
      }
      forgotResult.innerHTML = `${escapeHtml(data.message || 'Письмо отправлено')}.${extra}`;
      forgotResult.classList.remove('hidden');
    } catch (err) {
      showAlert(networkErrorMessage(err));
    }
  });

  document.getElementById('reset-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    hideAlert();
    try {
      const response = await postJson('/api/auth/reset', {
        token: resetToken,
        password: document.getElementById('reset-password').value,
      });
      if (!response.ok) throw new Error(await parseError(response));
      const data = await response.json();
      history.replaceState({}, '', location.pathname);
      resetToken = '';
      showAuth('login');
      showAlert(data.message || 'Пароль обновлён', 'success');
    } catch (err) {
      showAlert(networkErrorMessage(err));
    }
  });

  document.getElementById('show-register').addEventListener('click', () => {
    hideAlert();
    showAuth('register');
  });
  document.getElementById('register-back').addEventListener('click', () => showAuth('login'));
  document.getElementById('show-forgot').addEventListener('click', () => {
    hideAlert();
    showAuth('forgot');
  });
  document.getElementById('forgot-back').addEventListener('click', () => showAuth('login'));

  document.getElementById('logout-btn').addEventListener('click', async () => {
    try {
      await api('/api/auth/logout', {
        method: 'POST',
        body: { refreshToken: session.refreshToken },
      });
    } catch {
    }
    clearSession();
    resetForm();
    showAuth('login');
    showAlert('Вы вышли из системы', 'success');
  });

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
    if (attachmentInput.files[0]) formData.append('attachment', attachmentInput.files[0]);

    const isEdit = Boolean(editingId);
    const url = isEdit ? `${API_TASKS}/${editingId}` : API_TASKS;
    const method = isEdit ? 'PUT' : 'POST';
    submitBtn.disabled = true;
    try {
      const response = await api(url, { method, body: formData });
      if (!response.ok) throw new Error(await parseError(response));
      showAlert(isEdit ? 'Задача обновлена' : 'Задача создана', 'success');
      resetForm();
      await loadTasks();
    } catch (err) {
      showAlert(networkErrorMessage(err));
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
    const id = button.closest('.task')?.dataset.id;
    if (!id) return;

    if (button.dataset.action === 'edit') {
      try {
        const response = await api(`${API_TASKS}/${id}`);
        if (!response.ok) throw new Error(await parseError(response));
        fillForm(await response.json());
        hideAlert();
        editorPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (err) {
        showAlert(networkErrorMessage(err));
      }
      return;
    }

    if (button.dataset.action === 'delete') {
      if (!window.confirm('Удалить задачу?')) return;
      try {
        const response = await api(`${API_TASKS}/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error(await parseError(response));
        if (editingId === id) resetForm();
        showAlert('Задача удалена', 'success');
        await loadTasks();
      } catch (err) {
        showAlert(networkErrorMessage(err));
      }
    }
  });

  sessionsEl.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-revoke]');
    if (!button) return;
    try {
      const response = await api(`/api/sessions/${button.dataset.revoke}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await parseError(response));
      const data = await response.json();
      if (data.current) {
        clearSession();
        showAuth('login');
        showAlert('Это подключение закрыто', 'success');
        return;
      }
      showAlert('Подключение закрыто', 'success');
      await loadSessions();
    } catch (err) {
      showAlert(networkErrorMessage(err));
    }
  });

  document.getElementById('revoke-others-btn').addEventListener('click', async () => {
    try {
      const response = await api('/api/sessions/revoke-others', { method: 'POST', body: {} });
      if (!response.ok) throw new Error(await parseError(response));
      showAlert('Остальные подключения закрыты', 'success');
      await loadSessions();
    } catch (err) {
      showAlert(networkErrorMessage(err));
    }
  });

  scopeAllBtn.addEventListener('click', async () => {
    sessionsScope = sessionsScope === 'all' ? 'mine' : 'all';
    scopeAllBtn.textContent = sessionsScope === 'all' ? 'Только мои' : 'Все';
    try {
      await loadSessions();
    } catch (err) {
      showAlert(networkErrorMessage(err));
    }
  });

  usersEl.addEventListener('change', async (event) => {
    const select = event.target.closest('select[data-user]');
    if (!select) return;
    try {
      const response = await api(`/api/users/${select.dataset.user}/role`, {
        method: 'PATCH',
        body: { role: select.value },
      });
      if (!response.ok) throw new Error(await parseError(response));
      showAlert('Роль обновлена', 'success');
      if (select.dataset.user === session.user.id) {
        session.user.role = select.value;
        saveSession();
        await enterDesk();
      }
    } catch (err) {
      showAlert(networkErrorMessage(err));
      loadUsers().catch(() => {});
    }
  });

  const boot = async () => {
    loadSession();
    const params = new URLSearchParams(location.search);
    const fromLink = params.get('reset');
    if (fromLink) {
      resetToken = fromLink;
      showAuth('reset');
      return;
    }
    if (!session.accessToken) {
      showAuth('login');
      return;
    }
    try {
      const response = await api('/api/auth/me');
      if (!response.ok) {
        clearSession();
        showAuth('login');
        return;
      }
      session.user = await response.json();
      saveSession();
      await enterDesk();
    } catch (err) {
      showAlert(networkErrorMessage(err));
      showAuth('login');
    }
  };

  boot();
})();
