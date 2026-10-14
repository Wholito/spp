const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');

const STATUSES = ['pending', 'in_progress', 'done'];

const STATUS_LABELS = {
  pending: 'Ожидает',
  in_progress: 'В работе',
  done: 'Выполнена',
};

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

function readTasks() {
  try {
    const raw = fs.readFileSync(TASKS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeTasks(tasks) {
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
}

function findTask(tasks, id) {
  return tasks.find((t) => t.id === id);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('ru-RU');
}

function isValidDueDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function redirectWithMessage(res, message) {
  res.redirect('/?message=' + encodeURIComponent(message));
}

function taskSteps(task) {
  return Array.isArray(task.steps) ? task.steps : [];
}

function stepProgress(task) {
  const steps = taskSteps(task);
  const done = steps.filter((step) => step.done).length;
  return { total: steps.length, done };
}

function focusOf(tasks) {
  const open = tasks
    .filter((task) => task.status !== 'done')
    .slice()
    .sort((a, b) => {
      const ad = a.dueDate || '9999-99-99';
      const bd = b.dueDate || '9999-99-99';
      if (ad !== bd) return ad < bd ? -1 : 1;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

  let left = 0;
  let next = null;

  for (const task of open) {
    const pending = taskSteps(task).filter((step) => !step.done);
    left += pending.length;
    if (!next && pending.length) {
      next = { title: task.title, text: pending[0].text };
    }
  }

  return { left, next };
}

app.locals.STATUSES = STATUSES;
app.locals.STATUS_LABELS = STATUS_LABELS;
app.locals.formatDate = formatDate;
app.locals.taskSteps = taskSteps;
app.locals.stepProgress = stepProgress;

app.get('/', (req, res, next) => {
  try {
    const filter = req.query.status || 'all';
    const stored = readTasks();
    const focus = focusOf(stored);
    let tasks = stored;

    if (filter !== 'all' && STATUSES.includes(filter)) {
      tasks = tasks.filter((t) => t.status === filter);
    }

    tasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.render('index', {
      tasks,
      filter,
      focus,
      message: req.query.message || null,
    });
  } catch (err) {
    next(err);
  }
});

app.post('/tasks', (req, res, next) => {
  try {
    const { title, dueDate } = req.body;

    if (!title || !title.trim()) {
      return redirectWithMessage(res, 'Укажите название задачи');
    }

    if (dueDate && !isValidDueDate(dueDate)) {
      return redirectWithMessage(res, 'Некорректная дата завершения');
    }

    const tasks = readTasks();
    tasks.push({
      id: uuidv4(),
      title: title.trim(),
      status: 'pending',
      dueDate: dueDate || null,
      attachments: [],
      createdAt: new Date().toISOString(),
    });

    writeTasks(tasks);
    redirectWithMessage(res, 'Задача создана');
  } catch (err) {
    next(err);
  }
});

app.post('/tasks/:id/status', (req, res, next) => {
  try {
    const { status } = req.body;
    const tasks = readTasks();
    const task = findTask(tasks, req.params.id);

    if (!task) {
      return redirectWithMessage(res, 'Задача не найдена');
    }

    if (!STATUSES.includes(status)) {
      return redirectWithMessage(res, 'Некорректный статус задачи');
    }

    task.status = status;
    writeTasks(tasks);
    redirectWithMessage(res, 'Статус обновлён');
  } catch (err) {
    next(err);
  }
});

app.post('/tasks/:id/due-date', (req, res, next) => {
  try {
    const { dueDate } = req.body;
    const tasks = readTasks();
    const task = findTask(tasks, req.params.id);

    if (!task) {
      return redirectWithMessage(res, 'Задача не найдена');
    }

    if (dueDate && !isValidDueDate(dueDate)) {
      return redirectWithMessage(res, 'Некорректная дата завершения');
    }

    task.dueDate = dueDate || null;
    writeTasks(tasks);
    redirectWithMessage(res, 'Дата обновлена');
  } catch (err) {
    next(err);
  }
});

app.post('/tasks/:id/steps', (req, res, next) => {
  try {
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
    const tasks = readTasks();
    const task = findTask(tasks, req.params.id);

    if (!task) {
      return redirectWithMessage(res, 'Задача не найдена');
    }

    if (!text) {
      return redirectWithMessage(res, 'Укажите шаг');
    }

    if (text.length > 200) {
      return redirectWithMessage(res, 'Шаг слишком длинный');
    }

    if (!Array.isArray(task.steps)) task.steps = [];
    if (task.steps.length >= 20) {
      return redirectWithMessage(res, 'У задачи уже 20 шагов');
    }

    task.steps.push({
      id: uuidv4(),
      text,
      done: false,
    });
    writeTasks(tasks);
    redirectWithMessage(res, 'Шаг добавлен');
  } catch (err) {
    next(err);
  }
});

app.post('/tasks/:id/steps/:stepId/toggle', (req, res, next) => {
  try {
    const tasks = readTasks();
    const task = findTask(tasks, req.params.id);
    const step = task && taskSteps(task).find((item) => item.id === req.params.stepId);

    if (!task || !step) {
      return redirectWithMessage(res, 'Шаг не найден');
    }

    step.done = !step.done;
    writeTasks(tasks);
    redirectWithMessage(res, step.done ? 'Шаг закрыт' : 'Шаг снова открыт');
  } catch (err) {
    next(err);
  }
});

app.post('/tasks/:id/steps/:stepId/delete', (req, res, next) => {
  try {
    const tasks = readTasks();
    const task = findTask(tasks, req.params.id);

    if (!task) {
      return redirectWithMessage(res, 'Задача не найдена');
    }

    const before = taskSteps(task).length;
    task.steps = taskSteps(task).filter((step) => step.id !== req.params.stepId);
    if (task.steps.length === before) {
      return redirectWithMessage(res, 'Шаг не найден');
    }

    writeTasks(tasks);
    redirectWithMessage(res, 'Шаг убран');
  } catch (err) {
    next(err);
  }
});

app.post('/tasks/:id/attach', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return redirectWithMessage(res, 'Файл слишком большой (макс. 5 МБ)');
      }
      return redirectWithMessage(res, 'Ошибка загрузки файла');
    }
    if (err) return next(err);

    try {
      const tasks = readTasks();
      const task = findTask(tasks, req.params.id);

      if (!task) {
        return redirectWithMessage(res, 'Задача не найдена');
      }

      if (!req.file) {
        return redirectWithMessage(res, 'Выберите файл');
      }

      task.attachments.push({
        id: uuidv4(),
        originalName: req.file.originalname,
        filename: req.file.filename,
        uploadedAt: new Date().toISOString(),
      });

      writeTasks(tasks);
      redirectWithMessage(res, 'Файл прикреплён');
    } catch (error) {
      next(error);
    }
  });
});

app.post('/tasks/:id/delete', (req, res, next) => {
  try {
    let tasks = readTasks();
    const task = findTask(tasks, req.params.id);

    if (task) {
      for (const attachment of task.attachments) {
        const filePath = path.join(UPLOADS_DIR, attachment.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
      tasks = tasks.filter((t) => t.id !== req.params.id);
      writeTasks(tasks);
    }

    redirectWithMessage(res, 'Задача удалена');
  } catch (err) {
    next(err);
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  if (res.headersSent) return;
  redirectWithMessage(res, 'Произошла ошибка на сервере');
});

app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});
