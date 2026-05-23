const router  = require('express').Router();
const { Op }  = require('sequelize');
const { Shop, Product, User, Review, ViewLog, Analytics, Wishlist } = require('../models');
const { protect, optionalAuth, requireCvsu } = require('../middleware/auth');
const upload  = require('../middleware/upload');

const VIEW_WINDOW = 24 * 60 * 60 * 1000;

function todayDate() {
  return new Date().toISOString().split('T')[0];
}

async function recordUniqueView(req, shop) {
  const shopId = shop.id;
  const userId = req.user?.id || null;
  const viewerKey = userId ? null : (req.ip || 'anon');

  const where = userId
    ? { shopId, userId }
    : { shopId, viewerKey };

  const existing = await ViewLog.findOne({ where });
  const now = new Date();

  let isUnique = false;
  if (!existing) {
    await ViewLog.create({
      shopId,
      userId,
      viewerKey,
      lastViewedAt: now,
    });
    isUnique = true;
  } else if (now - new Date(existing.lastViewedAt) >= VIEW_WINDOW) {
    await existing.update({ lastViewedAt: now });
    isUnique = true;
  }

  if (isUnique) {
    await shop.increment('views');
    await Analytics.create({
      shopId,
      userId,
      type: 'view',
      date: todayDate(),
    });
  }
}

// ─── LIST CACHE (30s TTL) ─────────────────────────────────────────────────────
const listCache = new Map();
const LIST_TTL  = 30 * 1000;

function getListCacheKey(query) {
  return JSON.stringify(query);
}

function invalidateListCache() {
  listCache.clear();
}

// ─── SHARED INCLUDE ───────────────────────────────────────────────────────────
const shopInclude = [
  { model: User,    as: 'seller',   attributes: ['id','fullName','badgeLevel','department','profilePhoto'] },
  { model: Product, as: 'products', attributes: ['id','name','price','isAvailable'] },
  { model: Review,  as: 'reviews',  attributes: ['stars'] },
];

function withRating(shop) {
  const reviews = shop.reviews || [];
  const avg     = reviews.length
    ? (reviews.reduce((a, r) => a + r.stars, 0) / reviews.length).toFixed(1)
    : null;
  return { ...shop.toJSON(), avgRating: avg, reviewCount: reviews.length };
}

// ─── GET /api/shops — browse + filter + paginate ──────────────────────────────
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { category, college, search, sort = 'recent', page = 1, limit = 8 } = req.query;
    const cacheKey = getListCacheKey({ category, college, search, sort, page, limit });
    const cached   = listCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < LIST_TTL) {
      return res.json(cached.data);
    }

    const where  = { isActive: true };
    if (category && category !== 'all') where.category = category;
    if (college  && college  !== 'all') where.college  = college;
    if (search)  where.name = { [Op.iLike]: `%${search}%` };

    const order  = sort === 'popular' ? [['views','DESC']] : [['createdAt','DESC']];
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

    const { count, rows } = await Shop.findAndCountAll({
      where, order, limit: parseInt(limit), offset, include: shopInclude,
    });

    const payload = {
      total:      count,
      page:       parseInt(page),
      totalPages: Math.ceil(count / parseInt(limit)),
      pages:      Math.ceil(count / parseInt(limit)),
      shops:      rows.map(withRating),
    };

    listCache.set(cacheKey, { ts: Date.now(), data: payload });
    res.json(payload);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── GET /api/shops/mine ─────────────────────────────────────────────────────
router.get('/mine', protect, async (req, res) => {
  try {
    const shops = await Shop.findAll({
      where:   { userId: req.user.id },
      include: [{ model: Product, as: 'products' }, { model: Review, as: 'reviews', attributes: ['stars'] }],
      order:   [['createdAt','DESC']],
    });
    res.json(shops);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── GET /api/shops/:id ──────────────────────────────────────────────────────
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const shop = await Shop.findByPk(req.params.id, {
      include: [
        { model: User,    as: 'seller',   attributes: ['id','fullName','badgeLevel','department','profilePhoto','contactNumber','showContact'] },
        { model: Product, as: 'products' },
        { model: Review,  as: 'reviews',
          include: [{ model: User, as: 'reviewer', attributes: ['id','fullName','profilePhoto','department'] }] },
      ],
    });
    if (!shop) return res.status(404).json({ message: 'Shop not found' });

    await recordUniqueView(req, shop);

    let isSaved = false;
    if (req.user) {
      const saved = await Wishlist.findOne({
        where: { userId: req.user.id, shopId: shop.id },
      });
      isSaved = !!saved;
    }

    const avg = shop.reviews?.length
      ? (shop.reviews.reduce((a, r) => a + r.stars, 0) / shop.reviews.length).toFixed(1)
      : null;
    res.json({
      ...shop.toJSON(),
      avgRating: avg,
      reviewCount: shop.reviews?.length || 0,
      isSaved,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── POST /api/shops ─────────────────────────────────────────────────────────
router.post('/', protect, requireCvsu, upload.array('photos', 5), async (req, res) => {
  try {
    const { name, description, category, college, locationDesc, lat, lng, availableDate } = req.body;
    const photos = req.files ? req.files.map((f) => f.path) : [];
    const shop   = await Shop.create({
      userId: req.user.id, name, description,
      category:      category      || 'other',
      college:       college       || 'Other',
      locationDesc,
      lat:           lat           || null,
      lng:           lng           || null,
      photos,
      availableDate: availableDate || null,
    });
    invalidateListCache();
    res.status(201).json(shop);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── PUT /api/shops/:id ───────────────────────────────────────────────────────
router.put('/:id', protect, upload.array('photos', 5), async (req, res) => {
  try {
    const shop = await Shop.findByPk(req.params.id);
    if (!shop)                           return res.status(404).json({ message: 'Shop not found' });
    if (shop.userId !== req.user.id)     return res.status(403).json({ message: 'Forbidden' });

    const updates = { ...req.body };
    if (req.files?.length) {
      updates.photos = req.files.map((f) => f.path);
    } else if (req.body.keepPhotos) {
      delete updates.photos;
    }

    await shop.update(updates);
    invalidateListCache();
    res.json(shop);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── DELETE /api/shops/:id ────────────────────────────────────────────────────
router.delete('/:id', protect, async (req, res) => {
  try {
    const shop = await Shop.findByPk(req.params.id);
    if (!shop)                       return res.status(404).json({ message: 'Shop not found' });
    if (shop.userId !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Forbidden' });
    await shop.destroy();
    invalidateListCache();
    res.json({ message: 'Shop deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
