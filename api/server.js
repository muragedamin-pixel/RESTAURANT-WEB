require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');

const menuRouter     = require('./routes/menu');
const ordersRouter   = require('./routes/orders');
const bookingsRouter = require('./routes/bookings');
const authRouter     = require('./routes/auth');
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

// Orders
app.post('/api/orders',               authenticate,                                        ordersRouter);
app.get('/api/orders',                authenticate, requireRole('kitchen','waiter','manager'), ordersRouter);
app.get('/api/orders/:id',            authenticate, requireRole('kitchen','waiter','manager'), ordersRouter);
app.patch('/api/orders/:id/status',   authenticate, requireRole('kitchen','waiter','manager'), ordersRouter);

// Bookings — POST public, GET/PATCH staff only
app.post('/api/bookings/table',                                                            bookingsRouter);
app.post('/api/bookings/room',                                                             bookingsRouter);
app.get('/api/bookings/table',              authenticate, requireRole('waiter','manager'), bookingsRouter);
app.get('/api/bookings/table/:id',          authenticate, requireRole('waiter','manager'), bookingsRouter);
app.patch('/api/bookings/table/:id/status', authenticate, requireRole('waiter','manager'), bookingsRouter);
app.get('/api/bookings/room',               authenticate, requireRole('manager'),          bookingsRouter);
app.get('/api/bookings/room/:id',           authenticate, requireRole('manager'),          bookingsRouter);
app.patch('/api/bookings/room/:id/status',  authenticate, requireRole('manager'),          bookingsRouter);

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
