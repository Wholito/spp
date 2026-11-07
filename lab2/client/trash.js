window.TaskTrash = (() => {
  const toggle = document.getElementById('trash-toggle');
  const list = document.getElementById('trash-list');
  let visible = false;

  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);

  const request = async (url, method) => {
    const response = await fetch(url, { method });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || 'Не удалось выполнить действие');
    }
  };

  const refresh = async () => {
    if (!visible) return;
    const response = await fetch('/api/tasks/trash');
    if (!response.ok) throw new Error('Не удалось загрузить корзину');
    const tasks = await response.json();
    list.innerHTML = tasks.length ? tasks.map((task) => `
      <article class="task" data-id="${task._id}">
        <h3>${escapeHtml(task.title)}</h3>
        <p>${escapeHtml(task.description || '')}</p>
        <div class="actions">
          <button type="button" data-trash="restore">Восстановить</button>
          <button type="button" class="danger" data-trash="delete">Удалить навсегда</button>
        </div>
      </article>
    `).join('') : '<div class="empty">Корзина пуста</div>';
  };

  const init = (onRestore, onError) => {
    toggle.addEventListener('click', async () => {
      visible = !visible;
      list.classList.toggle('hidden', !visible);
      toggle.textContent = visible ? 'Скрыть' : 'Показать';
      try { await refresh(); } catch (err) { onError(err); }
    });
    list.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-trash]');
      const id = button?.closest('.task')?.dataset.id;
      if (!id) return;
      if (button.dataset.trash === 'delete' && !window.confirm('Удалить задачу и её файл навсегда?')) return;
      try {
        await request(`/api/tasks/trash/${id}${button.dataset.trash === 'restore' ? '/restore' : ''}`, button.dataset.trash === 'restore' ? 'POST' : 'DELETE');
        await refresh();
        await onRestore();
      } catch (err) { onError(err); }
    });
  };

  return { init, refresh };
})();
