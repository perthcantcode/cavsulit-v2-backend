const router = require('express').Router();
const { Wishlist, Shop, User, Product, Review } = require('../models');
const { protect } = require('../middleware/auth');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sanitize = (raw) => {
  const id = String(raw || '').trim();
  return UUID_RE.test(id) ? id : null;
};

// GET /api/wishlist — all saved shops for the logged-in user
router.get('/', protect, async (req, res) => {
  try {
    const items = await Wishlist.findAll({
      where:   { userId: req.user.id },
      include: [{
        model:   Shop,
        as:      'shop',
        include: [
          { model: User,    as: 'seller',   attributes: ['id','fullName','badgeLevel','department'] },
          { model: Product, as: 'products', attributes: ['id','name','price'] },
          { model: Review,  as: 'reviews',  attributes: ['stars'] },
        ],
      }],
      order: [['createdAt','DESC']],
    });
    res.json(items);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/wishlist/:shopId — toggle save/unsave
router.post('/:shopId', protect, async (req, res) => {
  try {
    const shopId = sanitize(req.params.shopId);
    if (!shopId) return res.status(400).json({ message: 'Invalid shop ID' });

    const existing = await Wishlist.findOne({ where: { userId: req.user.id, shopId } });
    if (existing) {
      await existing.destroy();
      return res.json({ saved: false });
    }
    await Wishlist.create({ userId: req.user.id, shopId });
    res.json({ saved: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/wishlist/check/:shopId — is this shop saved?
router.get('/check/:shopId', protect, async (req, res) => {
  try {
    const shopId = sanitize(req.params.shopId);
    if (!shopId) return res.status(400).json({ message: 'Invalid shop ID' });
    const item = await Wishlist.findOne({ where: { userId: req.user.id, shopId } });
    res.json({ saved: !!item });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
