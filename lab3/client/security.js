window.TaskSecurity = (() => {
  let challengeId = '';
  let inviteToken = '';
  let api;
  let postJson;
  let applyAuth;
  let parseError;
  let showAlert;

  const byId = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);

  const init = (deps) => {
    ({ api, postJson, applyAuth, parseError, showAlert } = deps);
    byId('verify-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const response = await postJson('/api/auth/verify', { challengeId, code: byId('verify-code').value.trim() });
        await applyAuth(response);
        challengeId = '';
      } catch (err) { showAlert(err.message); }
    });
    byId('verify-back').addEventListener('click', () => {
      challengeId = '';
      byId('verify-panel').classList.add('hidden');
      byId('login-panel').classList.remove('hidden');
    });
    byId('invite-create-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const response = await api('/api/invitations', { method: 'POST', body: {
          email: byId('invite-email').value.trim(), role: byId('invite-role').value,
        } });
        if (!response.ok) throw new Error(await parseError(response));
        byId('invite-create-form').reset();
        showAlert('Приглашение отправлено', 'success');
      } catch (err) { showAlert(err.message); }
    });
    byId('invite-accept-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const response = await postJson('/api/invitations/accept', {
          token: inviteToken, name: byId('invite-name').value.trim(), password: byId('invite-password').value,
        });
        if (!response.ok) throw new Error(await parseError(response));
        history.replaceState({}, '', location.pathname);
        inviteToken = '';
        byId('invite-panel').classList.add('hidden');
        byId('login-panel').classList.remove('hidden');
        showAlert('Аккаунт создан. Теперь войдите', 'success');
      } catch (err) { showAlert(err.message); }
    });
  };

  const startLogin = async (response) => {
    if (!response.ok) throw new Error(await parseError(response));
    const data = await response.json();
    challengeId = data.challengeId;
    byId('login-panel').classList.add('hidden');
    byId('verify-panel').classList.remove('hidden');
    byId('verify-code').focus();
    showAlert('Код отправлен на почту', 'success');
  };

  const showInvite = (token) => {
    inviteToken = token;
    byId('login-panel').classList.add('hidden');
    byId('invite-panel').classList.remove('hidden');
  };

  const enter = async (role) => {
    byId('invitations-panel').classList.toggle('hidden', role !== 'admin');
    try {
      const response = await api('/api/auth/history');
      if (!response.ok) throw new Error(await parseError(response));
      const items = await response.json();
      byId('login-history').innerHTML = items.length ? items.map((item) => `<p>${escapeHtml(new Date(item.at).toLocaleString('ru-RU'))} · ${item.success ? 'Успешно' : 'Неудачно'} · ${escapeHtml(item.ip)} · ${escapeHtml(item.userAgent)}</p>`).join('') : '<p class="hint">История пока пуста</p>';
    } catch {
      byId('login-history').textContent = 'Не удалось загрузить историю входов';
    }
  };

  return { init, startLogin, showInvite, enter };
})();
