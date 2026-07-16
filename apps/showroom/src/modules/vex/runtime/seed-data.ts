import embeddings from './product-embeddings.json';

// ═══════════════════════════════════════════════════════════
// Browser seed — a faithful port of @niscorp/vex's dev seed
// (packages/vex/scripts/seed.ts) as plain data + SQL builders the
// browser PGlite instance runs at boot. Deterministic UUIDs and
// values, so shape hashes (and thus prewarmed cache entries) are
// stable across runs.
//
// This is the showroom's own copy of the *data*; it deliberately
// does not import anything from the vex package internals.
// ═══════════════════════════════════════════════════════════

const PRODUCT_EMBEDDINGS = embeddings as number[][];

// Deterministic UUIDs — 00000000-0000-4000-8000-{prefix}{padded index}
const uuid = (prefix: string, index: number): string =>
  `00000000-0000-4000-8000-${prefix}${String(index).padStart(4, '0')}`;

const customerUuid = (i: number): string => uuid('c0000000', i);
const categoryUuid = (i: number): string => uuid('ca000000', i);
const productUuid = (i: number): string => uuid('b0000000', i);
const orderUuid = (i: number): string => uuid('00000000', i);
const orderItemUuid = (i: number): string => uuid('01000000', i);
const reviewUuid = (i: number): string => uuid('0e000000', i);
const tagUuid = (i: number): string => uuid('7a000000', i);
const accountUuid = (i: number): string => uuid('ac000000', i);

// The three tenant accounts orders are partitioned across; the scope
// demos switch between these.
export const ACCOUNTS: readonly string[] = [accountUuid(0), accountUuid(1), accountUuid(2)];

// Stable rows the mutation demos target (ids are deterministic, so the
// scenarios can name them). DEMO_ORDER belongs to ACCOUNTS[0] — the pin
// demo flips the account switcher against it.
export const DEMO_CUSTOMER_ID = customerUuid(0); // Alice Johnson
export const DEMO_PRODUCT_ID = productUuid(0); // iPhone 16 Pro
export const DEMO_ORDER_ID = orderUuid(0); // Account A's order

const sql = (s: string): string => s.replace(/'/g, "''");

// ─── DDL ─────────────────────────────────────────────────────

export const DDL = `
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;

CREATE TABLE IF NOT EXISTS customers (
  id          UUID PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',
  total_spent NUMERIC NOT NULL DEFAULT 0,
  order_count INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id          UUID PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,
  description TEXT,
  parent_id   UUID REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS products (
  id          UUID PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  sku         TEXT UNIQUE NOT NULL,
  price       NUMERIC NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT true,
  category_id UUID REFERENCES categories(id),
  embedding   VECTOR(1536),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  status      TEXT NOT NULL DEFAULT 'pending',
  total       NUMERIC NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  account_id  UUID
);

CREATE TABLE IF NOT EXISTS order_items (
  id          UUID PRIMARY KEY,
  order_id    UUID NOT NULL REFERENCES orders(id),
  product_id  UUID NOT NULL REFERENCES products(id),
  quantity    INT NOT NULL DEFAULT 1,
  unit_price  NUMERIC NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id          UUID PRIMARY KEY,
  product_id  UUID NOT NULL REFERENCES products(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  rating      INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tags (
  id   UUID PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS product_tags (
  product_id UUID NOT NULL REFERENCES products(id),
  tag_id     UUID NOT NULL REFERENCES tags(id),
  PRIMARY KEY (product_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_orders_customer_id     ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_account_id      ON orders(account_id);
CREATE INDEX IF NOT EXISTS idx_orders_status          ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id   ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product_id     ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_customer_id    ON reviews(customer_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id   ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active        ON products(active);
CREATE INDEX IF NOT EXISTS idx_products_name_trgm     ON products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_embedding_hnsw ON products USING hnsw (embedding vector_cosine_ops);
`;

// ─── Data ────────────────────────────────────────────────────

const CUSTOMER_NAMES = [
  'Alice Johnson', 'Bob Smith', 'Carol Williams', 'David Brown', 'Eve Davis',
  'Frank Miller', 'Grace Wilson', 'Henry Moore', 'Ivy Taylor', 'Jack Anderson',
  'Karen Thomas', 'Leo Jackson', 'Mia White', 'Noah Harris', 'Olivia Martin',
  'Paul Garcia', 'Quinn Martinez', 'Ruby Robinson', 'Sam Clark', 'Tina Rodriguez',
];
const CUSTOMER_STATUSES = ['active', 'active', 'active', 'inactive', 'suspended'];

const CATEGORY_DATA: Array<{ name: string; description: string; parentIdx: number | null }> = [
  { name: 'Electronics', description: 'Electronic devices and accessories', parentIdx: null },
  { name: 'Clothing', description: 'Apparel and fashion items', parentIdx: null },
  { name: 'Home & Garden', description: 'Home improvement and garden supplies', parentIdx: null },
  { name: 'Books', description: 'Physical and digital books', parentIdx: null },
  { name: 'Sports', description: 'Sports equipment and apparel', parentIdx: null },
  { name: 'Smartphones', description: 'Mobile phones and accessories', parentIdx: 0 },
  { name: 'Laptops', description: 'Portable computers', parentIdx: 0 },
  { name: "Men's Clothing", description: 'Clothing for men', parentIdx: 1 },
  { name: "Women's Clothing", description: 'Clothing for women', parentIdx: 1 },
  { name: 'Outdoor', description: 'Outdoor and camping gear', parentIdx: 4 },
];

const PRODUCT_DATA: Array<{ name: string; description: string; price: number; catIdx: number; active: boolean }> = [
  { name: 'iPhone 16 Pro', description: 'Latest Apple smartphone with A18 chip', price: 999.99, catIdx: 5, active: true },
  { name: 'Samsung Galaxy S25', description: 'Samsung flagship with AI features', price: 899.99, catIdx: 5, active: true },
  { name: 'Google Pixel 9', description: 'Pure Android experience with great camera', price: 799.0, catIdx: 5, active: true },
  { name: 'MacBook Pro 16"', description: 'Apple laptop with M4 Pro chip', price: 2499.0, catIdx: 6, active: true },
  { name: 'Dell XPS 15', description: 'Premium Windows ultrabook', price: 1799.0, catIdx: 6, active: true },
  { name: 'ThinkPad X1 Carbon', description: 'Business ultrabook with excellent keyboard', price: 1599.0, catIdx: 6, active: true },
  { name: 'AirPods Pro 3', description: 'Wireless earbuds with noise cancellation', price: 249.0, catIdx: 0, active: true },
  { name: 'Sony WH-1000XM6', description: 'Over-ear noise cancelling headphones', price: 349.99, catIdx: 0, active: true },
  { name: 'iPad Air M3', description: 'Versatile tablet for work and play', price: 599.0, catIdx: 0, active: true },
  { name: 'Kindle Paperwhite', description: 'E-reader with warm light display', price: 149.99, catIdx: 3, active: true },
  { name: 'Classic Oxford Shirt', description: 'Timeless button-down cotton shirt', price: 59.99, catIdx: 7, active: true },
  { name: 'Slim Fit Chinos', description: 'Comfortable everyday chino pants', price: 49.99, catIdx: 7, active: true },
  { name: 'Wool Blazer', description: 'Tailored wool blend blazer', price: 189.0, catIdx: 7, active: true },
  { name: 'Summer Dress', description: 'Light floral print summer dress', price: 79.99, catIdx: 8, active: true },
  { name: 'Cashmere Sweater', description: 'Luxurious cashmere pullover', price: 199.0, catIdx: 8, active: true },
  { name: 'Running Jacket', description: 'Waterproof lightweight running jacket', price: 129.0, catIdx: 8, active: false },
  { name: 'Garden Tool Set', description: '12-piece stainless steel garden tools', price: 89.99, catIdx: 2, active: true },
  { name: 'LED Desk Lamp', description: 'Adjustable brightness desk lamp', price: 45.99, catIdx: 2, active: true },
  { name: 'Smart Thermostat', description: 'WiFi-enabled programmable thermostat', price: 179.0, catIdx: 2, active: true },
  { name: 'Robot Vacuum', description: 'AI-powered robotic vacuum cleaner', price: 449.0, catIdx: 2, active: true },
  { name: 'Standing Desk', description: 'Electric height-adjustable desk', price: 599.0, catIdx: 2, active: true },
  { name: 'The Great Gatsby', description: 'Classic novel by F. Scott Fitzgerald', price: 12.99, catIdx: 3, active: true },
  { name: '1984', description: 'Dystopian novel by George Orwell', price: 11.99, catIdx: 3, active: true },
  { name: 'Clean Code', description: 'Software craftsmanship by Robert C. Martin', price: 39.99, catIdx: 3, active: true },
  { name: 'Design Patterns', description: 'Elements of reusable OO software', price: 44.99, catIdx: 3, active: true },
  { name: 'DUNE', description: 'Science fiction epic by Frank Herbert', price: 15.99, catIdx: 3, active: false },
  { name: 'Yoga Mat', description: 'Non-slip exercise yoga mat 6mm', price: 29.99, catIdx: 4, active: true },
  { name: 'Resistance Bands Set', description: '5-piece resistance band set', price: 24.99, catIdx: 4, active: true },
  { name: 'Trail Running Shoes', description: 'All-terrain trail running shoes', price: 139.0, catIdx: 9, active: true },
  { name: 'Camping Tent 4P', description: '4-person waterproof camping tent', price: 249.0, catIdx: 9, active: true },
  { name: 'Hiking Backpack 40L', description: 'Ergonomic 40-liter hiking backpack', price: 119.0, catIdx: 9, active: true },
  { name: 'Trekking Poles', description: 'Carbon fiber adjustable trekking poles', price: 79.99, catIdx: 9, active: true },
  { name: 'Sleeping Bag', description: 'Lightweight 3-season sleeping bag', price: 89.0, catIdx: 9, active: true },
  { name: 'USB-C Hub', description: '7-in-1 USB-C multiport adapter', price: 49.99, catIdx: 0, active: true },
  { name: 'Mechanical Keyboard', description: 'Cherry MX Brown mechanical keyboard', price: 129.0, catIdx: 0, active: true },
  { name: 'Wireless Mouse', description: 'Ergonomic wireless mouse with USB-C', price: 59.99, catIdx: 0, active: true },
  { name: '4K Monitor 27"', description: '27-inch IPS 4K HDR monitor', price: 449.0, catIdx: 0, active: true },
  { name: 'Webcam HD', description: '1080p webcam with ring light', price: 69.99, catIdx: 0, active: false },
  { name: 'Portable Charger', description: '20000mAh power bank with fast charge', price: 39.99, catIdx: 0, active: true },
  { name: 'Bluetooth Speaker', description: 'Waterproof portable bluetooth speaker', price: 79.99, catIdx: 0, active: true },
  { name: 'Cotton T-Shirt Pack', description: '3-pack premium cotton crew neck tees', price: 34.99, catIdx: 7, active: true },
  { name: 'Leather Belt', description: 'Genuine leather dress belt', price: 44.99, catIdx: 7, active: true },
  { name: 'Denim Jacket', description: 'Classic wash denim trucker jacket', price: 89.99, catIdx: 7, active: true },
  { name: 'Silk Blouse', description: 'Elegant silk button-up blouse', price: 119.0, catIdx: 8, active: true },
  { name: 'Linen Pants', description: 'Relaxed fit linen trousers', price: 69.99, catIdx: 8, active: true },
  { name: 'Rain Boots', description: 'Waterproof rubber rain boots', price: 54.99, catIdx: 8, active: true },
  { name: 'Cookbook Italian', description: 'Authentic Italian home cooking recipes', price: 29.99, catIdx: 3, active: true },
  { name: 'Water Bottle 1L', description: 'Insulated stainless steel water bottle', price: 24.99, catIdx: 4, active: true },
  { name: 'Dumbbells Set', description: 'Adjustable dumbbells 5-50 lbs', price: 299.0, catIdx: 4, active: true },
  { name: 'Jump Rope', description: 'Speed jump rope with ball bearings', price: 14.99, catIdx: 4, active: true },
];

const REVIEW_COMMENTS = [
  'Excellent product, highly recommend!', 'Good quality for the price.', 'Decent, but could be better.',
  'Not what I expected.', 'Amazing! Will buy again.', 'Works as described.', 'Great value for money.',
  'Solid build quality.', 'A bit overpriced.', 'Perfect for my needs.',
];

const TAG_NAMES = [
  'bestseller', 'new-arrival', 'sale', 'eco-friendly', 'premium', 'limited-edition', 'trending',
  'gift-idea', 'essentials', 'seasonal', 'bundle', 'clearance', 'organic', 'handmade', 'imported',
];

const ORDER_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'delivered', 'delivered', 'cancelled'];

const iso = (i: number, base: number): string => new Date(2025, 0, 1 + i * base).toISOString();

const values = (rows: string[]): string => rows.join(',\n');

// ─── Insert builder ──────────────────────────────────────────

export const buildSeedSql = (): string => {
  const customers = CUSTOMER_NAMES.map((name, i) => {
    const email = `${name.toLowerCase().replace(' ', '.')}@example.com`;
    const status = CUSTOMER_STATUSES[i % CUSTOMER_STATUSES.length];
    const totalSpent = (Math.round((i + 1) * 127.43 * 100) / 100).toFixed(2);
    const orderCount = (i % 7) + 1;
    return `('${customerUuid(i)}','${sql(name)}','${email}','${status}',${totalSpent},${orderCount},'${iso(i, 15)}')`;
  });

  const categories = CATEGORY_DATA.map((c, i) => {
    const parent = c.parentIdx !== null ? `'${categoryUuid(c.parentIdx)}'` : 'NULL';
    return `('${categoryUuid(i)}','${sql(c.name)}','${sql(c.description)}',${parent})`;
  });

  const products = PRODUCT_DATA.map((p, i) => {
    const sku = `SKU-${String(i + 1).padStart(4, '0')}`;
    const emb = PRODUCT_EMBEDDINGS[i] ? `'[${PRODUCT_EMBEDDINGS[i].join(',')}]'` : 'NULL';
    return `('${productUuid(i)}','${sql(p.name)}','${sql(p.description)}','${sku}',${p.price},${p.active},'${categoryUuid(p.catIdx)}',${emb},'${iso(i, 5)}')`;
  });

  const orders: string[] = [];
  for (let i = 0; i < 100; i++) {
    const status = ORDER_STATUSES[i % ORDER_STATUSES.length];
    const total = (Math.round((i + 1) * 43.57 * 100) / 100).toFixed(2);
    orders.push(`('${orderUuid(i)}','${customerUuid(i % 20)}','${status}',${total},'${iso(i, 3)}','${ACCOUNTS[i % 3]}')`);
  }

  const orderItems: string[] = [];
  for (let i = 0; i < 200; i++) {
    const price = PRODUCT_DATA[i % 50]?.price ?? 0;
    orderItems.push(`('${orderItemUuid(i)}','${orderUuid(i % 100)}','${productUuid(i % 50)}',${(i % 5) + 1},${price})`);
  }

  const reviews: string[] = [];
  for (let i = 0; i < 80; i++) {
    const comment = REVIEW_COMMENTS[i % REVIEW_COMMENTS.length] ?? '';
    reviews.push(`('${reviewUuid(i)}','${productUuid(i % 50)}','${customerUuid(i % 20)}',${(i % 5) + 1},'${sql(comment)}','${new Date(2025, 2, 1 + i * 4).toISOString()}')`);
  }

  const tags = TAG_NAMES.map((name, i) => `('${tagUuid(i)}','${name}')`);

  const productTags: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 60; i++) {
    const key = `${i % 50}-${i % 15}`;
    if (seen.has(key)) continue;
    seen.add(key);
    productTags.push(`('${productUuid(i % 50)}','${tagUuid(i % 15)}')`);
  }

  return [
    `INSERT INTO customers (id,name,email,status,total_spent,order_count,created_at) VALUES ${values(customers)} ON CONFLICT DO NOTHING;`,
    `INSERT INTO categories (id,name,description,parent_id) VALUES ${values(categories)} ON CONFLICT DO NOTHING;`,
    `INSERT INTO products (id,name,description,sku,price,active,category_id,embedding,created_at) VALUES ${values(products)} ON CONFLICT DO NOTHING;`,
    `INSERT INTO orders (id,customer_id,status,total,created_at,account_id) VALUES ${values(orders)} ON CONFLICT DO NOTHING;`,
    `INSERT INTO order_items (id,order_id,product_id,quantity,unit_price) VALUES ${values(orderItems)} ON CONFLICT DO NOTHING;`,
    `INSERT INTO reviews (id,product_id,customer_id,rating,comment,created_at) VALUES ${values(reviews)} ON CONFLICT DO NOTHING;`,
    `INSERT INTO tags (id,name) VALUES ${values(tags)} ON CONFLICT DO NOTHING;`,
    `INSERT INTO product_tags (product_id,tag_id) VALUES ${values(productTags)} ON CONFLICT DO NOTHING;`,
  ].join('\n');
};
