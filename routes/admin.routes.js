const router = require('express').Router();
const { User, Shop, Product, Analytics } = require('../models');
const { protect, requireAdmin } = require('../middleware/auth');

// All admin routes require auth + admin role
router.use(protect, requireAdmin);

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const [users, shops, products, views] = await Promise.all([
      User.count(),
      Shop.count(),
      Product.count(),
      Analytics.count({ where: { type: 'view' } }),
    ]);
    res.json({ users, shops, products, views });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: { exclude: ['password'] },
      order: [['createdAt','DESC']],
    });
    res.json(users);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT /api/admin/users/:id/verify
router.put('/users/:id/verify', async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    await user.update({ isCvsuVerified: true, badgeLevel: 'cvsu' });
    res.json(user);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/admin/shops
router.get('/shops', async (req, res) => {
  try {
    const shops = await Shop.findAll({
      include: [{ model: User, as: 'seller', attributes: ['id','fullName','email'] }],
      order:   [['createdAt','DESC']],
    });
    res.json(shops);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE /api/admin/shops/:id
router.delete('/shops/:id', async (req, res) => {
  try {
    const shop = await Shop.findByPk(req.params.id);
    if (!shop) return res.status(404).json({ message: 'Not found' });
    await shop.destroy();
    res.json({ message: 'Shop deleted by admin' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT /api/admin/shops/:id/feature
router.put('/shops/:id/feature', async (req, res) => {
  try {
    const shop = await Shop.findByPk(req.params.id);
    if (!shop) return res.status(404).json({ message: 'Not found' });
    await shop.update({ isFeatured: !shop.isFeatured });
    res.json(shop);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
