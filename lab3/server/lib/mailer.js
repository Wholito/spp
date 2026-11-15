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

const gmailApiReady = () =>
  Boolean(
    process.env.GMAIL_CLIENT_ID &&
      process.env.GMAIL_CLIENT_SECRET &&
      process.env.GMAIL_REFRESH_TOKEN &&
      process.env.GMAIL_USER
  );

const encodeHeader = (value) => `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;

const sendWithGmailApi = async ({ to, subject, text }) => {
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!tokenResponse.ok) throw new Error(`Gmail OAuth returned HTTP ${tokenResponse.status}`);
  const { access_token: accessToken } = await tokenResponse.json();
  if (!accessToken) throw new Error('Gmail OAuth response did not contain an access token');

  const from = process.env.SMTP_FROM || process.env.GMAIL_USER;
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(text, 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n').trim(),
  ].join('\r\n');
  const raw = Buffer.from(message, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  const sendResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ raw }),
    signal: AbortSignal.timeout(10000),
  });
  if (!sendResponse.ok) throw new Error(`Gmail API returned HTTP ${sendResponse.status}`);
  const result = await sendResponse.json();
  return { messageId: result.id };
};

const sendMessage = async ({ to, subject, text }) => {
  try {
    if (gmailApiReady()) {
      const info = await sendWithGmailApi({ to, subject, text });
      logger.info('mail_sent', { messageId: info.messageId, provider: 'gmail-api' });
      return;
    }
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
