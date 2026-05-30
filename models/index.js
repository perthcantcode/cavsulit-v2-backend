const { sequelize } = require('../config/db.config');
const { DataTypes } = require('sequelize');

// ─── USER ─────────────────────────────────────────────────────────────────────
const User = sequelize.define('User', {
  id:            { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  fullName:      { type: DataTypes.STRING(100), allowNull: false },
  email:         { type: DataTypes.STRING(100), allowNull: false, unique: true },
  password:      { type: DataTypes.STRING, allowNull: true },   // nullable — Firebase-only users have no password
  studentId:     { type: DataTypes.STRING(20), allowNull: true },
  department:    { type: DataTypes.ENUM('CEIT','CON','CEMDS','COE','CAS','STAFF','INSTRUCTOR','OTHER'), defaultValue: 'OTHER' },
  contactNumber: { type: DataTypes.STRING(15), allowNull: true },
  profilePhoto:  { type: DataTypes.STRING, allowNull: true },
  bio:           { type: DataTypes.TEXT, allowNull: true },
  socialLinks:   { type: DataTypes.JSON, defaultValue: {} },     // { facebook, instagram, messenger }
  showContact:   { type: DataTypes.BOOLEAN, defaultValue: true },
  showStudentId: { type: DataTypes.BOOLEAN, defaultValue: false },
  badgeLevel:    { type: DataTypes.ENUM('none','cvsu','trusted','top_seller'), defaultValue: 'none' },
  isCvsuVerified:{ type: DataTypes.BOOLEAN, defaultValue: false },
  isVerified:    { type: DataTypes.BOOLEAN, defaultValue: false },
  role:          { type: DataTypes.ENUM('user','seller','admin'), defaultValue: 'seller' },
}, { tableName: 'users', timestamps: true });

// ─── SHOP ─────────────────────────────────────────────────────────────────────
const Shop = sequelize.define('Shop', {
  id:            { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId:        { type: DataTypes.UUID, allowNull: false },
  name:          { type: DataTypes.STRING(100), allowNull: false },
  description:   { type: DataTypes.TEXT, allowNull: true },
  category:      { type: DataTypes.ENUM('food','drinks','merch','accessories','school_supplies','beauty','services','other'), defaultValue: 'other' },
  college:       { type: DataTypes.ENUM('CEIT','CON','CEMDS','COE','CAS','Main Gate','Canteen','Dormitory','Other'), defaultValue: 'Other' },
  locationDesc:  { type: DataTypes.STRING(200), allowNull: true },
  lat:           { type: DataTypes.DECIMAL(10,7), allowNull: true },
  lng:           { type: DataTypes.DECIMAL(10,7), allowNull: true },
  photos:        { type: DataTypes.JSON, defaultValue: [] },
  shopLogo:      { type: DataTypes.STRING, allowNull: true },
  availableDate: { type: DataTypes.DATEONLY, allowNull: true },
  isActive:      { type: DataTypes.BOOLEAN, defaultValue: true },
  isFeatured:    { type: DataTypes.BOOLEAN, defaultValue: false },
  views:         { type: DataTypes.INTEGER, defaultValue: 0 },
  clicks:        { type: DataTypes.INTEGER, defaultValue: 0 },
  shopType:        { type: DataTypes.STRING(20), defaultValue: 'products' },
  campusType:      { type: DataTypes.STRING(20), defaultValue: 'main' },
  satelliteCampus: { type: DataTypes.STRING(120), allowNull: true },
  gcashNumber:     { type: DataTypes.STRING(20), allowNull: true },
  gcashQr:         { type: DataTypes.STRING, allowNull: true },
  hideGcash:       { type: DataTypes.BOOLEAN, defaultValue: false },
}, {
  tableName: 'shops',
  timestamps: true,
  indexes: [
    { fields: ['category'] },
    { fields: ['college'] },
    { fields: ['userId'] },
  ],
});

// ─── PRODUCT ──────────────────────────────────────────────────────────────────
const Product = sequelize.define('Product', {
  id:          { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  shopId:      { type: DataTypes.UUID, allowNull: false },
  name:        { type: DataTypes.STRING(100), allowNull: false },
  price:       { type: DataTypes.DECIMAL(10,2), allowNull: false },
  image:       { type: DataTypes.STRING, allowNull: true },
  isAvailable: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'products', timestamps: true });

// ─── MESSAGE ──────────────────────────────────────────────────────────────────
const Message = sequelize.define('Message', {
  id:         { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  senderId:   { type: DataTypes.UUID, allowNull: false },
  receiverId: { type: DataTypes.UUID, allowNull: false },
  shopId:     { type: DataTypes.UUID, allowNull: true },
  text:       { type: DataTypes.TEXT, allowNull: false },
  isRead:     { type: DataTypes.BOOLEAN, defaultValue: false },
}, { tableName: 'messages', timestamps: true });

// ─── REVIEW ───────────────────────────────────────────────────────────────────
const Review = sequelize.define('Review', {
  id:      { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  shopId:  { type: DataTypes.UUID, allowNull: false },
  userId:  { type: DataTypes.UUID, allowNull: false },
  stars:   { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 5 } },
  comment: { type: DataTypes.TEXT, allowNull: true },
}, { tableName: 'reviews', timestamps: true });

// ─── PREORDER ─────────────────────────────────────────────────────────────────
const PreOrder = sequelize.define('PreOrder', {
  id:           { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  shopId:       { type: DataTypes.UUID, allowNull: false },
  buyerId:      { type: DataTypes.UUID, allowNull: false },
  items:        { type: DataTypes.JSON, defaultValue: [] },
  pickupTime:   { type: DataTypes.STRING, allowNull: true },
  locationNote: { type: DataTypes.STRING(200), allowNull: true },
  status:       { type: DataTypes.ENUM('pending','confirmed','done','cancelled'), defaultValue: 'pending' },
}, { tableName: 'preorders', timestamps: true });

// ─── WISHLIST ─────────────────────────────────────────────────────────────────
const Wishlist = sequelize.define('Wishlist', {
  id:     { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false },
  shopId: { type: DataTypes.UUID, allowNull: false },
}, { tableName: 'wishlists', timestamps: true });

// ─── ANALYTICS ────────────────────────────────────────────────────────────────
const Analytics = sequelize.define('Analytics', {
  id:     { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  shopId: { type: DataTypes.UUID, allowNull: false },
  userId: { type: DataTypes.UUID, allowNull: true },  // null for guests
  type:   { type: DataTypes.ENUM('view','click','message'), allowNull: false },
  date:   { type: DataTypes.DATEONLY, defaultValue: DataTypes.NOW },
}, {
  tableName: 'analytics',
  timestamps: true,
  indexes: [
    { fields: ['shopId'] },
    { fields: ['date'] },
    { fields: ['shopId', 'type', 'date'] },
  ],
});

// ─── VIEW LOG (unique views per user per shop per 24h) ───────────────────────
const ViewLog = sequelize.define('ViewLog', {
  id:            { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId:        { type: DataTypes.UUID, allowNull: true },
  shopId:        { type: DataTypes.UUID, allowNull: false },
  lastViewedAt:  { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  viewerKey:     { type: DataTypes.STRING(120), allowNull: true }, // ip or anon for guests
}, {
  tableName: 'view_logs',
  timestamps: true,
  indexes: [
    { fields: ['shopId', 'viewerKey'], unique: true },
  ],
});

// ─── ASSOCIATIONS ─────────────────────────────────────────────────────────────
Shop.belongsTo(User,     { foreignKey: 'userId',     as: 'seller' });
User.hasMany(Shop,       { foreignKey: 'userId',     as: 'shops' });
Product.belongsTo(Shop,  { foreignKey: 'shopId',     as: 'shop' });
Shop.hasMany(Product,    { foreignKey: 'shopId',     as: 'products' });
Review.belongsTo(Shop,   { foreignKey: 'shopId',     as: 'shop' });
Review.belongsTo(User,   { foreignKey: 'userId',     as: 'reviewer' });
Shop.hasMany(Review,     { foreignKey: 'shopId',     as: 'reviews' });
PreOrder.belongsTo(Shop, { foreignKey: 'shopId',     as: 'shop' });
PreOrder.belongsTo(User, { foreignKey: 'buyerId',    as: 'buyer' });
Wishlist.belongsTo(User, { foreignKey: 'userId',     as: 'user' });
Wishlist.belongsTo(Shop, { foreignKey: 'shopId',     as: 'shop' });
Message.belongsTo(User,  { foreignKey: 'senderId',   as: 'sender' });
Message.belongsTo(User,  { foreignKey: 'receiverId', as: 'receiver' });
Analytics.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });
Shop.hasMany(Analytics, { foreignKey: 'shopId', as: 'analytics' });
ViewLog.belongsTo(Shop, { foreignKey: 'shopId', as: 'shop' });
ViewLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Shop.hasMany(ViewLog, { foreignKey: 'shopId', as: 'viewLogs' });
User.hasMany(ViewLog, { foreignKey: 'userId', as: 'viewLogs' });

module.exports = {
  sequelize,
  User, Shop, Product, Message,
  Review, PreOrder, Wishlist, Analytics, ViewLog,
};
