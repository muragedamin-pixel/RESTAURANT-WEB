// ── API BASE URL ──
// Change this to your deployed API URL in production
const API_BASE = 'http://localhost:3000/api';

// ── SPLASH ──
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
  try {
    const res  = await fetch(`${API_BASE}/menu?category=${category}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Failed to load menu');

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
    menuGrid.innerHTML = `<p class="empty-msg">⚠️ Could not load menu. Please try again.</p>`;
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

  const note = document.getElementById('order-note').value;
  const btn  = document.querySelector('#order-footer .btn-primary');
  btn.textContent = 'Placing order…';
  btn.disabled    = true;

  try {
    const res  = await fetch(`${API_BASE}/orders`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ items: [...orderCart], note })
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Order failed');

    orderCart.length = 0;
    renderOrder();
    document.getElementById('order-note').value = '';
    document.getElementById('order-modal').classList.add('open');
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
