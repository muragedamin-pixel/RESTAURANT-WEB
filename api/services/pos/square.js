/**
 * Square POS Connector
 * Docs: https://developer.squareup.com/docs/payments-api/take-payments
 *
 * Required env vars:
 *   SQUARE_ACCESS_TOKEN   — your Square OAuth or personal access token
 *   SQUARE_LOCATION_ID    — the Square location ID to charge against
 *   SQUARE_ENVIRONMENT    — "sandbox" | "production"  (default: sandbox)
 */

const https = require('https');

const BASE_URL =
  process.env.SQUARE_ENVIRONMENT === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';

/**
 * Low-level Square REST helper (no SDK dependency).
 */
function squareRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: BASE_URL.replace('https://', ''),
      path,
      method,
      headers: {
        'Authorization': `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
        'Square-Version': '2024-01-18',
        'Content-Type': 'application/json',
      },
    };
    if (payload) options.headers['Content-Length'] = Buffer.byteLength(payload);

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) return reject(parsed);
          resolve(parsed);
        } catch (e) {
          reject(new Error('Square: invalid JSON response'));
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Create a Square payment.
 *
 * @param {object} opts
 * @param {number}  opts.amountCents   — total in smallest currency unit (cents)
 * @param {string}  opts.currency      — ISO currency code, e.g. "USD"
 * @param {string}  opts.sourceId      — nonce from Square Web/In-App Payments SDK
 * @param {string}  opts.idempotencyKey — unique key to prevent duplicate charges
 * @param {string}  [opts.orderId]     — internal restaurant order id (stored in note)
 * @param {number}  [opts.tipCents]    — optional tip amount in cents
 * @returns {Promise<{provider, providerTxId, status, amountCents, currency, raw}>}
 */
async function createPayment({ amountCents, currency, sourceId, idempotencyKey, orderId, tipCents }) {
  if (!process.env.SQUARE_ACCESS_TOKEN) throw new Error('SQUARE_ACCESS_TOKEN not set');
  if (!process.env.SQUARE_LOCATION_ID) throw new Error('SQUARE_LOCATION_ID not set');
  if (!sourceId) throw new Error('Square: sourceId (card nonce) is required');

  const body = {
    idempotency_key: idempotencyKey,
    source_id: sourceId,
    amount_money: { amount: amountCents, currency: currency || 'USD' },
    location_id: process.env.SQUARE_LOCATION_ID,
    note: orderId ? `Restaurant order #${orderId}` : undefined,
  };
  if (tipCents) body.tip_money = { amount: tipCents, currency: currency || 'USD' };

  const result = await squareRequest('POST', '/v2/payments', body);
  const p = result.payment;

  return {
    provider: 'square',
    providerTxId: p.id,
    status: p.status === 'COMPLETED' ? 'paid' : p.status.toLowerCase(),
    amountCents: p.amount_money.amount,
    currency: p.amount_money.currency,
    raw: p,
  };
}

/**
 * Refund a Square payment.
 *
 * @param {string} paymentId         — Square payment ID
 * @param {number} amountCents       — amount to refund in cents
 * @param {string} currency
 * @param {string} idempotencyKey
 * @returns {Promise<{provider, providerRefundId, status, amountCents, raw}>}
 */
async function refundPayment({ paymentId, amountCents, currency, idempotencyKey }) {
  if (!process.env.SQUARE_ACCESS_TOKEN) throw new Error('SQUARE_ACCESS_TOKEN not set');

  const body = {
    idempotency_key: idempotencyKey,
    payment_id: paymentId,
    amount_money: { amount: amountCents, currency: currency || 'USD' },
  };

  const result = await squareRequest('POST', '/v2/refunds', body);
  const r = result.refund;

  return {
    provider: 'square',
    providerRefundId: r.id,
    status: r.status === 'COMPLETED' ? 'refunded' : r.status.toLowerCase(),
    amountCents: r.amount_money.amount,
    raw: r,
  };
}

/**
 * Retrieve a Square payment by ID.
 */
async function getPayment(paymentId) {
  if (!process.env.SQUARE_ACCESS_TOKEN) throw new Error('SQUARE_ACCESS_TOKEN not set');
  const result = await squareRequest('GET', `/v2/payments/${paymentId}`);
  return result.payment;
}

module.exports = { createPayment, refundPayment, getPayment };
