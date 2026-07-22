# REAL Restaurant API

Node.js + Express + SQLite backend for the REAL Restaurant & Hotel website.

## Setup

```bash
cd api
npm install
npm start        # production
npm run dev      # development with auto-reload
```

Server runs on **http://localhost:3000**

---

## Endpoints

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server health check |

### Menu
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/menu` | All menu items (grouped by category) |
| GET | `/api/menu?category=kenyan` | Filter by category: `kenyan`, `continental`, `drinks`, `desserts` |
| GET | `/api/menu/:id` | Single menu item |

### Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/orders` | Place a new order |
| GET | `/api/orders` | List all orders |
| GET | `/api/orders/:id` | Single order |
| PATCH | `/api/orders/:id/status` | Update order status |

**POST /api/orders body:**
```json
{
  "items": [
    { "name": "Nyama Choma", "price": 850 },
    { "name": "Passion Juice", "price": 200 }
  ],
  "note": "Table 4, no onions"
}
```

### Table Bookings
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/bookings/table` | Reserve a table |
| GET | `/api/bookings/table` | List all table reservations |
| GET | `/api/bookings/table/:id` | Single reservation |
| PATCH | `/api/bookings/table/:id/status` | Update status: `pending`, `confirmed`, `cancelled` |

**POST /api/bookings/table body:**
```json
{
  "name": "John Kamau",
  "phone": "0712345678",
  "date": "2026-08-01",
  "time": "19:00",
  "guests": "4",
  "seating": "Indoor"
}
```

### Room Bookings
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/bookings/room` | Book a hotel room |
| GET | `/api/bookings/room` | List all room bookings |
| GET | `/api/bookings/room/:id` | Single booking |
| PATCH | `/api/bookings/room/:id/status` | Update status: `pending`, `confirmed`, `cancelled` |

**POST /api/bookings/room body:**
```json
{
  "room_name": "Deluxe Suite",
  "price": 9800,
  "name": "Jane Wanjiku",
  "phone": "0722222222",
  "check_in": "2026-08-05",
  "check_out": "2026-08-08",
  "guests": 2
}
```

---

## Environment Variables

Create `api/.env`:
```
PORT=3000
FRONTEND_ORIGIN=*
```

Set `FRONTEND_ORIGIN` to your frontend domain in production (e.g. `https://yourdomain.com`).
