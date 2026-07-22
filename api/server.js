require('dotenv').config();
const express  = require('express');
const cors     = require('cors');

const menuRouter     = require('./routes/menu');
const ordersRouter   = require('./routes/orders');
const bookingsRouter = require('./routes/bookings');
const authRouter     = require('./routes/auth');
const { authenticate, requireRole } = require('./middleware/auth');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── MIDDLEWARE ──
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || '*',
  methods: ['GET', 'POST', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// ── AUTH (public) ──
app.use('/api/auth', authRouter);

// ── MENU (public) ──
app.use('/api/menu', menuRouter);

// ── ORDERS ──
// POST — any authenticated user (customer or staff can place orders)
app.post('/api/orders',           authenticate, ordersRouter);
// GET / PATCH — staff only
app.get('/api/orders',            authenticate, requireRole('kitchen','waiter','manager'), ordersRouter);
app.get('/api/orders/:id',        authenticate, requireRole('kitchen','waiter','manager'), ordersRouter);
app.patch('/api/orders/:id/status', authenticate, requireRole('kitchen','waiter','manager'), ordersRouter);

// ── BOOKINGS ──
// POST — public (customers book from the website)
app.post('/api/bookings/table',               bookingsRouter);
app.post('/api/bookings/room',                bookingsRouter);
// GET / PATCH — staff only
app.get('/api/bookings/table',                authenticate, requireRole('waiter','manager'), bookingsRouter);
app.get('/api/bookings/table/:id',            authenticate, requireRole('waiter','manager'), bookingsRouter);
app.patch('/api/bookings/table/:id/status',   authenticate, requireRole('waiter','manager'), bookingsRouter);
app.get('/api/bookings/room',                 authenticate, requireRole('manager'), bookingsRouter);
app.get('/api/bookings/room/:id',             authenticate, requireRole('manager'), bookingsRouter);
app.patch('/api/bookings/room/:id/status',    authenticate, requireRole('manager'), bookingsRouter);

// ── HEALTH ──
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── 404 ──
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── ERROR ──
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🍽️  REAL Restaurant API  →  http://localhost:${PORT}`);
  console.log(`   PUBLIC  POST /api/auth/login`);
  console.log(`   PUBLIC  POST /api/auth/register`);
  console.log(`   PUBLIC  GET  /api/menu`);
  console.log(`   AUTH    POST /api/orders`);
  console.log(`   STAFF   GET  /api/orders`);
  console.log(`   PUBLIC  POST /api/bookings/table|room`);
  console.log(`   STAFF   GET  /api/bookings/table|room`);
});
