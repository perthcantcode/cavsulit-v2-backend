const router   = require('express').Router();
const bcrypt   = require('bcryptjs');
const { User } = require('../models');
const { protect } = require('../middleware/auth');
const upload   = require('../middleware/upload');

// Safe user object (never expose password hash)
const safe = (u) => ({
  id:             u.id,
  fullName:       u.fullName,
  email:          u.email,
  studentId:      u.studentId,
  department:     u.department,
  contactNumber:  u.contactNumber,
  profilePhoto:   u.profilePhoto,
  bio:            u.bio,
  socialLinks:    u.socialLinks,
  showContact:    u.showContact,
  showStudentId:  u.showStudentId,
  badgeLevel:     u.badgeLevel,
  isCvsuVerified: u.isCvsuVerified,
  isVerified:     u.isVerified,
  role:           u.role,
});

// POST /api/auth/register
// Called after Firebase creates the account — stores extra profile data in Postgres
router.post('/register', async (req, res) => {
  try {
    const { fullName, email, password, studentId, department, contactNumber } = req.body;

    const exists = await User.findOne({ where: { email } });
    if (exists) {
      // User already auto-created by protect middleware on a prior request → just return it
      return res.status(200).json({ user: safe(exists) });
    }

    const user = await User.create({
      fullName,
      email,
      password:       password ? await bcrypt.hash(password, 10) : null,
      studentId,
      department:     department || 'OTHER',
      contactNumber,
      badgeLevel:     'none',
      isCvsuVerified: false,
      isVerified:     false,
      role:           'seller',
    });

    res.status(201).json({ user: safe(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/me — returns the logged-in user's profile
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(safe(user));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/auth/me — update profile fields
router.put('/me', protect, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    const { fullName, contactNumber, department, bio, socialLinks, showContact, showStudentId } = req.body;
    await user.update({
      fullName:      fullName      ?? user.fullName,
      contactNumber: contactNumber ?? user.contactNumber,
      department:    department    ?? user.department,
      bio:           bio           ?? user.bio,
      socialLinks:   socialLinks   ?? user.socialLinks,
      showContact:   showContact !== undefined ? showContact : user.showContact,
      showStudentId: showStudentId !== undefined ? showStudentId : user.showStudentId,
    });
    res.json(safe(user));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/auth/me/photo — upload profile picture
router.put('/me/photo', protect, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const user = await User.findByPk(req.user.id);
    await user.update({ profilePhoto: req.file.path });
    res.json(safe(user));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
