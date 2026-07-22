const express = require('express');
const router  = express.Router();
const db      = require('../db');

// GET /api/menu — return all available items, grouped by category
router.get('/', (req, res) => {
  const { category } = req.query;

  let rows;
  if (category) {
    const allowed = ['kenyan', 'continental', 'drinks', 'desserts'];
    if (!allowed.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    rows = db.prepare(
      'SELECT * FROM menu_items WHERE available = 1 AND category = ? ORDER BY id'
    ).all(category);
  } else {
    rows = db.prepare(
      'SELECT * FROM menu_items WHERE available = 1 ORDER BY category, id'
    ).all();
  }

  // Group by category for convenience
  const grouped = rows.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  res.json({ items: rows, grouped });
});

// GET /api/menu/:id — single item
router.get('/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  res.json(item);
});

module.exports = router;
