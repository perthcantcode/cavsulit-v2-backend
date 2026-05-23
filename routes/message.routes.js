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
    const msg = await Message.create({
      senderId: req.user.id, receiverId, text, shopId: shopId || null,
    });
    res.status(201).json(msg);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
