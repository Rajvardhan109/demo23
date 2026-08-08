const jwt = require('jsonwebtoken');

// Attaches req.user = { id, email, role } when a valid Bearer token is present.
// Does NOT block the request if there's no token — routes decide for themselves
// whether they require auth via requireAuth/requireRole below.
function attachUser(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      req.user = null; // expired/invalid token — treat as logged out
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ ok: false, error: 'Not authenticated.' });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, error: 'Not authenticated.' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ ok: false, error: 'Not authorized.' });
    next();
  };
}

module.exports = { attachUser, requireAuth, requireRole };
