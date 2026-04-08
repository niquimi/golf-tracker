const mongoose = require('mongoose');
const Round = require('../models/Round');

const MOVING_AVG_WINDOW = 5;

function mean(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function populationStdDev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length;
  return Math.sqrt(v);
}

function getPlayerLine(round, playerId) {
  const id = String(playerId);
  return round.players.find((p) => String(p.player._id || p.player) === id);
}

function splitOutIn(line) {
  const arr = line.strokesPerHole || [];
  if (line.outTotal != null && line.inTotal != null) {
    return { out: line.outTotal, in: line.inTotal, source: 'card' };
  }
  if (!arr.length) return null;
  const mid = Math.floor(arr.length / 2);
  const out = arr.slice(0, mid).reduce((a, b) => a + b, 0);
  const inn = arr.slice(mid).reduce((a, b) => a + b, 0);
  return { out, in: inn, source: 'array' };
}

/**
 * Par 3 en todos los hoyos: birdie = 2 golpes, hoyo en uno = 1. No contamos "eagles" como categoría aparte.
 */
function countPar3BirdiesAndHio(strokesPerHole) {
  if (!strokesPerHole || !strokesPerHole.length) return { birdies: 0, holesInOne: 0 };
  let birdies = 0;
  let holesInOne = 0;
  for (const s of strokesPerHole) {
    if (s === 1) holesInOne += 1;
    else if (s === 2) birdies += 1;
  }
  return { birdies, holesInOne };
}

function buildMovingAverages(totalsChronological, window) {
  const n = totalsChronological.length;
  const series = [];
  for (let i = 0; i < n; i += 1) {
    const start = Math.max(0, i - window + 1);
    const slice = totalsChronological.slice(start, i + 1);
    series.push(mean(slice));
  }
  return series;
}

function streakBelowMean(totalsChronological, overallMean) {
  if (overallMean == null || !totalsChronological.length) return 0;
  let streak = 0;
  for (let i = totalsChronological.length - 1; i >= 0; i -= 1) {
    if (totalsChronological[i] < overallMean) streak += 1;
    else break;
  }
  return streak;
}

function roundSummary(round, line) {
  return {
    roundId: round._id,
    date: round.date,
    courseId: round.course?._id || round.course,
    courseName: round.course?.name || null,
    totalStrokes: line.totalStrokes,
  };
}

/**
 * @param {object[]} rounds - sorted by date ascending, populated course + players
 * @param {string} playerId
 * @param {{ byCourseHole: object[] }} holeStats - from Mongo aggregate
 * @param {{ _id: any, avgStrokes: number, courseName: string }[]} coursesFieldAverages - getCoursesStats()
 */
function buildPlayerAnalytics(rounds, playerId, holeStats, coursesFieldAverages) {
  const lines = rounds
    .map((r) => ({ round: r, line: getPlayerLine(r, playerId) }))
    .filter((x) => x.line);

  const totals = lines.map((x) => x.line.totalStrokes);
  const globalMean = mean(totals);
  const stdDevTotals = populationStdDev(totals);

  let sumStrokesAllHoles = 0;
  let countHolesScored = 0;
  for (const { line } of lines) {
    const arr = line.strokesPerHole || [];
    for (const s of arr) {
      if (typeof s === 'number' && s >= 1) {
        sumStrokesAllHoles += s;
        countHolesScored += 1;
      }
    }
  }
  const avgStrokesPerHole =
    countHolesScored > 0 ? sumStrokesAllHoles / countHolesScored : null;

  let best = null;
  let worst = null;
  for (const { round, line } of lines) {
    const t = line.totalStrokes;
    if (best == null || t < best.line.totalStrokes) best = { round, line };
    if (worst == null || t > worst.line.totalStrokes) worst = { round, line };
  }

  const movingSeries = buildMovingAverages(totals, MOVING_AVG_WINDOW);
  const movingAverageLast =
    movingSeries.length > 0 ? movingSeries[movingSeries.length - 1] : null;

  const movingAveragePoints = lines.map((x, i) => ({
    date: x.round.date,
    totalStrokes: x.line.totalStrokes,
    movingAvg: movingSeries[i],
  }));

  const splits = lines.map(({ round, line }) => {
    const s = splitOutIn(line);
    return s ? { roundId: round._id, ...s } : null;
  }).filter(Boolean);

  const outValues = splits.map((s) => s.out);
  const inValues = splits.map((s) => s.in);
  const splitAverages = {
    out: mean(outValues),
    in: mean(inValues),
    roundsCounted: splits.length,
  };

  let birdiesTotal = 0;
  let holesInOneTotal = 0;
  for (const { line } of lines) {
    const c = countPar3BirdiesAndHio(line.strokesPerHole);
    birdiesTotal += c.birdies;
    holesInOneTotal += c.holesInOne;
  }

  const fieldByCourseId = new Map(
    (coursesFieldAverages || []).map((c) => [String(c._id), c])
  );

  const courseNameById = new Map();
  for (const x of lines) {
    const cid = String(x.round.course?._id || x.round.course);
    if (!courseNameById.has(cid)) {
      courseNameById.set(cid, x.round.course?.name || 'Campo');
    }
  }

  const flatByCourseHole = (holeStats.byCourseHole || []).map((row) => {
    const cid = String(row._id.course);
    return {
      courseId: cid,
      courseName: courseNameById.get(cid) || 'Campo',
      hole: row._id.hole,
      avgStrokes: row.avgStrokes,
      count: row.n,
    };
  });

  const rankTieExpensive = (a, b) => {
    if (b.avgStrokes !== a.avgStrokes) return b.avgStrokes - a.avgStrokes;
    const cn = a.courseName.localeCompare(b.courseName, 'es');
    if (cn !== 0) return cn;
    return a.hole - b.hole;
  };
  const rankTieCheap = (a, b) => {
    if (a.avgStrokes !== b.avgStrokes) return a.avgStrokes - b.avgStrokes;
    const cn = a.courseName.localeCompare(b.courseName, 'es');
    if (cn !== 0) return cn;
    return a.hole - b.hole;
  };

  const top3HolesMostExpensive = [...flatByCourseHole].sort(rankTieExpensive).slice(0, 3);
  const top3HolesMostCheapest = [...flatByCourseHole].sort(rankTieCheap).slice(0, 3);

  // Por campo: curva, nemesis, aliado, dificultad relativa
  const byCourseMap = new Map();
  for (const row of holeStats.byCourseHole || []) {
    const cid = String(row._id.course);
    if (!byCourseMap.has(cid)) byCourseMap.set(cid, []);
    byCourseMap.get(cid).push({
      hole: row._id.hole,
      avgStrokes: row.avgStrokes,
      n: row.n,
    });
  }

  const courseIdsPlayed = [...new Set(lines.map((x) => String(x.round.course?._id || x.round.course)))];

  const coursesAnalytics = courseIdsPlayed.map((cid) => {
    const sample = lines.find(
      (x) => String(x.round.course?._id || x.round.course) === cid
    );
    const courseName = sample?.round.course?.name || 'Campo';

    const holeRows = (byCourseMap.get(cid) || []).sort((a, b) => a.hole - b.hole);
    const holeAvgs = holeRows.map((h) => h.avgStrokes);
    const meanHoleOnCourse = mean(holeAvgs);

    let nemesis = null;
    let ally = null;
    if (holeRows.length && meanHoleOnCourse != null) {
      for (const h of holeRows) {
        const diff = h.avgStrokes - meanHoleOnCourse;
        if (nemesis == null || diff > nemesis.diffFromCourseMean) {
          nemesis = { hole: h.hole, avgStrokes: h.avgStrokes, diffFromCourseMean: diff };
        }
        if (ally == null || diff < ally.diffFromCourseMean) {
          ally = { hole: h.hole, avgStrokes: h.avgStrokes, diffFromCourseMean: diff };
        }
      }
    }

    const field = fieldByCourseId.get(cid);
    const fieldAvgStrokes = field?.avgStrokes ?? null;
    const relativeDifficulty =
      fieldAvgStrokes != null && globalMean != null
        ? {
            fieldAvgOnCourse: fieldAvgStrokes,
            playerGlobalAvg: globalMean,
            difference: fieldAvgStrokes - globalMean,
          }
        : null;

    const roundsOnCourse = lines.filter(
      (x) => String(x.round.course?._id || x.round.course) === cid
    ).length;

    return {
      courseId: cid,
      courseName,
      roundsOnCourse,
      holeCurve: holeRows.map((h) => ({
        hole: h.hole,
        avgStrokes: h.avgStrokes,
        sampleSize: h.n,
      })),
      nemesis,
      ally,
      relativeDifficulty,
    };
  });

  coursesAnalytics.sort((a, b) => a.courseName.localeCompare(b.courseName, 'es'));

  return {
    movingAverageWindow: MOVING_AVG_WINDOW,
    globalMean,
    avgStrokesPerHole,
    stdDevTotals,
    movingAverageLast,
    movingAveragePoints,
    bestRound: best ? roundSummary(best.round, best.line) : null,
    worstRound: worst ? roundSummary(worst.round, worst.line) : null,
    streakBelowPersonalMean: streakBelowMean(totals, globalMean),
    splitAverages,
    par3Assumed: {
      birdiesTotal,
      holesInOneTotal,
    },
    top3HolesMostExpensive,
    top3HolesMostCheapest,
    courses: coursesAnalytics,
  };
}

/**
 * Agregación Mongo: $unwind de players y strokesPerHole con índice de hoyo.
 */
async function aggregatePlayerHoleStats(playerId) {
  const pid = new mongoose.Types.ObjectId(playerId);
  const [facetResult] = await Round.aggregate([
    { $match: { 'players.player': pid } },
    { $unwind: '$players' },
    { $match: { 'players.player': pid } },
    {
      $unwind: {
        path: '$players.strokesPerHole',
        includeArrayIndex: 'holeIdx',
      },
    },
    { $match: { 'players.strokesPerHole': { $gte: 1 } } },
    {
      $facet: {
        byCourseHole: [
          {
            $group: {
              _id: {
                course: '$course',
                hole: { $add: ['$holeIdx', 1] },
              },
              avgStrokes: { $avg: '$players.strokesPerHole' },
              n: { $sum: 1 },
            },
          },
          { $sort: { '_id.course': 1, '_id.hole': 1 } },
        ],
      },
    },
  ]);

  return {
    byCourseHole: facetResult?.byCourseHole || [],
  };
}

module.exports = {
  MOVING_AVG_WINDOW,
  buildPlayerAnalytics,
  aggregatePlayerHoleStats,
};
