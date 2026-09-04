/**
 * SumUp POS Connector
 * Docs: https://developer.sumup.com/api/checkouts
 *
 * Required env vars:
 *   SUMUP_API_KEY   — your SumUp API key (Bearer token from Dashboard)
 *
 * SumUp flow:
 *   1. POST /v0.1/checkouts  → creates a checkout, returns checkout_id
 *   2. PUT  /v0.1/checkouts/:id  → process checkout with card token/nonce
 *   3. GET  /v0.1/checkouts/:id  → poll for PAID status
 */

const https = require('https');

const SUMUP_HOST = 'api.sumup.com';

// ── HTTP helper ──────────────────────────────────────────────────────────────
function sumupRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    if (!process.env.SUMUP_API_KEY) {
      return reject(new Error('SUMUP_API_KEY not set'));
    }

    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: SUMUP_HOST,
      path,
      method,
      headers: {
        Authorization: `Bearer ${process.env.SUMUP_API_KEY}`,
        'Content-Type': 'application/json',
      },
    };
    if (payload) options.headers['Content-Length'] = Buffer.byteLength(payload);

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        // 204 No Content
        if (res.statusCode === 204) return resolve({});
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) return reject(parsed);
          resolve(parsed);
        } catch (e) {
          reject(new Error('SumUp: invalid JSON response'));
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a SumUp checkout (step 1 of 2).
 *
 * @param {object} opts
 * @param {number}  opts.amountCents       — total in cents
 * @param {string}  opts.currency          — ISO currency code, e.g. "USD" or "KES"
 * @param {string}  opts.checkoutReference — unique reference for this checkout
 * @param {string}  [opts.orderId]         — internal restaurant order id
 * @param {string}  [opts.description]     — line item description
 * @returns {Promise<{checkoutId, checkoutReference}>}
 */
async function createCheckout({ amountCents, currency, checkoutReference, orderId, description }) {
  const body = {
    checkout_reference: checkoutReference,
    amount: amountCents / 100,
    currency: currency || 'USD',
    description: description || (orderId ? `Restaurant order #${orderId}` : 'Restaurant order'),
  };

  const result = await sumupRequest('POST', '/v0.1/checkouts', body);
  return {
    checkoutId: result.id,
    checkoutReference: result.checkout_reference,
    status: result.status, // PENDING at this point
    raw: result,
  };
}

/**
 * Process a SumUp checkout (step 2 — attach card token / nonce).
 *
 * @param {string} checkoutId   — from createCheckout()
 * @param {object} paymentData  — e.g. { type: "card", token: "..." }
 * @returns {Promise<{provider, providerTxId, status, amountCents, currency, raw}>}
 */
async function processCheckout(checkoutId, paymentData) {
  const result = await sumupRequest('PUT', `/v0.1/checkouts/${checkoutId}`, paymentData);

  return {
    provider: 'sumup',
    providerTxId: result.id || checkoutId,
    status: result.status === 'PAID' ? 'paid' : (result.status || 'pending').toLowerCase(),
    amountCents: Math.round((result.amount || 0) * 100),
    currency: result.currency,
    raw: result,
  };
}

/**
 * Convenience: create + process in one call.
 *
 * @param {object} opts
 * @param {number}  opts.amountCents
 * @param {string}  opts.currency
 * @param {string}  opts.checkoutReference
 * @param {string}  opts.cardToken          — card nonce/token from SumUp.js SDK
 * @param {string}  [opts.orderId]
 * @returns {Promise<{provider, providerTxId, status, amountCents, currency, raw}>}
 */
async function createPayment({ amountCents, currency, checkoutReference, cardToken, orderId }) {
  const { checkoutId } = await createCheckout({ amountCents, currency, checkoutReference, orderId });

  const paymentData = {
    payment_type: 'card',
    token: cardToken,
  };

  return processCheckout(checkoutId, paymentData);
}

/**
 * Refund a SumUp transaction.
 *
 * @param {string} transactionId   — SumUp transaction ID (from providerTxId)
 * @param {number} [amountCents]   — partial refund amount; omit for full refund
 * @returns {Promise<{provider, providerRefundId, status, raw}>}
 */
async function refundPayment({ transactionId, amountCents }) {
  const body = amountCents != null ? { amount: amountCents / 100 } : undefined;
  const result = await sumupRequest('POST', `/v0.1/me/refund/${transactionId}`, body);

  return {
    provider: 'sumup',
    providerRefundId: transactionId,
    status: 'refunded',
    raw: result,
  };
}

/**
 * Retrieve a SumUp checkout by ID.
 */
async function getCheckout(checkoutId) {
  return sumupRequest('GET', `/v0.1/checkouts/${checkoutId}`);
}

/**
 * Retrieve a SumUp transaction by ID.
 */
async function getTransaction(transactionId) {
  return sumupRequest('GET', `/v0.1/me/transactions?id=${transactionId}`);
}

module.exports = { createCheckout, processCheckout, createPayment, refundPayment, getCheckout, getTransaction };
