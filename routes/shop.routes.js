const router  = require('express').Router();
const { Op }  = require('sequelize');
const {
  Shop, Product, User, Review, ViewLog, Analytics, Wishlist, PreOrder, Message,
} = require('../models');
const { protect, optionalAuth, requireCvsu } = require('../middleware/auth');
const upload  = require('../middleware/upload');
const { recordUniqueView } = require('../utils/analyticsHelpers');

function maskHalf(value) {
  if (!value) return value;
  const s = String(value).trim();
  if (s.length <= 1) return '*';
  const visible = Math.max(1, Math.ceil(s.length / 2));
  return s.slice(0, visible) + '*'.repeat(s.length - visible);
}

function sanitizeShopForViewer(shopJson, viewerId) {
  const out = { ...shopJson };
  const isOwner = viewerId && out.userId === viewerId;

  if (out.seller) {
    out.seller = { ...out.seller };
    const showContact = out.seller.showContact !== false;

    if (!showContact) {
      delete out.seller.contactNumber;
    } else if (!isOwner && out.seller.contactNumber) {
      out.seller.contactNumber = maskHalf(out.seller.contactNumber);
    }

    if (out.seller.studentId) {
      if (!isOwner) {
        out.seller.studentId = maskHalf(out.seller.studentId);
      }
    } else {
      delete out.seller.studentId;
    }

    delete out.seller.showContact;
    delete out.seller.showStudentId;
  }

  return out;
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

async function destroyShopWithRelations(shop) {
  const shopId = shop.id;
  await Analytics.destroy({ where: { shopId } });
  await ViewLog.destroy({ where: { shopId } });
  await Product.destroy({ where: { shopId } });
  await Review.destroy({ where: { shopId } });
  await PreOrder.destroy({ where: { shopId } });
  await Wishlist.destroy({ where: { shopId } });
  await Message.destroy({ where: { shopId } });
  await shop.destroy();
}

function parseExistingPhotos(body) {
  if (body.existingPhotos === undefined) return null;
  return Array.isArray(body.existingPhotos) ? body.existingPhotos : [body.existingPhotos];
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
        { model: User,    as: 'seller',   attributes: ['id','fullName','badgeLevel','department','profilePhoto','contactNumber','showContact','studentId','socialLinks'] },
        { model: Product, as: 'products' },
        { model: Review,  as: 'reviews',
          include: [{ model: User, as: 'reviewer', attributes: ['id','fullName','profilePhoto','department'] }] },
      ],
    });
    if (!shop) return res.status(404).json({ message: 'Shop not found' });

    await recordUniqueView(req, shop);
    await shop.reload();

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
    const payload = sanitizeShopForViewer(
      {
        ...shop.toJSON(),
        avgRating: avg,
        reviewCount: shop.reviews?.length || 0,
        isSaved,
      },
      req.user?.id,
    );
    res.json(payload);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

const shopUpload = upload.fields([
  { name: 'photos', maxCount: 5 },
  { name: 'gcashQr', maxCount: 1 },
  { name: 'shopLogo', maxCount: 1 },
]);

function shopPayloadFromBody(body, files, existingShop = null) {
  const photos = files?.photos ? files.photos.map((f) => f.path) : null;
  const gcashQrFile = files?.gcashQr?.[0]?.path;
  const shopLogoFile = files?.shopLogo?.[0]?.path;
  const removeShopLogo = body.removeShopLogo === 'true' || body.removeShopLogo === true;

  return {
    name:          body.name          ?? existingShop?.name,
    description:   body.description   ?? existingShop?.description,
    category:      body.category      ?? existingShop?.category ?? 'other',
    college:       body.college       ?? existingShop?.college ?? 'Other',
    locationDesc:  body.locationDesc  ?? existingShop?.locationDesc,
    lat:           body.lat           ?? existingShop?.lat ?? null,
    lng:           body.lng           ?? existingShop?.lng ?? null,
    availableDate: body.availableDate || null,
    shopType:      body.shopType      || existingShop?.shopType || 'products',
    campusType:    body.campusType    || existingShop?.campusType || 'main',
    satelliteCampus: body.campusType === 'satellite' ? (body.satelliteCampus || null) : null,
    gcashNumber:   body.gcashNumber   ?? existingShop?.gcashNumber ?? null,
    gcashQr:       gcashQrFile ?? existingShop?.gcashQr ?? null,
    shopLogo:      removeShopLogo ? null : (shopLogoFile ?? existingShop?.shopLogo ?? null),
    photos,
  };
}

// ─── POST /api/shops ─────────────────────────────────────────────────────────
router.post('/', protect, requireCvsu, shopUpload, async (req, res) => {
  try {
    const base = shopPayloadFromBody(req.body, req.files);
    const photos = base.photos || [];
    delete base.photos;

    const shop = await Shop.create({
      userId: req.user.id,
      ...base,
      photos,
    });

    const { productName, productPrice } = req.body;
    if (productName && productPrice) {
      await Product.create({
        shopId: shop.id,
        name: productName,
        price: parseFloat(productPrice),
      });
    }

    invalidateListCache();
    const full = await Shop.findByPk(shop.id, {
      include: [{ model: Product, as: 'products' }],
    });
    res.status(201).json(full);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── PUT /api/shops/:id ───────────────────────────────────────────────────────
router.put('/:id', protect, shopUpload, async (req, res) => {
  try {
    const shop = await Shop.findByPk(req.params.id);
    if (!shop)                       return res.status(404).json({ message: 'Shop not found' });
    if (shop.userId !== req.user.id) return res.status(403).json({ message: 'Forbidden' });

    const base = shopPayloadFromBody(req.body, req.files, shop);
    const data = { ...base };
    delete data.photos;

    const kept = parseExistingPhotos(req.body);
    if (kept !== null || req.files?.photos?.length) {
      let photoList = kept !== null ? kept : (shop.photos || []);
      if (req.files?.photos?.length) {
        photoList = [...photoList, ...req.files.photos.map((f) => f.path)];
      }
      data.photos = photoList.slice(0, 5);
    }

    await shop.update(data);

    const { productName, productPrice, productId } = req.body;
    if (productName && productPrice) {
      const price = parseFloat(productPrice);
      if (productId) {
        const prod = await Product.findByPk(productId);
        if (prod && prod.shopId === shop.id) {
          await prod.update({ name: productName, price });
        }
      } else {
        const count = await Product.count({ where: { shopId: shop.id } });
        if (count === 0) {
          await Product.create({ shopId: shop.id, name: productName, price });
        }
      }
    }
    invalidateListCache();

    const updated = await Shop.findByPk(shop.id, {
      include: [
        { model: Product, as: 'products' },
        { model: User, as: 'seller', attributes: ['id', 'fullName', 'badgeLevel', 'department', 'profilePhoto', 'contactNumber'] },
      ],
    });
    res.json(updated);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── DELETE /api/shops/:id ────────────────────────────────────────────────────
router.delete('/:id', protect, async (req, res) => {
  try {
    const shop = await Shop.findByPk(req.params.id);
    if (!shop)                       return res.status(404).json({ message: 'Shop not found' });
    if (shop.userId !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Forbidden' });
    await destroyShopWithRelations(shop);
    invalidateListCache();
    res.json({ message: 'Shop deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
