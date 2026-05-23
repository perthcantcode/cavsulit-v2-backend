const admin = require('../config/firebase.config');
const { User } = require('../models');

// ─── FULL AUTH ────────────────────────────────────────────────────────────────
// Verifies the Firebase ID token, upserts the user row in Postgres,
// and auto-upgrades the badge when CvSU email becomes verified.
const protect = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded      = await admin.auth().verifyIdToken(token);
    const email        = decoded.email;
    const isCvsuEmail  = email?.endsWith('@cvsu.edu.ph');
    const isVerified   = decoded.email_verified;
    const isCvsu       = isCvsuEmail && isVerified;

    // Upsert: create user row on first login if it doesn't exist yet
    let user = await User.findOne({ where: { email } });
    if (!user) {
      user = await User.create({
        id:             decoded.uid,
        email,
        fullName:       decoded.name || email.split('@')[0],
        password:       null,
        badgeLevel:     'none',
        isCvsuVerified: false,
      });
    }

    // Promote badge when Firebase confirms CvSU email is verified
    if (isCvsu && !user.isCvsuVerified) {
      await user.update({ isCvsuVerified: true, badgeLevel: 'cvsu' });
      user.isCvsuVerified = true;
      user.badgeLevel     = 'cvsu';
    }

    // Demote badge if CvSU email is no longer verified (edge case)
    if (isCvsuEmail && !isVerified && user.isCvsuVerified) {
      await user.update({ isCvsuVerified: false, badgeLevel: 'none' });
      user.isCvsuVerified = false;
      user.badgeLevel     = 'none';
    }

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// ─── OPTIONAL AUTH ────────────────────────────────────────────────────────────
// Attaches user if token is present but does NOT block unauthenticated requests.
// Used for routes like GET /shops where guests can browse.
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return next();
    const decoded = await admin.auth().verifyIdToken(token);
    const user    = await User.findOne({ where: { email: decoded.email } });
    req.user = user;
    next();
  } catch {
    next(); // invalid token → treat as guest
  }
};

// ─── REQUIRE CVSU ─────────────────────────────────────────────────────────────
// Blocks non-CvSU-verified users from creating shops.
const requireCvsu = (req, res, next) => {
  if (!req.user?.isCvsuVerified) {
    return res.status(403).json({
      message: 'A verified CvSU email (@cvsu.edu.ph) is required to post shops.',
    });
  }
  next();
};

// ─── REQUIRE ADMIN ────────────────────────────────────────────────────────────
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required.' });
  }
  next();
};

module.exports = { protect, optionalAuth, requireCvsu, requireAdmin };
