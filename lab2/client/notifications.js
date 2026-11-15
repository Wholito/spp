window.TaskNotifications = (() => {
  const alertEl = document.getElementById('alert');
  const messageEl = document.getElementById('alert-message');
  const closeBtn = document.getElementById('alert-close');

  const hide = () => {
    alertEl.className = 'alert hidden';
    messageEl.textContent = '';
  };

  const show = (message, type = 'error') => {
    messageEl.textContent = message;
    alertEl.setAttribute('role', type === 'success' ? 'status' : 'alert');
    alertEl.className = `alert alert-${type}`;
  };

  closeBtn.addEventListener('click', hide);

  return { show, hide };
})();
