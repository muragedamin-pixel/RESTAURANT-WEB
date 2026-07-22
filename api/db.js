const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'restaurant.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// ── MENU TABLE ──
db.exec(`
  CREATE TABLE IF NOT EXISTS menu_items (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT    NOT NULL,
    category  TEXT    NOT NULL CHECK(category IN ('kenyan','continental','drinks','desserts')),
    description TEXT  NOT NULL,
    price     INTEGER NOT NULL,
    emoji     TEXT    NOT NULL,
    available INTEGER NOT NULL DEFAULT 1
  );
`);

// ── ORDERS TABLE ──
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    items        TEXT    NOT NULL,   -- JSON array of {name, price}
    total        INTEGER NOT NULL,
    note         TEXT    DEFAULT '',
    status       TEXT    NOT NULL DEFAULT 'received'
                         CHECK(status IN ('received','preparing','ready','delivered')),
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── TABLE BOOKINGS TABLE ──
db.exec(`
  CREATE TABLE IF NOT EXISTS table_bookings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    phone       TEXT    NOT NULL,
    date        TEXT    NOT NULL,
    time        TEXT    NOT NULL,
    guests      TEXT    NOT NULL,
    seating     TEXT    NOT NULL DEFAULT 'Indoor',
    status      TEXT    NOT NULL DEFAULT 'pending'
                        CHECK(status IN ('pending','confirmed','cancelled')),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── ROOM BOOKINGS TABLE ──
db.exec(`
  CREATE TABLE IF NOT EXISTS room_bookings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    room_name   TEXT    NOT NULL,
    price       INTEGER NOT NULL,
    name        TEXT    NOT NULL,
    phone       TEXT    NOT NULL,
    check_in    TEXT    NOT NULL,
    check_out   TEXT    NOT NULL,
    guests      INTEGER NOT NULL DEFAULT 1,
    status      TEXT    NOT NULL DEFAULT 'pending'
                        CHECK(status IN ('pending','confirmed','cancelled')),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── GUEST CODES TABLE ──
db.exec(`
  CREATE TABLE IF NOT EXISTS guest_codes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT    NOT NULL UNIQUE,
    table_label TEXT    NOT NULL DEFAULT 'Guest',
    used        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    expires_at  TEXT    NOT NULL
  );
`);

// ── USERS TABLE ──
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    email      TEXT    NOT NULL UNIQUE,
    password   TEXT    NOT NULL,
    role       TEXT    NOT NULL DEFAULT 'customer'
               CHECK(role IN ('customer','kitchen','waiter','manager')),
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── SEED MENU if empty ──
const menuCount = db.prepare('SELECT COUNT(*) as c FROM menu_items').get();
if (menuCount.c === 0) {
  const insert = db.prepare(
    'INSERT INTO menu_items (name, category, description, price, emoji) VALUES (?, ?, ?, ?, ?)'
  );
  const seedMenu = db.transaction(() => {
    // Kenyan
    insert.run('Nyama Choma',       'kenyan',      'Slow-roasted seasoned beef, served with kachumbari & ugali', 850,  '🍖');
    insert.run('Pilau wa Nyumbani', 'kenyan',      'Fragrant spiced rice with tender beef, Kenyan style',        550,  '🍛');
    insert.run('Githeri Special',   'kenyan',      'Traditional maize & beans stew with a chef\'s twist',        350,  '🥘');
    insert.run('Tilapia ya Pwani',  'kenyan',      'Whole tilapia, coastal spiced & deep fried, with rice',      750,  '🐟');
    insert.run('Mukimo & Stew',     'kenyan',      'Mashed potato, peas & greens with rich beef stew',           450,  '🫕');
    insert.run('Kuku Kienyeji',     'kenyan',      'Free-range chicken stew with traditional herbs & ugali',     700,  '🍗');
    // Continental
    insert.run('Grilled Sirloin Steak', 'continental', '250g sirloin, garlic butter, mashed potato & greens',   1800, '🥩');
    insert.run('Pasta Carbonara',   'continental', 'Creamy egg-based pasta with pancetta & parmesan',           950,  '🍝');
    insert.run('Salmon Fillet',     'continental', 'Pan-seared salmon, lemon butter sauce, steamed veg',        1600, '🍣');
    insert.run('Caesar Salad',      'continental', 'Romaine, croutons, parmesan, house-made caesar dressing',   650,  '🥗');
    // Drinks
    insert.run('Passion Juice',     'drinks',      'Fresh-squeezed passion fruit, chilled',                     200,  '🍹');
    insert.run('Kenyan AA Coffee',  'drinks',      'Premium AA grade coffee, black or with milk',               250,  '☕');
    insert.run('Dawa Cocktail',     'drinks',      'Kenyan classic — vodka, honey, lime & ginger',              600,  '🧃');
    // Desserts
    insert.run('Maandazi Dessert',  'desserts',    'Warm spiced maandazi with honey & coconut cream',           300,  '🍮');
    insert.run('Chocolate Lava Cake','desserts',   'Warm chocolate cake with molten centre & vanilla ice cream',550,  '🍰');
  });
  seedMenu();
  console.log('✅ Menu seeded with', db.prepare('SELECT COUNT(*) as c FROM menu_items').get().c, 'items');
}

module.exports = db;
