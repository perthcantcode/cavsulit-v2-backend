const router = require('express').Router();
const { Analytics, Shop } = require('../models');
const { protect } = require('../middleware/auth');
const { recordProfileClick, countShopMessages } = require('../utils/analyticsHelpers');

// POST /api/analytics/track — profile click only (views tracked on shop GET)
router.post('/track', protect, async (req, res) => {
  try {
    const { shopId, type } = req.body;
    if (!shopId || type !== 'click') {
      return res.status(400).json({ message: 'shopId and type "click" required' });
    }

    const shop = await Shop.findByPk(shopId);
    if (!shop) return res.status(404).json({ message: 'Shop not found' });

    const recorded = await recordProfileClick(req, shop);
    res.json({ ok: true, recorded });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/analytics/:shopId — owner only
router.get('/:shopId', protect, async (req, res) => {
  try {
    const shop = await Shop.findByPk(req.params.shopId);
    if (!shop || shop.userId !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const id = String(req.params.shopId);

    const [totalViews, totalClicks, totalMessages] = await Promise.all([
      Analytics.count({ where: { shopId: id, type: 'view' } }),
      Analytics.count({ where: { shopId: id, type: 'click' } }),
      countShopMessages(id, shop.userId),
    ]);

    res.json({ totalViews, totalClicks, totalMessages });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
