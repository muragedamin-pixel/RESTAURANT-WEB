// ── CONFIG ──
const API         = 'http://localhost:3000/api';
const SOCKET_URL  = 'http://localhost:3000';

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
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function apiPatch(path, body) {
  const res = await fetch(`${API}${path}`, {
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

  // New order arrives → add to received column
  socket.on('order:new', (order) => {
    playAlert();
    toast(`🔔 New order #${order.id} — ${order.items.length} item(s)`, 'info');
    kitchenOrders.received.unshift(order);
    renderKitchenBoard();
  });

  // Any order status change → re-sort
  socket.on('order:updated', (order) => {
    // Remove from all columns
    ['received','preparing','ready','delivered'].forEach(s => {
      kitchenOrders[s] = (kitchenOrders[s] || []).filter(o => o.id !== order.id);
    });
    // Place in correct column (kitchen only cares about received/preparing/ready)
    if (['received','preparing','ready'].includes(order.status)) {
      kitchenOrders[order.status].unshift(order);
      toast(`Order #${order.id} → ${order.status}`);
    }
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

  // Kitchen marked order ready — alert waiter
  socket.on('order:ready', (order) => {
    playAlert();
    toast(`✅ Order #${order.id} is ready to serve!`, 'success');
    if (!readyOrders.find(o => o.id === order.id)) {
      readyOrders.unshift(order);
      renderWaiterBoard();
    }
  });

  // Any order update (e.g. delivered by another waiter tab)
  socket.on('order:updated', (order) => {
    readyOrders = readyOrders.filter(o => o.id !== order.id);
    if (order.status === 'ready') readyOrders.unshift(order);
    renderWaiterBoard();
  });

  // New table booking
  socket.on('booking:table:new', (booking) => {
    playAlert();
    toast(`📋 New table booking from ${booking.name}`, 'info');
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
    const [orders, tables, rooms] = await Promise.all([
      apiGet('/orders'), apiGet('/bookings/table'), apiGet('/bookings/room')
    ]);
    allOrders   = orders;
    allMgTables = tables;
    allMgRooms  = rooms;
    renderManagerBoard();
  } catch (e) { console.error('Manager refresh:', e); }
}

function initManagerSocket() {
  socket.emit('join', 'manager');

  socket.on('order:new', (order) => {
    playAlert();
    toast(`🔔 New order #${order.id} — Ksh ${order.total.toLocaleString()}`, 'info');
    allOrders.unshift(order);
    renderManagerBoard();
  });

  socket.on('order:updated', (order) => {
    const idx = allOrders.findIndex(o => o.id === order.id);
    if (idx !== -1) allOrders[idx] = order; else allOrders.unshift(order);
    toast(`Order #${order.id} → ${order.status}`);
    renderManagerBoard();
  });

  socket.on('booking:table:new', (booking) => {
    playAlert();
    toast(`📋 New table booking — ${booking.name}`, 'info');
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
    toast(`🛏️ New room booking — ${booking.name}`, 'info');
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
