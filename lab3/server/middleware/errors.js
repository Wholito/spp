const logger = require('../lib/logger');
const HttpError = require('../lib/httpError');

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  let status = err.status || err.statusCode || 500;
  let message = err.expose ? err.message : 'Внутренняя ошибка сервера';
  let code = err.code || 'INTERNAL';
  let details = err.details;

  if (err instanceof HttpError) {
    status = err.status;
    message = err.expose ? err.message : 'Внутренняя ошибка сервера';
    code = err.code;
    details = err.details;
  } else if (err.type === 'entity.too.large' || status === 413) {
    status = 413;
    message = 'Слишком большой запрос';
    code = 'PAYLOAD_TOO_LARGE';
  } else if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    status = 400;
    message = 'Некорректный JSON';
    code = 'BAD_JSON';
  } else if (err.name === 'ValidationError') {
    status = 400;
    message = 'Проверьте введённые данные';
    code = 'VALIDATION';
    details = Object.values(err.errors).map((item) => item.message);
  } else if (err.code === 11000) {
    status = 409;
    message = 'Запись с такими данными уже существует';
    code = 'CONFLICT';
  } else if (err.name === 'CastError') {
    status = 400;
    message = 'Некорректный идентификатор';
    code = 'BAD_ID';
  }

  if (err.headers) {
    for (const [name, value] of Object.entries(err.headers)) {
      res.setHeader(name, value);
    }
  }

  const fields = {
    reqId: req.id,
    code,
    status,
    message: err.message,
  };
  if (status >= 500) {
    fields.stack = err.stack;
    logger.error('request_failed', fields);
  } else {
    logger.warn('request_rejected', fields);
  }

  const body = { error: message, code };
  if (details && details.length) body.details = details;
  res.status(status).json(body);
};

module.exports = errorHandler;
