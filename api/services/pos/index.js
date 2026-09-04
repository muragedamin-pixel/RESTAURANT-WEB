/**
 * POS Provider Factory
 *
 * Usage:
 *   const pos = require('./services/pos');
 *   const provider = pos.get('square'); // | 'toast' | 'sumup'
 *   await provider.createPayment({ ... });
 */

const square = require('./square');
const toast  = require('./toast');
const sumup  = require('./sumup');

const PROVIDERS = { square, toast, sumup };

/**
 * Get a POS provider by name.
 * @param {string} name — "square" | "toast" | "sumup"
 */
function get(name) {
  const provider = PROVIDERS[name?.toLowerCase()];
  if (!provider) {
    throw new Error(`Unknown POS provider "${name}". Valid options: ${Object.keys(PROVIDERS).join(', ')}`);
  }
  return provider;
}

/**
 * List all registered provider names.
 */
function list() {
  return Object.keys(PROVIDERS);
}

module.exports = { get, list };
