const { validationResult } = require('express-validator');
const HttpError = require('../lib/httpError');

const validate = (req, _res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(
      new HttpError(400, 'Проверьте введённые данные', {
        code: 'VALIDATION',
        details: errors.array().map((item) => item.msg),
      })
    );
  }
  return next();
};

module.exports = validate;
