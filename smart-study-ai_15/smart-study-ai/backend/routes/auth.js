const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Otp = require('../models/Otp');

const router = express.Router();
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 30 * 1000;

function sign(user) {
  return jwt.sign({ id: user._id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

// POST /api/auth/login  { email, password, role }
// Mirrors old SSAI.login: if the account doesn't exist yet, it silently creates one.
router.post('/login', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const role = req.body.role;
  if (!email || !password) return res.status(400).json({ ok: false, error: 'Enter both email and password.' });

  let user = await User.findOne({ email });
  let created = false;

  if (user) {
    const valid = await user.comparePassword(password);
    if (!valid) return res.status(401).json({ ok: false, error: 'Incorrect password.' });
  } else {
    const name = email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    user = new User({ name, email, password, role: role || 'student' });
    await user.save();
    created = true;
  }

  res.json({ ok: true, token: sign(user), user: user.toPublic(), created });
});

// POST /api/auth/signup  { name, email, roll, semester, password, confirmPassword, role }
router.post('/signup', async (req, res) => {
  const { name, email: rawEmail, roll, semester, password, confirmPassword, role } = req.body;
  const email = (rawEmail || '').trim().toLowerCase();

  if (!name || !email || !roll || !semester || !password || !confirmPassword) {
    return res.status(400).json({ ok: false, error: 'Please fill out all fields.' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ ok: false, error: 'Passwords do not match.' });
  }
  if (await User.findOne({ email })) {
    return res.status(409).json({ ok: false, error: 'An account with this email already exists.' });
  }

  const user = new User({ name: name.trim(), email, roll: roll.trim(), semester, password, role: role || 'student' });
  await user.save();
  res.json({ ok: true, message: 'Account created successfully!', user: user.toPublic() });
});

// POST /api/auth/google  { name, email, picture, role }
// `email`/`name`/`picture` come from the already-decoded Google ID token on the frontend.
router.post('/google', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ ok: false, error: 'Google did not return an email address.' });

  let user = await User.findOne({ email });
  let created = false;

  if (!user) {
    const name = req.body.name || email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    user = new User({ name, email, password: null, authProvider: 'google', picture: req.body.picture || null, role: req.body.role || 'student' });
    await user.save();
    created = true;
  } else if (req.body.picture && user.picture !== req.body.picture) {
    user.picture = req.body.picture;
    await user.save();
  }

  res.json({ ok: true, token: sign(user), user: user.toPublic(), created });
});

// POST /api/auth/request-otp  { email }
router.post('/request-otp', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ ok: false, error: 'Enter your registered email address.' });

  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ ok: false, error: 'No account found with this email address.' });

  const existing = await Otp.findOne({ email }).sort({ sentAt: -1 });
  if (existing && Date.now() - existing.sentAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    return res.status(429).json({
      ok: false,
      error: 'Please wait a few seconds before requesting another OTP.',
      cooldownMsLeft: OTP_RESEND_COOLDOWN_MS - (Date.now() - existing.sentAt.getTime())
    });
  }

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  await Otp.deleteMany({ email }); // invalidate any older codes
  await Otp.create({ email, otp, expiresAt: new Date(Date.now() + OTP_TTL_MS) });

  // The OTP itself is returned so the calling page (forgot-password.html) can
  // hand it to EmailJS to actually deliver it — this server doesn't send email itself.
  res.json({ ok: true, otp, expiresInMs: OTP_TTL_MS, name: user.name });
});

// POST /api/auth/verify-otp  { email, otp }
router.post('/verify-otp', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const otp = (req.body.otp || '').trim();

  const record = await Otp.findOne({ email }).sort({ sentAt: -1 });
  if (!record) return res.status(400).json({ ok: false, error: 'Please request a new OTP first.' });
  if (Date.now() > record.expiresAt.getTime()) return res.status(400).json({ ok: false, error: 'This OTP has expired. Please request a new one.' });
  if (record.otp !== otp) return res.status(400).json({ ok: false, error: 'Incorrect OTP. Please try again.' });

  record.verified = true;
  await record.save();
  res.json({ ok: true });
});

// POST /api/auth/reset-password  { email, otp, newPassword }
router.post('/reset-password', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const otp = (req.body.otp || '').trim();
  const newPassword = req.body.newPassword || '';

  if (newPassword.length < 6) return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters.' });

  const record = await Otp.findOne({ email }).sort({ sentAt: -1 });
  if (!record || !record.verified || record.otp !== otp) {
    return res.status(400).json({ ok: false, error: 'OTP verification is required before resetting your password.' });
  }
  if (Date.now() > record.expiresAt.getTime()) return res.status(400).json({ ok: false, error: 'This OTP has expired. Please request a new one.' });

  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ ok: false, error: 'No account found with this email address.' });

  user.password = newPassword; // pre('save') hook re-hashes it
  await user.save();
  await Otp.deleteMany({ email });

  res.json({ ok: true, user: user.toPublic() });
});

module.exports = router;
