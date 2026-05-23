const router = require('express').Router();
const { Analytics, Shop } = require('../models');
const { protect } = require('../middleware/auth');
const { Op, fn, col } = require('sequelize');

function fillWeeklyGaps(weekly) {
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split('T')[0];
  });
  const byDate = {};
  (weekly || []).forEach((w) => {
    const date = typeof w.date === 'string'
      ? w.date.split('T')[0]
      : new Date(w.date).toISOString().split('T')[0];
    byDate[date] = parseInt(w.count, 10) || 0;
  });
  return last7.map((date) => ({ date, count: byDate[date] ?? 0 }));
}

// POST /api/analytics/track — click + message only (views tracked on shop GET)
router.post('/track', protect, async (req, res) => {
  try {
    const { shopId, type } = req.body;
    if (!shopId || !['click', 'message'].includes(type)) {
      return res.status(400).json({ message: 'shopId and type (click|message) required' });
    }

    const shop = await Shop.findByPk(shopId);
    if (!shop) return res.status(404).json({ message: 'Shop not found' });

    const date = new Date().toISOString().split('T')[0];
    await Analytics.create({
      shopId,
      type,
      userId: req.user.id,
      date,
    });

    if (type === 'click') {
      await shop.increment('clicks');
    }

    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/analytics/:shopId — owner only
router.get('/:shopId', protect, async (req, res) => {
  try {
    const shop = await Shop.findByPk(req.params.shopId);
    if (!shop || shop.userId !== req.user.id)
      return res.status(403).json({ message: 'Forbidden' });

    const id       = String(req.params.shopId);
    const sevenAgo = new Date();
    sevenAgo.setDate(sevenAgo.getDate() - 6);
    const sevenAgoStr = sevenAgo.toISOString().split('T')[0];

    const [totalViews, totalClicks, totalMessages, weeklyRaw] = await Promise.all([
      Analytics.count({ where: { shopId: id, type: 'view' } }),
      Analytics.count({ where: { shopId: id, type: 'click' } }),
      Analytics.count({ where: { shopId: id, type: 'message' } }),
      Analytics.findAll({
        where: {
          shopId: id,
          type: 'view',
          date: { [Op.gte]: sevenAgoStr },
        },
        attributes: ['date', [fn('COUNT', col('id')), 'count']],
        group: ['date'],
        order: [['date', 'ASC']],
        raw: true,
      }),
    ]);

    const weekly = fillWeeklyGaps(weeklyRaw);

    res.json({ totalViews, totalClicks, totalMessages, weekly });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
