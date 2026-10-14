const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./db');
const seed = require('./seed');
const logger = require('./lib/logger');
const context = require('./middleware/context');
const errorHandler = require('./middleware/errors');
const authRouter = require('./routes/auth');
const tasksRouter = require('./routes/tasks');
const sessionsRouter = require('./routes/sessions');
const usersRouter = require('./routes/users');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(context);
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/users', usersRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Маршрут не найден', code: 'NOT_FOUND' });
});

app.use(errorHandler);

const start = async () => {
  try {
    await connectDB();
    await seed();
    app.listen(PORT, () => {
      logger.info('server_started', { port: Number(PORT) });
    });
  } catch (err) {
    logger.error('server_failed', { message: err.message });
    process.exit(1);
  }
};

start();
