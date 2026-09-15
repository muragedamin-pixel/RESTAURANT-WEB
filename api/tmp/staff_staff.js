// ════════════════════════════════════════════
+      3: // M-PESA PAYMENT
+      4: // ════════════════════════════════════════════
+      5: 
+      6: const MPESA_API = 'https://real-restaurant-api-production.up.railway.app/api/mpesa';
+      7: 
+      8: // ── Inject M-Pesa modal + receipt styles ─────────────────────────────────────
+      9: (function injectMpesaStyles() {
+     10:   if (document.getElementById('mpesa-styles')) return;
+     11:   const s = document.createElement('style');
+     12:   s.id = 'mpesa-styles';
+     13:   s.textContent = `
+     14:     /* ── Payment modal ── */
+     15:     #mpesa-overlay {
+     16:       position: fixed; inset: 0; z-index: 9500;
+     17:       background: rgba(15,35,24,.75);
+     18:       backdrop-filter: blur(4px);
+     19:       display: flex; align-items: center; justify-content: center;
+     20:       opacity: 0; pointer-events: none; transition: opacity .3s;
+     21:     }
+     22:     #mpesa-overlay.show { opacity: 1; pointer-events: all; }
+     23:     #mpesa-modal {
+     24:       background: #faf6ee;
+     25:       border: 2px solid #c9a84c; border-radius: 16px;
+     26:       box-shadow: 0 32px 80px rgba(0,0,0,.5);
+     27:       width: 100%; max-width: 440px;
+     28:       margin: 1rem; padding: 2rem;
+     29:       transform: translateY(20px) scale(.97); transition: transform .3s;
+     30:       max-height: 90vh; overflow-y: auto;
+     31:     }
+     32:     #mpesa-overlay.show #mpesa-modal { transform: translateY(0) scale(1); }
+     33: 
+     34:     .mpesa-header {
+     35:       display: flex; align-items: center; justify-content: space-between;
+     36:       margin-bottom: 1.2rem;
+     37:     }
+     38:     .mpesa-title {
+     39:       font-family: 'Cinzel', serif; font-size: 1rem;
+     40:       letter-spacing: .2em; color: #0f2318; text-transform: uppercase;
+     41:     }
+     42:     .mpesa-close-btn {
+     43:       background: none; border: none; font-size: 1.3rem;
+     44:       cursor: pointer; color: #6a5a4a; line-height: 1;
+     45:     }
+     46:     .mpesa-logo {
+     47:       text-align: center; margin-bottom: 1.2rem;
+     48:     }
+     49:     .mpesa-logo-badge {
+     50:       display: inline-block;
+     51:       background: #00a651; color: #fff;
+     52:       font-weight: 900; font-size: 1.1rem;
+     53:       letter-spacing: .05em; padding: .35rem 1.2rem;
+     54:       border-radius: 6px;
+     55:     }
+     56:     .mpesa-order-summary {
+     57:       background: rgba(15,35,24,.06); border-radius: 10px;
+     58:       padding: .8rem 1rem; margin-bottom: 1.2rem;
+     59:       font-size: .82rem; color: #6a5a4a;
+     60:     }
+     61:     .mpesa-order-summary strong { color: #0f2318; display: block; margin-bottom: .3rem; }
+     62:     .mpesa-total { font-size: 1.1rem; font-weight: 700; color: #0f2318; margin-top: .4rem; }
+     63:     .mpesa-field { margin-bottom: .9rem; }
+     64:     .mpesa-field label {
+     65:       font-size: .72rem; font-weight: 700;
+     66:       letter-spacing: .1em; text-transform: uppercase;
+     67:       color: #6a5a4a; display: block; margin-bottom: .3rem;
+     68:     }
+     69:     .mpesa-field input {
+     70:       width: 100%; padding: .7rem 1rem;
+     71:       border: 1.5px solid #e0d8c8; border-radius: 6px;
+     72:       font-family: 'Lato', sans-serif; font-size: .95rem;
+     73:       background: #fff; color: #1a1a1a; transition: border-color .2s;
+     74:     }
+     75:     .mpesa-field input:focus { outline: none; border-color: #00a651; }
+     76:     .mpesa-hint { font-size: .72rem; color: #6a5a4a; margin-top: .25rem; }
+     77:     .tip-options { display: flex; gap: .5rem; flex-wrap: wrap; margin-top: .4rem; }
+     78:     .tip-btn {
+     79:       padding: .35rem .8rem; border-radius: 20px;
+     80:       border: 1px solid #e0d8c8; background: #fff;
+     81:       font-size: .75rem; font-weight: 700; cursor: pointer;
+     82:       color: #6a5a4a; transition: all .2s;
+     83:     }
+     84:     .tip-btn:hover { border-color: #00a651; }
+     85:     .tip-btn.active { background: #00a651; color: #fff; border-color: #00a651; }
+     86:     .mpesa-submit-btn {
+     87:       width: 100%; padding: .9rem;
+     88:       background: #00a651; color: #fff;
+     89:       border: none; border-radius: 8px;
+     90:       font-family: 'Cinzel', serif; font-size: .9rem;
+     91:       font-weight: 700; letter-spacing: .12em; text-transform: uppercase;
+     92:       cursor: pointer; transition: background .2s; margin-top: .5rem;
+     93:     }
+     94:     .mpesa-submit-btn:hover { background: #008c45; }
+     95:     .mpesa-submit-btn:disabled { opacity: .5; cursor: not-allowed; }
+     96:     .mpesa-error { font-size: .8rem; color: #c0392b; margin-top: .5rem; min-height: 1.2rem; }
+     97: 
+     98:     /* ── Waiting screen (after STK push sent) ── */
+     99:     #mpesa-waiting {
+    100:       display: none; text-align: center; padding: .5rem 0;
+    101:     }
+    102:     #mpesa-waiting.show { display: block; }
+    103:     .mpesa-spinner {
+    104:       font-size: 3rem; display: block;
+    105:       animation: mpesaSpin 1s linear infinite;
+    106:     }
+    107:     @keyframes mpesaSpin {
+    108:       from { transform: rotate(0deg); } to { transform: rotate(360deg); }
+    109:     }
+    110:     .mpesa-waiting-title {
+    111:       font-family: 'Cinzel', serif; font-size: .95rem;
+    112:       letter-spacing: .15em; color: #0f2318; margin: .8rem 0 .4rem;
+    113:     }
+    114:     .mpesa-waiting-desc { font-size: .82rem; color: #6a5a4a; line-height: 1.6; }
+    115:     .mpesa-cancel-btn {
+    116:       margin-top: 1.2rem; padding: .55rem 1.8rem;
+    117:       background: transparent; color: #c0392b;
+    118:       border: 1px solid #c0392b; border-radius: 6px;
+    119:       font-size: .78rem; font-weight: 700; cursor: pointer;
+    120:     }
+    121: 
+    122:     /* ── Receipt modal ── */
+    123:     #receipt-overlay {
+    124:       position: fixed; inset: 0; z-index: 9600;
+    125:       background: rgba(15,35,24,.8); backdrop-filter: blur(4px);
+    126:       display: flex; align-items: center; justify-content: center;
+    127:       opacity: 0; pointer-events: none; transition: opacity .3s;
+    128:     }
+    129:     #receipt-overlay.show { opacity: 1; pointer-events: all; }
+    130:     #receipt-modal {
+    131:       background: #fff; border: 2px solid #00a651; border-radius: 16px;
+    132:       box-shadow: 0 32px 80px rgba(0,0,0,.5);
+    133:       width: 100%; max-width: 380px;
+    134:       margin: 1rem; padding: 2rem;
+    135:       transform: translateY(20px) scale(.97); transition: transform .3s;
+    136:       text-align: center;
+    137:     }
+    138:     #receipt-overlay.show #receipt-modal { transform: translateY(0) scale(1); }
+    139:     .receipt-icon { font-size: 3rem; margin-bottom: .5rem; }
+    140:     .receipt-title {
+    141:       font-family: 'Cinzel', serif; font-size: 1rem;
+    142:       letter-spacing: .2em; color: #0f2318; text-transform: uppercase; margin-bottom: 1rem;
+    143:     }
+    144:     .receipt-body {
+    145:       background: #f8f8f8; border-radius: 10px; padding: 1rem;
+    146:       text-align: left; font-size: .82rem; color: #333;
+    147:       margin-bottom: 1.2rem; line-height: 1.8;
+    148:     }
+    149:     .receipt-row { display: flex; justify-content: space-between; }
+    150:     .receipt-row.receipt-total {
+    151:       font-weight: 700; font-size: .95rem; color: #0f2318;
+    152:       border-top: 1px dashed #ccc; margin-top: .5rem; padding-top: .5rem;
+    153:     }
+    154:     .receipt-number { font-size: .72rem; color: #999; letter-spacing: .08em; margin-bottom: 1rem; }
+    155:     .receipt-close-btn {
+    156:       width: 100%; padding: .75rem;
+    157:       background: #00a651; color: #fff; border: none; border-radius: 8px;
+    158:       font-size: .8rem; font-weight: 700; letter-spacing: .12em;
+    159:       text-transform: uppercase; cursor: pointer; transition: background .2s;
+    160:     }
+    161:     .receipt-close-btn:hover { background: #008c45; }
+    162: 
+    163:     /* ── Charge button on delivered order cards ── */
+    164:     .pos-charge-btn {
+    165:       background: #00a651; color: #fff; border: none; border-radius: 6px;
+    166:       padding: .45rem 1rem; font-size: .78rem; font-weight: 700;
+    167:       letter-spacing: .08em; text-transform: uppercase;
+    168:       cursor: pointer; transition: background .2s; margin-top: .4rem;
+    169:     }
+    170:     .pos-charge-btn:hover { background: #008c45; }
+    171:     .pos-charge-btn.charged { background: #27ae60; cursor: default; }
+    172:   `;
+    173:   document.head.appendChild(s);
+    174: })();
+    175: 
+    176: // ── M-Pesa state ─────────────────────────────────────────────────────────────
+    177: let _mpesaOrder           = null;
+    178: let _mpesaTipKes          = 0;
+    179: let _mpesaCheckoutReqId   = null;
+    180: let _mpesaPollInterval    = null;
+    181: 
+    182: // ── Open M-Pesa payment modal ─────────────────────────────────────────────────
+    183: function openPOSModal(order) {
+    184:   _mpesaOrder        = order;
+    185:   _mpesaTipKes       = 0;
+    186:   _mpesaCheckoutReqId = null;
+    187: 
+    188:   let overlay = document.getElementById('mpesa-overlay');
+    189:   if (!overlay) {
+    190:     overlay = document.createElement('div');
+    191:     overlay.id = 'mpesa-overlay';
+    192:     overlay.innerHTML = `
+    193:       <div id="mpesa-modal">
+    194:         <div class="mpesa-header">
+    195:           <span class="mpesa-title">📱 M-Pesa Payment</span>
+    196:           <button class="mpesa-close-btn" onclick="closePOSModal()">✕</button>
+    197:         </div>
+    198:         <div class="mpesa-logo"><span class="mpesa-logo-badge">M-PESA</span></div>
+    199:         <div class="mpesa-order-summary" id="mpesa-order-summary"></div>
+    200: 
+    201:         <!-- Input form -->
+    202:         <div id="mpesa-form">
+    203:           <div class="mpesa-field">
+    204:             <label>Customer Phone Number</label>
+    205:             <input type="tel" id="mpesa-phone" placeholder="07XXXXXXXX" maxlength="13" />
+    206:             <div class="mpesa-hint">Format: 07XXXXXXXX or 254XXXXXXXXX</div>
+    207:           </div>
+    208:           <div class="mpesa-field">
+    209:             <label>Add Tip</label>
+    210:             <div class="tip-options">
+    211:               <button class="tip-btn active" onclick="selectTip(0,this)">No Tip</button>
+    212:               <button class="tip-btn" onclick="selectTip(5,this)">5%</button>
+    213:               <button class="tip-btn" onclick="selectTip(10,this)">10%</button>
+    214:               <button class="tip-btn" onclick="selectTip(15,this)">15%</button>
+    215:               <button class="tip-btn" onclick="selectTip(20,this)">20%</button>
+    216:             </div>
+    217:           </div>
+    218:           <button class="mpesa-submit-btn" id="mpesa-submit-btn" onclick="submitMpesaPayment()">
+    219:             📲 Send STK Push
+    220:           </button>
+    221:           <div class="mpesa-error" id="mpesa-error"></div>
+    222:         </div>
+    223: 
+    224:         <!-- Waiting screen -->
+    225:         <div id="mpesa-waiting">
+    226:           <span class="mpesa-spinner">⏳</span>
+    227:           <div class="mpesa-waiting-title">Waiting for Payment…</div>
+    228:           <div class="mpesa-waiting-desc">
+    229:             A prompt has been sent to the customer's phone.<br/>
+    230:             Ask them to enter their M-Pesa PIN to confirm.
+    231:           </div>
+    232:           <button class="mpesa-cancel-btn" onclick="cancelMpesaWait()">Cancel</button>
+    233:         </div>
+    234:       </div>`;
+    235:     document.body.appendChild(overlay);
+    236:     overlay.addEventListener('click', (e) => { if (e.target === overlay) closePOSModal(); });
+    237:   }
+    238: 
+    239:   // Reset to form view
+    240:   document.getElementById('mpesa-form').style.display    = 'block';
+    241:   document.getElementById('mpesa-waiting').classList.remove('show');
+    242:   document.getElementById('mpesa-error').textContent     = '';
+    243:   document.getElementById('mpesa-phone').value           = '';
+    244: 
+    245:   // Fill order summary
+    246:   const items = Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]');
+    247:   document.getElementById('mpesa-order-summary').innerHTML = `
+    248:     <strong>Order #${order.id}${order.note ? ` — ${order.note}` : ''}</strong>
+    249:     ${items.map(i => `<div class="receipt-row"><span>${i.name}</span><span>Ksh ${i.price.toLocaleString()}</span></div>`).join('')}
+    250:     <div class="mpesa-total" id="mpesa-total-display">Total: Ksh ${order.total.toLocaleString()}</div>`;
+    251: 
+    252:   overlay.classList.add('show');
+    253: }
+    254: 
+    255: // ── Tip selector ──────────────────────────────────────────────────────────────
+    256: function selectTip(percent, btn) {
+    257:   document.querySelectorAll('.tip-btn').forEach(b => b.classList.remove('active'));
+    258:   btn.classList.add('active');
+    259:   _mpesaTipKes = Math.round((_mpesaOrder.total * percent) / 100);
+    260:   const total = _mpesaOrder.total + _mpesaTipKes;
+    261:   const el = document.getElementById('mpesa-total-display');
+    262:   if (el) el.textContent = `Total: Ksh ${total.toLocaleString()}${_mpesaTipKes > 0 ? ` (incl. Ksh ${_mpesaTipKes.toLocaleString()} tip)` : ''}`;
+    263: }
+    264: 
+    265: // ── Submit STK push ───────────────────────────────────────────────────────────
+    266: async function submitMpesaPayment() {
+    267:   const errorEl   = document.getElementById('mpesa-error');
+    268:   const submitBtn = document.getElementById('mpesa-submit-btn');
+    269:   const phone     = document.getElementById('mpesa-phone')?.value?.trim();
+    270: 
+    271:   errorEl.textContent = '';
+    272:   if (!phone) { errorEl.textContent = '⚠️ Phone number is required.'; return; }
+    273: 
+    274:   submitBtn.disabled    = true;
+    275:   submitBtn.textContent = 'Sending…';
+    276: 
+    277:   try {
+    278:     const res = await fetch(`${MPESA_API}/stkpush`, {
+    279:       method:  'POST',
+    280:       headers: { 'Content-Type': 'application/json' },
+    281:       body:    JSON.stringify({
+    282:         order_id:   _mpesaOrder.id,
+    283:         phone,
+    284:         amount_kes: _mpesaOrder.total + _mpesaTipKes,
+    285:       }),
+    286:     });
+    287:     const data = await res.json();
+    288: 
+    289:     if (!res.ok) {
+    290:       errorEl.textContent = `⚠️ ${data.error || 'STK push failed'}`;
+    291:       return;
+    292:     }
+    293: 
+    294:     _mpesaCheckoutReqId = data.checkoutRequestId;
+    295: 
+    296:     // Switch to waiting screen
+    297:     document.getElementById('mpesa-form').style.display = 'none';
+    298:     document.getElementById('mpesa-waiting').classList.add('show');
+    299: 
+    300:     // Start polling for payment confirmation
+    301:     startMpesaPolling(_mpesaCheckoutReqId);
+    302: 
+    303:   } catch (err) {
+    304:     errorEl.textContent = `⚠️ Network error: ${err.message}`;
+    305:   } finally {
+    306:     submitBtn.disabled    = false;
+    307:     submitBtn.textContent = '📲 Send STK Push';
+    308:   }
+    309: }
+    310: 
+    311: // ── Poll for payment result ───────────────────────────────────────────────────
+    312: function startMpesaPolling(checkoutRequestId) {
+    313:   let attempts = 0;
+    314:   const maxAttempts = 24; // poll for up to 2 minutes (24 × 5s)
+    315: 
+    316:   _mpesaPollInterval = setInterval(async () => {
+    317:     attempts++;
+    318:     try {
+    319:       const res  = await fetch(`${MPESA_API}/status/${checkoutRequestId}`);
+    320:       const data = await res.json();
+    321:       const tx   = data.transaction;
+    322: 
+    323:       if (!tx) return;
+    324: 
+    325:       if (tx.status === 'paid') {
+    326:         stopMpesaPolling();
+    327:         closePOSModal();
+    328:         showMpesaReceipt(tx, _mpesaOrder);
+    329:         // Mark charge button
+    330:         const btn = document.querySelector(`.pos-charge-btn[data-order-id="${_mpesaOrder.id}"]`);
+    331:         if (btn) { btn.textContent = '✅ Paid'; btn.classList.add('charged'); btn.disabled = true; }
+    332:       } else if (tx.status === 'failed' || tx.status === 'cancelled') {
+    333:         stopMpesaPolling();
+    334:         // Back to form with error
+    335:         document.getElementById('mpesa-waiting').classList.remove('show');
+    336:         document.getElementById('mpesa-form').style.display = 'block';
+    337:         const msg = tx.status === 'cancelled'
+    338:           ? '⚠️ Payment cancelled by customer.'
+    339:           : `⚠️ Payment failed: ${tx.result_desc || 'Unknown error'}`;
+    340:         document.getElementById('mpesa-error').textContent = msg;
+    341:       } else if (attempts >= maxAttempts) {
+    342:         stopMpesaPolling();
+    343:         document.getElementById('mpesa-waiting').classList.remove('show');
+    344:         document.getElementById('mpesa-form').style.display = 'block';
+    345:         document.getElementById('mpesa-error').textContent =
+    346:           '⚠️ Payment timed out. Ask the customer to try again.';
+    347:       }
+    348:     } catch (_) { /* network hiccup — keep polling */ }
+    349:   }, 5000); // every 5 seconds
+    350: }
+    351: 
+    352: function stopMpesaPolling() {
+    353:   if (_mpesaPollInterval) {
+    354:     clearInterval(_mpesaPollInterval);
+    355:     _mpesaPollInterval = null;
+    356:   }
+    357: }
+    358: 
+    359: function cancelMpesaWait() {
+    360:   stopMpesaPolling();
+    361:   document.getElementById('mpesa-waiting').classList.remove('show');
+    362:   document.getElementById('mpesa-form').style.display = 'block';
+    363:   document.getElementById('mpesa-error').textContent = '';
+    364: }
+    365: 
+    366: // ── Close modal ───────────────────────────────────────────────────────────────
+    367: function closePOSModal() {
+    368:   stopMpesaPolling();
+    369:   const overlay = document.getElementById('mpesa-overlay');
+    370:   if (overlay) overlay.classList.remove('show');
+    371: }
+    372: 
+    373: // ── Show M-Pesa receipt ───────────────────────────────────────────────────────
+    374: function showMpesaReceipt(tx, order) {
+    375:   let overlay = document.getElementById('receipt-overlay');
+    376:   if (!overlay) {
+    377:     overlay = document.createElement('div');
+    378:     overlay.id = 'receipt-overlay';
+    379:     overlay.innerHTML = `
+    380:       <div id="receipt-modal">
+    381:         <div class="receipt-icon">🧾</div>
+    382:         <div class="receipt-title">M-Pesa Payment Confirmed</div>
+    383:         <div class="receipt-number" id="receipt-number"></div>
+    384:         <div class="receipt-body"  id="receipt-body"></div>
+    385:         <button class="receipt-close-btn" onclick="closeReceipt()">Done — Close Receipt</button>
+    386:       </div>`;
+    387:     document.body.appendChild(overlay);
+    388:   }
+    389: 
+    390:   const items  = Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]');
+    391:   const tipKes = tx.amount_kes - order.total;
+    392: 
+    393:   document.getElementById('receipt-number').textContent =
+    394:     tx.mpesa_receipt ? `M-Pesa Receipt: ${tx.mpesa_receipt}` : `Tx #${tx.id}`;
+    395: 
+    396:   document.getElementById('receipt-body').innerHTML = `
+    397:     <div class="receipt-row">
+    398:       <span>Order #${order.id}</span>
+    399:       <span>${new Date().toLocaleTimeString('en-KE')}</span>
+    400:     </div>
+    401:     <div style="margin:.4rem 0;border-top:1px dashed #ddd;padding-top:.4rem;">
+    402:       ${items.map(i => `<div class="receipt-row"><span>${i.name}</span><span>Ksh ${i.price.toLocaleString()}</span></div>`).join('')}
+    403:     </div>
+    404:     ${tipKes > 0 ? `<div class="receipt-row"><span>Tip</span><span>Ksh ${tipKes.toLocaleString()}</span></div>` : ''}
+    405:     <div class="receipt-row receipt-total">
+    406:       <span>Total Paid</span><span>Ksh ${tx.amount_kes.toLocaleString()}</span>
+    407:     </div>
+    408:     <div class="receipt-row" style="margin-top:.4rem;font-size:.75rem;color:#999;">
+    409:       <span>Via</span><span>M-PESA • ${tx.phone}</span>
+    410:     </div>
+    411:     ${tx.mpesa_receipt ? `<div class="receipt-row" style="font-size:.75rem;color:#999;">
+    412:       <span>Receipt No.</span><span>${tx.mpesa_receipt}</span>
+    413:     </div>` : ''}`;
+    414: 
+    415:   overlay.classList.add('show');
+    416: }
+    417: 
+    418: function closeReceipt() {
+    419:   const overlay = document.getElementById('receipt-overlay');
+    420:   if (overlay) overlay.classList.remove('show');
+    421: }
+    422: 
+    423: // ── Socket listeners for M-Pesa events ──────────────────────────────────────
+    424: function initPOSSocketListeners() {
+    425:   if (!socket) return;
+    426: 
+    427:   socket.on('mpesa:paid', (tx) => {
+    428:     toast(`📱 M-Pesa received — Ksh ${tx.amount_kes.toLocaleString()} • ${tx.mpesa_receipt || tx.phone}`, 'success');
+    429:     // If polling modal is open for this tx, it will catch it on next poll
+    430:     if (typeof refreshManager === 'function') refreshManager();
+    431:   });
+    432: 
+    433:   socket.on('mpesa:failed', (tx) => {
+    434:     toast(`⚠️ M-Pesa ${tx.status} — Order #${tx.order_id} • ${tx.result_desc || ''}`, 'error');
+    435:     if (typeof refreshManager === 'function') refreshManager();
+    436:   });
+    437: }
+    438: 
+    439: // ── Expose globals ────────────────────────────────────────────────────────────
+    440: window.openPOSModal       = openPOSModal;
+    441: window.closePOSModal      = closePOSModal;
+    442: window.selectTip          = selectTip;
+    443: window.submitMpesaPayment = submitMpesaPayment;
+    444: window.cancelMpesaWait    = cancelMpesaWait;
+    445: window.closeReceipt       = closeReceipt;
