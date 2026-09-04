/**
 * Toast POS Connector
 * Docs: https://doc.toasttab.com/doc/devguide/portalOrdersApiOverview.html
 *
 * Required env vars:
 *   TOAST_CLIENT_ID       — from Toast Developer Portal
 *   TOAST_CLIENT_SECRET   — from Toast Developer Portal
 *   TOAST_RESTAURANT_GUID — the GUID of your restaurant location
 *   TOAST_ENVIRONMENT     — "sandbox" | "production"  (default: sandbox)
 *
 * Toast uses OAuth2 client_credentials flow.
 * Tokens expire after 24 h; this module caches and auto-refreshes them.
 */

const https = require('https');

const BASE_URL =
  process.env.TOAST_ENVIRONMENT === 'production'
    ? 'https://ws-api.toasttab.com'
    : 'https://ws-sandbox-api.toasttab.com';

// ── Token cache ──────────────────────────────────────────────────────────────
let _tokenCache = null; // { access_token, expires_at }

async function getAccessToken() {
  if (_tokenCache && Date.now() < _tokenCache.expires_at - 60_000) {
    return _tokenCache.access_token;
  }

  if (!process.env.TOAST_CLIENT_ID) throw new Error('TOAST_CLIENT_ID not set');
  if (!process.env.TOAST_CLIENT_SECRET) throw new Error('TOAST_CLIENT_SECRET not set');

  const body = JSON.stringify({
    clientId: process.env.TOAST_CLIENT_ID,
    clientSecret: process.env.TOAST_CLIENT_SECRET,
    userAccessType: 'TOAST_MACHINE_CLIENT',
  });

  const token = await toastRequest('POST', '/usermgmt/v1/authentications', body, null);
  _tokenCache = {
    access_token: token.token.accessToken,
    expires_at: Date.now() + token.token.expiresIn * 1000,
  };
  return _tokenCache.access_token;
}

// ── HTTP helper ──────────────────────────────────────────────────────────────
function toastRequest(method, path, body = null, token = undefined) {
  return new Promise(async (resolve, reject) => {
    // token=undefined means "fetch token first", token=null means "no auth header"
    const authHeader = token === null ? null : token || (await getAccessToken());

    const payload = typeof body === 'string' ? body : body ? JSON.stringify(body) : null;
    const options = {
      hostname: BASE_URL.replace('https://', ''),
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Toast-Restaurant-External-ID': process.env.TOAST_RESTAURANT_GUID || '',
      },
    };
    if (authHeader) options.headers['Authorization'] = `Bearer ${authHeader}`;
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
          reject(new Error('Toast: invalid JSON response'));
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
 * Create a Toast order with a payment (credit card via ccpartner or cash).
 *
 * @param {object} opts
 * @param {number}  opts.amountCents     — total in cents
 * @param {string}  opts.currency        — ISO currency code
 * @param {string}  opts.paymentType     — "CREDIT_CARD" | "CASH" | "OTHER"
 * @param {string}  [opts.cardToken]     — encrypted card token (ccpartner flow)
 * @param {string}  [opts.orderId]       — internal restaurant order id
 * @param {Array}   opts.selections      — Toast menu item selections
 * @returns {Promise<{provider, providerTxId, status, amountCents, currency, raw}>}
 */
async function createPayment({ amountCents, currency, paymentType, cardToken, orderId, selections = [] }) {
  if (!process.env.TOAST_RESTAURANT_GUID) throw new Error('TOAST_RESTAURANT_GUID not set');

  // Build minimal Toast order object
  const orderBody = {
    entityType: 'Order',
    externalId: orderId ? `restaurant-${orderId}` : undefined,
    checks: [
      {
        entityType: 'Check',
        selections: selections.map((s) => ({
          entityType: 'MenuItemSelection',
          externalId: s.externalId || String(s.name),
          itemGroup: { guid: s.itemGroupGuid || '' },
          item: { guid: s.itemGuid || '' },
          price: s.priceCents / 100,
          quantity: s.quantity || 1,
        })),
        payments: [
          {
            entityType: 'OrderPayment',
            paymentStatus: 'PAID',
            type: paymentType || 'CASH',
            amount: amountCents / 100,
            ...(cardToken ? { cardToken } : {}),
          },
        ],
      },
    ],
  };

  const result = await toastRequest(
    'POST',
    `/orders/v2/orders`,
    orderBody
  );

  // Toast returns the created order; extract first payment from first check
  const check = result.checks?.[0];
  const payment = check?.payments?.[0];

  return {
    provider: 'toast',
    providerTxId: payment?.guid || result.guid,
    status: payment?.paymentStatus === 'PAID' ? 'paid' : 'pending',
    amountCents: Math.round((payment?.amount || amountCents / 100) * 100),
    currency: currency || 'USD',
    raw: result,
  };
}

/**
 * Void (refund) a Toast order payment.
 *
 * @param {string} orderGuid   — Toast order GUID
 * @param {string} paymentGuid — Toast payment GUID
 * @returns {Promise<{provider, providerRefundId, status, raw}>}
 */
async function refundPayment({ orderGuid, paymentGuid }) {
  if (!process.env.TOAST_RESTAURANT_GUID) throw new Error('TOAST_RESTAURANT_GUID not set');

  // Void the payment on the check
  const result = await toastRequest(
    'DELETE',
    `/orders/v2/orders/${orderGuid}/checks/${paymentGuid}/payments/${paymentGuid}`
  );

  return {
    provider: 'toast',
    providerRefundId: paymentGuid,
    status: 'refunded',
    raw: result,
  };
}

/**
 * Get a Toast order by GUID.
 */
async function getOrder(orderGuid) {
  return toastRequest('GET', `/orders/v2/orders/${orderGuid}`);
}

module.exports = { createPayment, refundPayment, getOrder, getAccessToken };
