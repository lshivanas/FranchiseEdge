# FranchiseEdge

FranchiseEdge is an HTML5, CSS3 and AngularJS 1.x application backed by a native Node.js HTTP API and the official MongoDB Node.js driver. MongoDB is the persistent source of truth for franchises, products, inventory and orders.

## Run it

1. Start MongoDB locally, then copy `.env.example` to `.env` if you need different settings.
2. Run `npm install`.
3. Run `npm start` and open `http://localhost:3000`.

Required environment settings:

```text
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_CONTROL_DB=franchise_control
```

The application creates collections and indexes when it connects. It does not create demonstration records: create franchises, products and inventory through the interface or API.

## Collections

`franchises`, `products`, `inventory`, `orders`, and `order_items` are initialized. Order items are embedded in each order because they belong to exactly one order; `order_items` is retained as an available collection for integrations that require it.

Inventory links `franchiseId` and `productId` using ObjectIds. The API validates every supplied ObjectId. Codes are unique, and the database enforces unique franchise/product codes and franchise/product inventory pairs.

## API

| Resource | Endpoints |
| --- | --- |
| Franchises | `GET, POST /api/franchises`; `GET, PUT, DELETE /api/franchises/:id` |
| Products | `GET, POST /api/products`; `GET, PUT, DELETE /api/products/:id` |
| Inventory | `GET, POST /api/inventory`; `GET /api/inventory/franchise/:franchiseId`; `PUT /api/inventory/:id`; `POST /api/inventory/stock-in`; `POST /api/inventory/stock-out` |
| Orders | `GET, POST /api/orders`; `GET, PUT, DELETE /api/orders/:id`; `PUT /api/orders/:id/status` |
| Dashboard | `GET /api/dashboard` |

List endpoints support `search` and the relevant `status` query parameter. All responses contain a `success` flag and use ObjectId strings as `id` values.

## Order and inventory safety

The server ignores browser-submitted prices and totals. It reads the active products and current inventory itself, calculates totals, and decrements stock with conditional atomic updates. On a replica set, order creation runs in a MongoDB transaction. A standalone development server cannot run multi-document transactions; its compatible path still prevents negative stock through atomic stock predicates. Use a replica set for all-or-nothing order/inventory commits in production.

## Verification checklist

- Create, edit, search, filter and deactivate franchises and products.
- Add inventory, stock in, stock out, and confirm an insufficient stock request is rejected.
- Create a multi-product order and confirm totals and stock changes after success.
- Change an order status and check dashboard figures.
- Restart Node.js and reload the browser; MongoDB records remain available.
