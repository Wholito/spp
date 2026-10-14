const bcrypt = require('bcryptjs');

const passwordOk = (value) =>
  typeof value === 'string' &&
  value.length >= 8 &&
  value.length <= 72 &&
  /[A-Za-zА-Яа-яЁё]/.test(value) &&
  /\d/.test(value);

const hashPassword = (password) => bcrypt.hash(password, 10);

const verifyPassword = (password, hash) => bcrypt.compare(password, hash);

module.exports = { passwordOk, hashPassword, verifyPassword };
