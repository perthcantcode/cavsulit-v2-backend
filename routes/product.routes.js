const router = require('express').Router();
const { Product, Shop } = require('../models');
const { protect } = require('../middleware/auth');

// POST /api/products
router.post('/', protect, async (req, res) => {
  try {
    const { shopId, name, price, image } = req.body;
    const shop = await Shop.findByPk(shopId);
    if (!shop || shop.userId !== req.user.id)
      return res.status(403).json({ message: 'Forbidden' });
    const product = await Product.create({ shopId, name, price, image });
    res.status(201).json(product);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT /api/products/:id
router.put('/:id', protect, async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id, {
      include: [{ model: Shop, as: 'shop' }],
    });
    if (!product || product.shop.userId !== req.user.id)
      return res.status(403).json({ message: 'Forbidden' });
    await product.update(req.body);
    res.json(product);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE /api/products/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id, {
      include: [{ model: Shop, as: 'shop' }],
    });
    if (!product || product.shop.userId !== req.user.id)
      return res.status(403).json({ message: 'Forbidden' });
    await product.destroy();
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
