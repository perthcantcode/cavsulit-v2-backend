const { Op } = require('sequelize');
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

    // Match by Firebase UID first, then email (legacy rows before id → text migration)
    let user = await User.findOne({
      where: { [Op.or]: [{ id: decoded.uid }, { email }] },
    });
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
    // If found by email with a legacy id, keep that id so shops/messages FKs stay valid.

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
    let message = 'Invalid or expired token. Sign out and sign in again.';
    if (err.message?.includes('PEM') || err.message?.includes('DECODER')) {
      message =
        'Server could not verify login. Check FIREBASE_PRIVATE_KEY on Render (full key with \\n line breaks).';
    }
    res.status(401).json({ message });
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
    const user = await User.findOne({
      where: { [Op.or]: [{ id: decoded.uid }, { email: decoded.email }] },
    });
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
