// ── API BASE URL ──
const API_BASE   = 'https://real-restaurant-api-production.up.railway.app/api';
const SOCKET_URL = 'https://real-restaurant-api-production.up.railway.app';

// ── CUSTOMER SOCKET (optional live feedback) ──
let customerSocket = null;
try {
  if (typeof io !== 'undefined') {
    customerSocket = io(SOCKET_URL, { transports: ['websocket','polling'] });
    customerSocket.emit('join', 'customer');
  }
} catch(_) {}

// ── AUTO-VERIFY QR CODE ──
// If URL has ?code=XXXXXXXX, verify it and auto-login the customer
(async function autoVerifyCode() {
  const params = new URLSearchParams(window.location.search);
  const code   = params.get('code');
  if (!code) return;

  try {
    const res  = await fetch(`${API_BASE}/auth/verify/${code}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    // Store token — customer is now logged in
    localStorage.setItem('rr_token', data.token);
    localStorage.setItem('rr_user',  JSON.stringify(data.user));

    // Store table label so order form can pre-fill it
    if (data.table) localStorage.setItem('rr_table', data.table);

    // Clean the code from URL without reloading
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, '', cleanUrl);

    // Show welcome toast after page loads
    window.addEventListener('load', () => {
      showWelcomeToast(data.user.name, data.table);
    });
  } catch (err) {
    console.warn('QR verify failed:', err.message);
  }
})();

function showWelcomeToast(name, table) {
  const el = document.createElement('div');
  el.style.cssText = `
    position:fixed; bottom:1.5rem; right:1.5rem; z-index:9999;
    background:#0f2318; color:#e8cc7a; border:1px solid #c9a84c;
    border-radius:10px; padding:1rem 1.4rem; font-family:'Lato',sans-serif;
    font-size:.9rem; font-weight:600; box-shadow:0 4px 20px rgba(0,0,0,.4);
    max-width:280px; animation: slideUp .4s ease;
  `;
  el.innerHTML = `
    <div style="font-size:1.4rem;margin-bottom:.3rem">👋</div>
    <div>Welcome! You're verified as a customer${table ? ` at <strong>${table}</strong>` : ''}.</div>
    <div style="font-size:.78rem;color:rgba(232,204,122,.6);margin-top:.3rem">You can now place orders directly.</div>
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}


document.getElementById('splash-btn').addEventListener('click', () => {
  document.getElementById('splash').classList.add('hidden');
  const site = document.getElementById('site');
  site.classList.add('visible');
});

// ── HAMBURGER ──
document.getElementById('hamburger').addEventListener('click', () => {
  document.getElementById('nav-links').classList.toggle('open');
});

// ── MENU TABS ──
const mtabs     = document.querySelectorAll('.mtab');
const menuGrid  = document.getElementById('menu-grid');

// Load menu from API on page load
async function loadMenu(category = 'kenyan') {
  menuGrid.innerHTML = `<p class="empty-msg" style="grid-column:1/-1;text-align:center;padding:3rem 0">Loading menu…</p>`;

  try {
    const res  = await fetch(`${API_BASE}/menu?category=${category}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Failed to load menu');

    if (!data.items || data.items.length === 0) {
      menuGrid.innerHTML = `<p class="empty-msg" style="grid-column:1/-1;text-align:center;padding:2rem">No items in this category.</p>`;
      return;
    }

    menuGrid.innerHTML = data.items.map(item => `
      <div class="menu-card" data-cat="${item.category}">
        <div class="menu-emoji">${item.emoji}</div>
        <div class="menu-info">
          <h4>${item.name}</h4>
          <p>${item.description}</p>
          <strong>Ksh ${item.price.toLocaleString()}</strong>
        </div>
        <button class="add-order" data-name="${item.name}" data-price="${item.price}">+ Add</button>
      </div>
    `).join('');

    wireAddButtons();
  } catch (err) {
    menuGrid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:3rem 0">
        <p class="empty-msg">⚠️ Could not load menu — make sure the server is running.</p>
        <button onclick="loadMenu('${category}')" style="margin-top:1rem;padding:.5rem 1.5rem;
          background:var(--gold);color:var(--green-dark);border:none;border-radius:4px;
          font-weight:700;cursor:pointer;letter-spacing:.1em;text-transform:uppercase;font-size:.8rem">
          ↺ Retry
        </button>
      </div>`;
    console.error('Menu load error:', err);
  }
}

mtabs.forEach(tab => {
  tab.addEventListener('click', () => {
    mtabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    loadMenu(tab.dataset.cat);
  });
});

// Initial load
loadMenu('kenyan');

// ── ORDER CART ──
const orderCart = [];

function wireAddButtons() {
  document.querySelectorAll('.add-order').forEach(btn => {
    btn.onclick = () => {
      const name  = btn.dataset.name;
      const price = parseInt(btn.dataset.price);
      orderCart.push({ name, price });
      renderOrder();
      btn.textContent = '✓ Added';
      btn.classList.add('added');
      setTimeout(() => { btn.textContent = '+ Add'; btn.classList.remove('added'); }, 1500);
    };
  });
}

function renderOrder() {
  const itemsEl  = document.getElementById('order-items');
  const footerEl = document.getElementById('order-footer');
  const totalEl  = document.getElementById('order-total');
  const countEl  = document.getElementById('cart-count');

  countEl.textContent = orderCart.length;

  if (orderCart.length === 0) {
    itemsEl.innerHTML = '<p class="empty-msg">No items yet. Add from the menu above.</p>';
    footerEl.style.display = 'none';
    return;
  }

  footerEl.style.display = 'block';
  itemsEl.innerHTML = orderCart.map((item, i) => `
    <div class="order-item">
      <span class="order-item-name">${item.name}</span>
      <span class="order-item-price">Ksh ${item.price.toLocaleString()}</span>
      <button class="order-item-remove" onclick="removeOrderItem(${i})">✕</button>
    </div>
  `).join('');

  const total = orderCart.reduce((s, i) => s + i.price, 0);
  totalEl.textContent = 'Ksh ' + total.toLocaleString();
}

function removeOrderItem(i) {
  orderCart.splice(i, 1);
  renderOrder();
}

// Place order — sends to API
async function placeOrder() {
  if (!orderCart.length) return;

  // Pre-fill table from QR session if available
  const tableLabel = localStorage.getItem('rr_table');
  const noteEl     = document.getElementById('order-note');
  if (tableLabel && noteEl && !noteEl.value) {
    noteEl.placeholder = `Table: ${tableLabel} — add any special instructions…`;
  }

  const note = noteEl ? noteEl.value || (tableLabel ? `Table: ${tableLabel}` : '') : '';
  const btn  = document.querySelector('#order-footer .btn-primary');
  btn.textContent = 'Placing order…';
  btn.disabled    = true;

  try {
    const token = localStorage.getItem('rr_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res  = await fetch(`${API_BASE}/orders`, {
      method:  'POST',
      headers,
      body:    JSON.stringify({ items: [...orderCart], note })
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Order failed');

    const placedOrder = data.order;
    orderCart.length = 0;
    renderOrder();
    document.getElementById('order-note').value = '';

    // Show live order tracker instead of static modal
    showOrderTracker(placedOrder);
    subscribeOrderUpdates(placedOrder.id);
  } catch (err) {
    alert('⚠️ Could not place order: ' + err.message);
    console.error('Order error:', err);
  } finally {
    btn.textContent = 'Place Order';
    btn.disabled    = false;
  }
}

// ── TABLE BOOKING — sends to API ──
document.getElementById('table-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form    = e.target;
  const inputs  = form.querySelectorAll('input, select');
  const btn     = form.querySelector('button[type="submit"]');
  const success = document.getElementById('table-success');

  const [nameEl, phoneEl, dateEl, timeEl, guestsEl, seatingEl] = inputs;

  btn.textContent = 'Reserving…';
  btn.disabled    = true;
  success.textContent = '';

  try {
    const res  = await fetch(`${API_BASE}/bookings/table`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:    nameEl.value,
        phone:   phoneEl.value,
        date:    dateEl.value,
        time:    timeEl.value,
        guests:  guestsEl.value,
        seating: seatingEl.value
      })
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Reservation failed');

    success.style.color = 'var(--green)';
    success.textContent = `✅ Table reserved! Booking #${data.booking.id} — we'll confirm via phone shortly.`;
    form.reset();
  } catch (err) {
    success.style.color = '#cc4444';
    success.textContent = '⚠️ ' + err.message;
  } finally {
    btn.textContent = 'Reserve Table';
    btn.disabled    = false;
  }
});

// ── ROOM BOOKING — sends to API ──
let currentRoom  = '';
let currentPrice = 0;

function openRoomBook(name, price) {
  currentRoom  = name;
  currentPrice = price;
  document.getElementById('room-modal-title').textContent  = 'Book — ' + name;
  document.getElementById('room-modal-price').textContent  = 'Ksh ' + price.toLocaleString();
  document.getElementById('room-success').textContent      = '';
  document.getElementById('room-modal').classList.add('open');
}

function closeRoomBook() {
  document.getElementById('room-modal').classList.remove('open');
}

async function confirmRoomBook() {
  const name    = document.getElementById('rm-name').value;
  const phone   = document.getElementById('rm-phone').value;
  const checkIn = document.getElementById('rm-in').value;
  const checkOut= document.getElementById('rm-out').value;
  const guests  = document.getElementById('rm-guests').value;
  const success = document.getElementById('room-success');
  const btn     = document.querySelector('#room-modal .btn-primary');

  if (!name || !phone || !checkIn || !checkOut) {
    success.style.color  = '#cc4444';
    success.textContent  = '⚠️ Please fill in all fields.';
    return;
  }

  btn.textContent = 'Confirming…';
  btn.disabled    = true;
  success.textContent = '';

  try {
    const res  = await fetch(`${API_BASE}/bookings/room`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_name: currentRoom,
        price:     currentPrice,
        name, phone,
        check_in:  checkIn,
        check_out: checkOut,
        guests:    parseInt(guests)
      })
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Booking failed');

    success.style.color = 'var(--green)';
    success.textContent = `✅ ${currentRoom} booked for ${name}! Booking #${data.booking.id} — ${data.summary.nights} night(s), ${data.summary.total_cost}. Confirmation sent to ${phone}.`;
  } catch (err) {
    success.style.color = '#cc4444';
    success.textContent = '⚠️ ' + err.message;
  } finally {
    btn.textContent = 'Confirm Booking';
    btn.disabled    = false;
  }
}

// ── SCROLL NAV HIGHLIGHT ──
window.addEventListener('scroll', () => {
  const nav = document.getElementById('navbar');
  nav.style.boxShadow = window.scrollY > 50 ? '0 2px 20px rgba(0,0,0,.3)' : 'none';
});

// ══════════════════════════════════════════
//  LIVE ORDER TRACKER
// ══════════════════════════════════════════

const STATUS_STEPS = ['received', 'preparing', 'ready', 'delivered'];
const STATUS_LABELS = {
  received:  { label: 'Order Received',   icon: '✅', desc: 'Your order has been received by the restaurant.' },
  preparing: { label: 'Being Prepared',   icon: '🍳', desc: 'The kitchen is preparing your order now.' },
  ready:     { label: 'Ready to Serve',   icon: '🔔', desc: 'Your order is ready! A waiter is on the way.' },
  delivered: { label: 'Delivered',        icon: '🍽️', desc: 'Enjoy your meal! Thank you for dining with us.' }
};

// Inject tracker styles once
(function injectTrackerStyles() {
  if (document.getElementById('tracker-styles')) return;
  const s = document.createElement('style');
  s.id = 'tracker-styles';
  s.textContent = `
    #order-tracker-overlay {
      position: fixed; inset: 0; z-index: 8000;
      background: rgba(15,35,24,.7); backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      opacity: 0; pointer-events: none; transition: opacity .3s;
    }
    #order-tracker-overlay.show { opacity: 1; pointer-events: all; }

    #order-tracker {
      background: var(--cream, #faf6ee);
      border: 2px solid var(--gold, #c9a84c);
      border-radius: 16px;
      box-shadow: 0 32px 80px rgba(0,0,0,.5);
      width: 100%; max-width: 440px; margin: 1rem;
      padding: 2rem;
      transform: translateY(20px) scale(.97);
      transition: transform .3s;
    }
    #order-tracker-overlay.show #order-tracker { transform: translateY(0) scale(1); }

    .ot-header { text-align: center; margin-bottom: 1.5rem; }
    .ot-icon   { font-size: 2.8rem; display: block; margin-bottom: .4rem; }
    .ot-title  { font-family: 'Cinzel', serif; font-size: 1rem; letter-spacing: .2em; color: #0f2318; }
    .ot-order-id { font-size: .78rem; color: #6a5a4a; margin-top: .2rem; }

    .ot-steps  { display: flex; flex-direction: column; gap: .6rem; margin-bottom: 1.5rem; }
    .ot-step   {
      display: flex; align-items: center; gap: 1rem;
      padding: .75rem 1rem; border-radius: 10px;
      border: 1.5px solid #e0d8c8; background: #fff;
      transition: all .3s;
    }
    .ot-step.active   { border-color: var(--gold, #c9a84c); background: #fffdf5; }
    .ot-step.done     { border-color: #27ae60; background: #f0faf4; }
    .ot-step.done .ot-step-icon   { color: #27ae60; }
    .ot-step.active .ot-step-icon { color: var(--gold, #c9a84c); }

    .ot-step-icon  { font-size: 1.5rem; flex-shrink: 0; }
    .ot-step-info  { flex: 1; }
    .ot-step-label { font-weight: 700; font-size: .88rem; color: #0f2318; }
    .ot-step-desc  { font-size: .75rem; color: #6a5a4a; margin-top: .1rem; }
    .ot-step-tick  { font-size: 1.1rem; color: #27ae60; display: none; }
    .ot-step.done .ot-step-tick   { display: block; }

    .ot-items { background: rgba(15,35,24,.05); border-radius: 8px; padding: .8rem 1rem; margin-bottom: 1.5rem; font-size: .82rem; color: #6a5a4a; }
    .ot-items ul { margin: .4rem 0 0; padding-left: 1.2rem; }
    .ot-items li { margin-bottom: .2rem; }

    .ot-close {
      width: 100%; padding: .7rem;
      background: #0f2318; color: #c9a84c;
      border: 1px solid #c9a84c; border-radius: 6px;
      font-size: .8rem; font-weight: 700; letter-spacing: .12em;
      text-transform: uppercase; cursor: pointer; transition: background .2s;
    }
    .ot-close:hover { background: #1a3a2a; }
    .ot-close:disabled { opacity: .5; cursor: not-allowed; }

    .ot-pulse { animation: otPulse 1.5s ease-in-out infinite; }
    @keyframes otPulse { 0%,100% { opacity:1; } 50% { opacity:.5; } }
  `;
  document.head.appendChild(s);
})();

function showOrderTracker(order) {
  let overlay = document.getElementById('order-tracker-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'order-tracker-overlay';
    overlay.innerHTML = `
      <div id="order-tracker">
        <div class="ot-header">
          <span class="ot-icon" id="ot-icon">✅</span>
          <div class="ot-title">ORDER TRACKER</div>
          <div class="ot-order-id" id="ot-order-id"></div>
        </div>
        <div class="ot-steps" id="ot-steps"></div>
        <div class="ot-items" id="ot-items"></div>
        <button class="ot-close" id="ot-close-btn" onclick="closeOrderTracker()">Close</button>
      </div>`;
    document.body.appendChild(overlay);
  }

  updateTrackerUI(order);
  overlay.classList.add('show');
}

function updateTrackerUI(order) {
  const currentIdx = STATUS_STEPS.indexOf(order.status);
  const info = STATUS_LABELS[order.status] || STATUS_LABELS.received;

  document.getElementById('ot-icon').textContent    = info.icon;
  document.getElementById('ot-order-id').textContent = `Order #${order.id} • ${order.note ? order.note : ''}`;

  // Steps
  document.getElementById('ot-steps').innerHTML = STATUS_STEPS.map((s, i) => {
    const stepInfo = STATUS_LABELS[s];
    let cls = '';
    if (i < currentIdx)  cls = 'done';
    if (i === currentIdx) cls = 'active' + (s !== 'delivered' ? ' ot-pulse' : '');
    return `
      <div class="ot-step ${cls}">
        <span class="ot-step-icon">${stepInfo.icon}</span>
        <div class="ot-step-info">
          <div class="ot-step-label">${stepInfo.label}</div>
          ${i === currentIdx ? `<div class="ot-step-desc">${stepInfo.desc}</div>` : ''}
        </div>
        <span class="ot-step-tick">✓</span>
      </div>`;
  }).join('');

  // Items
  const items = Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]');
  document.getElementById('ot-items').innerHTML = `
    <strong>Your order:</strong>
    <ul>${items.map(i => `<li>${i.name} — Ksh ${i.price.toLocaleString()}</li>`).join('')}</ul>
    <div style="margin-top:.4rem;font-weight:700;color:#0f2318">Total: Ksh ${order.total.toLocaleString()}</div>`;

  // Allow close only when delivered
  const closeBtn = document.getElementById('ot-close-btn');
  if (closeBtn) {
    if (order.status === 'delivered') {
      closeBtn.disabled = false;
      closeBtn.textContent = 'Close — Enjoy your meal! 🍽️';
    } else {
      closeBtn.disabled = false; // allow close anytime but show status
      closeBtn.textContent = 'Minimize (tracking continues)';
    }
  }
}

function subscribeOrderUpdates(orderId) {
  if (!customerSocket) return;
  customerSocket.on('order:updated', (order) => {
    if (order.id !== orderId) return;
    updateTrackerUI(order);
    // Re-show if minimized
    const overlay = document.getElementById('order-tracker-overlay');
    if (overlay) overlay.classList.add('show');
  });
}

function closeOrderTracker() {
  const overlay = document.getElementById('order-tracker-overlay');
  if (overlay) overlay.classList.remove('show');
}
window.closeOrderTracker = closeOrderTracker;
