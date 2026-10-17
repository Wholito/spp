const fs = require('fs');
const path = require('path');

const logFile = () => process.env.LOG_FILE || path.join(__dirname, '..', 'logs', 'lab3.log');

const write = (level, msg, fields = {}) => {
  const entry = {
    time: new Date().toISOString(),
    level,
    service: 'lab3',
    msg,
    ...fields,
  };
  const line = `${JSON.stringify(entry)}\n`;
  process.stdout.write(line);
  try {
    const file = logFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, line);
  } catch (err) {
    process.stderr.write(`${JSON.stringify({
      time: new Date().toISOString(),
      level: 'error',
      service: 'lab3',
      msg: 'log_write_failed',
      message: err.message,
    })}\n`);
  }
};

module.exports = {
  info: (msg, fields) => write('info', msg, fields),
  warn: (msg, fields) => write('warn', msg, fields),
  error: (msg, fields) => write('error', msg, fields),
  logFile,
};
