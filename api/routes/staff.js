const express = require('express');
const router  = express.Router();
const db      = require('../db');

function getIO(req) { return req.app.get('io'); }

// ══════════════════════════════════════════
//  STAFF — ORDERS
// ══════════════════════════════════════════

// GET /api/staff/orders — all orders, newest first
router.get('/orders', (req, res) => {
  const { status } = req.query;
  const allowed = ['received','preparing','ready','delivered'];
  let rows;
  if (status) {
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    rows = db.prepare('SELECT * FROM orders WHERE status=? ORDER BY id DESC').all(status);
  } else {
    rows = db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
  }
  res.json(rows.map(o => ({ ...o, items: JSON.parse(o.items) })));
});

// GET /api/staff/orders/:id
router.get('/orders/:id', (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Order not found' });
  res.json({ ...o, items: JSON.parse(o.items) });
});

// PATCH /api/staff/orders/:id/status
router.patch('/orders/:id/status', (req, res) => {
  const { status } = req.body;
  const allowed = ['received','preparing','ready','delivered'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
  }
  const result = db.prepare('UPDATE orders SET status=? WHERE id=?').run(status, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Order not found' });

  const order = { ...db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id) };
  order.items = JSON.parse(order.items);

  const io = getIO(req);
  io.to('kitchen').emit('order:updated', order);
  io.to('waiter').emit('order:updated', order);
  io.to('manager').emit('order:updated', order);
  if (status === 'ready') io.to('waiter').emit('order:ready', order);

  res.json({ message: 'Status updated', order });
});

// ══════════════════════════════════════════
//  STAFF — TABLE BOOKINGS
// ══════════════════════════════════════════

// GET /api/staff/bookings/table
router.get('/bookings/table', (req, res) => {
  const { status } = req.query;
  let rows;
  if (status) {
    rows = db.prepare('SELECT * FROM table_bookings WHERE status=? ORDER BY date,time').all(status);
  } else {
    rows = db.prepare('SELECT * FROM table_bookings ORDER BY date DESC, time DESC').all();
  }
  res.json(rows);
});

// GET /api/staff/bookings/table/:id
router.get('/bookings/table/:id', (req, res) => {
  const b = db.prepare('SELECT * FROM table_bookings WHERE id=?').get(req.params.id);
  if (!b) return res.status(404).json({ error: 'Booking not found' });
  res.json(b);
});

// PATCH /api/staff/bookings/table/:id/status
router.patch('/bookings/table/:id/status', (req, res) => {
  const { status } = req.body;
  const allowed = ['pending','confirmed','cancelled'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
  }
  const result = db.prepare('UPDATE table_bookings SET status=? WHERE id=?').run(status, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Booking not found' });

  const booking = db.prepare('SELECT * FROM table_bookings WHERE id=?').get(req.params.id);
  const io = getIO(req);
  io.to('waiter').emit('booking:table:updated', booking);
  io.to('manager').emit('booking:table:updated', booking);

  res.json({ message: 'Status updated', booking });
});

// ══════════════════════════════════════════
//  STAFF — ROOM BOOKINGS
// ══════════════════════════════════════════

// GET /api/staff/bookings/room
router.get('/bookings/room', (req, res) => {
  const { status } = req.query;
  let rows;
  if (status) {
    rows = db.prepare('SELECT * FROM room_bookings WHERE status=? ORDER BY check_in').all(status);
  } else {
    rows = db.prepare('SELECT * FROM room_bookings ORDER BY check_in DESC').all();
  }
  res.json(rows);
});

// GET /api/staff/bookings/room/:id
router.get('/bookings/room/:id', (req, res) => {
  const b = db.prepare('SELECT * FROM room_bookings WHERE id=?').get(req.params.id);
  if (!b) return res.status(404).json({ error: 'Booking not found' });
  res.json(b);
});

// PATCH /api/staff/bookings/room/:id/status
router.patch('/bookings/room/:id/status', (req, res) => {
  const { status } = req.body;
  const allowed = ['pending','confirmed','cancelled'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
  }
  const result = db.prepare('UPDATE room_bookings SET status=? WHERE id=?').run(status, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Booking not found' });

  const booking = db.prepare('SELECT * FROM room_bookings WHERE id=?').get(req.params.id);
  const io = getIO(req);
  io.to('manager').emit('booking:room:updated', booking);

  res.json({ message: 'Status updated', booking });
});

// ══════════════════════════════════════════
//  STAFF — STATS (manager overview)
// ══════════════════════════════════════════

// GET /api/staff/stats
router.get('/stats', (req, res) => {
  const orders       = db.prepare('SELECT * FROM orders').all().map(o => ({ ...o, items: JSON.parse(o.items) }));
  const tableBookings = db.prepare('SELECT * FROM table_bookings').all();
  const roomBookings  = db.prepare('SELECT * FROM room_bookings').all();

  const revenue = orders.reduce((s, o) => s + o.total, 0);
  const roomRevenue = roomBookings.reduce((s, b) => {
    const nights = Math.ceil((new Date(b.check_out) - new Date(b.check_in)) / 86400000);
    return s + (isNaN(nights) ? 0 : b.price * nights);
  }, 0);

  res.json({
    orders: {
      total:     orders.length,
      received:  orders.filter(o => o.status === 'received').length,
      preparing: orders.filter(o => o.status === 'preparing').length,
      ready:     orders.filter(o => o.status === 'ready').length,
      delivered: orders.filter(o => o.status === 'delivered').length,
      revenue
    },
    tables: {
      total:     tableBookings.length,
      pending:   tableBookings.filter(b => b.status === 'pending').length,
      confirmed: tableBookings.filter(b => b.status === 'confirmed').length,
      cancelled: tableBookings.filter(b => b.status === 'cancelled').length
    },
    rooms: {
      total:     roomBookings.length,
      pending:   roomBookings.filter(b => b.status === 'pending').length,
      confirmed: roomBookings.filter(b => b.status === 'confirmed').length,
      cancelled: roomBookings.filter(b => b.status === 'cancelled').length,
      revenue:   roomRevenue
    }
  });
});

module.exports = router;
