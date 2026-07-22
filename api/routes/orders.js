const express = require('express');
const router  = express.Router();
const db      = require('../db');

// Helper — get io from app
function getIO(req) { return req.app.get('io'); }

// POST /api/orders — place a new order
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

  const total  = items.reduce((sum, i) => sum + i.price, 0);
  const result = db.prepare(
    'INSERT INTO orders (items, total, note) VALUES (?, ?, ?)'
  ).run(JSON.stringify(items), total, note || '');

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(result.lastInsertRowid);
  const parsed = { ...order, items: JSON.parse(order.items) };

  // 🔔 Notify kitchen + manager of new order
  const io = getIO(req);
  io.to('kitchen').emit('order:new', parsed);
  io.to('manager').emit('order:new', parsed);

  res.status(201).json({ message: 'Order placed successfully', order: parsed });
});

// GET /api/orders
router.get('/', (req, res) => {
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

// GET /api/orders/:id
router.get('/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json({ ...order, items: JSON.parse(order.items) });
});

// PATCH /api/orders/:id/status
router.patch('/:id/status', (req, res) => {
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

  // 🔔 Broadcast status change to all staff rooms
  const io = getIO(req);
  io.to('kitchen').emit('order:updated', parsed);
  io.to('waiter').emit('order:updated', parsed);
  io.to('manager').emit('order:updated', parsed);

  // 🔔 Extra alert to waiter when order is ready
  if (status === 'ready') {
    io.to('waiter').emit('order:ready', parsed);
  }

  res.json({ message: 'Status updated', order: parsed });
});

module.exports = router;
