const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    location: { type: String },
    holes: { type: Number, default: 18 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Course', courseSchema);


