require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const menuRouter = require('./routes/menu');
const ordersRouter = require('./routes/orders');
const bookingsRouter = require('./routes/bookings');
const authRouter = require('./routes/auth');
const staffRouter = require('./routes/staff');
const posRouter = require('./routes/pos');
const { authenticate, requireRole } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
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
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// ── SOCKET.IO ROOMS ──
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  socket.on('join', (room) => {
    socket.join(room);
    console.log(` ↳ joined room: ${room}`);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// ── ROUTES ──
app.use('/api/auth', authRouter);
app.use('/api/menu', menuRouter);

// Staff API — all under /api/staff, require auth + staff role
app.use('/api/staff',
  authenticate,
  requireRole('kitchen', 'waiter', 'manager'),
  staffRouter
);

// Orders — POST requires login, GET/PATCH/DELETE handled inside router
app.use('/api/orders', (req, res, next) => {
  if (req.method === 'POST') {
    return authenticate(req, res, () =>
      requireRole('customer', 'kitchen', 'waiter', 'manager')(req, res, next)
    );
  }
  next();
}, ordersRouter);

// Bookings — auth handled per-route inside the router
app.use('/api/bookings', bookingsRouter);

// POS Connector — waiter or manager only (enforced inside the router)
app.use('/api/pos',
  authenticate,
  requireRole('waiter', 'manager'),
  posRouter
);

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
  console.log(`🍽️  REAL Restaurant API → http://localhost:${PORT}`);
  console.log(`⚡  Socket.IO          → ws://localhost:${PORT}`);
  console.log(`💳  POS Connector      → /api/pos (Square · Toast · SumUp)`);
});
