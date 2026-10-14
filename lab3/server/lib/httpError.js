class HttpError extends Error {
  constructor(status, message, extras = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = extras.code || 'ERROR';
    this.details = extras.details;
    this.headers = extras.headers || null;
    this.expose = status < 500;
  }
}

module.exports = HttpError;
