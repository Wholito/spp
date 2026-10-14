const clientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim().slice(0, 80);
  }
  return String(req.ip || '').slice(0, 80);
};

module.exports = clientIp;
