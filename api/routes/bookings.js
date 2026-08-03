const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

function getIO(req) { return req.app.get('io'); }

// ══════════════════════════════════════════
//  TABLE BOOKINGS
// ══════════════════════════════════════════

// POST /api/bookings/table — place a table booking (public, but saves user_id if logged in)
router.post('/table', (req, res) => {
  const { name, phone, date, time, guests, seating } = req.body;

  if (!name || !phone || !date || !time || !guests) {
    return res.status(400).json({ error: 'name, phone, date, time, and guests are required' });
  }

  const bookingDate = new Date(`${date}T${time}`);
  if (isNaN(bookingDate.getTime()) || bookingDate < new Date()) {
    return res.status(400).json({ error: 'Please provide a valid future date and time' });
  }

  const user_id = req.user ? req.user.id : null;

  const result = db.prepare(
    `INSERT INTO table_bookings (user_id, name, phone, date, time, guests, seating)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(user_id, name, phone, date, time, guests, seating || 'Indoor');

  const booking = db.prepare('SELECT * FROM table_bookings WHERE id = ?').get(result.lastInsertRowid);

  // 🔔 Notify waiter + manager
  const io = getIO(req);
  io.to('waiter').emit('booking:table:new', booking);
  io.to('manager').emit('booking:table:new', booking);

  res.status(201).json({ message: 'Table reserved successfully', booking });
});

// GET /api/bookings/table/my — customer's own table bookings
router.get('/table/my', authenticate, (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM table_bookings WHERE user_id = ? ORDER BY date DESC, time DESC'
  ).all(req.user.id);
  res.json(rows);
});

// GET /api/bookings/table — all table bookings (staff only)
router.get('/table', authenticate, requireRole('waiter', 'manager'), (req, res) => {
  const { status } = req.query;
  let rows;
  if (status) {
    rows = db.prepare('SELECT * FROM table_bookings WHERE status=? ORDER BY date,time').all(status);
  } else {
    rows = db.prepare('SELECT * FROM table_bookings ORDER BY date DESC, time DESC').all();
  }
  res.json(rows);
});

// GET /api/bookings/table/:id — single table booking (owner or staff)
router.get('/table/:id', authenticate, (req, res) => {
  const booking = db.prepare('SELECT * FROM table_bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const staffRoles = ['waiter', 'manager'];
  if (!staffRoles.includes(req.user.role) && booking.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  res.json(booking);
});

// PATCH /api/bookings/table/:id/status — update status (staff only)
router.patch('/table/:id/status', authenticate, requireRole('waiter', 'manager'), (req, res) => {
  const { status } = req.body;
  const allowed = ['pending', 'confirmed', 'cancelled'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
  }

  const result = db.prepare('UPDATE table_bookings SET status = ? WHERE id = ?')
    .run(status, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Booking not found' });

  const booking = db.prepare('SELECT * FROM table_bookings WHERE id = ?').get(req.params.id);

  // 🔔 Broadcast update
  const io = getIO(req);
  io.to('waiter').emit('booking:table:updated', booking);
  io.to('manager').emit('booking:table:updated', booking);

  res.json({ message: 'Status updated', booking });
});

// DELETE /api/bookings/table/:id — customer cancels own pending booking
router.delete('/table/:id', authenticate, (req, res) => {
  const booking = db.prepare('SELECT * FROM table_bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const staffRoles = ['waiter', 'manager'];
  if (!staffRoles.includes(req.user.role) && booking.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  if (!staffRoles.includes(req.user.role) && booking.status !== 'pending') {
    return res.status(400).json({ error: 'Cannot cancel — booking has already been confirmed' });
  }

  db.prepare('UPDATE table_bookings SET status = ? WHERE id = ?').run('cancelled', req.params.id);
  const updated = db.prepare('SELECT * FROM table_bookings WHERE id = ?').get(req.params.id);

  const io = getIO(req);
  io.to('waiter').emit('booking:table:updated', updated);
  io.to('manager').emit('booking:table:updated', updated);

  res.json({ message: 'Booking cancelled', booking: updated });
});

// ══════════════════════════════════════════
//  ROOM BOOKINGS
// ══════════════════════════════════════════

// POST /api/bookings/room — book a room (public, saves user_id if logged in)
router.post('/room', (req, res) => {
  const { room_name, price, name, phone, check_in, check_out, guests } = req.body;

  if (!room_name || !price || !name || !phone || !check_in || !check_out) {
    return res.status(400).json({ error: 'room_name, price, name, phone, check_in, and check_out are required' });
  }

  const checkIn  = new Date(check_in);
  const checkOut = new Date(check_out);

  if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
    return res.status(400).json({ error: 'Invalid check_in or check_out date' });
  }
  if (checkOut <= checkIn) {
    return res.status(400).json({ error: 'check_out must be after check_in' });
  }
  if (checkIn < new Date()) {
    return res.status(400).json({ error: 'check_in must be a future date' });
  }

  const nights  = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
  const total   = price * nights;
  const user_id = req.user ? req.user.id : null;

  const result = db.prepare(
    `INSERT INTO room_bookings (user_id, room_name, price, name, phone, check_in, check_out, guests)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(user_id, room_name, price, name, phone, check_in, check_out, guests || 1);

  const booking = db.prepare('SELECT * FROM room_bookings WHERE id = ?').get(result.lastInsertRowid);

  // 🔔 Notify manager
  const io = getIO(req);
  io.to('manager').emit('booking:room:new', { ...booking, nights, total_cost: total });

  res.status(201).json({
    message: 'Room booked successfully',
    booking,
    summary: { nights, total_cost: `Ksh ${total.toLocaleString()}` }
  });
});

// GET /api/bookings/room/my — customer's own room bookings
router.get('/room/my', authenticate, (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM room_bookings WHERE user_id = ? ORDER BY check_in DESC'
  ).all(req.user.id);
  res.json(rows);
});

// GET /api/bookings/room — all room bookings (manager only)
router.get('/room', authenticate, requireRole('manager'), (req, res) => {
  const { status } = req.query;
  let rows;
  if (status) {
    rows = db.prepare('SELECT * FROM room_bookings WHERE status=? ORDER BY check_in').all(status);
  } else {
    rows = db.prepare('SELECT * FROM room_bookings ORDER BY check_in DESC').all();
  }
  res.json(rows);
});

// GET /api/bookings/room/:id — single room booking (owner or manager)
router.get('/room/:id', authenticate, (req, res) => {
  const booking = db.prepare('SELECT * FROM room_bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  if (req.user.role !== 'manager' && booking.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  res.json(booking);
});

// PATCH /api/bookings/room/:id/status — update status (manager only)
router.patch('/room/:id/status', authenticate, requireRole('manager'), (req, res) => {
  const { status } = req.body;
  const allowed = ['pending', 'confirmed', 'cancelled'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
  }

  const result = db.prepare('UPDATE room_bookings SET status = ? WHERE id = ?')
    .run(status, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Booking not found' });

  const booking = db.prepare('SELECT * FROM room_bookings WHERE id = ?').get(req.params.id);

  const io = getIO(req);
  io.to('manager').emit('booking:room:updated', booking);

  res.json({ message: 'Status updated', booking });
});

// DELETE /api/bookings/room/:id — customer cancels own pending room booking
router.delete('/room/:id', authenticate, (req, res) => {
  const booking = db.prepare('SELECT * FROM room_bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  if (req.user.role !== 'manager' && booking.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  if (req.user.role !== 'manager' && booking.status !== 'pending') {
    return res.status(400).json({ error: 'Cannot cancel — booking has already been confirmed' });
  }

  db.prepare('UPDATE room_bookings SET status = ? WHERE id = ?').run('cancelled', req.params.id);
  const updated = db.prepare('SELECT * FROM room_bookings WHERE id = ?').get(req.params.id);

  const io = getIO(req);
  io.to('manager').emit('booking:room:updated', updated);

  res.json({ message: 'Room booking cancelled', booking: updated });
});

module.exports = router;
