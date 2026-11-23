(() => {
  window.SeaFeatures = window.SeaFeatures || {};

  window.SeaFeatures.createShipPlacement = ({ board, getState, perform, setDirection, notify }) => {
    const rack = document.getElementById('ship-rack');
    const hint = document.getElementById('placement-hint');
    let selectedLength = 4;
    let selectedShipId = null;
    let drag = null;
    let busy = false;
    let suppressClickUntil = 0;

    document.addEventListener('pointerdown', () => { suppressClickUntil = 0; }, { capture: true });

    const editable = () => {
      const { room, pending } = getState();
      return room?.phase === 'place' && room.own && !room.own.ready && !busy && !pending.some((item) => item.op === 'random');
    };

    const preview = window.SeaPlacementModel.previewPlacement;
    const applyLocal = window.SeaPlacementModel.applyLocalPlacement;

    const clearPreview = () => board.querySelectorAll('.placement-valid, .placement-invalid').forEach((cell) => cell.classList.remove('placement-valid', 'placement-invalid'));
    const cellAt = (x, y) => {
      const element = document.elementFromPoint(x, y)?.closest('[data-cell]');
      return element && board.contains(element) ? element : null;
    };
    const paintPreview = () => {
      clearPreview();
      if (!drag?.moved || !drag.target) return;
      const own = getState().room?.own;
      if (!own) return;
      const result = preview(own.ships || [], drag.target.x, drag.target.y, drag.length, drag.dir, drag.shipId);
      for (const id of result.cells) board.querySelector(`[data-cell="${id}"]`)?.classList.add(result.valid ? 'placement-valid' : 'placement-invalid');
      drag.valid = result.valid;
    };
    const targetAt = (clientX, clientY) => {
      const cell = cellAt(clientX, clientY);
      if (!cell) return null;
      const [x, y] = cell.dataset.cell.split(':').map(Number);
      return { x: x - (drag.dir === 'h' ? drag.offset : 0), y: y - (drag.dir === 'v' ? drag.offset : 0) };
    };

    const cancelDrag = () => {
      if (drag?.moved) suppressClickUntil = Date.now() + 400;
      if (drag && board.hasPointerCapture(drag.pointerId)) board.releasePointerCapture(drag.pointerId);
      drag?.ghost?.remove();
      drag = null;
      board.classList.remove('placement-dragging');
      clearPreview();
    };

    const submit = async (action) => {
      if (!editable()) return;
      busy = true;
      try {
        await perform({ ...action, actionId: crypto.randomUUID(), expectedVersion: getState().room.own.fleetVersion });
      } finally { busy = false; update(); }
    };

    const begin = (event, length, shipId = null, offset = 0) => {
      if (!editable() || event.button !== 0 || !event.isPrimary) return;
      const ship = getState().room.own.ships?.find((item) => item.id === shipId);
      const dir = ship?.length > 1 ? (ship.cells[0].split(':')[1] === ship.cells[1].split(':')[1] ? 'h' : 'v') : getState().dir;
      drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, clientX: event.clientX, clientY: event.clientY, length, shipId, offset, dir, moved: false, target: null, version: getState().room.own.fleetVersion };
      selectedShipId = shipId;
      selectedLength = length;
      board.setPointerCapture(event.pointerId);
    };

    rack.addEventListener('pointerdown', (event) => {
      const item = event.target.closest('[data-length]');
      if (item && !item.disabled) begin(event, Number(item.dataset.length));
    });
    board.addEventListener('pointerdown', (event) => {
      const cell = event.target.closest('[data-cell]');
      const ship = getState().room?.own?.ships?.find((item) => item.id === cell?.dataset.shipId);
      if (ship) begin(event, ship.length, ship.id, ship.cells.indexOf(cell.dataset.cell));
    });
    document.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag.clientX = event.clientX;
      drag.clientY = event.clientY;
      if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
      if (!drag.moved) {
        drag.moved = true;
        drag.ghost = document.createElement('div');
        drag.ghost.className = 'placement-ghost';
        drag.ghost.textContent = `Корабль · ${drag.length}`;
        document.body.append(drag.ghost);
        board.classList.add('placement-dragging');
      }
      event.preventDefault();
      drag.ghost.style.left = `${event.clientX + 15}px`;
      drag.ghost.style.top = `${event.clientY + 15}px`;
      drag.target = targetAt(event.clientX, event.clientY);
      paintPreview();
    }, { passive: false });
    document.addEventListener('pointerup', (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const current = drag;
      if (!current.moved) {
        cancelDrag();
        update();
        return;
      }
      current.target = targetAt(event.clientX, event.clientY);
      paintPreview();
      cancelDrag();
      if (!current.target || !current.valid) { notify('Выберите свободное место: корабли не должны касаться или выходить за поле.'); return; }
      submit({ op: current.shipId ? 'move' : 'place', shipId: current.shipId, length: current.length, ...current.target, dir: current.dir });
    });
    document.addEventListener('pointercancel', cancelDrag);
    window.addEventListener('blur', cancelDrag);
    document.addEventListener('visibilitychange', () => { if (document.hidden) cancelDrag(); });
    rack.addEventListener('click', (event) => {
      const item = event.target.closest('[data-length]');
      if (!item || item.disabled || Date.now() < suppressClickUntil) return;
      selectedLength = Number(item.dataset.length);
      selectedShipId = null;
      update();
    });
    board.addEventListener('click', (event) => {
      if (!editable() || Date.now() < suppressClickUntil) return;
      const cell = event.target.closest('[data-cell]');
      if (!cell) return;
      if (cell.dataset.shipId) { selectedShipId = cell.dataset.shipId; update(); return; }
      const [x, y] = cell.dataset.cell.split(':').map(Number);
      selectedShipId = null;
      submit({ op: 'place', length: selectedLength, x, y, dir: getState().dir });
    });

    const rotate = () => {
      if (drag?.moved) {
        drag.dir = drag.dir === 'h' ? 'v' : 'h';
        drag.target = targetAt(drag.clientX, drag.clientY);
        paintPreview();
        return;
      }
      const ship = getState().room?.own?.ships?.find((item) => item.id === selectedShipId);
      if (ship && editable()) {
        const [x, y] = ship.cells[0].split(':').map(Number);
        const dir = ship.length > 1 && ship.cells[0].split(':')[1] === ship.cells[1].split(':')[1] ? 'v' : 'h';
        submit({ op: 'move', shipId: ship.id, x, y, dir });
      } else setDirection(getState().dir === 'h' ? 'v' : 'h');
    };
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { cancelDrag(); selectedShipId = null; update(); }
      if ((event.code === 'KeyR' || event.key.toLowerCase() === 'r') && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && !event.target.closest('input, textarea, select, [contenteditable]') && editable()) {
        event.preventDefault();
        rotate();
      }
    });

    function update() {
      const { room } = getState();
      const own = room?.own;
      const open = room?.phase === 'place' && own && !own.ready;
      rack.classList.toggle('hidden', !open);
      hint.classList.toggle('hidden', !open);
      board.classList.toggle('placement-editable', Boolean(open));
      if (!open || drag && drag.version !== own?.fleetVersion) cancelDrag();
      if (!own) return;
      if (selectedShipId && !own.ships?.some((ship) => ship.id === selectedShipId)) selectedShipId = null;
      const remaining = own.remaining || [];
      if (!remaining.includes(selectedLength)) selectedLength = remaining[0] || null;
      if (!drag) {
        rack.replaceChildren(...[4, 3, 2, 1].map((length) => {
          const button = document.createElement('button');
          const count = remaining.filter((value) => value === length).length;
          button.type = 'button';
          button.className = `placement-ship ${!selectedShipId && selectedLength === length ? 'placement-selected' : ''}`;
          button.dataset.length = length;
          button.disabled = !count || busy;
          button.setAttribute('aria-pressed', String(!selectedShipId && selectedLength === length));
          button.setAttribute('aria-label', `Корабль на ${length} клетки, осталось ${count}`);
          const blocks = document.createElement('span');
          blocks.className = 'placement-blocks';
          blocks.textContent = '■'.repeat(length);
          button.append(blocks, document.createTextNode(` × ${count}`));
          return button;
        }));
      }
      for (const cell of board.querySelectorAll('[data-cell]')) {
        const entry = own.cells.find((item) => item.id === cell.dataset.cell);
        if (entry?.shipId) cell.dataset.shipId = entry.shipId;
        else delete cell.dataset.shipId;
        cell.classList.toggle('placement-selected-cell', Boolean(selectedShipId && entry?.shipId === selectedShipId));
      }
      hint.textContent = selectedShipId ? 'Корабль выбран. Перетащите его или нажмите «Повернуть» / R. Esc — снять выбор.' : remaining.length ? 'Перетащите корабль на поле или выберите размер и нажмите клетку. R — поворот, Esc — отмена.' : 'Флот собран. Корабли можно передвигать и поворачивать до нажатия «В бой».';
      paintPreview();
    }

    return { update, rotate, applyLocal };
  };
})();
