const Round = require('../models/Round');
const {
  buildPlayerAnalytics,
  aggregatePlayerHoleStats,
} = require('./playerAnalytics');

async function getOverviewStats() {
  // Número total de rondas y última ronda
  const totalRounds = await Round.countDocuments();
  const lastRound = await Round.findOne().sort({ date: -1 }).populate('course').populate('players.player');

  // Media de golpes por jugador (simple para v1)
  const agg = await Round.aggregate([
    { $unwind: '$players' },
    {
      $group: {
        _id: '$players.player',
        avgStrokes: { $avg: '$players.totalStrokes' },
        rounds: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: 'players',
        localField: '_id',
        foreignField: '_id',
        as: 'playerDoc',
      },
    },
    {
      $addFields: {
        playerName: { $arrayElemAt: ['$playerDoc.name', 0] },
      },
    },
    { $project: { playerDoc: 0 } },
    { $sort: { playerName: 1 } },
  ]);

  return { totalRounds, lastRound, playersAverage: agg };
}

async function getPlayerStats(playerId) {
  const rounds = await Round.find({ 'players.player': playerId })
    .sort({ date: 1 })
    .populate('course')
    .populate('players.player');

  const [holeStats, coursesFieldAverages] = await Promise.all([
    aggregatePlayerHoleStats(playerId),
    getCoursesStats(),
  ]);

  const analytics =
    rounds.length > 0
      ? buildPlayerAnalytics(rounds, playerId, holeStats, coursesFieldAverages)
      : null;

  return { rounds, analytics };
}

async function getCoursesStats() {
  const agg = await Round.aggregate([
    { $unwind: '$players' },
    {
      $group: {
        _id: '$course',
        avgStrokes: { $avg: '$players.totalStrokes' },
        roundIds: { $addToSet: '$_id' },
      },
    },
    {
      $lookup: {
        from: 'courses',
        localField: '_id',
        foreignField: '_id',
        as: 'courseDoc',
      },
    },
    {
      $addFields: {
        courseName: { $arrayElemAt: ['$courseDoc.name', 0] },
      },
    },
    {
      $project: {
        _id: 1,
        avgStrokes: 1,
        rounds: { $size: '$roundIds' },
        courseName: 1,
      },
    },
    { $sort: { courseName: 1 } },
  ]);

  return agg;
}

module.exports = {
  getOverviewStats,
  getPlayerStats,
  getCoursesStats,
};


