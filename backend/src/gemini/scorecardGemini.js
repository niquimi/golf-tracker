const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
/** Usa otro modelo si tu clave no tiene cuota (p. ej. gemini-2.0-flash con límite 0 en free tier). */
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_MAX_RETRIES = Math.min(5, Math.max(1, parseInt(process.env.GEMINI_MAX_RETRIES || '3', 10) || 3));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extrae segundos de mensajes tipo "Please retry in 43.13s" */
function parseRetryDelayMs(err) {
  const m = String(err?.message || '').match(/retry in ([\d.]+)\s*s/i);
  if (m) return Math.ceil(parseFloat(m[1]) * 1000) + 250;
  return null;
}

function isRateLimitError(err) {
  const msg = String(err?.message || '');
  return (
    msg.includes('429') ||
    msg.includes('Too Many Requests') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    /quota|rate.?limit/i.test(msg)
  );
}

function formatGeminiError(err) {
  const msg = String(err?.message || '');
  if (isRateLimitError(err)) {
    return (
      'Cuota o límite de peticiones de Gemini (429). Espera unos minutos, revisa ' +
      'https://ai.google.dev/gemini-api/docs/rate-limits o cambia GEMINI_MODEL en .env ' +
      `(ahora: ${GEMINI_MODEL}). Si ves "limit: 0", prueba otro modelo o activa facturación en Google AI Studio.`
    );
  }
  return msg || 'Error al llamar a Gemini';
}

async function generateContentWithRetries(model, parts) {
  let lastErr;
  for (let attempt = 1; attempt <= GEMINI_MAX_RETRIES; attempt += 1) {
    try {
      return await model.generateContent(parts);
    } catch (err) {
      lastErr = err;
      if (!isRateLimitError(err) || attempt === GEMINI_MAX_RETRIES) {
        throw err;
      }
      const fromApi = parseRetryDelayMs(err);
      const backoff = fromApi ?? Math.min(90_000, 2000 * 2 ** (attempt - 1));
      console.warn(
        `Gemini rate limit (intento ${attempt}/${GEMINI_MAX_RETRIES}), esperando ${Math.round(backoff / 1000)}s…`
      );
      await sleep(backoff);
    }
  }
  throw lastErr;
}

const TSV_INSTRUCTION = `Eres un asistente que lee fotos de tarjetas de puntuación de golf.

Tareas:
1) Identifica la fila o columnas de PAR por hoyo. Si todos los hoyos son par 3, el campo es pitch & putt: par total = (número de hoyos) × 3 (ej. 18 hoyos → par 54; 9 hoyos → par 27).
2) Lee los golpes (scores) por hoyo de cada jugador.
3) Calcula In = suma de golpes en hoyos 1–9; Out = suma de golpes en hoyos 10–18. Si solo hay 9 hoyos jugados, deja 10–18 vacíos o 0 y Out = 0 o vacío según corresponda.
4) Calcula SobrePar = (suma de golpes del jugador en los hoyos jugados) − (suma de los par de esos hoyos). Debe ser coherente con los par leídos o inferidos.

Salida OBLIGATORIA:
- Solo texto plano en formato TSV (separador TAB, no comas).
- Sin markdown, sin bloques de código, sin explicaciones, sin líneas antes ni después de la tabla.
- Primera línea: cabecera EXACTA con estas columnas en este orden (nombres tal cual):
Nombre\tHoyos\t1\t2\t3\t4\t5\t6\t7\t8\t9\tIn\t10\t11\t12\t13\t14\t15\t16\t17\t18\tOut\tSobrePar

- Una línea por jugador. Hoyos = número de hoyos jugados (9 o 18). Los números 1–18 son golpes en cada hoyo. In y Out son totales. SobrePar es un número (puede ser negativo, cero o positivo).`;

function guessMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

function stripCodeFences(text) {
  let t = text.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```[a-z0-9]*\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  return t;
}

function normalizeHeaderCell(h) {
  return String(h).trim().toLowerCase();
}

function parseNum(v) {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parsea TSV devuelto por Gemini. Devuelve { players: [...] }.
 */
function parseTsvResponse(rawText) {
  const cleaned = stripCodeFences(rawText);
  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const tabLines = lines.filter((l) => l.includes('\t'));
  if (tabLines.length < 2) {
    return { players: [], parseError: 'No hay al menos cabecera y una fila TSV' };
  }

  let headerIdx = tabLines.findIndex((l) => /nombre/i.test(l.split('\t')[0] || ''));
  if (headerIdx === -1) headerIdx = 0;

  const headerLine = tabLines[headerIdx];
  const headers = headerLine.split('\t').map((h) => h.trim());
  const col = {};
  headers.forEach((h, i) => {
    col[normalizeHeaderCell(h)] = i;
  });

  const need = ['nombre', 'hoyos', 'in', 'out', 'sobrepar'];
  const missing = need.filter((k) => col[k] === undefined);
  if (missing.length > 0) {
    return { players: [], parseError: `Cabecera incompleta: faltan ${missing.join(', ')}` };
  }

  const players = [];
  for (let r = headerIdx + 1; r < tabLines.length; r += 1) {
    const parts = tabLines[r].split('\t');
    const name = (parts[col.nombre] || '').trim();
    if (!name) continue;

    const holesPlayed = Math.min(18, Math.max(1, Math.round(parseNum(parts[col.hoyos]) || 18)));

    const strokesPerHole = [];
    for (let h = 1; h <= 18; h += 1) {
      const key = String(h);
      const idx = col[key];
      strokesPerHole.push(idx !== undefined ? parseNum(parts[idx]) : 0);
    }

    let totalStrokes = strokesPerHole.reduce((a, b) => a + b, 0);
    if (totalStrokes <= 0 && holesPlayed > 0) {
      const inVal = parseNum(parts[col.in]);
      const outVal = parseNum(parts[col.out]);
      if (inVal + outVal > 0) totalStrokes = inVal + outVal;
    }

    const inTotal = parseNum(parts[col.in]);
    const outTotal = parseNum(parts[col.out]);
    const strokesOverPar = parseNum(parts[col.sobrepar]);

    players.push({
      name,
      holesPlayed,
      strokesPerHole,
      totalStrokes: totalStrokes > 0 ? totalStrokes : inTotal + outTotal,
      inTotal,
      outTotal,
      strokesOverPar,
    });
  }

  return { players: players.length ? players : [], parseError: players.length ? null : 'Sin filas de jugador' };
}

async function parseScorecardWithGemini(imagePath) {
  if (!imagePath) {
    return { rawText: '', parsed: null, geminiError: 'Sin imagen' };
  }

  if (!GEMINI_API_KEY) {
    console.warn('GEMINI_API_KEY no está configurado. Se omite análisis con Gemini.');
    return { rawText: '', parsed: null, geminiError: 'GEMINI_API_KEY no configurada' };
  }

  const resolved = path.resolve(imagePath);
  if (!fs.existsSync(resolved)) {
    return { rawText: '', parsed: null, geminiError: 'Archivo de imagen no encontrado' };
  }

  try {
    const buffer = await fs.promises.readFile(resolved);
    const mimeType = guessMimeType(resolved);
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const imagePart = {
      inlineData: {
        mimeType,
        data: buffer.toString('base64'),
      },
    };

    const result = await generateContentWithRetries(model, [TSV_INSTRUCTION, imagePart]);
    const rawText = result.response.text().trim();

    const parsedRows = parseTsvResponse(rawText);
    const parsed = {
      model: GEMINI_MODEL,
      players: parsedRows.players,
      parseError: parsedRows.parseError,
    };

    return {
      rawText,
      parsed,
      geminiError: null,
    };
  } catch (err) {
    console.error('Gemini scorecard error', err.message);
    return {
      rawText: '',
      parsed: null,
      geminiError: formatGeminiError(err),
    };
  }
}

module.exports = {
  parseScorecardWithGemini,
  parseTsvResponse,
};
