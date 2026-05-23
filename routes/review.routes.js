const router = require('express').Router();
const { Review, User } = require('../models');
const { protect } = require('../middleware/auth');

// GET /api/reviews/:shopId
router.get('/:shopId', async (req, res) => {
  try {
    const reviews = await Review.findAll({
      where:   { shopId: String(req.params.shopId) },
      include: [{ model: User, as: 'reviewer', attributes: ['id','fullName','department','profilePhoto'] }],
      order:   [['createdAt','DESC']],
    });
    const avg = reviews.length
      ? (reviews.reduce((a, r) => a + r.stars, 0) / reviews.length).toFixed(1)
      : 0;
    res.json({ reviews, avgRating: avg, total: reviews.length });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/reviews
router.post('/', protect, async (req, res) => {
  try {
    const { shopId, stars, comment } = req.body;
    const existing = await Review.findOne({ where: { shopId, userId: req.user.id } });
    if (existing) return res.status(400).json({ message: 'You already reviewed this shop' });
    const review = await Review.create({ shopId, userId: req.user.id, stars: parseInt(stars), comment });
    const full   = await Review.findByPk(review.id, {
      include: [{ model: User, as: 'reviewer', attributes: ['id','fullName','department','profilePhoto'] }],
    });
    res.status(201).json(full);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE /api/reviews/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    const review = await Review.findByPk(req.params.id);
    if (!review || review.userId !== req.user.id)
      return res.status(403).json({ message: 'Forbidden' });
    await review.destroy();
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
