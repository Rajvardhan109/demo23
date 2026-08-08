const express = require('express');
const Note = require('../models/Note');
const User = require('../models/User');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function ratingAvg(note) {
  return note.ratingCount ? note.ratingSum / note.ratingCount : 0;
}

// GET /api/notes  — all notes (equivalent to old SSAI.getNotes())
router.get('/', requireAuth, async (req, res) => {
  const notes = await Note.find().sort({ uploadedAt: -1 });
  res.json({ ok: true, notes: notes.map(n => n.toPublic()) });
});

// POST /api/notes  — equivalent to SSAI.addNote(note)
router.post('/', requireAuth, async (req, res) => {
  const note = new Note(Object.assign({}, req.body, {
    uploadedBy: req.user.email,
    status: 'pending',
    downloads: 0,
    ratingSum: 0,
    ratingCount: 0
  }));
  await note.save();
  res.json({ ok: true, note: note.toPublic() });
});

// PATCH /api/notes/:id/approve  { status, feedback }  — faculty/admin only
router.patch('/:id/approve', requireRole('faculty', 'admin'), async (req, res) => {
  const note = await Note.findById(req.params.id);
  if (!note) return res.status(404).json({ ok: false, error: 'Note not found.' });
  note.status = req.body.status;
  if (typeof req.body.feedback === 'string') note.facultyFeedback = req.body.feedback;
  await note.save();
  res.json({ ok: true, note: note.toPublic() });
});

// PATCH /api/notes/:id  — equivalent to SSAI.updateNote(id, changes)
router.patch('/:id', requireAuth, async (req, res) => {
  const note = await Note.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!note) return res.status(404).json({ ok: false, error: 'Note not found.' });
  res.json({ ok: true, note: note.toPublic() });
});

// DELETE /api/notes/:id
router.delete('/:id', requireAuth, async (req, res) => {
  await Note.findByIdAndDelete(req.params.id);
  res.json({ ok: true }); // client still deletes the matching IndexedDB PDF locally
});

// GET /api/notes/search?q=...  — equivalent to SSAI.searchNotes(query)
router.get('/search', requireAuth, async (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  const approved = await Note.find({ status: 'approved' });
  if (!q) return res.json({ ok: true, notes: approved.map(n => Object.assign(n.toPublic(), { matchScore: 90 })) });

  const terms = q.split(/\s+/).filter(Boolean);
  const results = [];
  approved.forEach(n => {
    const haystack = [n.title, n.subject, n.description, (n.tags || []).join(' ')].join(' ').toLowerCase();
    let hits = 0;
    terms.forEach(t => { if (haystack.indexOf(t) !== -1) hits++; });
    if (hits > 0) results.push(Object.assign(n.toPublic(), { matchScore: Math.min(99, Math.round((hits / terms.length) * 100)) }));
  });
  results.sort((a, b) => b.matchScore - a.matchScore);
  res.json({ ok: true, notes: results });
});

// GET /api/notes/recommendations?limit=5  — equivalent to SSAI.getRecommendations(limit)
router.get('/recommendations', requireAuth, async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || undefined;
  const approved = await Note.find({ status: 'approved' });
  const scored = approved.map(n => {
    const avg = ratingAvg(n);
    const score = Math.min(97, Math.round(55 + avg * 6 + Math.min(n.downloads, 50) * 0.2));
    return Object.assign(n.toPublic(), { matchScore: score, ratingAvgVal: avg });
  });
  scored.sort((a, b) => b.matchScore - a.matchScore);
  res.json({ ok: true, notes: limit ? scored.slice(0, limit) : scored });
});

// POST /api/notes/:id/rate  { stars }  — equivalent to SSAI.rateNote(id, stars, email)
router.post('/:id/rate', requireAuth, async (req, res) => {
  const note = await Note.findById(req.params.id);
  if (!note) return res.status(404).json({ ok: false, error: 'Note not found.' });

  const stars = Number(req.body.stars);
  const prev = note.ratings.get(req.user.email);
  if (prev !== undefined) {
    note.ratingSum = note.ratingSum - prev + stars;
  } else {
    note.ratingSum += stars;
    note.ratingCount += 1;
  }
  note.ratings.set(req.user.email, stars);
  await note.save();
  res.json({ ok: true, note: note.toPublic() });
});

// POST /api/notes/:id/download  — equivalent to SSAI.recordDownload(id)
router.post('/:id/download', requireAuth, async (req, res) => {
  const note = await Note.findByIdAndUpdate(req.params.id, { $inc: { downloads: 1 } }, { new: true });
  if (!note) return res.status(404).json({ ok: false, error: 'Note not found.' });
  res.json({ ok: true, note: note.toPublic() });
});

// POST /api/notes/:id/bookmark  — equivalent to SSAI.toggleBookmark(email, noteId)
router.post('/:id/bookmark', requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id);
  const idx = user.bookmarks.findIndex(b => b.toString() === req.params.id);
  let bookmarked;
  if (idx === -1) { user.bookmarks.push(req.params.id); bookmarked = true; }
  else { user.bookmarks.splice(idx, 1); bookmarked = false; }
  await user.save();
  res.json({ ok: true, bookmarked });
});

// GET /api/notes/bookmarks  — equivalent to SSAI.getBookmarkedNotes(email)
router.get('/bookmarks', requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id).populate('bookmarks');
  res.json({ ok: true, notes: user.bookmarks.map(n => n.toPublic()) });
});

module.exports = router;
