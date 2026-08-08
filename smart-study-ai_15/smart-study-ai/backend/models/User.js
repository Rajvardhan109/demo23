const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  // Null for Google-authenticated accounts (no local password).
  password: { type: String, default: null },
  authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
  picture: { type: String, default: null },
  role: { type: String, enum: ['student', 'faculty', 'admin'], default: 'student' },
  roll: { type: String, default: 'N/A' },
  semester: { type: String, default: 'N/A' },
  // Note IDs this user has bookmarked.
  bookmarks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Note' }]
}, { timestamps: true });

// Hash password automatically whenever it's set/changed — this is what fixes
// the plaintext-password vulnerability from the old localStorage version.
userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  if (!this.password) return Promise.resolve(false); // Google-only accounts
  return bcrypt.compare(candidate, this.password);
};

// Shape returned to the frontend — never send the password hash back.
userSchema.methods.toPublic = function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    roll: this.roll,
    semester: this.semester,
    picture: this.picture
  };
};

module.exports = mongoose.model('User', userSchema);
