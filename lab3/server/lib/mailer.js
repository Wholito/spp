const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const logger = require('./logger');

const outboxDir = path.join(__dirname, '..', 'outbox');
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

  const account = await nodemailer.createTestAccount();
  fromAddress = 'Task Desk <no-reply@taskdesk.local>';
  logger.info('mail_transport_ready', { mode: 'ethereal', user: account.user });
  return nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    auth: { user: account.user, pass: account.pass },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000,
  });
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

const writeOutbox = async (entry) => {
  fs.mkdirSync(outboxDir, { recursive: true });
  const file = path.join(outboxDir, `${Date.now()}-${entry.to.replace(/[^a-z0-9@._-]/gi, '_')}.json`);
  fs.writeFileSync(file, JSON.stringify(entry, null, 2));
  return file;
};

const sendPasswordReset = async ({ to, resetUrl }) => {
  const subject = 'Восстановление доступа к Task Desk';
  const text = [
    'Чтобы задать новый пароль, откройте ссылку. Она действует 30 минут.',
    resetUrl,
    'Если вы не запрашивали восстановление, проигнорируйте это письмо.',
  ].join('\n\n');

  try {
    const transport = await getTransport();
    const info = await transport.sendMail({
      from: fromAddress,
      to,
      subject,
      text,
    });
    const preview = nodemailer.getTestMessageUrl(info) || null;
    logger.info('password_reset_sent', { to, messageId: info.messageId, preview });
    return { delivered: true, preview, resetUrl: null };
  } catch (err) {
    const file = await writeOutbox({ to, subject, text, resetUrl, error: err.message, at: new Date().toISOString() });
    logger.error('password_reset_failed', { to, message: err.message, outbox: file });
    return { delivered: false, preview: null, resetUrl };
  }
};

module.exports = { sendPasswordReset };
