const router = require('express').Router();
const { PreOrder, Shop, User, Message } = require('../models');
const { protect } = require('../middleware/auth');
const { formatPickupDateTime } = require('../utils/formatHelpers');

function buildPreorderMessage({ items, pickupTime, locationNote }) {
  const itemText = Array.isArray(items)
    ? items.map((i) => (typeof i === 'string' ? i : i?.name)).filter(Boolean).join(', ')
    : String(items || '').trim();
  const pickup = formatPickupDateTime(pickupTime);
  const location = locationNote?.trim() || 'TBD';
  return `📋 PRE-ORDER REQUEST\nItems: ${itemText}\nPickup: ${pickup}\nLocation: ${location}`;
}

function emitMessage(req, payload) {
  const io = req.app.get('io');
  if (io && payload.receiverId && payload.receiverId !== payload.senderId) {
    io.to(String(payload.receiverId)).emit('receive_message', payload);
  }
}

// POST /api/preorders — creates order + inbox message for seller
router.post('/', protect, async (req, res) => {
  try {
    const { shopId, items, pickupTime, locationNote } = req.body;
    if (!shopId || !items?.length) {
      return res.status(400).json({ message: 'Shop and order details are required' });
    }

    const shop = await Shop.findByPk(shopId, {
      include: [{ model: User, as: 'seller', attributes: ['id', 'fullName'] }],
    });
    if (!shop) return res.status(404).json({ message: 'Shop not found' });
    if (shop.userId === req.user.id) {
      return res.status(400).json({ message: 'You cannot pre-order your own listing' });
    }

    const order = await PreOrder.create({
      shopId,
      buyerId: req.user.id,
      items,
      pickupTime: pickupTime || null,
      locationNote: locationNote || null,
    });

    const text = buildPreorderMessage({ items, pickupTime, locationNote });
    const msg = await Message.create({
      senderId: req.user.id,
      receiverId: shop.userId,
      text,
      shopId,
    });
    const messagePayload = msg.toJSON();
    emitMessage(req, messagePayload);

    res.status(201).json({ order, message: messagePayload });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
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
