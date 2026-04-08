/**
 * Fusiona cursos duplicados (mismo nombre con distinta capitalización / espacios).
 * Reasigna rondas al curso canónico y borra el duplicado.
 *
 * Desde la carpeta backend: node scripts/dedupeCourses.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Course = require('../src/models/Course');
const Round = require('../src/models/Round');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/golf-tracker';

function courseKey(name) {
  if (typeof name !== 'string') return '';
  return name.trim().toLocaleLowerCase('es');
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected');

  const courses = await Course.find().sort({ _id: 1 });
  const groups = new Map();

  for (const c of courses) {
    const key = courseKey(c.name);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }

  for (const [key, list] of groups) {
    if (list.length < 2) continue;

    const withCounts = await Promise.all(
      list.map(async (c) => ({
        doc: c,
        rounds: await Round.countDocuments({ course: c._id }),
      }))
    );

    withCounts.sort((a, b) => {
      if (b.rounds !== a.rounds) return b.rounds - a.rounds;
      return String(a.doc._id).localeCompare(String(b.doc._id));
    });

    const keeper = withCounts[0].doc;
    const duplicates = withCounts.slice(1).map((x) => x.doc);

    for (const dup of duplicates) {
      const result = await Round.updateMany({ course: dup._id }, { $set: { course: keeper._id } });
      if (result.modifiedCount) {
        console.log(
          `Rondas ${dup._id} -> ${keeper._id} (${key}): ${result.modifiedCount} documento(s)`
        );
      }

      const maxHoles = Math.max(keeper.holes || 18, dup.holes || 18);
      if (maxHoles > (keeper.holes || 18)) {
        keeper.holes = maxHoles;
      }

      await Course.deleteOne({ _id: dup._id });
      console.log(`Eliminado curso duplicado "${dup.name}" (${dup._id})`);
    }

    await keeper.save();
    console.log(`Curso canónico "${keeper.name}" (${keeper._id}) para clave "${key}"`);
  }

  await Course.syncIndexes();
  console.log('Índices de Course sincronizados');
  await mongoose.disconnect();
  console.log('Hecho');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
