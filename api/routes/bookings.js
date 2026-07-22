const express = require('express');
const router  = express.Router();
const db      = require('../db');

function getIO(req) { return req.app.get('io'); }

// ══════════════════════════════════════════
//  TABLE BOOKINGS
// ══════════════════════════════════════════

router.post('/table', (req, res) => {
  const { name, phone, date, time, guests, seating } = req.body;

  if (!name || !phone || !date || !time || !guests) {
    return res.status(400).json({ error: 'name, phone, date, time, and guests are required' });
  }

  const bookingDate = new Date(`${date}T${time}`);
  if (isNaN(bookingDate.getTime()) || bookingDate < new Date()) {
    return res.status(400).json({ error: 'Please provide a valid future date and time' });
  }

  const result = db.prepare(
    `INSERT INTO table_bookings (name, phone, date, time, guests, seating)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(name, phone, date, time, guests, seating || 'Indoor');

  const booking = db.prepare('SELECT * FROM table_bookings WHERE id = ?').get(result.lastInsertRowid);

  // 🔔 Notify waiter + manager
  const io = getIO(req);
  io.to('waiter').emit('booking:table:new', booking);
  io.to('manager').emit('booking:table:new', booking);

  res.status(201).json({ message: 'Table reserved successfully', booking });
});

router.get('/table', (req, res) => {
  res.json(db.prepare('SELECT * FROM table_bookings ORDER BY date, time').all());
});

router.get('/table/:id', (req, res) => {
  const booking = db.prepare('SELECT * FROM table_bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  res.json(booking);
});

router.patch('/table/:id/status', (req, res) => {
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

// ══════════════════════════════════════════
//  ROOM BOOKINGS
// ══════════════════════════════════════════

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

  const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
  const total  = price * nights;

  const result = db.prepare(
    `INSERT INTO room_bookings (room_name, price, name, phone, check_in, check_out, guests)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(room_name, price, name, phone, check_in, check_out, guests || 1);

  const booking = db.prepare('SELECT * FROM room_bookings WHERE id = ?').get(result.lastInsertRowid);

  // 🔔 Notify manager only
  const io = getIO(req);
  io.to('manager').emit('booking:room:new', { ...booking, nights, total_cost: total });

  res.status(201).json({
    message: 'Room booked successfully',
    booking,
    summary: { nights, total_cost: `Ksh ${total.toLocaleString()}` }
  });
});

router.get('/room', (req, res) => {
  res.json(db.prepare('SELECT * FROM room_bookings ORDER BY check_in').all());
});

router.get('/room/:id', (req, res) => {
  const booking = db.prepare('SELECT * FROM room_bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  res.json(booking);
});

router.patch('/room/:id/status', (req, res) => {
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

module.exports = router;
