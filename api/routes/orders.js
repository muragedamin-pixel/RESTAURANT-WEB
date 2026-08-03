const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

function getIO(req) { return req.app.get('io'); }

// ══════════════════════════════════════════
//  POST /api/orders — place a new order (customer must be logged in)
// ══════════════════════════════════════════
router.post('/', (req, res) => {
  const { items, note } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items must be a non-empty array' });
  }
  for (const item of items) {
    if (!item.name || typeof item.price !== 'number' || item.price < 0) {
      return res.status(400).json({ error: 'Each item must have a name and a numeric price' });
    }
  }

  const total   = items.reduce((sum, i) => sum + i.price, 0);
  const user_id = req.user ? req.user.id : null;

  const result = db.prepare(
    'INSERT INTO orders (user_id, items, total, note) VALUES (?, ?, ?, ?)'
  ).run(user_id, JSON.stringify(items), total, note || '');

  const order  = db.prepare('SELECT * FROM orders WHERE id = ?').get(result.lastInsertRowid);
  const parsed = { ...order, items: JSON.parse(order.items) };

  // 🔔 Notify all staff rooms of new order in real time
  const io = getIO(req);
  io.to('kitchen').emit('order:new', parsed);
  io.to('waiter').emit('order:new', parsed);
  io.to('manager').emit('order:new', parsed);

  res.status(201).json({ message: 'Order placed successfully', order: parsed });
});

// ══════════════════════════════════════════
//  GET /api/orders/my — customer's own orders
// ══════════════════════════════════════════
router.get('/my', authenticate, (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC'
  ).all(req.user.id);
  res.json(rows.map(o => ({ ...o, items: JSON.parse(o.items) })));
});

// ══════════════════════════════════════════
//  GET /api/orders/:id — get single order (owner or staff)
// ══════════════════════════════════════════
router.get('/:id', authenticate, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const staffRoles = ['kitchen', 'waiter', 'manager'];
  if (!staffRoles.includes(req.user.role) && order.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  res.json({ ...order, items: JSON.parse(order.items) });
});

// ══════════════════════════════════════════
//  GET /api/orders — all orders (staff only)
// ══════════════════════════════════════════
router.get('/', authenticate, requireRole('kitchen', 'waiter', 'manager'), (req, res) => {
  const { status } = req.query;
  let rows;

  if (status) {
    const allowed = ['received', 'preparing', 'ready', 'delivered'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }
    rows = db.prepare('SELECT * FROM orders WHERE status = ? ORDER BY id DESC').all(status);
  } else {
    rows = db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
  }
  res.json(rows.map(o => ({ ...o, items: JSON.parse(o.items) })));
});

// ══════════════════════════════════════════
//  DELETE /api/orders/:id — cancel own order (only if still 'received')
// ══════════════════════════════════════════
router.delete('/:id', authenticate, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const staffRoles = ['kitchen', 'waiter', 'manager'];
  if (!staffRoles.includes(req.user.role) && order.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Customers can only cancel while still in 'received' state
  if (!staffRoles.includes(req.user.role) && order.status !== 'received') {
    return res.status(400).json({ error: 'Cannot cancel — order is already being prepared' });
  }

  db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);

  const io = getIO(req);
  io.to('kitchen').emit('order:cancelled', { id: parseInt(req.params.id) });
  io.to('waiter').emit('order:cancelled',  { id: parseInt(req.params.id) });
  io.to('manager').emit('order:cancelled', { id: parseInt(req.params.id) });

  res.json({ message: 'Order cancelled successfully' });
});

// ══════════════════════════════════════════
//  PATCH /api/orders/:id/status — update order status (staff only)
// ══════════════════════════════════════════
router.patch('/:id/status', authenticate, requireRole('kitchen', 'waiter', 'manager'), (req, res) => {
  const { status } = req.body;
  const allowed = ['received', 'preparing', 'ready', 'delivered'];

  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
  }

  const result = db.prepare('UPDATE orders SET status = ? WHERE id = ?')
    .run(status, req.params.id);

  if (result.changes === 0) return res.status(404).json({ error: 'Order not found' });

  const order  = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  const parsed = { ...order, items: JSON.parse(order.items) };

  // 🔔 Broadcast status change to all staff rooms + customer room
  const io = getIO(req);
  io.to('kitchen').emit('order:updated', parsed);
  io.to('waiter').emit('order:updated', parsed);
  io.to('manager').emit('order:updated', parsed);
  io.to('customer').emit('order:updated', parsed);

  // 🔔 Extra alert to waiter when order is ready
  if (status === 'ready') {
    io.to('waiter').emit('order:ready', parsed);
  }

  res.json({ message: 'Status updated', order: parsed });
});

module.exports = router;
