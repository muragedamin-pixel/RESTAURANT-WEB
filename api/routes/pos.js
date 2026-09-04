/**
 * POS Connector Routes
 * Mount: /api/pos
 *
 * All routes require authentication (waiter or manager unless noted).
 *
 * POST   /api/pos/checkout              — create a POS transaction from an order
 * POST   /api/pos/sumup/process/:id     — process a pending SumUp checkout (step 2)
 * GET    /api/pos/transactions          — list all POS transactions     [manager]
 * GET    /api/pos/transactions/:id      — get a single POS transaction
 * POST   /api/pos/transactions/:id/refund — refund a transaction        [manager]
 * GET    /api/pos/providers             — list enabled POS providers
 *
 * Socket.IO events emitted:
 *   pos:payment  — broadcast to 'manager' and 'waiter' rooms on successful payment
 *   pos:refund   — broadcast to 'manager' room on successful refund
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();
const db      = require('../db');
const pos     = require('../services/pos');
const { authenticate, requireRole } = require('../middleware/auth');

function getIO(req) { return req.app.get('io'); }

// ── DB migration: create pos_transactions table if not present ───────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS pos_transactions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id         INTEGER,
    provider         TEXT NOT NULL CHECK(provider IN ('square', 'toast', 'sumup')),
    provider_tx_id   TEXT,
    provider_data    TEXT,          -- JSON blob of raw provider response
    status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK(status IN ('pending','paid','failed','refunded')),
    amount_cents     INTEGER NOT NULL,
    currency         TEXT NOT NULL DEFAULT 'USD',
    tip_cents        INTEGER NOT NULL DEFAULT 0,
    receipt_number   TEXT NOT NULL UNIQUE,
    refund_id        TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a human-readable receipt number: RCP-YYYYMMDD-XXXXXX */
function generateReceiptNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `RCP-${date}-${rand}`;
}

/** Parse transaction row — provider_data is stored as JSON string */
function parseRow(row) {
  if (!row) return null;
  return {
    ...row,
    provider_data: row.provider_data ? JSON.parse(row.provider_data) : null,
  };
}

// ── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/pos/providers
 * Public info — which POS providers are configured.
 */
router.get('/providers', authenticate, requireRole('waiter', 'manager'), (req, res) => {
  const available = pos.list().filter((name) => {
    try { pos.get(name); return true; } catch { return false; }
  });
  res.json({ providers: available });
});

/**
 * POST /api/pos/checkout
 *
 * Body:
 * {
 *   order_id:          number   — internal order ID to charge
 *   provider:          string   — "square" | "toast" | "sumup"
 *   currency:          string   — e.g. "USD" (default "USD")
 *   tip_cents:         number   — optional tip
 *
 *   // Square
 *   source_id:         string   — card nonce from Square SDK
 *
 *   // Toast
 *   payment_type:      string   — "CREDIT_CARD" | "CASH"
 *   card_token:        string   — encrypted card token (if CREDIT_CARD)
 *   selections:        array    — Toast menu item selections
 *
 *   // SumUp
 *   card_token:        string   — card nonce from SumUp.js
 *   checkout_reference:string   — unique ref (auto-generated if omitted)
 * }
 */
router.post(
  '/checkout',
  authenticate,
  requireRole('waiter', 'manager'),
  async (req, res) => {
    const { order_id, provider, currency = 'USD', tip_cents = 0 } = req.body;

    if (!provider) return res.status(400).json({ error: 'provider is required (square, toast, sumup)' });

    // Validate provider
    let posProvider;
    try { posProvider = pos.get(provider); }
    catch (e) { return res.status(400).json({ error: e.message }); }

    // Validate order exists and is in 'delivered' state (ready to pay)
    let order = null;
    if (order_id) {
      order = db.prepare('SELECT * FROM orders WHERE id = ?').get(order_id);
      if (!order) return res.status(404).json({ error: `Order #${order_id} not found` });
      if (order.status !== 'delivered') {
        return res.status(400).json({
          error: `Order #${order_id} is not ready for payment (status: ${order.status})`,
        });
      }
    }

    const amountCents = order ? order.total : req.body.amount_cents;
    if (!amountCents || amountCents <= 0) {
      return res.status(400).json({ error: 'amount_cents must be > 0' });
    }

    const totalCents  = amountCents + (tip_cents || 0);
    const idempotencyKey = uuidv4();
    const receiptNumber  = generateReceiptNumber();

    // Insert a pending transaction before calling the provider
    const insertResult = db.prepare(`
      INSERT INTO pos_transactions
        (order_id, provider, status, amount_cents, currency, tip_cents, receipt_number)
      VALUES (?, ?, 'pending', ?, ?, ?, ?)
    `).run(order_id || null, provider, totalCents, currency, tip_cents || 0, receiptNumber);

    const txRow = db.prepare('SELECT * FROM pos_transactions WHERE id = ?')
      .get(insertResult.lastInsertRowid);

    try {
      let result;

      if (provider === 'square') {
        const { source_id } = req.body;
        if (!source_id) return res.status(400).json({ error: 'source_id (card nonce) required for Square' });
        result = await posProvider.createPayment({
          amountCents: totalCents,
          currency,
          sourceId: source_id,
          idempotencyKey,
          orderId: order_id,
          tipCents: tip_cents || undefined,
        });

      } else if (provider === 'toast') {
        const { payment_type = 'CASH', card_token, selections } = req.body;
        result = await posProvider.createPayment({
          amountCents: totalCents,
          currency,
          paymentType: payment_type,
          cardToken: card_token,
          orderId: order_id,
          selections: selections || [],
        });

      } else if (provider === 'sumup') {
        const { card_token, checkout_reference } = req.body;
        if (!card_token) return res.status(400).json({ error: 'card_token required for SumUp' });
        result = await posProvider.createPayment({
          amountCents: totalCents,
          currency,
          checkoutReference: checkout_reference || idempotencyKey,
          cardToken: card_token,
          orderId: order_id,
        });
      }

      // Update transaction with provider response
      db.prepare(`
        UPDATE pos_transactions
        SET provider_tx_id = ?, provider_data = ?, status = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(result.providerTxId, JSON.stringify(result.raw), result.status, txRow.id);

      // If paid, mark the order as having a payment record
      if (result.status === 'paid' && order_id) {
        // Optional: you could add a 'paid' status to the orders table — for now we just emit
      }

      const updated = parseRow(
        db.prepare('SELECT * FROM pos_transactions WHERE id = ?').get(txRow.id)
      );

      // 🔔 Notify staff rooms
      const io = getIO(req);
      io.to('manager').emit('pos:payment', updated);
      io.to('waiter').emit('pos:payment', updated);

      return res.status(201).json({
        message: 'Payment processed successfully',
        transaction: updated,
      });

    } catch (err) {
      // Mark transaction as failed
      db.prepare(`
        UPDATE pos_transactions
        SET status = 'failed', provider_data = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(JSON.stringify({ error: err.message || err }), txRow.id);

      console.error(`[POS] ${provider} payment failed:`, err);
      return res.status(502).json({
        error: `POS provider error: ${err.message || JSON.stringify(err)}`,
        receipt_number: receiptNumber,
      });
    }
  }
);

/**
 * POST /api/pos/sumup/process/:checkout_id
 *
 * Step 2 for SumUp: process a previously created checkout.
 * Body: { payment_type, token }
 */
router.post(
  '/sumup/process/:checkout_id',
  authenticate,
  requireRole('waiter', 'manager'),
  async (req, res) => {
    const { checkout_id } = req.params;
    const { payment_type = 'card', token } = req.body;

    if (!token) return res.status(400).json({ error: 'token is required' });

    try {
      const sumup = pos.get('sumup');
      const result = await sumup.processCheckout(checkout_id, { payment_type, token });

      // Find the pending transaction for this checkout
      const tx = db.prepare(
        "SELECT * FROM pos_transactions WHERE provider = 'sumup' AND status = 'pending' ORDER BY id DESC LIMIT 1"
      ).get();

      if (tx) {
        db.prepare(`
          UPDATE pos_transactions
          SET provider_tx_id = ?, provider_data = ?, status = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(result.providerTxId, JSON.stringify(result.raw), result.status, tx.id);
      }

      const updated = tx
        ? parseRow(db.prepare('SELECT * FROM pos_transactions WHERE id = ?').get(tx.id))
        : result;

      const io = getIO(req);
      io.to('manager').emit('pos:payment', updated);
      io.to('waiter').emit('pos:payment', updated);

      res.json({ message: 'SumUp checkout processed', transaction: updated });
    } catch (err) {
      console.error('[POS] SumUp process error:', err);
      res.status(502).json({ error: `SumUp error: ${err.message || JSON.stringify(err)}` });
    }
  }
);

/**
 * GET /api/pos/transactions
 * List all POS transactions — manager only.
 * Query params: ?provider=square&status=paid&limit=50&offset=0
 */
router.get(
  '/transactions',
  authenticate,
  requireRole('manager'),
  (req, res) => {
    const { provider, status, limit = 50, offset = 0 } = req.query;

    let query = 'SELECT * FROM pos_transactions WHERE 1=1';
    const params = [];

    if (provider) {
      const valid = ['square', 'toast', 'sumup'];
      if (!valid.includes(provider)) return res.status(400).json({ error: 'Invalid provider' });
      query += ' AND provider = ?';
      params.push(provider);
    }

    if (status) {
      const valid = ['pending', 'paid', 'failed', 'refunded'];
      if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const rows = db.prepare(query).all(...params);
    const total = db.prepare(
      'SELECT COUNT(*) as c FROM pos_transactions' +
      (provider || status ? ' WHERE ' + (provider ? `provider='${provider}'` : '') +
        (provider && status ? ' AND ' : '') +
        (status ? `status='${status}'` : '') : '')
    ).get().c;

    res.json({
      total,
      limit: Number(limit),
      offset: Number(offset),
      transactions: rows.map(parseRow),
    });
  }
);

/**
 * GET /api/pos/transactions/:id
 * Get a single transaction — staff only (waiter or manager).
 */
router.get(
  '/transactions/:id',
  authenticate,
  requireRole('waiter', 'manager'),
  (req, res) => {
    const tx = db.prepare('SELECT * FROM pos_transactions WHERE id = ?').get(req.params.id);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    res.json(parseRow(tx));
  }
);

/**
 * POST /api/pos/transactions/:id/refund
 * Refund a paid transaction — manager only.
 *
 * Body (Square): { amount_cents }   — partial refund; omit for full refund
 * Body (SumUp):  { amount_cents }   — partial refund; omit for full refund
 * Body (Toast):  {}                 — Toast uses void flow
 */
router.post(
  '/transactions/:id/refund',
  authenticate,
  requireRole('manager'),
  async (req, res) => {
    const tx = parseRow(
      db.prepare('SELECT * FROM pos_transactions WHERE id = ?').get(req.params.id)
    );
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    if (tx.status !== 'paid') {
      return res.status(400).json({ error: `Cannot refund a transaction with status: ${tx.status}` });
    }
    if (!tx.provider_tx_id) {
      return res.status(400).json({ error: 'No provider transaction ID stored — cannot refund' });
    }

    const { amount_cents } = req.body;
    const refundAmount = amount_cents || tx.amount_cents;

    let posProvider;
    try { posProvider = pos.get(tx.provider); }
    catch (e) { return res.status(400).json({ error: e.message }); }

    try {
      let result;
      const idempotencyKey = uuidv4();

      if (tx.provider === 'square') {
        result = await posProvider.refundPayment({
          paymentId: tx.provider_tx_id,
          amountCents: refundAmount,
          currency: tx.currency,
          idempotencyKey,
        });
      } else if (tx.provider === 'toast') {
        const raw = tx.provider_data;
        result = await posProvider.refundPayment({
          orderGuid: raw?.guid,
          paymentGuid: tx.provider_tx_id,
        });
      } else if (tx.provider === 'sumup') {
        result = await posProvider.refundPayment({
          transactionId: tx.provider_tx_id,
          amountCents: amount_cents || undefined,
        });
      }

      db.prepare(`
        UPDATE pos_transactions
        SET status = 'refunded', refund_id = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(result.providerRefundId || idempotencyKey, tx.id);

      const updated = parseRow(
        db.prepare('SELECT * FROM pos_transactions WHERE id = ?').get(tx.id)
      );

      const io = getIO(req);
      io.to('manager').emit('pos:refund', updated);

      res.json({ message: 'Refund processed successfully', transaction: updated });

    } catch (err) {
      console.error(`[POS] ${tx.provider} refund failed:`, err);
      res.status(502).json({ error: `Refund error: ${err.message || JSON.stringify(err)}` });
    }
  }
);

module.exports = router;
