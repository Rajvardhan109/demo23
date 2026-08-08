const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true },
  otp: { type: String, required: true },
  sentAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  verified: { type: Boolean, default: false }
});

// MongoDB automatically deletes the document once expiresAt passes — no manual cleanup needed.
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Otp', otpSchema);
