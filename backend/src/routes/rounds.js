const express = require('express');
const multer = require('multer');
const path = require('path');
const mongoose = require('mongoose');

const { verifyUploadToken } = require('../middleware/uploadAuth');
const { uploadDir } = require('../config/paths');
const { parseScorecardWithGemini } = require('../gemini/scorecardGemini');
const Player = require('../models/Player');
const Course = require('../models/Course');
const Round = require('../models/Round');
const { normalizePlayerName, escapeRegex } = require('../utils/playerName');

/** Solo jugadores ya dados de alta; no crea registros nuevos. */
async function findExistingPlayer(rawName) {
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (!name) return null;
  const nameKey = normalizePlayerName(name);

  let player = await Player.findOne({ nameKey });
  if (player) return player;

  const legacy = await Player.find({
    name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') },
  }).sort({ _id: 1 });

  return legacy.length > 0 ? legacy[0] : null;
}

const router = express.Router();

function imagePathToPublicUrl(imagePath) {
  if (!imagePath || typeof imagePath !== 'string') return null;
  const base = path.basename(imagePath);
  if (!base || base === '.' || base === '..') return null;
  return `/uploads/${base}`;
}

function roundWithImageUrl(roundDoc) {
  const o = roundDoc.toObject ? roundDoc.toObject({ virtuals: false }) : { ...roundDoc };
  o.imageUrl = imagePathToPublicUrl(o.imagePath);
  return o;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({ storage });

// GET /rounds — listar rondas (filtros opcionales: courseId, playerId)
router.get('/', async (req, res) => {
  try {
    const { courseId, playerId } = req.query;
    const filter = {};

    if (courseId) {
      if (!mongoose.Types.ObjectId.isValid(courseId)) {
        return res.status(400).json({ error: 'courseId inválido' });
      }
      filter.course = courseId;
    }
    if (playerId) {
      if (!mongoose.Types.ObjectId.isValid(playerId)) {
        return res.status(400).json({ error: 'playerId inválido' });
      }
      filter['players.player'] = playerId;
    }

    const rounds = await Round.find(filter)
      .sort({ date: -1 })
      .populate('course')
      .populate('players.player');

    const payload = rounds.map((r) => roundWithImageUrl(r));
    return res.json(payload);
  } catch (err) {
    console.error('Error listing rounds', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /rounds/:id — detalle (debe ir después de rutas fijas como /upload)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: 'Ronda no encontrada' });
    }
    const round = await Round.findById(id).populate('course').populate('players.player');
    if (!round) {
      return res.status(404).json({ error: 'Ronda no encontrada' });
    }
    return res.json(roundWithImageUrl(round));
  } catch (err) {
    console.error('Error getting round', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /rounds/upload - sube imagen y devuelve borrador basado en Gemini (NO guarda en BD)
router.post('/upload', verifyUploadToken, upload.single('image'), async (req, res) => {
  try {
    const { courseName, date } = req.body;

    const imagePath = req.file ? req.file.path : null;

    const geminiResult = await parseScorecardWithGemini(imagePath);
    const playersFromGemini = geminiResult.parsed?.players || [];

    const skippedNames = [];
    const matched = [];
    for (const p of playersFromGemini) {
      const dbPlayer = await findExistingPlayer(p.name);
      if (!dbPlayer) {
        const raw =
          typeof p.name === 'string' ? p.name.trim() : String(p.name || '').trim();
        if (raw) skippedNames.push(raw);
        continue;
      }
      matched.push({ gemini: p, dbPlayer });
    }

    const holes =
      matched.length > 0
        ? Math.min(18, Math.max(...matched.map(({ gemini: p }) => p.holesPlayed || 18)))
        : 18;

    const draftPlayers = matched.map(({ gemini: p, dbPlayer }) => {
      const slice = p.strokesPerHole.slice(0, holes);
      const totalFromHoles = slice.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
      const totalStrokes =
        p.totalStrokes > 0 ? p.totalStrokes : totalFromHoles || p.inTotal + p.outTotal;

      return {
        name: dbPlayer.name,
        playerId: String(dbPlayer._id),
        totalStrokes,
        strokesPerHole: Array.from({ length: holes }, (_, i) =>
          Number.isFinite(slice[i]) ? slice[i] : 0
        ),
        inTotal: p.inTotal,
        outTotal: p.outTotal,
        strokesOverPar: p.strokesOverPar,
      };
    });

    return res.status(200).json({
      draft: {
        courseName: courseName || '',
        date: date || '',
        imagePath,
        holes,
        players: draftPlayers,
      },
      gemini: {
        rawText: geminiResult.rawText,
        model: geminiResult.parsed?.model,
        parseError: geminiResult.parsed?.parseError,
        error: geminiResult.geminiError,
        skippedNames: [...new Set(skippedNames)],
      },
    });
  } catch (err) {
    console.error('Error creating round', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /rounds/confirm - guarda en BD una ronda basada en un borrador confirmado
router.post('/confirm', verifyUploadToken, async (req, res) => {
  try {
    const { courseName, date, imagePath, holes, players } = req.body;

    if (!courseName || !holes || !Array.isArray(players) || players.length === 0) {
      return res.status(400).json({ error: 'Datos incompletos para guardar la ronda' });
    }

    const unknownNames = [];
    for (const p of players) {
      if (!p.name) continue;
      const player = await findExistingPlayer(p.name);
      if (!player) unknownNames.push(p.name);
    }
    if (unknownNames.length > 0) {
      return res.status(400).json({
        error: 'Hay jugadores no registrados en la aplicación',
        unknownNames,
      });
    }

    const roundPlayers = [];
    for (const p of players) {
      if (!p.name) continue;
      const player = await findExistingPlayer(p.name);
      if (!player) continue;

      const strokesPerHole = Array.from({ length: holes }, (_, idx) =>
        Number(p.strokesPerHole?.[idx] ?? 0)
      );
      const totalStrokes =
        typeof p.totalStrokes === 'number' && p.totalStrokes > 0
          ? p.totalStrokes
          : strokesPerHole.reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0);

      const entry = {
        player: player._id,
        totalStrokes,
        strokesPerHole,
      };
      if (typeof p.strokesOverPar === 'number' && Number.isFinite(p.strokesOverPar)) {
        entry.strokesOverPar = p.strokesOverPar;
      }
      if (typeof p.inTotal === 'number' && Number.isFinite(p.inTotal)) {
        entry.inTotal = p.inTotal;
      }
      if (typeof p.outTotal === 'number' && Number.isFinite(p.outTotal)) {
        entry.outTotal = p.outTotal;
      }

      roundPlayers.push(entry);
    }

    let course = await Course.findOne({ name: courseName });
    if (!course) {
      course = await Course.create({ name: courseName, holes });
    }

    const round = await Round.create({
      date: date ? new Date(date) : new Date(),
      course: course._id,
      imagePath,
      players: roundPlayers,
    });

    const populated = await Round.findById(round._id)
      .populate('course')
      .populate('players.player');

    return res.status(201).json(populated);
  } catch (err) {
    console.error('Error confirming round', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
