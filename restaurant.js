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
const mtabs = document.querySelectorAll('.mtab');
const menuCards = document.querySelectorAll('.menu-card');

mtabs.forEach(tab => {
  tab.addEventListener('click', () => {
    mtabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const cat = tab.dataset.cat;
    menuCards.forEach(c => c.classList.toggle('hidden', c.dataset.cat !== cat));
    // re-wire add buttons after filter
    wireAddButtons();
  });
});

// ── ORDER CART ──
const orderCart = [];

function wireAddButtons() {
  document.querySelectorAll('.add-order').forEach(btn => {
    btn.onclick = () => {
      const name = btn.dataset.name;
      const price = parseInt(btn.dataset.price);
      orderCart.push({ name, price });
      renderOrder();
      btn.textContent = '✓ Added';
      btn.classList.add('added');
      setTimeout(() => { btn.textContent = '+ Add'; btn.classList.remove('added'); }, 1500);
    };
  });
}
wireAddButtons();

function renderOrder() {
  const itemsEl = document.getElementById('order-items');
  const footerEl = document.getElementById('order-footer');
  const totalEl = document.getElementById('order-total');
  const countEl = document.getElementById('cart-count');

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

function placeOrder() {
  if (!orderCart.length) return;
  orderCart.length = 0;
  renderOrder();
  document.getElementById('order-modal').classList.add('open');
}

// ── TABLE BOOKING ──
document.getElementById('table-form').addEventListener('submit', e => {
  e.preventDefault();
  document.getElementById('table-success').textContent = '✅ Table reserved! We\'ll confirm via phone shortly.';
  e.target.reset();
});

// ── ROOM BOOKING ──
let currentRoom = '';
function openRoomBook(name, price) {
  currentRoom = name;
  document.getElementById('room-modal-title').textContent = 'Book — ' + name;
  document.getElementById('room-modal-price').textContent = 'Ksh ' + price.toLocaleString();
  document.getElementById('room-success').textContent = '';
  document.getElementById('room-modal').classList.add('open');
}
function closeRoomBook() {
  document.getElementById('room-modal').classList.remove('open');
}
function confirmRoomBook() {
  const name = document.getElementById('rm-name').value;
  const phone = document.getElementById('rm-phone').value;
  const inDate = document.getElementById('rm-in').value;
  const outDate = document.getElementById('rm-out').value;
  if (!name || !phone || !inDate || !outDate) {
    document.getElementById('room-success').textContent = '⚠️ Please fill in all fields.';
    document.getElementById('room-success').style.color = '#cc4444';
    return;
  }
  document.getElementById('room-success').textContent = `✅ ${currentRoom} booked for ${name}! Confirmation will be sent to ${phone}.`;
  document.getElementById('room-success').style.color = 'var(--green)';
}

// ── SCROLL NAV HIGHLIGHT ──
window.addEventListener('scroll', () => {
  const nav = document.getElementById('navbar');
  nav.style.boxShadow = window.scrollY > 50 ? '0 2px 20px rgba(0,0,0,.3)' : 'none';
});
