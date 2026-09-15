/**
 * M-Pesa Routes
 * Mount: /api/mpesa
 *
 * POST /api/mpesa/stkpush          — initiate STK push (waiter or customer)
 * POST /api/mpesa/callback         — Safaricom callback (public — no auth)
 * GET  /api/mpesa/status/:checkoutRequestId — poll payment status
 * GET  /api/mpesa/transactions     — list all M-Pesa transactions [manager]
 * GET  /api/mpesa/transactions/:id — get single transaction
 *
 * Socket.IO events emitted:
 *   mpesa:paid     → 'manager', 'waiter', 'customer' rooms on successful payment
 *   mpesa:failed   → 'manager', 'waiter' rooms on failed/cancelled payment
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const mpesa   = require('../services/mpesa');
const { authenticate, requireRole } = require('../middleware/auth');

function getIO(req) { return req.app.get('io'); }

// ── DB migration: create mpesa_transactions table ────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS mpesa_transactions (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id            INTEGER,
    phone               TEXT NOT NULL,
    amount_kes          INTEGER NOT NULL,
    checkout_request_id TEXT NOT NULL UNIQUE,
    merchant_request_id TEXT,
    mpesa_receipt       TEXT,               -- filled on callback
    status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK(status IN ('pending','paid','failed','cancelled')),
    result_code         TEXT,
    result_desc         TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── POST /api/mpesa/stkpush ───────────────────────────────────────────────────
router.post(
  '/stkpush',
  authenticate,
  requireRole('customer', 'waiter', 'manager'),
  async (req, res) => {
    const { order_id, phone, amount_kes, description } = req.body;

    if (!phone)      return res.status(400).json({ error: 'phone is required (07XXXXXXXX)' });
    if (!amount_kes) return res.status(400).json({ error: 'amount_kes is required' });

    // Format phone
    let formattedPhone;
    try {
      formattedPhone = mpesa.formatPhone(phone);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    // Validate order if provided
    let order = null;
    if (order_id) {
      order = db.prepare('SELECT * FROM orders WHERE id = ?').get(order_id);
      if (!order) return res.status(404).json({ error: `Order #${order_id} not found` });
    }

    const finalAmount = order ? order.total : amount_kes;

    try {
      const result = await mpesa.stkPush({
        phone:       formattedPhone,
        amountKes:   finalAmount,
        orderId:     order_id || 'N/A',
        description: description || (order_id ? `Order #${order_id}` : 'Restaurant payment'),
      });

      // Save pending transaction
      const insert = db.prepare(`
        INSERT INTO mpesa_transactions
          (order_id, phone, amount_kes, checkout_request_id, merchant_request_id, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
      `).run(
        order_id || null,
        formattedPhone,
        finalAmount,
        result.checkoutRequestId,
        result.merchantRequestId
      );

      const tx = db.prepare('SELECT * FROM mpesa_transactions WHERE id = ?')
        .get(insert.lastInsertRowid);

      return res.status(201).json({
        message:           result.customerMessage,
        checkoutRequestId: result.checkoutRequestId,
        transaction:       tx,
      });

    } catch (err) {
      console.error('[M-Pesa] STK push error:', err.message);
      return res.status(502).json({ error: `M-Pesa error: ${err.message}` });
    }
  }
);

// ── POST /api/mpesa/callback — Safaricom posts here (no auth) ────────────────
router.post('/callback', (req, res) => {
  // Always respond 200 immediately so Safaricom doesn't retry
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

  try {
    const body     = req.body?.Body?.stkCallback;
    if (!body) return;

    const checkoutRequestId = body.CheckoutRequestID;
    const resultCode        = String(body.ResultCode);
    const resultDesc        = body.ResultDesc;

    const tx = db.prepare(
      'SELECT * FROM mpesa_transactions WHERE checkout_request_id = ?'
    ).get(checkoutRequestId);

    if (!tx) {
      console.warn('[M-Pesa] Callback for unknown CheckoutRequestID:', checkoutRequestId);
      return;
    }

    let status       = 'failed';
    let mpesaReceipt = null;

    if (resultCode === '0') {
      // Payment successful — extract receipt from CallbackMetadata
      status = 'paid';
      const items = body.CallbackMetadata?.Item || [];
      const find  = (name) => items.find(i => i.Name === name)?.Value;
      mpesaReceipt = find('MpesaReceiptNumber') || null;
    } else if (resultCode === '1032') {
      status = 'cancelled'; // user cancelled on phone
    }

    db.prepare(`
      UPDATE mpesa_transactions
      SET status = ?, result_code = ?, result_desc = ?, mpesa_receipt = ?,
          updated_at = datetime('now')
      WHERE checkout_request_id = ?
    `).run(status, resultCode, resultDesc, mpesaReceipt, checkoutRequestId);

    const updated = db.prepare(
      'SELECT * FROM mpesa_transactions WHERE checkout_request_id = ?'
    ).get(checkoutRequestId);

    // Emit socket events to notify staff + customer
    // (req.app.get('io') works even in async/fire-and-forget context)
    const io = req.app.get('io');
    if (status === 'paid') {
      io.to('manager').emit('mpesa:paid', updated);
      io.to('waiter').emit('mpesa:paid', updated);
      io.to('customer').emit('mpesa:paid', updated);
    } else {
      io.to('manager').emit('mpesa:failed', updated);
      io.to('waiter').emit('mpesa:failed', updated);
    }

    console.log(`[M-Pesa] Callback → order #${tx.order_id} | ${status} | ${mpesaReceipt || resultDesc}`);
  } catch (err) {
    console.error('[M-Pesa] Callback processing error:', err.message);
  }
});

// ── GET /api/mpesa/status/:checkoutRequestId — poll status ───────────────────
router.get(
  '/status/:checkoutRequestId',
  authenticate,
  async (req, res) => {
    const { checkoutRequestId } = req.params;

    // Check our DB first (callback may have already arrived)
    const tx = db.prepare(
      'SELECT * FROM mpesa_transactions WHERE checkout_request_id = ?'
    ).get(checkoutRequestId);

    if (tx && tx.status !== 'pending') {
      return res.json({ source: 'db', transaction: tx });
    }

    // If still pending, query Daraja directly
    try {
      const result = await mpesa.stkQuery(checkoutRequestId);

      // Update DB if result is conclusive
      if (result.resultCode !== undefined && String(result.resultCode) !== '0' && tx) {
        const status = String(result.resultCode) === '1032' ? 'cancelled' : 'failed';
        db.prepare(`
          UPDATE mpesa_transactions
          SET status = ?, result_code = ?, result_desc = ?, updated_at = datetime('now')
          WHERE checkout_request_id = ?
        `).run(status, String(result.resultCode), result.resultDesc, checkoutRequestId);
      }

      const fresh = tx
        ? db.prepare('SELECT * FROM mpesa_transactions WHERE checkout_request_id = ?').get(checkoutRequestId)
        : null;

      return res.json({ source: 'daraja', result, transaction: fresh });
    } catch (err) {
      // Query can fail if the request is still processing — return DB state
      return res.json({ source: 'db', transaction: tx || null, queryError: err.message });
    }
  }
);

// ── GET /api/mpesa/transactions — all transactions [manager] ─────────────────
router.get(
  '/transactions',
  authenticate,
  requireRole('manager'),
  (req, res) => {
    const { status, limit = 50, offset = 0 } = req.query;
    let query  = 'SELECT * FROM mpesa_transactions WHERE 1=1';
    const params = [];

    if (status) {
      const valid = ['pending', 'paid', 'failed', 'cancelled'];
      if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const rows  = db.prepare(query).all(...params);
    const total = db.prepare('SELECT COUNT(*) as c FROM mpesa_transactions').get().c;

    res.json({ total, limit: Number(limit), offset: Number(offset), transactions: rows });
  }
);

// ── GET /api/mpesa/transactions/:id ──────────────────────────────────────────
router.get(
  '/transactions/:id',
  authenticate,
  requireRole('waiter', 'manager'),
  (req, res) => {
    const tx = db.prepare('SELECT * FROM mpesa_transactions WHERE id = ?').get(req.params.id);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    res.json(tx);
  }
);

module.exports = router;
