/**
 * Una sola vez: fusiona jugadores duplicados (mismo nombre con distinta capitalización),
 * rellena nameKey y elimina el índice único antiguo sobre `name`.
 *
 * Desde la carpeta backend: node scripts/dedupePlayers.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { normalizePlayerName } = require('../src/utils/playerName');
const Player = require('../src/models/Player');
const Round = require('../src/models/Round');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/golf-tracker';

async function dropNameUniqueIndex() {
  try {
    await Player.collection.dropIndex('name_1');
    console.log('Dropped index name_1');
  } catch (e) {
    if (e.code !== 27 && e.codeName !== 'IndexNotFound') throw e;
  }
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected');

  await dropNameUniqueIndex();

  const players = await Player.find().sort({ _id: 1 });
  const groups = new Map();

  for (const p of players) {
    const key = p.nameKey || normalizePlayerName(p.name);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }

  for (const [nameKey, list] of groups) {
    if (list.length === 1) {
      const p = list[0];
      p.nameKey = nameKey;
      await p.save();
      continue;
    }

    const keeper = list[0];
    const duplicates = list.slice(1);
    for (const dup of duplicates) {
      const result = await Round.updateMany(
        {},
        { $set: { 'players.$[elem].player': keeper._id } },
        { arrayFilters: [{ 'elem.player': dup._id }] }
      );
      if (result.modifiedCount) {
        console.log(`Merged ${dup._id} -> ${keeper._id} (${nameKey}), rounds touched: ${result.modifiedCount}`);
      }
      await Player.deleteOne({ _id: dup._id });
      console.log(`Removed duplicate player ${dup.name} (${dup._id})`);
    }
    keeper.nameKey = nameKey;
    await keeper.save();
    console.log(`Kept canonical player for "${nameKey}": ${keeper.name} (${keeper._id})`);
  }

  await Player.syncIndexes();
  console.log('Indexes synced');
  await mongoose.disconnect();
  console.log('Done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
