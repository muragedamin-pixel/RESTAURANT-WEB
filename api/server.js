require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');

const menuRouter     = require('./routes/menu');
const ordersRouter   = require('./routes/orders');
const bookingsRouter = require('./routes/bookings');
const authRouter     = require('./routes/auth');
const staffRouter    = require('./routes/staff');
const { authenticate, requireRole } = require('./middleware/auth');

const app    = express();
const server = http.createServer(app);        // http server wraps express
const io     = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_ORIGIN || '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// ── Share io with routes via app locals ──
app.set('io', io);

// ── MIDDLEWARE ──
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || '*',
  methods: ['GET', 'POST', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// ── SOCKET.IO ROOMS ──
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  // Client tells us what role/room it belongs to
  socket.on('join', (room) => {
    socket.join(room);
    console.log(`   ↳ joined room: ${room}`);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// ── ROUTES ──
app.use('/api/auth',    authRouter);
app.use('/api/menu',    menuRouter);

// ── STAFF API — all under /api/staff, require auth + staff role ──
app.use('/api/staff',
  authenticate,
  requireRole('kitchen', 'waiter', 'manager'),
  staffRouter
);

// Orders — POST requires login (customer or staff), GET/PATCH require staff auth
app.use('/api/orders', (req, res, next) => {
  if (req.method === 'POST') {
    // Must be logged in as customer, or staff (waiter/kitchen/manager)
    return authenticate(req, res, () => requireRole('customer','kitchen','waiter','manager')(req, res, next));
  }
  // All other methods (GET, PATCH, DELETE) — auth is handled inside the router
  next();
}, ordersRouter);

// Bookings — all auth handled inside the router per-route
app.use('/api/bookings', bookingsRouter);

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

// ── START ──
server.listen(PORT, () => {
  console.log(`🍽️  REAL Restaurant API  →  http://localhost:${PORT}`);
  console.log(`⚡  Socket.IO            →  ws://localhost:${PORT}`);
});
