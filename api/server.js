require('dotenv').config();
const express  = require('express');
const cors     = require('cors');

const menuRouter     = require('./routes/menu');
const ordersRouter   = require('./routes/orders');
const bookingsRouter = require('./routes/bookings');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── MIDDLEWARE ──
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || '*',
  methods: ['GET', 'POST', 'PATCH'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// ── ROUTES ──
app.use('/api/menu',     menuRouter);
app.use('/api/orders',   ordersRouter);
app.use('/api/bookings', bookingsRouter);

// ── HEALTH CHECK ──
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── 404 HANDLER ──
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── ERROR HANDLER ──
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🍽️  REAL Restaurant API running on http://localhost:${PORT}`);
  console.log(`   GET  /api/menu`);
  console.log(`   POST /api/orders`);
  console.log(`   POST /api/bookings/table`);
  console.log(`   POST /api/bookings/room`);
});
