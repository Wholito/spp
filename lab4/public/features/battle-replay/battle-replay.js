(() => {
  window.SeaFeatures = window.SeaFeatures || {};

  window.SeaFeatures.createBattleReplay = ({ getRoom, send, isOnline }) => {
    const section = document.getElementById('replay-feature');
    const select = document.getElementById('replay-select');
    const openButton = document.getElementById('replay-open');
    const dialog = document.getElementById('replay-dialog');
    const timeline = document.getElementById('replay-timeline');
    const play = document.getElementById('replay-play');
    const speed = document.getElementById('replay-speed');
    const status = document.getElementById('replay-status');
    const boards = document.getElementById('replay-boards');
    const cache = new Map();
    let roomCode = null;
    let signature = '';
    let replay = null;
    let step = 0;
    let timer = null;
    let waiting = null;

    const pause = () => {
      clearTimeout(timer);
      timer = null;
      play.textContent = '▶ Воспроизвести';
      play.setAttribute('aria-pressed', 'false');
    };
    const stopWaiting = () => { if (waiting) clearTimeout(waiting.timer); waiting = null; };
    const setControls = (enabled) => {
      for (const id of ['replay-start', 'replay-back', 'replay-play', 'replay-next', 'replay-end', 'replay-speed', 'replay-timeline']) document.getElementById(id).disabled = !enabled;
    };

    const render = () => {
      if (!replay) return;
      const frame = window.SeaReplayModel.buildFrame(replay, step);
      timeline.value = step;
      document.getElementById('replay-progress').textContent = `Ход ${step} из ${replay.shots.length}`;
      const winner = replay.players.find((player) => player.id === replay.winnerId)?.name || '';
      document.getElementById('replay-summary').textContent = `${new Date(replay.startedAt).toLocaleString('ru-RU')} · Победитель: ${winner}`;
      const shot = frame.lastShot;
      if (shot) {
        const name = replay.players.find((player) => player.id === shot.playerId)?.name || '';
        const [x, y] = shot.cellId.split(':').map(Number);
        status.textContent = `${name}: ${'АБВГДЕЖЗИК'[x]}${y + 1} — ${{ miss: 'мимо', hit: 'попадание', sunk: 'корабль потоплен' }[shot.result]}${frame.finished ? `. Бой завершён. Победитель: ${winner}` : ''}`;
      } else status.textContent = 'Начальные расстановки. Оба флота открыты, потому что этот бой уже завершён.';
      boards.replaceChildren(...frame.boards.map((board) => {
        const section = document.createElement('section');
        const title = document.createElement('h3');
        title.textContent = board.name;
        const grid = document.createElement('div');
        grid.className = 'board replay-board';
        grid.setAttribute('role', 'img');
        grid.setAttribute('aria-label', `Поле ${board.name}, ход ${step}`);
        for (const cell of board.cells) {
          const element = document.createElement('span');
          element.className = ['cell', cell.ship ? 'ship' : '', cell.shot || '', cell.last ? 'replay-last' : ''].filter(Boolean).join(' ');
          element.dataset.cell = cell.id;
          element.textContent = cell.shot === 'miss' ? '·' : cell.shot ? '×' : '';
          grid.append(element);
        }
        section.append(title, grid);
        return section;
      }));
      document.getElementById('replay-start').disabled = step === 0;
      document.getElementById('replay-back').disabled = step === 0;
      document.getElementById('replay-next').disabled = frame.finished;
      document.getElementById('replay-end').disabled = frame.finished;
    };

    const load = (data) => {
      pause();
      replay = data;
      step = 0;
      timeline.max = replay.shots.length;
      setControls(true);
      render();
    };
    const schedule = () => {
      timer = setTimeout(() => {
        step++;
        render();
        if (step >= replay.shots.length) pause();
        else schedule();
      }, 900 / Number(speed.value));
    };
    const seek = (value) => { if (!replay) return; pause(); step = Math.max(0, Math.min(replay.shots.length, value)); render(); };

    openButton.addEventListener('click', () => {
      const room = getRoom();
      if (!room || !select.value) return;
      pause();
      stopWaiting();
      if (!dialog.open) dialog.showModal();
      replay = null;
      boards.replaceChildren();
      document.getElementById('replay-summary').textContent = '';
      document.getElementById('replay-progress').textContent = '';
      setControls(false);
      const key = `${room.code}:${select.value}`;
      if (cache.has(key)) { load(cache.get(key)); return; }
      if (!isOnline()) { status.textContent = 'Для первой загрузки повтора нужно соединение с сервером.'; return; }
      const requestId = crypto.randomUUID();
      status.textContent = 'Загружаем завершённый бой…';
      waiting = { requestId, key, timer: setTimeout(() => { waiting = null; status.textContent = 'Не удалось загрузить повтор. Закройте окно и попробуйте ещё раз.'; }, 5000) };
      if (!send({ type: 'replay', replayId: select.value, requestId })) {
        stopWaiting();
        status.textContent = 'Нет соединения с сервером.';
      }
    });
    document.getElementById('replay-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { pause(); stopWaiting(); });
    dialog.addEventListener('click', (event) => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
    document.getElementById('replay-start').addEventListener('click', () => seek(0));
    document.getElementById('replay-back').addEventListener('click', () => seek(step - 1));
    document.getElementById('replay-next').addEventListener('click', () => seek(step + 1));
    document.getElementById('replay-end').addEventListener('click', () => seek(replay?.shots.length || 0));
    timeline.addEventListener('input', () => seek(Number(timeline.value)));
    speed.addEventListener('change', () => { if (timer) { clearTimeout(timer); schedule(); } });
    play.addEventListener('click', () => {
      if (!replay) return;
      if (timer) { pause(); return; }
      if (step >= replay.shots.length) { step = 0; render(); }
      play.textContent = 'Ⅱ Пауза';
      play.setAttribute('aria-pressed', 'true');
      schedule();
    });

    const update = (room) => {
      if (room?.code !== roomCode) {
        pause(); stopWaiting(); cache.clear(); replay = null; signature = '';
        if (dialog.open) dialog.close();
        roomCode = room?.code || null;
      }
      section.classList.toggle('hidden', !room);
      const replays = room?.replays || [];
      const nextSignature = JSON.stringify(replays);
      if (signature !== nextSignature) {
        const selected = select.value;
        select.replaceChildren(...[...replays].reverse().map((item) => {
          const option = document.createElement('option');
          option.value = item.id;
          option.textContent = `${new Date(item.finishedAt).toLocaleString('ru-RU')} · ${item.winner} · ${item.moves} ходов`;
          return option;
        }));
        if (replays.some((item) => item.id === selected)) select.value = selected;
        signature = nextSignature;
      }
      select.disabled = !replays.length;
      openButton.disabled = !replays.length;
      document.getElementById('replay-empty').classList.toggle('hidden', Boolean(replays.length));
    };
    const handleMessage = (message) => {
      if (message.type !== 'replay') return false;
      if (!waiting || message.requestId !== waiting.requestId) return true;
      const key = waiting.key;
      stopWaiting();
      if (!message.replay) { status.textContent = 'Этот повтор недоступен. Доступны только завершённые бои вашей комнаты.'; return true; }
      if (cache.size >= 10) cache.delete(cache.keys().next().value);
      cache.set(key, message.replay);
      load(message.replay);
      return true;
    };

    return { update, handleMessage };
  };
})();
