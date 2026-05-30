const { Op } = require('sequelize');
const { sequelize, Analytics, ViewLog, Message } = require('../models');

const VIEW_WINDOW_MS = 24 * 60 * 60 * 1000;

function todayDate() {
  return new Date().toISOString().split('T')[0];
}

function isShopOwner(req, shop) {
  return Boolean(req.user?.id && shop.userId === req.user.id);
}

/**
 * One view per logged-in user (or guest IP) per shop per 24h.
 * Owner views are never counted.
 */
async function recordUniqueView(req, shop) {
  if (isShopOwner(req, shop)) return false;

  const shopId = shop.id;
  const userId = req.user?.id || null;
  const viewerKey = userId
    ? `user:${userId}`
    : `ip:${String(req.ip || 'anon').slice(0, 100)}`;
  const now = new Date();

  return sequelize.transaction(async (transaction) => {
    const where = { shopId, viewerKey };

    let row = await ViewLog.findOne({
      where,
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    let isUnique = false;

    if (!row) {
      try {
        await ViewLog.create(
          { shopId, userId, viewerKey, lastViewedAt: now },
          { transaction },
        );
        isUnique = true;
      } catch (err) {
        if (!['SequelizeUniqueConstraintError', 'SQLITE_CONSTRAINT'].includes(err.name)) {
          throw err;
        }
        row = await ViewLog.findOne({
          where,
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (row && now - new Date(row.lastViewedAt) >= VIEW_WINDOW_MS) {
          await row.update({ lastViewedAt: now }, { transaction });
          isUnique = true;
        }
      }
    } else if (now - new Date(row.lastViewedAt) >= VIEW_WINDOW_MS) {
      await row.update({ lastViewedAt: now }, { transaction });
      isUnique = true;
    }

    if (isUnique) {
      await shop.increment('views', { transaction });
      await Analytics.create(
        { shopId, userId, type: 'view', date: todayDate() },
        { transaction },
      );
    }

    return isUnique;
  });
}

/**
 * Profile click — one per user per shop per 24h. Owner clicks are ignored.
 */
async function recordProfileClick(req, shop) {
  if (!req.user || isShopOwner(req, shop)) return false;

  const recent = await Analytics.findOne({
    where: { shopId: shop.id, userId: req.user.id, type: 'click' },
    order: [['createdAt', 'DESC']],
  });

  if (recent && Date.now() - new Date(recent.createdAt) < VIEW_WINDOW_MS) {
    return false;
  }

  await Analytics.create({
    shopId: shop.id,
    userId: req.user.id,
    type: 'click',
    date: todayDate(),
  });
  await shop.increment('clicks');
  return true;
}

/** Distinct buyers who messaged the seller about this listing. */
async function countShopMessages(shopId, sellerId) {
  return Message.count({
    where: {
      shopId,
      receiverId: sellerId,
      senderId: { [Op.ne]: sellerId },
    },
    distinct: true,
    col: 'senderId',
  });
}

module.exports = {
  VIEW_WINDOW_MS,
  todayDate,
  isShopOwner,
  recordUniqueView,
  recordProfileClick,
  countShopMessages,
};
