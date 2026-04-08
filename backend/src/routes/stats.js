const express = require('express');
const mongoose = require('mongoose');
const { getOverviewStats, getPlayerStats, getCoursesStats } = require('../services/statsService');
const Course = require('../models/Course');

const router = express.Router();

router.get('/overview', async (req, res) => {
  try {
    const data = await getOverviewStats();
    return res.json(data);
  } catch (err) {
    console.error('Error getting overview stats', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/player/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(playerId)) {
      return res.status(400).json({ error: 'Invalid playerId' });
    }
    const data = await getPlayerStats(playerId);
    return res.json(data);
  } catch (err) {
    console.error('Error getting player stats', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/courses', async (req, res) => {
  try {
    const data = await getCoursesStats();
    return res.json(data);
  } catch (err) {
    console.error('Error getting courses stats', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/** Lista nombres de campo únicos (misma clave = una sola entrada, p. ej. varios documentos o mayúsculas). */
router.get('/course-names', async (req, res) => {
  try {
    const courses = await Course.find().select('name').sort({ name: 1 }).lean();
    const seen = new Map();
    for (const c of courses) {
      const raw = typeof c.name === 'string' ? c.name.trim() : '';
      if (!raw) continue;
      const key = raw.toLocaleLowerCase('es');
      if (!seen.has(key)) seen.set(key, raw);
    }
    const unique = [...seen.values()].sort((a, b) => a.localeCompare(b, 'es'));
    return res.json(unique);
  } catch (err) {
    console.error('Error listing course names', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;


