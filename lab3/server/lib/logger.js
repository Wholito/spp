const write = (level, msg, fields = {}) => {
  const entry = {
    time: new Date().toISOString(),
    level,
    service: 'lab3',
    msg,
    ...fields,
  };
  process.stdout.write(`${JSON.stringify(entry)}\n`);
};

module.exports = {
  info: (msg, fields) => write('info', msg, fields),
  warn: (msg, fields) => write('warn', msg, fields),
  error: (msg, fields) => write('error', msg, fields),
};
