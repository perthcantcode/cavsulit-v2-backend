const router = require('express').Router();
const { Message, User } = require('../models');
const { protect } = require('../middleware/auth');
const { Op } = require('sequelize');

// Firebase UIDs are not UUID-shaped; shop/listing IDs are UUID strings from randomUUID().
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USER_ID_RE = /^[a-zA-Z0-9_-]{10,128}$/;

const sanitizePartnerId = (raw) => {
  const id = String(raw || '').trim();
  return USER_ID_RE.test(id) ? id : null;
};

const sanitizeShopId = (raw) => {
  const id = String(raw || '').trim();
  return UUID_RE.test(id) ? id : null;
};

// GET /api/messages/conversations
router.get('/conversations', protect, async (req, res) => {
  try {
    const msgs = await Message.findAll({
      where: { [Op.or]: [{ senderId: req.user.id }, { receiverId: req.user.id }] },
      include: [
        { model: User, as: 'sender',   attributes: ['id','fullName','profilePhoto','department'] },
        { model: User, as: 'receiver', attributes: ['id','fullName','profilePhoto','department'] },
      ],
      order: [['createdAt','DESC']],
    });

    const seen = new Set();
    const conversations = [];
    for (const m of msgs) {
      const partnerId = m.senderId === req.user.id ? m.receiverId : m.senderId;
      if (!seen.has(partnerId)) {
        seen.add(partnerId);
        const partner = m.senderId === req.user.id ? m.receiver : m.sender;
        conversations.push({ partner, lastMessage: m.text, lastAt: m.createdAt, shopId: m.shopId });
      }
    }
    res.json(conversations);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/messages/:partnerId
router.get('/:partnerId', protect, async (req, res) => {
  try {
    const partnerId = sanitizePartnerId(req.params.partnerId);
    if (!partnerId) return res.status(400).json({ message: 'Invalid partner ID' });

    const msgs = await Message.findAll({
      where: {
        [Op.or]: [
          { senderId: req.user.id, receiverId: partnerId },
          { senderId: partnerId, receiverId: req.user.id },
        ],
      },
      order: [['createdAt','ASC']],
    });
    await Message.update(
      { isRead: true },
      { where: { senderId: partnerId, receiverId: req.user.id, isRead: false } }
    );
    res.json(msgs);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/messages
router.post('/', protect, async (req, res) => {
  try {
    const { receiverId, text, shopId } = req.body;
    if (!receiverId || !text?.trim()) {
      return res.status(400).json({ message: 'Receiver and message text are required' });
    }
    const safeReceiverId = sanitizePartnerId(receiverId);
    if (!safeReceiverId) {
      return res.status(400).json({ message: 'Invalid receiver ID' });
    }
    const safeShopId = shopId ? sanitizeShopId(shopId) : null;
    if (shopId && !safeShopId) {
      return res.status(400).json({ message: 'Invalid shop ID' });
    }
    const msg = await Message.create({
      senderId: req.user.id,
      receiverId: safeReceiverId,
      text: text.trim(),
      shopId: safeShopId,
    });
    const payload = msg.toJSON();
    const io = req.app.get('io');
    if (io && payload.receiverId !== payload.senderId) {
      io.to(String(payload.receiverId)).emit('receive_message', payload);
    }
    res.status(201).json(payload);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
