const UPLOAD_PASSWORD = process.env.UPLOAD_PASSWORD || 'supersecreta';

function verifyUploadToken(req, res, next) {
  const token = req.headers['x-upload-token'];
  if (!token) {
    return res.status(401).json({ error: 'Missing upload token' });
  }

  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const parts = decoded.split(':');
    const secret = parts[1];

    if (secret !== UPLOAD_PASSWORD) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token format' });
  }
}

module.exports = { verifyUploadToken };


