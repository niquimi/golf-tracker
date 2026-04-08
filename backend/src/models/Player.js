const mongoose = require('mongoose');
const { normalizePlayerName } = require('../utils/playerName');

const playerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    nameKey: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

playerSchema.pre('validate', function () {
  if (typeof this.name === 'string') {
    this.name = this.name.trim();
  }
  if (this.name) {
    this.nameKey = normalizePlayerName(this.name);
  }
});

module.exports = mongoose.model('Player', playerSchema);
