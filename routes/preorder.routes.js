const router = require('express').Router();
const { PreOrder, Shop, User } = require('../models');
const { protect } = require('../middleware/auth');

// POST /api/preorders
router.post('/', protect, async (req, res) => {
  try {
    const { shopId, items, pickupTime, locationNote } = req.body;
    const order = await PreOrder.create({
      shopId, buyerId: req.user.id, items, pickupTime, locationNote,
    });
    res.status(201).json(order);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/preorders/mine — buyer's own orders
router.get('/mine', protect, async (req, res) => {
  try {
    const orders = await PreOrder.findAll({
      where:   { buyerId: req.user.id },
      include: [{ model: Shop, as: 'shop', attributes: ['id','name','college','photos'] }],
      order:   [['createdAt','DESC']],
    });
    res.json(orders);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/preorders/shop/:shopId — seller view
router.get('/shop/:shopId', protect, async (req, res) => {
  try {
    const shop = await Shop.findByPk(req.params.shopId);
    if (!shop || shop.userId !== req.user.id)
      return res.status(403).json({ message: 'Forbidden' });
    const orders = await PreOrder.findAll({
      where:   { shopId: String(req.params.shopId) },
      include: [{ model: User, as: 'buyer', attributes: ['id','fullName','contactNumber','department'] }],
      order:   [['createdAt','DESC']],
    });
    res.json(orders);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT /api/preorders/:id/status
router.put('/:id/status', protect, async (req, res) => {
  try {
    const order = await PreOrder.findByPk(req.params.id, {
      include: [{ model: Shop, as: 'shop' }],
    });
    if (!order) return res.status(404).json({ message: 'Not found' });
    if (order.shop.userId !== req.user.id && order.buyerId !== req.user.id)
      return res.status(403).json({ message: 'Forbidden' });
    await order.update({ status: req.body.status });
    res.json(order);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
