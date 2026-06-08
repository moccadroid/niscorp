const BASE = process.env['VEX_URL'] ?? 'http://localhost:3456';

type Scenario = {
  name: string;
  method: 'GET' | 'POST';
  endpoint: string;
  body?: Record<string, unknown>;
  cacheable: boolean;
  expect: (result: Record<string, unknown>) => string | null;
  expectCached?: (result: Record<string, unknown>) => string | null;
};

const request = async (endpoint: string, method: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> => {
  const res = await fetch(`${BASE}${endpoint}`, {
    method,
    ...(body && {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  });
  return res.json() as Promise<Record<string, unknown>>;
};

const scenarios: Scenario[] = [
  {
    name: 'discovery',
    method: 'GET',
    endpoint: '/api/customers/vex',
    cacheable: false,
    expect: (r) => {
      if (r['vex'] !== '1.0') return `vex version: ${r['vex']}`;
      if (!Array.isArray(r['entities'])) return 'entities missing';
      return null;
    },
  },
  {
    name: 'missing-shape',
    method: 'POST',
    endpoint: '/api/customers/vex',
    body: { context: {} },
    cacheable: false,
    expect: (r) => {
      if (r['error'] !== 'invalid_request') return `expected invalid_request, got ${r['error']}`;
      return null;
    },
  },
  {
    name: 'top-customers',
    method: 'POST',
    endpoint: '/api/customers/vex',
    cacheable: true,
    body: {
      intent: 'top 3 customers by total spent',
      shape: [{ id: '', name: '', total_spent: 0 }],
      context: {},
    },
    expect: (r) => {
      const rows = r['result'] as unknown[];
      if (!Array.isArray(rows) || rows.length !== 3) return `expected 3 rows, got ${Array.isArray(rows) ? rows.length : typeof rows}`;
      const first = rows[0] as Record<string, unknown>;
      if (typeof first['name'] !== 'string' || first['name'] === '') return `name missing`;
      if (typeof first['total_spent'] !== 'number') return `total_spent not a number`;
      return null;
    },
  },
  {
    name: 'customer-by-id',
    method: 'POST',
    endpoint: '/api/customers/vex',
    cacheable: true,
    body: {
      intent: 'get customer by id',
      shape: [{ id: '', name: '', email: '' }],
      context: { customerId: '00000000-0000-4000-8000-c00000000005' },
    },
    expect: (r) => {
      const rows = r['result'] as Record<string, unknown>[];
      if (!Array.isArray(rows) || rows.length === 0) return 'no rows';
      if (rows[0]!['name'] !== 'Frank Miller') return `expected Frank Miller, got ${rows[0]!['name']}`;
      const meta = r['meta'] as Record<string, unknown>;
      const ctx = meta['context'] as Record<string, unknown>;
      if (!ctx['customerId']) return 'context contract missing customerId';
      return null;
    },
    expectCached: (r) => {
      const rows = r['result'] as Record<string, unknown>[];
      if (!Array.isArray(rows) || rows.length === 0) return 'no rows';
      if (rows[0]!['name'] !== 'Mia White') return `expected Mia White, got ${rows[0]!['name']}`;
      return null;
    },
  },
  {
    name: 'recent-orders',
    method: 'POST',
    endpoint: '/api/orders/vex',
    cacheable: true,
    body: {
      intent: '5 most recent orders with their total',
      shape: [{ id: '', status: '', total: 0, created_at: '' }],
      context: {},
    },
    expect: (r) => {
      const rows = r['result'] as Record<string, unknown>[];
      if (!Array.isArray(rows) || rows.length !== 5) return `expected 5 rows, got ${Array.isArray(rows) ? rows.length : typeof rows}`;
      if (typeof rows[0]!['total'] !== 'number') return `total not a number`;
      return null;
    },
  },
  {
    name: 'orders-by-status',
    method: 'POST',
    endpoint: '/api/orders/vex',
    cacheable: true,
    body: {
      intent: 'count of orders grouped by status',
      shape: [{ status: '', count: 0 }],
      context: {},
    },
    expect: (r) => {
      const rows = r['result'] as Record<string, unknown>[];
      if (!Array.isArray(rows) || rows.length < 3) return `expected >= 3 groups, got ${Array.isArray(rows) ? rows.length : typeof rows}`;
      const statuses = rows.map(row => row['status']);
      if (!statuses.includes('delivered')) return `missing 'delivered'`;
      return null;
    },
  },
  {
    name: 'customers-above-threshold',
    method: 'POST',
    endpoint: '/api/customers/vex',
    cacheable: true,
    body: {
      intent: 'customers who spent more than 2000',
      shape: [{ name: '', total_spent: 0 }],
      context: {},
    },
    expect: (r) => {
      const rows = r['result'] as Record<string, unknown>[];
      if (!Array.isArray(rows) || rows.length === 0) return 'no rows';
      const bad = rows.find(row => (row['total_spent'] as number) <= 2000);
      if (bad) return `row with total_spent ${bad['total_spent']} <= 2000`;
      return null;
    },
  },
  {
    name: 'cheapest-products',
    method: 'POST',
    endpoint: '/api/products/vex',
    cacheable: true,
    body: {
      intent: 'cheapest 5 active products with name',
      shape: [{ name: '', price: 0 }],
      context: {},
    },
    expect: (r) => {
      const rows = r['result'] as Record<string, unknown>[];
      if (!Array.isArray(rows) || rows.length !== 5) return `expected 5 rows, got ${Array.isArray(rows) ? rows.length : typeof rows}`;
      if (typeof rows[0]!['name'] !== 'string' || rows[0]!['name'] === '') return `name empty`;
      if (typeof rows[0]!['price'] !== 'number') return `price not a number`;
      return null;
    },
  },
  {
    name: 'semantic-similar-products',
    method: 'POST',
    endpoint: '/api/products/vex',
    cacheable: true,
    body: {
      intent: 'find products most similar to the search query, top 5',
      shape: [{ name: '', price: 0 }],
      context: { searchQuery: 'wireless noise-cancelling headphones' },
    },
    expect: (r) => {
      const rows = r['result'] as Record<string, unknown>[];
      if (!Array.isArray(rows) || rows.length === 0) return 'no rows';
      if (rows.length > 5) return `expected <= 5 rows, got ${rows.length}`;
      const first = rows[0]!['name'] as string;
      if (!first.toLowerCase().includes('airpods') && !first.toLowerCase().includes('sony') && !first.toLowerCase().includes('headphone'))
        return `expected audio product first, got "${first}"`;
      return null;
    },
    expectCached: (r) => {
      const rows = r['result'] as Record<string, unknown>[];
      if (!Array.isArray(rows) || rows.length === 0) return 'no rows';
      const names = rows.map(row => (row['name'] as string).toLowerCase());
      const hasCamping = names.some(n => n.includes('camping') || n.includes('hiking') || n.includes('tent') || n.includes('backpack'));
      if (!hasCamping) return `expected camping products, got ${names.join(', ')}`;
      return null;
    },
  },
  {
    name: 'avg-rating-per-category',
    method: 'POST',
    endpoint: '/api/vex',
    cacheable: true,
    body: {
      intent: 'average product rating per category name',
      shape: [{ category: '', avg_rating: 0 }],
      context: {},
    },
    expect: (r) => {
      const rows = r['result'] as Record<string, unknown>[];
      if (!Array.isArray(rows) || rows.length < 3) return `expected >= 3 categories`;
      if (typeof rows[0]!['avg_rating'] !== 'number') return `avg_rating not a number`;
      return null;
    },
  },
];

type Timing = { agentMs?: number; executionMs?: number; mappingMs?: number };
type CacheMeta = { hit: boolean };
type Result = { name: string; status: 'PASS' | 'FAIL'; ms: number; error?: string; timing?: Timing; cache?: CacheMeta };

const extractMeta = (response: Record<string, unknown>) => {
  const meta = response['meta'] as Record<string, unknown> | undefined;
  return {
    timing: meta?.['timing'] as Timing | undefined,
    cache: meta?.['cache'] as CacheMeta | undefined,
  };
};

const fmtMs = (v?: number) => v !== undefined ? `${v}ms` : '—';

const printResults = (results: Result[]) => {
  const nameWidth = Math.max(...results.map(r => r.name.length));
  for (const r of results) {
    const icon = r.status === 'PASS' ? 'PASS' : 'FAIL';
    const breakdown = r.timing
      ? `  query:${fmtMs(r.timing.agentMs).padStart(7)}  sql:${fmtMs(r.timing.executionMs).padStart(5)}  map:${fmtMs(r.timing.mappingMs).padStart(7)}  cache:${r.cache?.hit ? 'hit' : 'miss'}`
      : '';
    const line = `  ${icon}  ${r.name.padEnd(nameWidth)}  ${String(r.ms).padStart(6)}ms${breakdown}`;
    console.log(r.error ? `${line}  ${r.error}` : line);
  }
};

const run = async (filter?: string) => {
  const selected = filter
    ? scenarios.filter(s => s.name.includes(filter))
    : scenarios;

  if (selected.length === 0) {
    console.log(`No scenarios match "${filter}"`);
    process.exit(1);
  }

  console.log(`\n  vex integration tests — ${BASE}\n`);

  const results: Result[] = [];
  const cachedResults: Result[] = [];

  for (const scenario of selected) {
    // First run
    const t0 = Date.now();
    try {
      const response = await request(scenario.endpoint, scenario.method, scenario.body);
      const ms = Date.now() - t0;
      const { timing, cache } = extractMeta(response);
      const err = scenario.expect(response);
      results.push(err
        ? { name: scenario.name, status: 'FAIL', ms, error: err, timing, cache }
        : { name: scenario.name, status: 'PASS', ms, timing, cache },
      );
    } catch (e) {
      const ms = Date.now() - t0;
      results.push({ name: scenario.name, status: 'FAIL', ms, error: e instanceof Error ? e.message : String(e) });
    }

    // Cache run (same scenario, immediately after)
    if (!scenario.cacheable) continue;

    const cachedBody = scenario.name === 'customer-by-id'
      ? { ...scenario.body, context: { customerId: '00000000-0000-4000-8000-c00000000012' } }
      : scenario.name === 'semantic-similar-products'
      ? { ...scenario.body, context: { searchQuery: 'hiking and camping equipment' } }
      : scenario.body;
    const validate = scenario.expectCached ?? scenario.expect;
    const label = `${scenario.name} (cached)`;

    const t1 = Date.now();
    try {
      const response = await request(scenario.endpoint, scenario.method, cachedBody);
      const ms = Date.now() - t1;
      const { timing, cache } = extractMeta(response);

      if (!cache?.hit) {
        cachedResults.push({ name: label, status: 'FAIL', ms, error: 'expected cache hit', timing, cache });
        continue;
      }

      const err = validate(response);
      cachedResults.push(err
        ? { name: label, status: 'FAIL', ms, error: err, timing, cache }
        : { name: label, status: 'PASS', ms, timing, cache },
      );
    } catch (e) {
      const ms = Date.now() - t1;
      cachedResults.push({ name: label, status: 'FAIL', ms, error: e instanceof Error ? e.message : String(e) });
    }
  }

  printResults(results);
  if (cachedResults.length > 0) {
    console.log('');
    printResults(cachedResults);
  }

  const all = [...results, ...cachedResults];
  const passed = all.filter(r => r.status === 'PASS').length;
  const failed = all.filter(r => r.status === 'FAIL').length;
  const totalMs = all.reduce((s, r) => s + r.ms, 0);

  console.log(`\n  ${passed} passed, ${failed} failed (${(totalMs / 1000).toFixed(1)}s)\n`);
  process.exit(failed > 0 ? 1 : 0);
};

run(process.argv[2]);
