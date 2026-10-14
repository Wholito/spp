const crypto = require('crypto');
const logger = require('../lib/logger');
const clientIp = require('../lib/clientIp');

const context = (req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  const started = process.hrtime.bigint();

  res.on('finish', () => {
    if (req.path === '/api/health') return;
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    const fields = {
      reqId: req.id,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      durationMs: Math.round(durationMs),
      ip: clientIp(req),
      userId: req.user?.id || null,
    };
    if (res.statusCode >= 500) logger.error('request', fields);
    else if (res.statusCode >= 400) logger.warn('request', fields);
    else logger.info('request', fields);
  });

  next();
};

module.exports = context;
