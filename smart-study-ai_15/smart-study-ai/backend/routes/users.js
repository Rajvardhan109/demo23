const express = require('express');
const User = require('../models/User');
const Note = require('../models/Note');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/users  — admin only, equivalent to SSAI.getUsers()
router.get('/', requireRole('admin'), async (req, res) => {
  const users = await User.find();
  res.json({ ok: true, users: users.map(u => u.toPublic()) });
});

// POST /api/users  — equivalent to SSAI.createUser(user)
router.post('/', requireRole('admin'), async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ ok: false, error: 'Name, email and password are all required.' });
  if (await User.findOne({ email: email.toLowerCase() })) {
    return res.status(409).json({ ok: false, error: 'A user with this email already exists.' });
  }
  const user = new User({ name, email: email.toLowerCase(), password, role: role || 'student' });
  await user.save();
  res.json({ ok: true, user: user.toPublic() });
});

// PATCH /api/users/:email/role  { role }  — equivalent to SSAI.setUserRole(email, role)
router.patch('/:email/role', requireRole('admin'), async (req, res) => {
  const user = await User.findOneAndUpdate({ email: req.params.email.toLowerCase() }, { role: req.body.role }, { new: true });
  if (!user) return res.status(404).json({ ok: false, error: 'User not found.' });
  res.json({ ok: true, user: user.toPublic() });
});

// DELETE /api/users/:email  — equivalent to SSAI.deleteUser(email)
router.delete('/:email', requireRole('admin'), async (req, res) => {
  await User.deleteOne({ email: req.params.email.toLowerCase() });
  res.json({ ok: true });
});

// PATCH /api/users/me  { name, currentPassword, newPassword }  — equivalent to SSAI.updateUserProfile
router.patch('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ ok: false, error: 'User not found.' });

  if (req.body.newPassword) {
    const valid = await user.comparePassword(req.body.currentPassword || '');
    if (!valid) return res.status(401).json({ ok: false, error: 'Current password is incorrect.' });
    user.password = req.body.newPassword; // re-hashed by pre('save')
  }
  if (req.body.name && req.body.name.trim()) {
    user.name = req.body.name.trim();
    await Note.updateMany({ uploadedBy: user.email }, { uploadedByName: user.name });
  }
  await user.save();
  res.json({ ok: true, user: user.toPublic() });
});

module.exports = router;

// ---- Separate small router for /api/analytics (mounted independently in server.js) ----
const analyticsRouter = express.Router();

// GET /api/analytics  — equivalent to SSAI.getAnalytics()
analyticsRouter.get('/', requireRole('admin', 'faculty'), async (req, res) => {
  const notes = await Note.find();
  const approved = notes.filter(n => n.status === 'approved');
  const rated = approved.filter(n => n.ratingCount > 0);
  const ratingAvg = n => (n.ratingCount ? n.ratingSum / n.ratingCount : 0);

  const totalDownloads = notes.reduce((s, n) => s + n.downloads, 0);
  const totalRatings = notes.reduce((s, n) => s + n.ratingCount, 0);
  const avgRating = rated.length ? rated.reduce((s, n) => s + ratingAvg(n), 0) / rated.length : 0;

  const subjectCounts = {};
  notes.forEach(n => { subjectCounts[n.subject] = (subjectCounts[n.subject] || 0) + 1; });
  const topSubject = Object.keys(subjectCounts).sort((a, b) => subjectCounts[b] - subjectCounts[a])[0] || '—';
  const topNote = notes.slice().sort((a, b) => b.downloads - a.downloads)[0] || null;
  const filesAttached = notes.filter(n => n.hasFile).length;

  res.json({
    ok: true,
    totalDownloads, totalRatings, avgRating, topSubject, subjectCounts,
    topNote: topNote ? topNote.toPublic() : null,
    filesAttached, totalNotes: notes.length
  });
});

module.exports = router;
module.exports.analyticsRouter = analyticsRouter;
