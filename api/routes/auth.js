const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const db       = require('../db');
const QRCode   = require('qrcode');
const { v4: uuidv4 } = require('uuid');

const JWT_SECRET  = process.env.JWT_SECRET  || 'real-restaurant-secret-change-in-prod';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';
const SITE_URL    = process.env.SITE_URL    || 'https://muragedamin-pixel.github.io/RESTAURANT-WEB';

// ── POST /api/auth/login ──
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );

  res.json({
    message: 'Login successful',
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role }
  });
});

// ── POST /api/auth/register (customers only) ──
router.post('/register', (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const hashed = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)'
  ).run(name.trim(), email.trim().toLowerCase(), hashed, 'customer');

  const user  = db.prepare('SELECT id,name,email,role FROM users WHERE id = ?').get(result.lastInsertRowid);
  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );

  res.status(201).json({ message: 'Account created', token, user });
});

// ── GET /api/auth/me — verify token & return user ──
router.get('/me', (req, res) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const payload = jwt.verify(header.split(' ')[1], JWT_SECRET);
    const user    = db.prepare('SELECT id,name,email,role FROM users WHERE id = ?').get(payload.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// ── POST /api/auth/guest-token — generate a QR code for a table ──
// Staff (manager/waiter) hits this to get a scannable code for a table
router.post('/guest-token', (req, res) => {
  const { table_label } = req.body;           // e.g. "Table 4" or "Terrace 2"
  const label = (table_label || 'Guest').trim();

  // 6-char uppercase code e.g. "R7KX2M"
  const code = uuidv4().replace(/-/g, '').toUpperCase().slice(0, 8);

  // Expires in 12 hours
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

  db.prepare(
    'INSERT INTO guest_codes (code, table_label, expires_at) VALUES (?, ?, ?)'
  ).run(code, label, expiresAt);

  // Full URL the QR code will point to
  const url = `${SITE_URL}/index.html?code=${code}`;

  // Generate QR as base64 PNG
  QRCode.toDataURL(url, {
    width: 300,
    margin: 2,
    color: { dark: '#0f2318', light: '#faf6ee' }
  }, (err, qrDataUrl) => {
    if (err) return res.status(500).json({ error: 'QR generation failed' });
    res.json({ code, url, table_label: label, expires_at: expiresAt, qr: qrDataUrl });
  });
});

// ── GET /api/auth/verify/:code — customer scans QR, browser calls this ──
router.get('/verify/:code', (req, res) => {
  const { code } = req.params;

  const row = db.prepare('SELECT * FROM guest_codes WHERE code = ?').get(code);

  if (!row) {
    return res.status(404).json({ error: 'Invalid code' });
  }
  if (new Date(row.expires_at) < new Date()) {
    return res.status(410).json({ error: 'This code has expired' });
  }

  // Create/find a guest user for this code
  const guestEmail = `guest-${code.toLowerCase()}@real.guest`;
  let user = db.prepare('SELECT * FROM users WHERE email = ?').get(guestEmail);

  if (!user) {
    const result = db.prepare(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)'
    ).run(`${row.table_label} Guest`, guestEmail, 'guest-no-password', 'customer');
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  }

  // Mark code as used (but still valid for re-scans within expiry)
  db.prepare('UPDATE guest_codes SET used = used + 1 WHERE code = ?').run(code);

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role, table: row.table_label },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );

  res.json({
    message: 'Verified',
    token,
    user:  { id: user.id, name: user.name, role: user.role, table: row.table_label },
    table: row.table_label
  });
});

// ── GET /api/auth/guest-codes — list all active codes (manager only) ──
router.get('/guest-codes', (req, res) => {
  const codes = db.prepare(
    `SELECT * FROM guest_codes
     WHERE expires_at > datetime('now')
     ORDER BY created_at DESC`
  ).all();
  res.json(codes);
});

module.exports = router;
module.exports.JWT_SECRET = JWT_SECRET;
