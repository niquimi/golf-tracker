const mongoose = require('mongoose');

const roundPlayerSchema = new mongoose.Schema(
  {
    player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
    totalStrokes: { type: Number, required: true },
    strokesPerHole: [{ type: Number }],
    strokesOverPar: { type: Number },
    inTotal: { type: Number },
    outTotal: { type: Number },
  },
  { _id: false }
);

const roundSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    imagePath: { type: String },
    players: [roundPlayerSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Round', roundSchema);


