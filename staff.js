// ── CONFIG ──
const API = 'http://localhost:3000/api';
const POLL_INTERVAL = 8000; // refresh every 8 seconds

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
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
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

// ── API CALLS ──
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

// ── STATUS UPDATE HELPERS ──
async function updateOrderStatus(id, status, onSuccess) {
  try {
    await apiPatch(`/orders/${id}/status`, { status });
    toast(`Order #${id} → ${status}`);
    if (onSuccess) onSuccess();
  } catch (e) {
    toast('⚠️ Failed to update order');
  }
}

async function updateTableStatus(id, status, onSuccess) {
  try {
    await apiPatch(`/bookings/table/${id}/status`, { status });
    toast(`Booking #${id} → ${status}`);
    if (onSuccess) onSuccess();
  } catch (e) {
    toast('⚠️ Failed to update booking');
  }
}

async function updateRoomStatus(id, status, onSuccess) {
  try {
    await apiPatch(`/bookings/room/${id}/status`, { status });
    toast(`Room booking #${id} → ${status}`);
    if (onSuccess) onSuccess();
  } catch (e) {
    toast('⚠️ Failed to update room booking');
  }
}

// ════════════════════════════════════════════
//  KITCHEN DASHBOARD
// ════════════════════════════════════════════
function renderKitchenOrder(order, targetStatus) {
  const items = order.items.map(i => `<li>${i.name} — Ksh ${i.price.toLocaleString()}</li>`).join('');
  const noteHtml = order.note ? `<div class="order-note">📝 ${order.note}</div>` : '';

  let actionsHtml = '';
  if (targetStatus === 'received') {
    actionsHtml = `<button class="action-btn btn-start" onclick="updateOrderStatus(${order.id},'preparing', refreshKitchen)">🔥 Start Cooking</button>`;
  } else if (targetStatus === 'preparing') {
    actionsHtml = `<button class="action-btn btn-ready" onclick="updateOrderStatus(${order.id},'ready', refreshKitchen)">✅ Mark Ready</button>`;
  } else if (targetStatus === 'ready') {
    actionsHtml = `<span style="font-size:.8rem;color:var(--success);font-weight:700">⏳ Waiting for waiter...</span>`;
  }

  return `
    <div class="order-card">
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

async function refreshKitchen() {
  try {
    const orders = await apiGet('/orders');
    const cols   = { received: [], preparing: [], ready: [], delivered: [] };
    orders.forEach(o => { if (cols[o.status]) cols[o.status].push(o); });

    ['received', 'preparing', 'ready'].forEach(status => {
      const el = document.getElementById(`col-${status}-cards`);
      const counter = document.getElementById(`col-${status}`);
      if (!el) return;
      const list = cols[status];
      counter.textContent = list.length;
      el.innerHTML = list.length
        ? list.map(o => renderKitchenOrder(o, status)).join('')
        : '<div class="empty-state">No orders here</div>';
    });

    // stats
    document.getElementById('stat-received').textContent  = cols.received.length;
    document.getElementById('stat-preparing').textContent = cols.preparing.length;
    document.getElementById('stat-ready').textContent     = cols.ready.length;
    document.getElementById('stat-delivered').textContent = cols.delivered.length;
  } catch (e) {
    console.error('Kitchen refresh error:', e);
  }
}

// ════════════════════════════════════════════
//  WAITER DASHBOARD
// ════════════════════════════════════════════
let allTableBookings = [];

function renderReadyOrder(order) {
  const items = order.items.map(i => `<li>${i.name}</li>`).join('');
  return `
    <div class="order-card">
      <div class="order-card-header">
        <span class="order-id">Order #${order.id}</span>
        <span class="order-time">${timeAgo(order.created_at)}</span>
      </div>
      <ul class="order-items-list">${items}</ul>
      <div class="order-total">Ksh ${order.total.toLocaleString()}</div>
      <div class="order-actions">
        <button class="action-btn btn-deliver" onclick="updateOrderStatus(${order.id},'delivered', refreshWaiter)">🍽️ Delivered</button>
      </div>
    </div>`;
}

function renderTableBooking(b) {
  return `
    <div class="booking-card">
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
        <button class="action-btn btn-confirm" onclick="updateTableStatus(${b.id},'confirmed', refreshWaiter)">✅ Confirm</button>
        <button class="action-btn btn-cancel"  onclick="updateTableStatus(${b.id},'cancelled', refreshWaiter)">✕ Cancel</button>
      </div>` : ''}
    </div>`;
}

function filterBookings(filter, btn) {
  document.querySelectorAll('.filter-tabs .ftab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const filtered = filter === 'all'
    ? allTableBookings
    : allTableBookings.filter(b => b.status === filter);
  const el = document.getElementById('table-bookings');
  el.innerHTML = filtered.length
    ? filtered.map(renderTableBooking).join('')
    : '<div class="empty-state">No bookings found</div>';
}

async function refreshWaiter() {
  try {
    const [orders, bookings] = await Promise.all([
      apiGet('/orders'),
      apiGet('/bookings/table')
    ]);

    const ready     = orders.filter(o => o.status === 'ready');
    const delivered = orders.filter(o => o.status === 'delivered');
    allTableBookings = bookings;

    // stats
    document.getElementById('stat-ready').textContent          = ready.length;
    document.getElementById('stat-tables').textContent         = bookings.length;
    document.getElementById('stat-pending-tables').textContent = bookings.filter(b => b.status === 'pending').length;
    document.getElementById('stat-delivered').textContent      = delivered.length;

    // ready orders
    const readyEl = document.getElementById('ready-orders');
    readyEl.innerHTML = ready.length
      ? ready.map(renderReadyOrder).join('')
      : '<div class="empty-state">No orders ready yet</div>';

    // bookings — keep current filter
    const activeTab = document.querySelector('#table-bookings')?.closest('.waiter-section')
      ?.querySelector('.ftab.active')?.textContent?.toLowerCase();
    const filter = activeTab === 'all' || !activeTab ? 'all' : activeTab;
    const filtered = filter === 'all' ? bookings : bookings.filter(b => b.status === filter);
    document.getElementById('table-bookings').innerHTML = filtered.length
      ? filtered.map(renderTableBooking).join('')
      : '<div class="empty-state">No bookings found</div>';

  } catch (e) {
    console.error('Waiter refresh error:', e);
  }
}

// ════════════════════════════════════════════
//  MANAGER DASHBOARD
// ════════════════════════════════════════════
let allOrders  = [];
let allMgTables = [];
let allMgRooms  = [];

function renderManagerOrder(o) {
  const items = o.items.map(i => i.name).join(', ');
  return `
    <div class="order-card">
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
    <div class="booking-card">
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
        <button class="action-btn btn-confirm" onclick="updateTableStatus(${b.id},'confirmed', refreshManager)">✅ Confirm</button>
        <button class="action-btn btn-cancel"  onclick="updateTableStatus(${b.id},'cancelled', refreshManager)">✕ Cancel</button>
      </div>` : ''}
    </div>`;
}

function renderMgRoomBooking(b) {
  const nights = Math.ceil((new Date(b.check_out) - new Date(b.check_in)) / (1000 * 60 * 60 * 24));
  return `
    <div class="booking-card">
      <div class="booking-card-header">
        <span class="booking-name">${b.name}</span>
        ${statusBadge(b.status)}
      </div>
      <div class="booking-meta">
        <span>🛏️ ${b.room_name}</span>
        <span>📅 ${b.check_in} → ${b.check_out} (${nights} night${nights !== 1 ? 's' : ''})</span>
        <span>📞 ${b.phone} &nbsp;•&nbsp; 💰 Ksh ${(b.price * nights).toLocaleString()}</span>
      </div>
      ${b.status === 'pending' ? `
      <div class="booking-actions">
        <button class="action-btn btn-confirm" onclick="updateRoomStatus(${b.id},'confirmed', refreshManager)">✅ Confirm</button>
        <button class="action-btn btn-cancel"  onclick="updateRoomStatus(${b.id},'cancelled', refreshManager)">✕ Cancel</button>
      </div>` : ''}
    </div>`;
}

function mgFilterOrders(filter, btn) {
  document.querySelectorAll('#all-orders')
    .forEach(el => el.closest('.manager-section')
    ?.querySelectorAll('.ftab').forEach(b => b.classList.remove('active')));
  btn.classList.add('active');
  const filtered = filter === 'all' ? allOrders : allOrders.filter(o => o.status === filter);
  document.getElementById('all-orders').innerHTML = filtered.length
    ? filtered.map(renderManagerOrder).join('')
    : '<div class="empty-state">No orders found</div>';
}

function mgFilterTables(filter, btn) {
  btn.closest('.filter-tabs').querySelectorAll('.ftab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const filtered = filter === 'all' ? allMgTables : allMgTables.filter(b => b.status === filter);
  document.getElementById('mg-table-bookings').innerHTML = filtered.length
    ? filtered.map(renderMgTableBooking).join('')
    : '<div class="empty-state">No bookings found</div>';
}

function mgFilterRooms(filter, btn) {
  btn.closest('.filter-tabs').querySelectorAll('.ftab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const filtered = filter === 'all' ? allMgRooms : allMgRooms.filter(b => b.status === filter);
  document.getElementById('mg-room-bookings').innerHTML = filtered.length
    ? filtered.map(renderMgRoomBooking).join('')
    : '<div class="empty-state">No bookings found</div>';
}

async function refreshManager() {
  try {
    const [orders, tables, rooms] = await Promise.all([
      apiGet('/orders'),
      apiGet('/bookings/table'),
      apiGet('/bookings/room')
    ]);

    allOrders   = orders;
    allMgTables = tables;
    allMgRooms  = rooms;

    // KPIs
    const revenue = orders.reduce((s, o) => s + o.total, 0);
    const roomRevenue = rooms.reduce((r, b) => {
      const nights = Math.ceil((new Date(b.check_out) - new Date(b.check_in)) / (1000 * 60 * 60 * 24));
      return r + (b.price * nights);
    }, 0);
    const pendingAll = tables.filter(b => b.status === 'pending').length
                     + rooms.filter(b => b.status === 'pending').length;

    document.getElementById('kpi-total-orders').textContent   = orders.length;
    document.getElementById('kpi-revenue').textContent        = `Ksh ${revenue.toLocaleString()}`;
    document.getElementById('kpi-table-bookings').textContent = tables.length;
    document.getElementById('kpi-room-bookings').textContent  = rooms.length;
    document.getElementById('kpi-room-revenue').textContent   = `Ksh ${roomRevenue.toLocaleString()}`;
    document.getElementById('kpi-pending').textContent        = pendingAll;

    // Orders list
    document.getElementById('all-orders').innerHTML = orders.length
      ? orders.map(renderManagerOrder).join('')
      : '<div class="empty-state">No orders yet</div>';

    // Table bookings
    document.getElementById('mg-table-bookings').innerHTML = tables.length
      ? tables.map(renderMgTableBooking).join('')
      : '<div class="empty-state">No table bookings yet</div>';

    // Room bookings
    document.getElementById('mg-room-bookings').innerHTML = rooms.length
      ? rooms.map(renderMgRoomBooking).join('')
      : '<div class="empty-state">No room bookings yet</div>';

  } catch (e) {
    console.error('Manager refresh error:', e);
  }
}

// ════════════════════════════════════════════
//  INIT — called per page
// ════════════════════════════════════════════
function initDashboard(role) {
  startClock();

  const refreshFn = {
    kitchen: refreshKitchen,
    waiter:  refreshWaiter,
    manager: refreshManager
  }[role];

  if (!refreshFn) return;

  // initial load
  refreshFn();

  // auto-poll
  setInterval(refreshFn, POLL_INTERVAL);
}

// expose for inline onclick
window.refreshAll     = () => {
  const path = location.pathname;
  if (path.includes('kitchen')) refreshKitchen();
  else if (path.includes('waiter')) refreshWaiter();
  else refreshManager();
};
