// ── CONFIG ──
const API         = 'https://real-restaurant-api-production.up.railway.app/api';
const STAFF_API   = 'https://real-restaurant-api-production.up.railway.app/api/staff';
const SOCKET_URL  = 'https://real-restaurant-api-production.up.railway.app';

// ── SOCKET.IO CLIENT (loaded from CDN in each HTML page) ──
let socket = null;

// ── LIVE CLOCK ──
function startClock() {
  const el = document.getElementById('clock');
  if (!el) return;
  const tick = () => {
    const now = new Date();
    el.textContent = now.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  tick();
  setInterval(tick, 1000);
}

// ── TOAST ──
function toast(msg, type = 'info') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = `toast show toast-${type}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 4000);
}

// ── HELPERS ──
function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr + 'Z')) / 60000);
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff}m ago`;
  return `${Math.floor(diff / 60)}h ${diff % 60}m ago`;
}

function formatTime(dateStr) {
  return new Date(dateStr + 'Z').toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
}

function statusBadge(status) {
  return `<span class="status-badge badge-${status}">${status}</span>`;
}

// ── API ──
async function apiGet(path) {
  const res = await fetch(`${STAFF_API}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function apiPatch(path, body) {
  const res = await fetch(`${STAFF_API}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// ── STATUS UPDATES ──
async function updateOrderStatus(id, status, onSuccess) {
  try {
    await apiPatch(`/orders/${id}/status`, { status });
    // Socket event will handle the UI update — no manual refresh needed
    if (onSuccess) onSuccess();
  } catch (e) {
    toast('⚠️ Failed to update order', 'error');
  }
}

async function updateTableStatus(id, status, onSuccess) {
  try {
    await apiPatch(`/bookings/table/${id}/status`, { status });
    if (onSuccess) onSuccess();
  } catch (e) {
    toast('⚠️ Failed to update booking', 'error');
  }
}

async function updateRoomStatus(id, status, onSuccess) {
  try {
    await apiPatch(`/bookings/room/${id}/status`, { status });
    if (onSuccess) onSuccess();
  } catch (e) {
    toast('⚠️ Failed to update room booking', 'error');
  }
}

// ── SOUND ALERT (optional browser beep) ──
function playAlert() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (_) {}
}

// ════════════════════════════════════════════
//  KITCHEN DASHBOARD
// ════════════════════════════════════════════
function renderKitchenOrder(order, targetStatus) {
  const items   = order.items.map(i => `<li>${i.name} — Ksh ${i.price.toLocaleString()}</li>`).join('');
  const noteHtml = order.note ? `<div class="order-note">📝 ${order.note}</div>` : '';

  let actionsHtml = '';
  if (targetStatus === 'received') {
    actionsHtml = `<button class="action-btn btn-start" onclick="updateOrderStatus(${order.id},'preparing')">🔥 Start Cooking</button>`;
  } else if (targetStatus === 'preparing') {
    actionsHtml = `<button class="action-btn btn-ready" onclick="updateOrderStatus(${order.id},'ready')">✅ Mark Ready</button>`;
  } else {
    actionsHtml = `<span style="font-size:.8rem;color:var(--success);font-weight:700">⏳ Waiting for waiter…</span>`;
  }

  return `
    <div class="order-card" id="order-${order.id}">
      <div class="order-card-header">
        <span class="order-id">Order #${order.id}</span>
        <span class="order-time">${timeAgo(order.created_at)}</span>
      </div>
      <ul class="order-items-list">${items}</ul>
      ${noteHtml}
      <div class="order-total">Total: Ksh ${order.total.toLocaleString()}</div>
      <div class="order-actions">${actionsHtml}</div>
    </div>`;
}

let kitchenOrders = { received: [], preparing: [], ready: [] };

function renderKitchenBoard() {
  ['received', 'preparing', 'ready'].forEach(status => {
    const el      = document.getElementById(`col-${status}-cards`);
    const counter = document.getElementById(`col-${status}`);
    if (!el) return;
    const list = kitchenOrders[status] || [];
    counter.textContent = list.length;
    el.innerHTML = list.length
      ? list.map(o => renderKitchenOrder(o, status)).join('')
      : '<div class="empty-state">No orders here</div>';
  });

  // Stats
  const s = kitchenOrders;
  setEl('stat-received',  (s.received  || []).length);
  setEl('stat-preparing', (s.preparing || []).length);
  setEl('stat-ready',     (s.ready     || []).length);
}

function setEl(id, val) { const e = document.getElementById(id); if (e) e.textContent = val; }

async function refreshKitchen() {
  try {
    const orders = await apiGet('/orders');
    kitchenOrders = { received: [], preparing: [], ready: [], delivered: [] };
    orders.forEach(o => { if (kitchenOrders[o.status] !== undefined) kitchenOrders[o.status].push(o); });
    setEl('stat-delivered', (kitchenOrders.delivered || []).length);
    renderKitchenBoard();
  } catch (e) { console.error('Kitchen refresh:', e); }
}
function initKitchenSocket() {
  socket.emit('join', 'kitchen');

  // Staff login notification — all dashboards get the popup
  socket.on('staff:login', (data) => {
    playAlert();
    showLoginPopup(data);
  });

  // New order arrives → popup + add to received column
  socket.on('order:new', (order) => {
    playAlert();
    const items = order.items.map(i => `• ${i.name} — Ksh ${i.price.toLocaleString()}`).join('<br>');
    showEventPopup({
      icon:     '🔔',
      title:    'New Order',
      headline: `Order #${order.id}`,
      details:  `${items}${order.note ? `<br><em>📝 ${order.note}</em>` : ''}<br><strong>Total: Ksh ${order.total.toLocaleString()}</strong>`
    });
    kitchenOrders.received.unshift(order);
    renderKitchenBoard();
  });

  // Any order status change → re-sort
  socket.on('order:updated', (order) => {
    ['received','preparing','ready','delivered'].forEach(s => {
      kitchenOrders[s] = (kitchenOrders[s] || []).filter(o => o.id !== order.id);
    });
    if (['received','preparing','ready'].includes(order.status)) {
      kitchenOrders[order.status].unshift(order);
      toast(`Order #${order.id} → ${order.status}`);
    }
    renderKitchenBoard();
  });

  // Customer cancelled order — remove from board immediately
  socket.on('order:cancelled', ({ id }) => {
    ['received','preparing','ready','delivered'].forEach(s => {
      kitchenOrders[s] = (kitchenOrders[s] || []).filter(o => o.id !== id);
    });
    toast(`Order #${id} was cancelled`);
    renderKitchenBoard();
  });
}

// ════════════════════════════════════════════
//  WAITER DASHBOARD
// ════════════════════════════════════════════
let readyOrders      = [];
let allTableBookings = [];

function renderReadyOrder(order) {
  const items = order.items.map(i => `<li>${i.name}</li>`).join('');
  return `
    <div class="order-card" id="order-${order.id}">
      <div class="order-card-header">
        <span class="order-id">Order #${order.id}</span>
        <span class="order-time">${timeAgo(order.created_at)}</span>
      </div>
      <ul class="order-items-list">${items}</ul>
      <div class="order-total">Ksh ${order.total.toLocaleString()}</div>
      <div class="order-actions">
        <button class="action-btn btn-deliver" onclick="updateOrderStatus(${order.id},'delivered')">🍽️ Delivered</button>
      </div>
    </div>`;
}

function renderTableBooking(b) {
  return `
    <div class="booking-card" id="tbooking-${b.id}">
      <div class="booking-card-header">
        <span class="booking-name">${b.name}</span>
        ${statusBadge(b.status)}
      </div>
      <div class="booking-meta">
        <span>📅 ${b.date} at ${b.time}</span>
        <span>👥 ${b.guests} guests &nbsp;•&nbsp; ${b.seating}</span>
        <span>📞 ${b.phone}</span>
      </div>
      ${b.status === 'pending' ? `
      <div class="booking-actions">
        <button class="action-btn btn-confirm" onclick="updateTableStatus(${b.id},'confirmed')">✅ Confirm</button>
        <button class="action-btn btn-cancel"  onclick="updateTableStatus(${b.id},'cancelled')">✕ Cancel</button>
      </div>` : ''}
    </div>`;
}

function renderWaiterBoard(bookingFilter = 'all') {
  const readyEl = document.getElementById('ready-orders');
  if (readyEl) {
    readyEl.innerHTML = readyOrders.length
      ? readyOrders.map(renderReadyOrder).join('')
      : '<div class="empty-state">No orders ready yet</div>';
  }

  const filtered = bookingFilter === 'all'
    ? allTableBookings
    : allTableBookings.filter(b => b.status === bookingFilter);
  const bookEl = document.getElementById('table-bookings');
  if (bookEl) {
    bookEl.innerHTML = filtered.length
      ? filtered.map(renderTableBooking).join('')
      : '<div class="empty-state">No bookings found</div>';
  }

  setEl('stat-ready',          readyOrders.length);
  setEl('stat-tables',         allTableBookings.length);
  setEl('stat-pending-tables', allTableBookings.filter(b => b.status === 'pending').length);
}

function filterBookings(filter, btn) {
  document.querySelectorAll('.filter-tabs .ftab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderWaiterBoard(filter);
}

async function refreshWaiter() {
  try {
    const [orders, bookings] = await Promise.all([apiGet('/orders'), apiGet('/bookings/table')]);
    readyOrders      = orders.filter(o => o.status === 'ready');
    allTableBookings = bookings;
    setEl('stat-delivered', orders.filter(o => o.status === 'delivered').length);
    renderWaiterBoard();
  } catch (e) { console.error('Waiter refresh:', e); }
}

function initWaiterSocket() {
  socket.emit('join', 'waiter');

  // Staff login notification — all dashboards get the popup
  socket.on('staff:login', (data) => {
    playAlert();
    showLoginPopup(data);
  });

  // New order placed by customer — show popup alert to waiter
  socket.on('order:new', (order) => {
    playAlert();
    const items = order.items.map(i => `• ${i.name} — Ksh ${i.price.toLocaleString()}`).join('<br>');
    showEventPopup({
      icon:     '🔔',
      title:    'New Order Placed',
      headline: `Order #${order.id}`,
      details:  `${items}${order.note ? `<br><em>📝 ${order.note}</em>` : ''}<br><strong>Total: Ksh ${order.total.toLocaleString()}</strong>`
    });
  });

  // Kitchen marked order ready — popup alert waiter
  socket.on('order:ready', (order) => {
    playAlert();
    const items = order.items.map(i => `• ${i.name}`).join('<br>');
    showEventPopup({
      icon:     '✅',
      title:    'Order Ready to Serve',
      headline: `Order #${order.id}`,
      details:  `${items}<br><strong>Ksh ${order.total.toLocaleString()}</strong>`
    });
    if (!readyOrders.find(o => o.id === order.id)) {
      readyOrders.unshift(order);
      renderWaiterBoard();
    }
  });

  // Any order update
  socket.on('order:updated', (order) => {
    readyOrders = readyOrders.filter(o => o.id !== order.id);
    if (order.status === 'ready') readyOrders.unshift(order);
    renderWaiterBoard();
  });

  // Customer cancelled order — remove from ready list if it was there
  socket.on('order:cancelled', ({ id }) => {
    readyOrders = readyOrders.filter(o => o.id !== id);
    toast(`Order #${id} was cancelled`);
    renderWaiterBoard();
  });

  // New table booking — popup
  socket.on('booking:table:new', (booking) => {
    playAlert();
    showEventPopup({
      icon:     '📋',
      title:    'New Table Booking',
      headline: booking.name,
      details:  `📅 ${booking.date} at ${booking.time}<br>👥 ${booking.guests} guests • ${booking.seating}<br>📞 ${booking.phone}`
    });
    allTableBookings.unshift(booking);
    renderWaiterBoard();
  });

  // Booking status changed
  socket.on('booking:table:updated', (booking) => {
    const idx = allTableBookings.findIndex(b => b.id === booking.id);
    if (idx !== -1) allTableBookings[idx] = booking;
    else allTableBookings.unshift(booking);
    renderWaiterBoard();
  });
}

// ════════════════════════════════════════════
//  MANAGER DASHBOARD
// ════════════════════════════════════════════
let allOrders   = [];
let allMgTables = [];
let allMgRooms  = [];
let mgOrderFilter = 'all';
let mgTableFilter = 'all';
let mgRoomFilter  = 'all';

function calcKPIs() {
  const revenue = allOrders.reduce((s, o) => s + o.total, 0);
  const roomRevenue = allMgRooms.reduce((r, b) => {
    const nights = Math.ceil((new Date(b.check_out) - new Date(b.check_in)) / (1000 * 60 * 60 * 24));
    return r + (b.price * (isNaN(nights) ? 0 : nights));
  }, 0);
  const pendingAll = allMgTables.filter(b => b.status === 'pending').length
                   + allMgRooms.filter(b => b.status === 'pending').length;

  setEl('kpi-total-orders',   allOrders.length);
  setEl('kpi-revenue',        `Ksh ${revenue.toLocaleString()}`);
  setEl('kpi-table-bookings', allMgTables.length);
  setEl('kpi-room-bookings',  allMgRooms.length);
  setEl('kpi-room-revenue',   `Ksh ${roomRevenue.toLocaleString()}`);
  setEl('kpi-pending',        pendingAll);
}

function renderManagerOrder(o) {
  const items = o.items.map(i => i.name).join(', ');
  return `
    <div class="order-card" id="order-${o.id}">
      <div class="order-card-header">
        <span class="order-id">Order #${o.id}</span>
        ${statusBadge(o.status)}
      </div>
      <div style="font-size:.82rem;color:var(--text-muted);margin-bottom:.4rem">${items}</div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:.75rem;color:var(--text-muted)">${formatTime(o.created_at)}</span>
        <span class="order-total" style="margin:0">Ksh ${o.total.toLocaleString()}</span>
      </div>
    </div>`;
}

function renderMgTableBooking(b) {
  return `
    <div class="booking-card" id="tbooking-${b.id}">
      <div class="booking-card-header">
        <span class="booking-name">${b.name}</span>
        ${statusBadge(b.status)}
      </div>
      <div class="booking-meta">
        <span>📅 ${b.date} ${b.time} &nbsp;•&nbsp; 👥 ${b.guests}</span>
        <span>📞 ${b.phone} &nbsp;•&nbsp; ${b.seating}</span>
      </div>
      ${b.status === 'pending' ? `
      <div class="booking-actions">
        <button class="action-btn btn-confirm" onclick="updateTableStatus(${b.id},'confirmed')">✅ Confirm</button>
        <button class="action-btn btn-cancel"  onclick="updateTableStatus(${b.id},'cancelled')">✕ Cancel</button>
      </div>` : ''}
    </div>`;
}

function renderMgRoomBooking(b) {
  const nights = Math.ceil((new Date(b.check_out) - new Date(b.check_in)) / (1000 * 60 * 60 * 24));
  const cost   = isNaN(nights) ? 0 : b.price * nights;
  return `
    <div class="booking-card" id="rbooking-${b.id}">
      <div class="booking-card-header">
        <span class="booking-name">${b.name}</span>
        ${statusBadge(b.status)}
      </div>
      <div class="booking-meta">
        <span>🛏️ ${b.room_name}</span>
        <span>📅 ${b.check_in} → ${b.check_out} (${isNaN(nights) ? '?' : nights} night${nights !== 1 ? 's' : ''})</span>
        <span>📞 ${b.phone} &nbsp;•&nbsp; 💰 Ksh ${cost.toLocaleString()}</span>
      </div>
      ${b.status === 'pending' ? `
      <div class="booking-actions">
        <button class="action-btn btn-confirm" onclick="updateRoomStatus(${b.id},'confirmed')">✅ Confirm</button>
        <button class="action-btn btn-cancel"  onclick="updateRoomStatus(${b.id},'cancelled')">✕ Cancel</button>
      </div>` : ''}
    </div>`;
}

function renderManagerBoard() {
  calcKPIs();

  // Orders
  const filtOrders = mgOrderFilter === 'all' ? allOrders : allOrders.filter(o => o.status === mgOrderFilter);
  const ordEl = document.getElementById('all-orders');
  if (ordEl) ordEl.innerHTML = filtOrders.length ? filtOrders.map(renderManagerOrder).join('') : '<div class="empty-state">No orders found</div>';

  // Tables
  const filtTables = mgTableFilter === 'all' ? allMgTables : allMgTables.filter(b => b.status === mgTableFilter);
  const tblEl = document.getElementById('mg-table-bookings');
  if (tblEl) tblEl.innerHTML = filtTables.length ? filtTables.map(renderMgTableBooking).join('') : '<div class="empty-state">No table bookings</div>';

  // Rooms
  const filtRooms = mgRoomFilter === 'all' ? allMgRooms : allMgRooms.filter(b => b.status === mgRoomFilter);
  const rmEl = document.getElementById('mg-room-bookings');
  if (rmEl) rmEl.innerHTML = filtRooms.length ? filtRooms.map(renderMgRoomBooking).join('') : '<div class="empty-state">No room bookings</div>';
}

function mgFilterOrders(filter, btn) {
  mgOrderFilter = filter;
  btn.closest('.filter-tabs').querySelectorAll('.ftab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderManagerBoard();
}
function mgFilterTables(filter, btn) {
  mgTableFilter = filter;
  btn.closest('.filter-tabs').querySelectorAll('.ftab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderManagerBoard();
}
function mgFilterRooms(filter, btn) {
  mgRoomFilter = filter;
  btn.closest('.filter-tabs').querySelectorAll('.ftab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderManagerBoard();
}

async function refreshManager() {
  try {
    const [orders, tables, rooms, stats] = await Promise.all([
      apiGet('/orders'),
      apiGet('/bookings/table'),
      apiGet('/bookings/room'),
      apiGet('/stats')
    ]);
    allOrders   = orders;
    allMgTables = tables;
    allMgRooms  = rooms;

    // KPIs from dedicated stats endpoint
    setEl('kpi-total-orders',   stats.orders.total);
    setEl('kpi-revenue',        `Ksh ${stats.orders.revenue.toLocaleString()}`);
    setEl('kpi-table-bookings', stats.tables.total);
    setEl('kpi-room-bookings',  stats.rooms.total);
    setEl('kpi-room-revenue',   `Ksh ${stats.rooms.revenue.toLocaleString()}`);
    setEl('kpi-pending',        stats.tables.pending + stats.rooms.pending);

    renderManagerBoard();
  } catch (e) { console.error('Manager refresh:', e); }
}

// ── EVENT POPUP NOTIFICATION ──
(function injectEventPopupStyles() {
  const style = document.createElement('style');
  style.textContent = `
    #event-popup-overlay {
      position: fixed; inset: 0; z-index: 9998;
      background: rgba(15,35,24,.6); backdrop-filter: blur(3px);
      display: flex; align-items: center; justify-content: center;
      opacity: 0; pointer-events: none;
      transition: opacity .3s ease;
    }
    #event-popup-overlay.show { opacity: 1; pointer-events: all; }

    #event-popup {
      background: var(--cream, #faf6ee);
      border: 2px solid var(--gold, #c9a84c);
      border-radius: 16px;
      box-shadow: 0 32px 80px rgba(0,0,0,.5);
      width: 100%; max-width: 400px; margin: 1rem;
      padding: 2rem 2rem 1.5rem;
      text-align: center;
      transform: translateY(24px) scale(.96);
      transition: transform .3s ease;
    }
    #event-popup-overlay.show #event-popup { transform: translateY(0) scale(1); }

    .ep-icon  { font-size: 3rem; margin-bottom: .5rem; display: block; }
    .ep-title {
      font-family: 'Cinzel', serif; font-size: .9rem;
      letter-spacing: .15em; color: var(--text-muted, #6a5a4a);
      text-transform: uppercase; margin-bottom: .4rem;
    }
    .ep-headline {
      font-family: 'Cormorant Garamond', serif; font-size: 1.6rem;
      font-weight: 700; color: var(--green-dark, #0f2318);
      margin-bottom: .5rem;
    }
    .ep-details {
      font-size: .82rem; color: var(--text-muted, #6a5a4a);
      line-height: 1.6; margin-bottom: 1.4rem;
      background: rgba(15,35,24,.05); border-radius: 8px; padding: .7rem 1rem;
    }
    .ep-close {
      background: var(--green-dark, #0f2318); color: var(--gold, #c9a84c);
      border: 1px solid var(--gold, #c9a84c); border-radius: 6px;
      padding: .55rem 2rem; font-size: .8rem; font-weight: 700;
      letter-spacing: .12em; text-transform: uppercase; cursor: pointer;
      transition: background .2s;
    }
    .ep-close:hover { background: var(--green-light, #2a5a3a); }
  `;
  document.head.appendChild(style);
})();

function showEventPopup({ icon, title, headline, details }) {
  let overlay = document.getElementById('event-popup-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'event-popup-overlay';
    overlay.innerHTML = `
      <div id="event-popup">
        <span class="ep-icon"  id="ep-icon"></span>
        <div class="ep-title"  id="ep-title"></div>
        <div class="ep-headline" id="ep-headline"></div>
        <div class="ep-details"  id="ep-details"></div>
        <button class="ep-close" onclick="closeEventPopup()">Got it</button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeEventPopup(); });
  }

  document.getElementById('ep-icon').textContent     = icon;
  document.getElementById('ep-title').textContent    = title;
  document.getElementById('ep-headline').textContent = headline;
  document.getElementById('ep-details').innerHTML    = details;

  overlay.classList.add('show');

  // Auto-dismiss after 8 seconds
  clearTimeout(overlay._autoClose);
  overlay._autoClose = setTimeout(closeEventPopup, 8000);
}

function closeEventPopup() {
  const overlay = document.getElementById('event-popup-overlay');
  if (overlay) overlay.classList.remove('show');
}
window.closeEventPopup = closeEventPopup;

// ── STAFF LOGIN POPUP MODAL ──
(function injectLoginPopupStyles() {
  const style = document.createElement('style');
  style.textContent = `
    #login-popup-overlay {
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(15,35,24,.65); backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      opacity: 0; pointer-events: none;
      transition: opacity .3s ease;
    }
    #login-popup-overlay.show { opacity: 1; pointer-events: all; }

    #login-popup {
      background: var(--cream, #faf6ee);
      border: 2px solid var(--gold, #c9a84c);
      border-radius: 16px;
      box-shadow: 0 32px 80px rgba(0,0,0,.5);
      width: 100%; max-width: 380px; margin: 1rem;
      padding: 2rem 2rem 1.5rem;
      text-align: center;
      transform: translateY(24px) scale(.96);
      transition: transform .3s ease;
    }
    #login-popup-overlay.show #login-popup { transform: translateY(0) scale(1); }

    .lp-icon  { font-size: 3rem; margin-bottom: .5rem; display: block; }
    .lp-title {
      font-family: 'Cinzel', serif; font-size: 1rem;
      letter-spacing: .15em; color: var(--green-dark, #0f2318);
      text-transform: uppercase; margin-bottom: .3rem;
    }
    .lp-name  {
      font-family: 'Cormorant Garamond', serif; font-size: 1.7rem;
      font-weight: 700; color: var(--green-dark, #0f2318);
      margin-bottom: .2rem;
    }
    .lp-role  {
      display: inline-block; font-size: .72rem; font-weight: 700;
      letter-spacing: .12em; text-transform: uppercase;
      padding: .25rem .9rem; border-radius: 20px; margin-bottom: 1rem;
    }
    .lp-role.kitchen { background: rgba(231,76,60,.15); color: #c0392b; border: 1px solid #e74c3c; }
    .lp-role.waiter  { background: rgba(52,152,219,.15); color: #2471a3; border: 1px solid #3498db; }
    .lp-role.manager { background: rgba(201,168,76,.15); color: #7d6010; border: 1px solid #c9a84c; }

    .lp-time  { font-size: .78rem; color: var(--text-muted, #6a5a4a); margin-bottom: 1.4rem; }

    .lp-close {
      background: var(--green-dark, #0f2318); color: var(--gold, #c9a84c);
      border: 1px solid var(--gold, #c9a84c); border-radius: 6px;
      padding: .55rem 2rem; font-size: .8rem; font-weight: 700;
      letter-spacing: .12em; text-transform: uppercase; cursor: pointer;
      transition: background .2s;
    }
    .lp-close:hover { background: var(--green-light, #2a5a3a); }

    .lp-confirm-label {
      font-size: .75rem; font-weight: 700; letter-spacing: .08em;
      text-transform: uppercase; color: var(--text-muted, #6a5a4a);
      margin-bottom: .5rem;
    }
    .lp-input {
      width: 100%; padding: .65rem 1rem;
      border: 1.5px solid var(--border, #e0d8c8); border-radius: 6px;
      font-family: 'Lato', sans-serif; font-size: .9rem;
      color: var(--text, #1a1a1a); background: #fff;
      margin-bottom: .4rem; transition: border-color .2s;
    }
    .lp-input:focus { outline: none; border-color: var(--gold, #c9a84c); }
    .lp-error {
      font-size: .78rem; color: #c0392b; min-height: 1.2rem;
      margin-bottom: .6rem;
    }
  `;
  document.head.appendChild(style);
})();

function showLoginPopup(data) {
  let overlay = document.getElementById('login-popup-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'login-popup-overlay';
    overlay.innerHTML = `
      <div id="login-popup">
        <span class="lp-icon" id="lp-icon"></span>
        <div class="lp-title">Staff Login Alert</div>
        <div class="lp-name" id="lp-name"></div>
        <span class="lp-role" id="lp-role"></span>
        <div class="lp-time" id="lp-time"></div>
        <div class="lp-confirm-label">Type your name to acknowledge:</div>
        <input class="lp-input" id="lp-input" type="text" placeholder="Your name…" autocomplete="off" />
        <div class="lp-error" id="lp-error"></div>
        <button class="lp-close" onclick="closeLoginPopup()">Acknowledge</button>
      </div>`;
    document.body.appendChild(overlay);
    // Block clicking outside to close
    overlay.addEventListener('click', (e) => e.stopPropagation());
  }

  const roleEmoji = { waiter: '🍽️', kitchen: '🍳', manager: '👔' };
  const time = new Date(data.logged_in).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  document.getElementById('lp-icon').textContent  = roleEmoji[data.role] || '👤';
  document.getElementById('lp-name').textContent  = data.name;
  document.getElementById('lp-role').textContent  = data.role;
  document.getElementById('lp-role').className    = `lp-role ${data.role}`;
  document.getElementById('lp-time').textContent  = `Logged in at ${time}`;
  document.getElementById('lp-input').value       = '';
  document.getElementById('lp-error').textContent = '';

  // Enter key to acknowledge
  document.getElementById('lp-input').onkeydown = (e) => { if (e.key === 'Enter') closeLoginPopup(); };

  overlay.classList.add('show');
  setTimeout(() => document.getElementById('lp-input').focus(), 300);
}

function closeLoginPopup() {
  const input   = document.getElementById('lp-input');
  const errorEl = document.getElementById('lp-error');
  if (!input) return;

  const val = input.value.trim();
  if (!val) {
    errorEl.textContent = '⚠️ Please type your name to acknowledge.';
    input.focus();
    return;
  }

  const overlay = document.getElementById('login-popup-overlay');
  if (overlay) overlay.classList.remove('show');
}
window.closeLoginPopup = closeLoginPopup;

// ── STAFF LOGIN ACTIVITY LOG (manager dashboard) ──
let loginActivity = [];

function addLoginActivity(data) {
  loginActivity.unshift(data);
  if (loginActivity.length > 20) loginActivity.pop(); // keep last 20
  renderLoginActivity();
}

function renderLoginActivity() {
  const el = document.getElementById('staff-activity-log');
  if (!el) return;
  if (loginActivity.length === 0) {
    el.innerHTML = '<div class="empty-state">No staff logins yet this session</div>';
    return;
  }
  const roleEmoji = { waiter: '🍽️', kitchen: '🍳', manager: '👔' };
  el.innerHTML = loginActivity.map(d => {
    const time = new Date(d.logged_in).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `
      <div class="activity-item">
        <span class="activity-icon">${roleEmoji[d.role] || '👤'}</span>
        <div class="activity-info">
          <span class="activity-name">${d.name}</span>
          <span class="activity-role">${d.role}</span>
        </div>
        <span class="activity-time">${time}</span>
      </div>`;
  }).join('');
}

function initManagerSocket() {
  socket.emit('join', 'manager');

  // Staff login notification
  socket.on('staff:login', (data) => {
    playAlert();
    showLoginPopup(data);
    addLoginActivity(data);
  });

  socket.on('order:new', (order) => {
    playAlert();
    const items = order.items.map(i => `• ${i.name} — Ksh ${i.price.toLocaleString()}`).join('<br>');
    showEventPopup({
      icon:     '🔔',
      title:    'New Order',
      headline: `Order #${order.id}`,
      details:  `${items}${order.note ? `<br><em>📝 ${order.note}</em>` : ''}<br><strong>Total: Ksh ${order.total.toLocaleString()}</strong>`
    });
    allOrders.unshift(order);
    renderManagerBoard();
  });

  socket.on('order:updated', (order) => {
    const idx = allOrders.findIndex(o => o.id === order.id);
    if (idx !== -1) allOrders[idx] = order; else allOrders.unshift(order);
    toast(`Order #${order.id} → ${order.status}`);
    renderManagerBoard();
  });

  // Customer cancelled order — remove from list
  socket.on('order:cancelled', ({ id }) => {
    allOrders = allOrders.filter(o => o.id !== id);
    toast(`Order #${id} was cancelled`);
    renderManagerBoard();
  });

  socket.on('booking:table:new', (booking) => {
    playAlert();
    showEventPopup({
      icon:     '📋',
      title:    'New Table Booking',
      headline: booking.name,
      details:  `📅 ${booking.date} at ${booking.time}<br>👥 ${booking.guests} guests • ${booking.seating}<br>📞 ${booking.phone}`
    });
    allMgTables.unshift(booking);
    renderManagerBoard();
  });

  socket.on('booking:table:updated', (booking) => {
    const idx = allMgTables.findIndex(b => b.id === booking.id);
    if (idx !== -1) allMgTables[idx] = booking; else allMgTables.unshift(booking);
    renderManagerBoard();
  });

  socket.on('booking:room:new', (booking) => {
    playAlert();
    showEventPopup({
      icon:     '🛏️',
      title:    'New Room Booking',
      headline: booking.name,
      details:  `🛏️ ${booking.room_name}<br>📅 ${booking.check_in} → ${booking.check_out}<br>👥 ${booking.guests} guest(s) • 📞 ${booking.phone}<br><strong>Ksh ${(booking.total_cost || booking.price).toLocaleString()}</strong>`
    });
    allMgRooms.unshift(booking);
    renderManagerBoard();
  });

  socket.on('booking:room:updated', (booking) => {
    const idx = allMgRooms.findIndex(b => b.id === booking.id);
    if (idx !== -1) allMgRooms[idx] = booking; else allMgRooms.unshift(booking);
    renderManagerBoard();
  });
}

// ════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════
const roleFns = {
  kitchen: { refresh: refreshKitchen, initSocket: initKitchenSocket },
  waiter:  { refresh: refreshWaiter,  initSocket: initWaiterSocket  },
  manager: { refresh: refreshManager, initSocket: initManagerSocket }
};

function initDashboard(role) {
  startClock();

  const { refresh, initSocket } = roleFns[role];

  // Connect Socket.IO
  socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });

  socket.on('connect', () => {
    console.log('⚡ Socket connected:', socket.id);
    initSocket();
    // Initial data load after socket is ready
    refresh();
  });

  socket.on('disconnect', () => {
    toast('⚠️ Connection lost — reconnecting…', 'error');
  });

  socket.on('reconnect', () => {
    toast('✅ Reconnected', 'success');
    refresh();
  });

  socket.on('connect_error', (err) => {
    console.error('Socket error:', err.message);
  });
}

// expose for inline onclick
window.refreshAll = () => {
  const path = location.pathname;
  if (path.includes('kitchen'))      refreshKitchen();
  else if (path.includes('waiter'))  refreshWaiter();
  else                               refreshManager();
};
