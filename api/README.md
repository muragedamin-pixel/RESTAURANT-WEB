# REAL Restaurant API

**Base URL:** `https://real-restaurant-api-production.up.railway.app/api`

Real-time events powered by **Socket.IO** on the same origin.

---

## Authentication

All protected routes require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <token>
```

Tokens are obtained via `/api/auth/login` or `/api/auth/register`.

### Roles
| Role | Description |
|---|---|
| `customer` | Logged-in customer — can place, view, and cancel their own orders/bookings |
| `waiter` | Can view/update orders (ready→delivered) and table bookings |
| `kitchen` | Can view/update orders (received→preparing→ready) |
| `manager` | Full access to all orders, bookings, staff activity, and stats |

---

## Auth Endpoints

### `POST /auth/register`
Register a new customer account.

**Body:**
```json
{ "name": "Jane Doe", "email": "jane@example.com", "password": "secret123" }
```
**Response:** `201` `{ token, user }`

---

### `POST /auth/login`
Login as any user (customer or staff).

**Body:**
```json
{ "email": "jane@example.com", "password": "secret123" }
```
**Response:** `200` `{ token, user }`

Emits **`staff:login`** socket event to all staff rooms when a staff member logs in.

---

### `GET /auth/me`
Verify token and return current user.

**Auth:** Required  
**Response:** `200` `{ id, name, email, role }`

---

### `POST /auth/guest-token`
Generate a QR code token for a table (staff only).

**Auth:** Required (waiter or manager)  
**Body:** `{ "table_label": "Table 4" }`  
**Response:** `{ code, url, qr (base64 PNG), expires_at }`

---

### `GET /auth/verify/:code`
Customer scans QR — verifies code and returns a session token.

**Public**  
**Response:** `{ token, user, table }`

---

## Orders

### `POST /orders`
Place a new order.

**Auth:** Required (customer, waiter, kitchen, or manager)  
**Body:**
```json
{
  "items": [
    { "name": "Nyama Choma", "price": 850 },
    { "name": "Passion Juice", "price": 200 }
  ],
  "note": "Table 3 — no onions"
}
```
**Response:** `201` `{ message, order }`

Emits **`order:new`** to `kitchen`, `waiter`, and `manager` rooms.

---

### `GET /orders/my`
Get the logged-in customer's own orders.

**Auth:** Required (any role)  
**Response:** `200` Array of orders

---

### `GET /orders/:id`
Get a single order by ID.

**Auth:** Required — owner or staff  
**Response:** `200` Order object

---

### `GET /orders`
Get all orders (staff only).

**Auth:** Required (kitchen, waiter, or manager)  
**Query:** `?status=received|preparing|ready|delivered`  
**Response:** `200` Array of orders

---

### `PATCH /orders/:id/status`
Update an order's status (staff only).

**Auth:** Required (kitchen, waiter, or manager)  
**Body:** `{ "status": "preparing" }`  
Valid values: `received` → `preparing` → `ready` → `delivered`  
**Response:** `200` `{ message, order }`

Emits **`order:updated`** to all staff rooms and `customer` room.  
Also emits **`order:ready`** to `waiter` room when status becomes `ready`.

---

### `DELETE /orders/:id`
Cancel an order.

**Auth:** Required — owner (only if status is `received`) or staff  
**Response:** `200` `{ message }`

Emits **`order:cancelled`** to `kitchen`, `waiter`, and `manager` rooms.

---

## Table Bookings

### `POST /bookings/table`
Place a table booking. Saves `user_id` if logged in.

**Public** (auth optional — saves user link if token provided)  
**Body:**
```json
{
  "name": "John Doe",
  "phone": "0712345678",
  "date": "2026-12-25",
  "time": "19:00",
  "guests": "4",
  "seating": "Outdoor"
}
```
**Response:** `201` `{ message, booking }`

Emits **`booking:table:new`** to `waiter` and `manager` rooms.

---

### `GET /bookings/table/my`
Get the logged-in customer's own table bookings.

**Auth:** Required (any role)  
**Response:** `200` Array of bookings

---

### `GET /bookings/table`
Get all table bookings (staff only).

**Auth:** Required (waiter or manager)  
**Query:** `?status=pending|confirmed|cancelled`  
**Response:** `200` Array of bookings

---

### `GET /bookings/table/:id`
Get a single table booking.

**Auth:** Required — owner or staff  
**Response:** `200` Booking object

---

### `PATCH /bookings/table/:id/status`
Update a table booking status (staff only).

**Auth:** Required (waiter or manager)  
**Body:** `{ "status": "confirmed" }`  
Valid values: `pending`, `confirmed`, `cancelled`  
**Response:** `200` `{ message, booking }`

Emits **`booking:table:updated`** to `waiter` and `manager` rooms.

---

### `DELETE /bookings/table/:id`
Cancel a table booking.

**Auth:** Required — owner (only if status is `pending`) or staff  
**Response:** `200` `{ message, booking }`

Emits **`booking:table:updated`** to `waiter` and `manager` rooms.

---

## Room Bookings

### `POST /bookings/room`
Book a hotel room. Saves `user_id` if logged in.

**Public** (auth optional)  
**Body:**
```json
{
  "room_name": "Deluxe Suite",
  "price": 8500,
  "name": "Jane Doe",
  "phone": "0712345678",
  "check_in": "2026-12-24",
  "check_out": "2026-12-26",
  "guests": 2
}
```
**Response:** `201` `{ message, booking, summary: { nights, total_cost } }`

Emits **`booking:room:new`** to `manager` room.

---

### `GET /bookings/room/my`
Get the logged-in customer's own room bookings.

**Auth:** Required (any role)  
**Response:** `200` Array of room bookings

---

### `GET /bookings/room`
Get all room bookings (manager only).

**Auth:** Required (manager)  
**Query:** `?status=pending|confirmed|cancelled`  
**Response:** `200` Array of room bookings

---

### `GET /bookings/room/:id`
Get a single room booking.

**Auth:** Required — owner or manager  
**Response:** `200` Room booking object

---

### `PATCH /bookings/room/:id/status`
Update a room booking status (manager only).

**Auth:** Required (manager)  
**Body:** `{ "status": "confirmed" }`  
**Response:** `200` `{ message, booking }`

Emits **`booking:room:updated`** to `manager` room.

---

### `DELETE /bookings/room/:id`
Cancel a room booking.

**Auth:** Required — owner (only if status is `pending`) or manager  
**Response:** `200` `{ message, booking }`

---

## Staff Endpoints (`/api/staff/*`)

All routes under `/api/staff` require auth with role `kitchen`, `waiter`, or `manager`.

### Orders
| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/staff/orders` | kitchen/waiter/manager | All orders, optional `?status=` filter |
| `GET` | `/staff/orders/:id` | kitchen/waiter/manager | Single order |
| `PATCH` | `/staff/orders/:id/status` | kitchen/waiter/manager | Update order status |

### Table Bookings
| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/staff/bookings/table` | waiter/manager | All table bookings |
| `GET` | `/staff/bookings/table/:id` | waiter/manager | Single table booking |
| `PATCH` | `/staff/bookings/table/:id/status` | waiter/manager | Update table booking status |

### Room Bookings
| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/staff/bookings/room` | manager | All room bookings |
| `GET` | `/staff/bookings/room/:id` | manager | Single room booking |
| `PATCH` | `/staff/bookings/room/:id/status` | manager | Update room booking status |

### Stats
| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/staff/stats` | manager | Dashboard KPIs — orders, table bookings, room bookings, revenue |

**Stats response shape:**
```json
{
  "orders":  { "total": 0, "received": 0, "preparing": 0, "ready": 0, "delivered": 0, "revenue": 0 },
  "tables":  { "total": 0, "pending": 0, "confirmed": 0, "cancelled": 0 },
  "rooms":   { "total": 0, "pending": 0, "confirmed": 0, "cancelled": 0, "revenue": 0 }
}
```

---

## Menu

### `GET /menu`
Get all available menu items.

**Public**  
**Query:** `?category=kenyan|continental|drinks|desserts`  
**Response:** `{ items: [...], grouped: { kenyan: [...], ... } }`

### `GET /menu/:id`
Get a single menu item.

**Public**  
**Response:** Menu item object

---

## Real-Time Events (Socket.IO)

Connect to the socket server at the base URL. After connecting, join a room:

```js
socket.emit('join', 'kitchen')   // or 'waiter', 'manager', 'customer'
```

### Events by Room

#### `kitchen` room
| Event | Payload | Description |
|---|---|---|
| `order:new` | order object | New order placed |
| `order:updated` | order object | Order status changed |
| `order:cancelled` | `{ id }` | Order cancelled by customer |
| `staff:login` | `{ name, role, logged_in }` | A staff member logged in |

#### `waiter` room
| Event | Payload | Description |
|---|---|---|
| `order:new` | order object | New order placed |
| `order:updated` | order object | Order status changed |
| `order:ready` | order object | Order is ready to serve (duplicate of updated for alert purposes) |
| `order:cancelled` | `{ id }` | Order cancelled by customer |
| `booking:table:new` | booking object | New table booking placed |
| `booking:table:updated` | booking object | Table booking status changed |
| `staff:login` | `{ name, role, logged_in }` | A staff member logged in |

#### `manager` room
| Event | Payload | Description |
|---|---|---|
| `order:new` | order object | New order placed |
| `order:updated` | order object | Order status changed |
| `order:cancelled` | `{ id }` | Order cancelled by customer |
| `booking:table:new` | booking object | New table booking |
| `booking:table:updated` | booking object | Table booking updated |
| `booking:room:new` | booking object | New room booking |
| `booking:room:updated` | booking object | Room booking updated |
| `staff:login` | `{ name, role, logged_in }` | A staff member logged in |

#### `customer` room
| Event | Payload | Description |
|---|---|---|
| `order:updated` | order object | Customer's order status changed |
| `order:cancelled` | `{ id }` | Order was cancelled |

---

## Default Staff Credentials

| Role | Email | Password |
|---|---|---|
| Manager | `manager@realrestaurant.com` | `manager@realrestaurant.com` |
| Waiter | `waiter@realrestaurant.com` | `waiter@realrestaurant.com` |

> ⚠️ Change these passwords in production.

---

## Health Check

### `GET /health`
**Public** — Returns server status.
```json
{ "status": "ok", "timestamp": "2026-08-03T10:00:00.000Z" }
```
