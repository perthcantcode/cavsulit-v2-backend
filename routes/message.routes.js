const router = require('express').Router();
const { Message, User } = require('../models');
const { protect } = require('../middleware/auth');
const { Op } = require('sequelize');

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
    const msgs = await Message.findAll({
      where: {
        [Op.or]: [
          { senderId: req.user.id,          receiverId: req.params.partnerId },
          { senderId: req.params.partnerId, receiverId: req.user.id },
        ],
      },
      order: [['createdAt','ASC']],
    });
    await Message.update(
      { isRead: true },
      { where: { senderId: req.params.partnerId, receiverId: req.user.id, isRead: false } }
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
    const msg = await Message.create({
      senderId: req.user.id,
      receiverId,
      text: text.trim(),
      shopId: shopId || null,
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
