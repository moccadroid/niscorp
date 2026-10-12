const mulberry = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const FIRST = ['Grace', 'Ada', 'Alan', 'Edsger', 'Barbara', 'Donald', 'Margaret', 'Linus', 'Radia', 'Ken', 'Frances', 'Dennis'];
const LAST = ['Hopper', 'Lovelace', 'Turing', 'Dijkstra', 'Liskov', 'Knuth', 'Hamilton', 'Torvalds', 'Perlman', 'Thompson', 'Allen', 'Ritchie'];
const PLACES = [
  ['Vienna', 'AT'], ['Graz', 'AT'], ['Berlin', 'DE'], ['Munich', 'DE'], ['Hamburg', 'DE'], ['Zurich', 'CH'],
  ['Paris', 'FR'], ['Lyon', 'FR'], ['Milan', 'IT'], ['Madrid', 'ES'], ['Lisbon', 'PT'], ['Prague', 'CZ'],
];
const TIERS = ['gold', 'silver', 'silver', 'bronze', 'bronze', 'bronze'];
const STATUSES = ['paid', 'paid', 'paid', 'paid', 'pending', 'refunded', 'cancelled'];
const PRODUCTS = [
  ['MUG-01', 'Enamel mug', 1400], ['TEE-02', 'Logo tee', 2400], ['CAP-03', 'Dad cap', 1900], ['BAG-04', 'Tote bag', 1600],
  ['PIN-05', 'Pin set', 800], ['HOO-06', 'Zip hoodie', 5200], ['SOC-07', 'Wool socks', 1200], ['NOT-08', 'Notebook', 900],
];
const SHIPPING = [0, 0, 490, 490, 790, 1290];
const COUPONS = [null, null, null, 'WELCOME10', 'SPRING'];
const NOTES = ['Leave at the door', 'Gift wrap, please', 'Ring twice'];

const pad = (n, width) => String(n).padStart(width, '0');

export const makeOrder = (index, seed = 1) => {
  const random = mulberry(seed * 100003 + index);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const first = pick(FIRST);
  const last = pick(LAST);
  const [city, country] = pick(PLACES);
  const lines = 1 + Math.floor(random() * 4);
  const start = Math.floor(random() * PRODUCTS.length);
  const items = [];
  for (let line = 0; line < lines; line += 1) {
    const [sku, title, unitCents] = PRODUCTS[(start + line) % PRODUCTS.length];
    items.push({ sku, title, qty: 1 + Math.floor(random() * 4), unitCents });
  }
  // Unique, and never later than the tasks' "now".
  const placedAt = new Date(Date.UTC(2026, 8, 30, 23, 59, 0) - index * 37 * 60_000 - Math.floor(random() * 50) * 1000).toISOString().replace('.000Z', 'Z');
  const order = {
    id: `o-${pad(index + 1, 6)}`,
    status: pick(STATUSES),
    placedAt,
    customer: { id: `c-${pad(Math.floor(random() * 5000), 4)}`, name: `${first} ${last}`, email: `${first}.${last}@example.com`.toLowerCase(), tier: pick(TIERS), address: { city, country } },
    items,
    shippingCents: pick(SHIPPING),
    couponCode: pick(COUPONS),
  };
  if (random() < 0.34) order.notes = pick(NOTES);
  return order;
};

export const makeOrders = (count, seed = 1) => Array.from({ length: count }, (_, index) => makeOrder(index, seed));

export const NOW = '2026-10-01T00:00:00Z';
