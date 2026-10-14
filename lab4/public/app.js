(() => {
  const KEY = 'sea-v1';

  const reasons = {
    CONFLICT: 'Эту клетку уже занял другой ход. Оставлен первый.',
    BAD_PLACE: 'Так корабль не ставится: он выходит за поле или касается другого',
    NEED_SHIPS: 'Сначала поставьте весь флот',
    ALREADY_READY: 'Расстановка уже сдана',
    NOT_READY: 'Расстановка ещё открыта',
    NOT_PLACE: 'Расстановка уже закончилась',
    NOT_BATTLE: 'Бой ещё не начался',
    NOT_TURN: 'Сейчас ход соперника',
    TAKEN: 'По этой клетке уже стреляли',
    NOT_OVER: 'Партия ещё идёт',
    EMPTY_FLEET: 'Убирать нечего',
    BAD_TEXT: 'Позывной: от 1 до 80 символов',
    BAD_NAME: 'Имя: от 2 до 16 символов, без скобок',
    NO_ROOM: 'Комната не найдена',
    ROOM_FULL: 'В комнате уже два капитана',
    UNKNOWN_TOKEN: 'Сохранённая партия не найдена на сервере',
    NO_CELL: 'Нет такой клетки',
    BAD_VERSION: 'Ход устарел',
    BAD_ACTION: 'Ход отклонён',
  };

  const statusEl = document.getElementById('status');
  const noteEl = document.getElementById('note');
  const lobbyEl = document.getElementById('lobby');
  const tableEl = document.getElementById('table');
  const ownEl = document.getElementById('own-board');
  const enemyEl = document.getElementById('enemy-board');
  const enemyWrap = document.getElementById('enemy-wrap');
  const playersEl = document.getElementById('players');
  const logEl = document.getElementById('log');
  const roomCodeEl = document.getElementById('room-code');
  const phaseEl = document.getElementById('phase-line');
  const nextShipEl = document.getElementById('next-ship');
  const dockEl = document.getElementById('dock');
  const againBtn = document.getElementById('again-btn');
  const bannerInput = document.getElementById('banner-input');
  const conflictEl = document.getElementById('conflict');
  const conflictText = document.getElementById('conflict-text');
  const dirBtn = document.getElementById('dir-btn');

  const state = {
    socket: null,
    online: false,
    connecting: false,
    room: null,
    token: null,
    playerId: null,
    name: '',
    dir: 'h',
    pending: [],
    conflict: null,
    note: '',
    flushing: false,
  };

  const waiters = new Map();
  let attempt = 0;
  let reconnectTimer = null;
  let syncing = false;

  const escapeHtml = (value) =>
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const persist = () => {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({
        token: state.token,
        playerId: state.playerId,
        name: state.name,
        dir: state.dir,
        pending: state.pending,
        conflict: state.conflict,
        room: state.room,
      })
    );
  };

  const restore = () => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (!saved) return;
      state.token = saved.token || null;
      state.playerId = saved.playerId || null;
      state.name = saved.name || '';
      state.dir = saved.dir === 'v' ? 'v' : 'h';
      state.pending = Array.isArray(saved.pending) ? saved.pending : [];
      state.conflict = saved.conflict || null;
      state.room = saved.room || null;
      if (state.pending.length) state.note = `Сохранено ходов без связи: ${state.pending.length}`;
    } catch {
      sessionStorage.removeItem(KEY);
    }
  };

  const sendRaw = (payload) => {
    if (!state.socket || state.socket.readyState !== 1) return false;
    state.socket.send(JSON.stringify(payload));
    return true;
  };

  const sendAndWait = (action) =>
    new Promise((resolve) => {
      if (!sendRaw({ type: 'action', ...action })) {
        resolve(null);
        return;
      }
      const timer = setTimeout(() => {
        waiters.delete(action.actionId);
        resolve(null);
      }, 4000);
      waiters.set(action.actionId, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
    });

  const showLobby = () => {
    lobbyEl.classList.remove('hidden');
    tableEl.classList.add('hidden');
  };

  const showTable = () => {
    lobbyEl.classList.add('hidden');
    tableEl.classList.remove('hidden');
  };

  const renderStatus = () => {
    let text = 'Подключение…';
    statusEl.className = 'status';
    if (state.online && state.room) {
      text = state.pending.length ? `В сети. Отправляем сохранённые ходы: ${state.pending.length}` : 'В сети';
      statusEl.classList.add('online');
    } else if (!state.online && (state.room || state.token)) {
      text = `Нет соединения. Сохранено ходов: ${state.pending.length}`;
      statusEl.classList.add('offline');
    } else if (state.online) {
      text = 'Соединение есть';
      statusEl.classList.add('online');
    } else if (!state.connecting) {
      text = 'Нет соединения';
      statusEl.classList.add('offline');
    }
    statusEl.textContent = text;
  };

  const renderNote = () => {
    if (!state.note) {
      noteEl.className = 'note hidden';
      noteEl.textContent = '';
      return;
    }
    noteEl.textContent = state.note;
    noteEl.className = 'note';
  };

  const selfPlayer = () => state.room?.players.find((player) => player.self) || null;

  const phaseText = () => {
    const room = state.room;
    if (!room) return '';
    if (room.phase === 'place') {
      if (!room.enemy) return 'Ждём второго капитана';
      if (selfPlayer()?.ready) return 'Вы готовы. Ждём соперника';
      return room.nextShip ? `Следующий корабль: ${room.nextShip}` : 'Флот собран';
    }
    if (room.phase === 'over') {
      if (room.winnerId === state.playerId) return 'Победа';
      return 'Поражение';
    }
    if (room.turn === state.playerId) return 'Ваш выстрел';
    const foe = room.players.find((player) => player.id === room.turn);
    return foe ? `Ход: ${foe.name}` : 'Бой';
  };

  const cellMark = (cell) => {
    if (cell.shot === 'miss') return '·';
    if (cell.shot === 'hit' || cell.shot === 'sunk') return '×';
    if (cell.ship) return '';
    return '';
  };

  const cellClass = (cell) => {
    const names = ['cell'];
    if (cell.shot === 'sunk') names.push('sunk');
    else if (cell.shot === 'hit') names.push('hit');
    else if (cell.shot === 'miss') names.push('miss');
    else if (cell.ship) names.push('ship');
    if (cell.pending) names.push('pending');
    return names.join(' ');
  };

  const drawBoard = (element, cells) => {
    const ordered = [...cells].sort((a, b) => a.y - b.y || a.x - b.x);
    element.innerHTML = ordered
      .map(
        (cell) =>
          `<button type="button" class="${cellClass(cell)}" data-cell="${cell.id}" aria-label="${cell.id}">${cellMark(cell)}</button>`
      )
      .join('');
  };

  const render = () => {
    renderStatus();
    renderNote();
    dirBtn.textContent = state.dir === 'h' ? 'Горизонтально' : 'Вертикально';
    if (!state.room) {
      showLobby();
      return;
    }
    showTable();
    roomCodeEl.textContent = state.room.code;
    phaseEl.textContent = phaseText();
    if (document.activeElement !== bannerInput) bannerInput.value = state.room.banner?.text || '';
    if (!state.conflict) conflictEl.classList.add('hidden');
    else {
      const current = state.conflict.current?.text || 'пусто';
      conflictText.textContent = `Сейчас: «${current}». Ваш вариант: «${state.conflict.text}».`;
      conflictEl.classList.remove('hidden');
    }
    drawBoard(ownEl, state.room.own?.cells || []);
    if (state.room.enemy) {
      enemyWrap.classList.remove('hidden');
      drawBoard(enemyEl, state.room.enemy.cells);
    } else {
      enemyWrap.classList.add('hidden');
    }
    const openPlace = state.room.phase === 'place' && !selfPlayer()?.ready;
    dockEl.classList.toggle('hidden', state.room.phase !== 'place');
    dirBtn.classList.toggle('hidden', !openPlace);
    document.getElementById('undo-btn').classList.toggle('hidden', !openPlace);
    document.getElementById('random-btn').classList.toggle('hidden', !openPlace);
    document.getElementById('ready-btn').textContent = selfPlayer()?.ready ? 'Изменить расстановку' : 'В бой';
    againBtn.classList.toggle('hidden', state.room.phase !== 'over');
    nextShipEl.textContent = selfPlayer()?.ready
      ? 'Расстановка сдана'
      : state.room.nextShip
        ? `Поставьте корабль на ${state.room.nextShip} ${state.room.nextShip === 1 ? 'клетку' : 'клетки'}`
        : 'Все корабли на поле';
    playersEl.innerHTML = state.room.players
      .map(
        (player) => `
          <div class="player">
            <div>
              <b>${escapeHtml(player.name)}${player.self ? ' (вы)' : ''}</b>
              <span>${player.ready ? 'готов' : 'расставляет'} · кораблей ${player.shipsLeft} · побед ${player.score}</span>
            </div>
            <i class="dot ${player.connected ? 'on' : ''}"></i>
          </div>`
      )
      .join('');
    const lines = state.room.log || [];
    logEl.innerHTML = lines.length ? lines.map((line) => `<p>${escapeHtml(line.text)}</p>`).join('') : '<p>Пока тихо</p>';
  };

  const queueLocal = (action) => {
    const room = state.room;
    if (!room?.own) return false;
    if (action.op === 'banner') {
      room.banner = { text: action.text, version: (room.banner?.version || 0) + 1 };
      return true;
    }
    if (action.op === 'shot') {
      if (room.phase !== 'battle' || room.turn !== state.playerId || !room.enemy) {
        state.note = reasons.NOT_TURN;
        return false;
      }
      const cell = room.enemy.cells.find((item) => item.id === action.cellId);
      if (!cell || cell.shot) {
        state.note = reasons.TAKEN;
        return false;
      }
      cell.shot = 'miss';
      cell.pending = true;
      cell.version += 1;
      return true;
    }
    if (room.phase !== 'place') {
      state.note = reasons.NOT_PLACE;
      return false;
    }
    room.own.fleetVersion += 1;
    return true;
  };

  const flushPending = async () => {
    if (state.flushing || state.conflict) return;
    state.flushing = true;
    try {
      while (state.pending.length && state.online) {
        const action = state.pending[0];
        const ack = await sendAndWait(action);
        if (!ack) return;
        state.pending.shift();
        if (ack.room) state.room = ack.room;
        if (ack.ok) continue;
        if (ack.conflict && ack.resolution === 'choose') {
          state.conflict = { current: ack.current, text: action.text };
          state.note = 'Позывной изменили одновременно. Выберите, что оставить.';
          break;
        }
        state.note = reasons[ack.code] || reasons.CONFLICT;
        state.pending = [];
        break;
      }
    } finally {
      state.flushing = false;
      if (
        state.online &&
        !state.pending.length &&
        !state.conflict &&
        /сохран|соединен|Связь прервалась|восстанавливаем/i.test(state.note)
      ) {
        state.note = '';
      }
      persist();
      render();
    }
  };

  const perform = async (action) => {
    if (!state.online) {
      if (!queueLocal(action)) {
        render();
        return;
      }
      state.pending.push(action);
      state.note = `Нет соединения. Ход сохранён (${state.pending.length}).`;
      persist();
      render();
      return;
    }
    const ack = await sendAndWait(action);
    if (!ack) {
      if (!queueLocal(action)) {
        render();
        return;
      }
      state.pending.push(action);
      state.note = 'Связь прервалась, ход сохранён';
      persist();
      render();
      return;
    }
    if (ack.room) state.room = ack.room;
    if (!ack.ok && ack.conflict && ack.resolution === 'choose') {
      state.conflict = { current: ack.current, text: action.text };
      state.note = 'Позывной изменили одновременно. Выберите, что оставить.';
    } else if (!ack.ok) {
      state.note = reasons[ack.code] || 'Ход не принят';
    } else {
      state.note = '';
    }
    persist();
    render();
  };

  const onMessage = (msg) => {
    if (msg.type === 'welcome' || msg.type === 'state') {
      if (msg.token) state.token = msg.token;
      if (msg.playerId) state.playerId = msg.playerId;
      if (msg.room) {
        state.room = msg.room;
        const self = state.room.players.find((player) => player.id === state.playerId);
        if (self) state.name = self.name;
      }
      syncing = false;
      persist();
      render();
      if (msg.type === 'welcome') flushPending();
      return;
    }

    if (msg.type === 'tick' && state.room) {
      if (msg.version === state.room.version) {
        state.room.players = msg.players;
        render();
        return;
      }
      if (state.online && !state.pending.length && !state.flushing && !syncing) {
        syncing = true;
        sendRaw({ type: 'sync' });
      }
      return;
    }

    if (msg.type === 'ack') {
      const waiter = waiters.get(msg.actionId);
      if (waiter) {
        waiters.delete(msg.actionId);
        waiter(msg);
        return;
      }
      if (msg.room) state.room = msg.room;
      if (!msg.ok) state.note = reasons[msg.code] || 'Ход не принят';
      persist();
      render();
      return;
    }

    if (msg.type === 'error') {
      state.note = reasons[msg.code] || 'Ошибка';
      if (msg.code === 'UNKNOWN_TOKEN') {
        state.token = null;
        state.playerId = null;
        state.room = null;
        state.pending = [];
        state.conflict = null;
        persist();
      }
      render();
    }
  };

  const connect = () => {
    if (state.socket && (state.socket.readyState === 0 || state.socket.readyState === 1)) return;
    state.connecting = true;
    renderStatus();
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${proto}://${location.host}`);
    state.socket = socket;

    socket.addEventListener('open', () => {
      state.online = true;
      state.connecting = false;
      attempt = 0;
      if (state.token) sendRaw({ type: 'hello', token: state.token });
      else render();
    });

    socket.addEventListener('message', (event) => {
      try {
        onMessage(JSON.parse(event.data));
      } catch {
        state.note = 'Некорректный ответ сервера';
        renderNote();
      }
    });

    socket.addEventListener('close', () => {
      state.online = false;
      state.connecting = false;
      state.flushing = false;
      for (const fail of waiters.values()) fail(null);
      waiters.clear();
      persist();
      render();
      const delay = Math.min(8000, 500 * 2 ** attempt);
      attempt += 1;
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, delay);
    });

    socket.addEventListener('error', () => {});
  };

  document.getElementById('create-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = document.getElementById('create-name').value.trim();
    state.name = name;
    state.note = '';
    if (!sendRaw({ type: 'create', name })) {
      state.note = 'Нет соединения с сервером';
      renderNote();
    }
  });

  document.getElementById('join-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = document.getElementById('join-name').value.trim();
    const code = document.getElementById('join-code').value.trim().toUpperCase();
    state.name = name;
    state.note = '';
    if (!sendRaw({ type: 'join', name, code })) {
      state.note = 'Нет соединения с сервером';
      renderNote();
    }
  });

  document.getElementById('banner-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (!state.room) return;
    perform({
      actionId: crypto.randomUUID(),
      op: 'banner',
      text: bannerInput.value.trim(),
      expectedVersion: state.room.banner?.version || 0,
    });
  });

  dirBtn.addEventListener('click', () => {
    state.dir = state.dir === 'h' ? 'v' : 'h';
    persist();
    render();
  });

  const fleetAction = (op) => {
    if (!state.room?.own) return;
    perform({
      actionId: crypto.randomUUID(),
      op,
      expectedVersion: state.room.own.fleetVersion,
    });
  };

  document.getElementById('undo-btn').addEventListener('click', () => fleetAction('unplace'));
  document.getElementById('random-btn').addEventListener('click', () => fleetAction('random'));
  document.getElementById('ready-btn').addEventListener('click', () => {
    if (selfPlayer()?.ready) fleetAction('unready');
    else fleetAction('ready');
  });

  againBtn.addEventListener('click', () => {
    if (!state.room) return;
    perform({
      actionId: crypto.randomUUID(),
      op: 'again',
      expectedVersion: state.room.version,
    });
  });

  ownEl.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-cell]');
    if (!button || !state.room?.own || state.room.phase !== 'place' || selfPlayer()?.ready) return;
    const [x, y] = button.dataset.cell.split(':').map(Number);
    perform({
      actionId: crypto.randomUUID(),
      op: 'place',
      x,
      y,
      dir: state.dir,
      expectedVersion: state.room.own.fleetVersion,
    });
  });

  enemyEl.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-cell]');
    if (!button || !state.room?.enemy) return;
    const cell = state.room.enemy.cells.find((item) => item.id === button.dataset.cell);
    if (!cell) return;
    perform({
      actionId: crypto.randomUUID(),
      op: 'shot',
      cellId: cell.id,
      expectedVersion: cell.version,
    });
  });

  document.getElementById('copy-btn').addEventListener('click', async () => {
    if (!state.room) return;
    try {
      await navigator.clipboard.writeText(state.room.code);
      state.note = 'Код комнаты скопирован';
    } catch {
      state.note = `Код комнаты: ${state.room.code}`;
    }
    renderNote();
  });

  document.getElementById('exit-btn').addEventListener('click', () => {
    state.token = null;
    state.playerId = null;
    state.room = null;
    state.pending = [];
    state.conflict = null;
    state.note = '';
    sessionStorage.removeItem(KEY);
    if (state.socket) state.socket.close();
    showLobby();
    render();
  });

  document.getElementById('conflict-keep').addEventListener('click', () => {
    state.conflict = null;
    state.note = 'Оставлен текущий позывной';
    persist();
    render();
    flushPending();
  });

  document.getElementById('conflict-mine').addEventListener('click', async () => {
    if (!state.conflict) return;
    const text = state.conflict.text;
    const version = state.conflict.current?.version ?? state.room?.banner?.version ?? 0;
    state.conflict = null;
    await perform({
      actionId: crypto.randomUUID(),
      op: 'banner',
      text,
      expectedVersion: version,
    });
    flushPending();
  });

  window.addEventListener('offline', () => {
    state.note = 'Интернет пропал. Ходы останутся на этом устройстве.';
    persist();
    render();
  });

  window.addEventListener('online', () => {
    state.note = 'Сеть появилась, восстанавливаем партию';
    connect();
    render();
  });

  window.addEventListener('beforeunload', persist);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persist();
  });

  setInterval(() => {
    if (state.online) sendRaw({ type: 'ping' });
  }, 25000);

  restore();
  render();
  connect();
})();
