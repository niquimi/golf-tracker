const express = require('express');

const router = express.Router();

const UPLOAD_PASSWORD = process.env.UPLOAD_PASSWORD || 'supersecreta';

router.post('/check-upload-password', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  if (password !== UPLOAD_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  // Token muy simple (no JWT) solo para esta app
  const token = Buffer.from(`${Date.now()}:${UPLOAD_PASSWORD}`).toString('base64');
  return res.json({ token });
});

module.exports = router;


