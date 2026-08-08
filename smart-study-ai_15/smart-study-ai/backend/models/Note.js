const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
  title: { type: String, required: true },
  subject: { type: String, required: true },
  semester: { type: String, default: 'N/A' },
  unit: { type: String, default: '' },
  description: { type: String, default: '' },
  tags: [{ type: String }],
  difficulty: { type: String, default: 'Intermediate' },
  uploadedBy: { type: String, required: true },      // stores user email, matches old shape
  uploadedByName: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  facultyFeedback: { type: String, default: '' },
  downloads: { type: Number, default: 0 },
  ratingSum: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
  aiConfidence: { type: Number, default: 80 },
  hasFile: { type: Boolean, default: false }, // actual PDF blob still lives in the browser's IndexedDB
  // { "student@krmu.edu.in": 5, ... } — one rating per user, matches old RATINGS_KEY shape
  ratings: { type: Map, of: Number, default: {} }
}, { timestamps: { createdAt: 'uploadedAt', updatedAt: true } });

noteSchema.methods.toPublic = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  obj.ratings = Object.fromEntries(this.ratings); // Map -> plain object for JSON
  return obj;
};

module.exports = mongoose.model('Note', noteSchema);
