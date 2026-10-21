require('dotenv').config();
const express     = require('express');
const compression = require('compression');
const cors        = require('cors');
const http     = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { sequelize } = require('./models');

const app    = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://cavsulit.vercel.app',
  'https://cavsulit-v2-frontend.vercel.app',
  process.env.CLIENT_URL,
].filter(Boolean);

const corsOptions = {
  origin: function (origin, cb) {
    if (!origin || allowedOrigins.includes(origin)) {
      cb(null, true);
    } else {
      cb(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
}));
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts, try again in a few minutes.' },
}));
// ─── SOCKET.IO (real-time messaging) ─────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin(origin, cb) {
      if (!origin || allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

io.on('connection', (socket) => {
  socket.on('join', (userId) => {
    if (userId) socket.join(String(userId));
  });
  socket.on('send_message', (data) => {
    if (data?.receiverId && data.senderId !== data.receiverId) {
      io.to(String(data.receiverId)).emit('receive_message', data);
    }
  });
});

app.set('io', io);

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── ROUTES ───────────────────────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth.routes'));
app.use('/api/shops',     require('./routes/shop.routes'));
app.use('/api/products',  require('./routes/product.routes'));
app.use('/api/reviews',   require('./routes/review.routes'));
app.use('/api/messages',  require('./routes/message.routes'));
app.use('/api/wishlist',  require('./routes/wishlist.routes'));
app.use('/api/preorders', require('./routes/preorder.routes'));
app.use('/api/analytics', require('./routes/analytics.routes'));
app.use('/api/admin',     require('./routes/admin.routes'));

// Health check — also used by frontend ping to wake Render from sleep
app.get('/',        (_req, res) => res.json({ status: 'ok', message: '🟢 CavSulit API running' }));
app.get('/api/ping',(_req, res) => res.json({ pong: true, ts: Date.now() }));

// ─── START ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const syncOptions = process.env.DB_SYNC_ALTER === 'true' ? { alter: true } : {};

sequelize.sync(syncOptions)
  .then(() => {
    server.listen(PORT, () => console.log(`✅ Server on http://localhost:${PORT}`));
    console.log('✅ Database synced');
  })
  .catch((err) => console.error('❌ Startup error:', err));
