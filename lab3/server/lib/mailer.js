const nodemailer = require('nodemailer');
const logger = require('./logger');
const HttpError = require('./httpError');

let transportPromise = null;
let fromAddress = '';

const buildTransport = async () => {
  if (process.env.SMTP_HOST) {
    fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@taskdesk.local';
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
        : undefined,
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 8000,
    });
  }

  throw new Error('SMTP_HOST is required for email delivery');
};

const getTransport = () => {
  if (!transportPromise) {
    transportPromise = buildTransport().catch((err) => {
      transportPromise = null;
      throw err;
    });
  }
  return transportPromise;
};

const sendMessage = async ({ to, subject, text }) => {
  try {
    const transport = await getTransport();
    const info = await transport.sendMail({ from: fromAddress, to, subject, text });
    logger.info('mail_sent', { messageId: info.messageId });
  } catch (err) {
    logger.error('mail_failed', { message: err.message });
    throw new HttpError(503, 'Почта временно недоступна', { code: 'MAIL_UNAVAILABLE' });
  }
};

const sendPasswordReset = async ({ to, resetUrl }) => {
  const subject = 'Восстановление доступа к Task Desk';
  const text = [
    'Чтобы задать новый пароль, откройте ссылку. Она действует 30 минут.',
    resetUrl,
    'Если вы не запрашивали восстановление, проигнорируйте это письмо.',
  ].join('\n\n');

  await sendMessage({ to, subject, text });
};

module.exports = { sendPasswordReset, sendMessage };
