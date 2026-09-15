/**
 * M-Pesa Daraja API Service
 * Docs: https://developer.safaricom.co.ke/APIs
 *
 * Required env vars:
 *   MPESA_CONSUMER_KEY     — from Safaricom Developer Portal
 *   MPESA_CONSUMER_SECRET  — from Safaricom Developer Portal
 *   MPESA_SHORTCODE        — your Business/Till/Paybill number
 *   MPESA_PASSKEY          — Lipa Na M-Pesa Online passkey
 *   MPESA_CALLBACK_URL     — public HTTPS URL e.g. https://your-api.railway.app/api/mpesa/callback
 *   MPESA_ENVIRONMENT      — "sandbox" | "production"  (default: sandbox)
 */

const https = require('https');

const ENV         = process.env.MPESA_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
const BASE_HOST   = ENV === 'production' ? 'api.safaricom.co.ke' : 'sandbox.safaricom.co.ke';

// ── Low-level HTTPS helper ────────────────────────────────────────────────────
function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: BASE_HOST,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };
    if (payload) options.headers['Content-Length'] = Buffer.byteLength(payload);

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch {
          reject(new Error('M-Pesa: invalid JSON response'));
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Get OAuth access token (cached, refreshes before expiry) ─────────────────
let _tokenCache = null; // { token, expires_at }

async function getAccessToken() {
  if (_tokenCache && Date.now() < _tokenCache.expires_at - 60_000) {
    return _tokenCache.token;
  }

  const key    = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;
  if (!key || !secret) throw new Error('MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET are required');

  const credentials = Buffer.from(`${key}:${secret}`).toString('base64');

  const res = await request(
    'GET',
    '/oauth/v1/generate?grant_type=client_credentials',
    null,
    { Authorization: `Basic ${credentials}` }
  );

  if (!res.access_token) throw new Error(`M-Pesa auth failed: ${JSON.stringify(res)}`);

  _tokenCache = {
    token:      res.access_token,
    expires_at: Date.now() + parseInt(res.expires_in || 3600) * 1000,
  };
  return _tokenCache.token;
}

// ── Generate Lipa Na M-Pesa password ─────────────────────────────────────────
function generatePassword(timestamp) {
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey   = process.env.MPESA_PASSKEY;
  if (!shortcode || !passkey) throw new Error('MPESA_SHORTCODE and MPESA_PASSKEY are required');
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
}

function getTimestamp() {
  return new Date()
    .toISOString()
    .replace(/[-T:.Z]/g, '')
    .slice(0, 14); // YYYYMMDDHHmmss
}

// ── STK Push (Lipa Na M-Pesa Online) ─────────────────────────────────────────
/**
 * Initiate an STK Push to customer's phone.
 *
 * @param {object} opts
 * @param {string} opts.phone       — customer phone in 254XXXXXXXXX format
 * @param {number} opts.amountKes   — amount in KES (whole number)
 * @param {string} opts.orderId     — internal order ID (used in AccountReference)
 * @param {string} [opts.description] — transaction description (max 13 chars shown on phone)
 * @returns {Promise<{ checkoutRequestId, merchantRequestId, responseCode, customerMessage }>}
 */
async function stkPush({ phone, amountKes, orderId, description }) {
  const shortcode   = process.env.MPESA_SHORTCODE;
  const callbackUrl = process.env.MPESA_CALLBACK_URL;
  if (!shortcode)   throw new Error('MPESA_SHORTCODE is required');
  if (!callbackUrl) throw new Error('MPESA_CALLBACK_URL is required');

  const token     = await getAccessToken();
  const timestamp = getTimestamp();
  const password  = generatePassword(timestamp);

  const body = {
    BusinessShortCode: shortcode,
    Password:          password,
    Timestamp:         timestamp,
    TransactionType:   'CustomerPayBillOnline',
    Amount:            Math.ceil(amountKes),         // M-Pesa requires whole numbers
    PartyA:            phone,
    PartyB:            shortcode,
    PhoneNumber:       phone,
    CallBackURL:       callbackUrl,
    AccountReference:  `Order${orderId}`,
    TransactionDesc:   description || `Order #${orderId}`,
  };

  const res = await request(
    'POST',
    '/mpesa/stkpush/v1/processrequest',
    body,
    { Authorization: `Bearer ${token}` }
  );

  if (res.ResponseCode !== '0') {
    throw new Error(res.ResponseDescription || res.errorMessage || 'STK push failed');
  }

  return {
    checkoutRequestId: res.CheckoutRequestID,
    merchantRequestId: res.MerchantRequestID,
    responseCode:      res.ResponseCode,
    customerMessage:   res.CustomerMessage,
  };
}

// ── STK Push Query (check payment status) ────────────────────────────────────
/**
 * Query the status of an STK push.
 * @param {string} checkoutRequestId — from stkPush()
 * @returns {Promise<{ resultCode, resultDesc }>}
 */
async function stkQuery(checkoutRequestId) {
  const shortcode = process.env.MPESA_SHORTCODE;
  const token     = await getAccessToken();
  const timestamp = getTimestamp();
  const password  = generatePassword(timestamp);

  const body = {
    BusinessShortCode: shortcode,
    Password:          password,
    Timestamp:         timestamp,
    CheckoutRequestID: checkoutRequestId,
  };

  const res = await request(
    'POST',
    '/mpesa/stkpushquery/v1/query',
    body,
    { Authorization: `Bearer ${token}` }
  );

  return {
    resultCode: res.ResultCode,
    resultDesc: res.ResultDesc,
  };
}

/**
 * Format a phone number to 254XXXXXXXXX.
 * Accepts: 07XXXXXXXX, +2547XXXXXXXX, 2547XXXXXXXX
 */
function formatPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0')   && digits.length === 10) return '254' + digits.slice(1);
  if (digits.startsWith('7')   && digits.length === 9)  return '254' + digits;
  throw new Error(`Invalid phone number: ${phone}. Use format 07XXXXXXXX or 254XXXXXXXXX`);
}

module.exports = { stkPush, stkQuery, formatPhone, getAccessToken };
