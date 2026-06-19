// Deterministic seed generator. A fixed-seed PRNG produces the same
// coherent dataset on every boot — stable for demos and screenshots.
// Emits one SQL string; the bootstrap runs it after the DDL.
//
// "Coherent" means the relationships hold: contacts belong to real
// companies, deals reference real contacts, activities and tasks hang off
// real deals, and the timeline clusters around "today" (2026-06-13) so
// overdue/today/upcoming tasks and recent activity all look real.

const TODAY = new Date('2026-06-13T12:00:00.000Z');

// ─── PRNG (mulberry32) ───────────────────────────────────────
const makeRng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const rng = makeRng(0x5e1f);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]!;
const int = (min: number, max: number): number => min + Math.floor(rng() * (max - min + 1));
const chance = (p: number): boolean => rng() < p;
const id = (prefix: string, n: number): string => `${prefix}_${String(n).padStart(3, '0')}`;
const some = <T>(xs: readonly T[], min: number, max: number): T[] => {
  const n = int(min, max);
  const pool = [...xs];
  const out: T[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]!);
  return out;
};

const dayMs = 86_400_000;
const dateOffset = (days: number): string => new Date(TODAY.getTime() + days * dayMs).toISOString().slice(0, 10);
const tsOffset = (days: number): string => new Date(TODAY.getTime() + days * dayMs).toISOString();

// ─── SQL emission ────────────────────────────────────────────
type Val = string | number | boolean | null;
const lit = (v: Val): string => {
  if (v === null) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return `'${v.replace(/'/g, "''")}'`;
};
const insert = (table: string, cols: string[], rows: Val[][]): string => {
  if (rows.length === 0) return '';
  const values = rows.map((r) => `(${r.map(lit).join(', ')})`).join(',\n  ');
  return `INSERT INTO ${table} (${cols.join(', ')}) VALUES\n  ${values};\n`;
};

// ─── Data pools ──────────────────────────────────────────────
const FIRST = ['Alex', 'Jordan', 'Sam', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie', 'Avery', 'Quinn', 'Drew', 'Cameron', 'Skyler', 'Reese', 'Frank', 'Dana', 'Elliot', 'Harper', 'Logan', 'Parker', 'Rowan', 'Sasha', 'Noah', 'Mila', 'Omar', 'Priya', 'Wei', 'Ingrid', 'Diego', 'Yuki'];
const LAST = ['Morgan', 'Chen', 'Patel', 'Nguyen', 'Kim', 'Okafor', 'Silva', 'Müller', 'Rossi', 'Andersson', 'Drebbin', 'Holloway', 'Vance', 'Castellanos', 'Bauer', 'Larsen', 'Whitfield', 'Osei', 'Romano', 'Fischer', 'Novak', 'Ibrahim', 'Petrov', 'Costa', 'Hughes'];
const COMPANY_BASE = ['Northwind', 'Globex', 'Initech', 'Umbrella', 'Hooli', 'Stark', 'Wayne', 'Acme', 'Soylent', 'Vandelay', 'Wonka', 'Tyrell', 'Cyberdyne', 'Massive Dynamic', 'Pied Piper', 'Aperture', 'Black Mesa', 'Oscorp', 'Gringotts', 'Bluth', 'Dunder', 'Prestige', 'Sterling', 'Pearson', 'Paper Street', 'Monarch', 'Wernham', 'Krystal', 'Sirius', 'Helix'];
const COMPANY_SUFFIX = ['Labs', 'Systems', 'Group', 'Industries', 'Technologies', 'Partners', 'Holdings', 'Corp', 'Co', 'Digital'];
const INDUSTRY = ['SaaS', 'Fintech', 'Healthcare', 'E-commerce', 'Manufacturing', 'Logistics', 'Media', 'Energy', 'Education', 'Real Estate'];
const SIZE = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'];
const TITLE = ['CEO', 'CTO', 'VP Sales', 'Head of Ops', 'Procurement Lead', 'Engineering Manager', 'Founder', 'CFO', 'Product Lead', 'IT Director', 'Office Manager', 'Account Executive'];
const PRODUCTS = [
  { name: 'Starter', sku: 'PLN-START', price: 49 },
  { name: 'Growth', sku: 'PLN-GROW', price: 199 },
  { name: 'Enterprise', sku: 'PLN-ENT', price: 999 },
  { name: 'Onboarding', sku: 'SVC-ONB', price: 2500 },
  { name: 'Premium Support', sku: 'SVC-SUP', price: 750 },
];
const STAGES = [
  { name: 'Lead', prob: 10 },
  { name: 'Qualified', prob: 30 },
  { name: 'Proposal', prob: 50 },
  { name: 'Negotiation', prob: 70 },
  { name: 'Closed Won', prob: 100 },
  { name: 'Closed Lost', prob: 0 },
];
const OPEN_STAGE_COUNT = 4; // Lead..Negotiation
const ACTIVITY = {
  call: ['Discovery call', 'Follow-up call', 'Check-in call', 'Demo call', 'Renewal call'],
  email: ['Sent proposal', 'Replied to pricing question', 'Intro email', 'Shared case study', 'Follow-up email'],
  meeting: ['Product demo', 'Quarterly review', 'Kickoff meeting', 'Stakeholder sync', 'Contract review'],
  note: ['Left voicemail', 'Budget approved internally', 'Champion changed roles', 'Competitor mentioned', 'Wants a custom quote'],
} as const;
const TASK = ['Send follow-up', 'Prepare proposal', 'Schedule demo', 'Call back', 'Send contract', 'Check in on trial', 'Update CRM notes', 'Loop in solutions engineer', 'Confirm budget', 'Send onboarding deck'];
const LISTS = ['Key Accounts', 'Q3 Targets', 'Newsletter', 'At-Risk Renewals'];

// ─── Generation ──────────────────────────────────────────────
export const buildSeedSql = (): string => {
  const sql: string[] = [];

  // Users — usr_001 is the signed-in demo user ("me").
  const userCount = 6;
  const users = Array.from({ length: userCount }, (_, i) => ({
    id: id('usr', i + 1),
    first: FIRST[i % FIRST.length]!,
    last: LAST[i % LAST.length]!,
  }));
  const me = users[0]!.id;
  sql.push(
    insert(
      'users',
      ['id', 'name', 'email', 'avatar_url', 'role'],
      users.map((u, i) => [
        u.id,
        `${u.first} ${u.last}`,
        `${u.first.toLowerCase()}@relay.app`,
        null,
        i === 0 ? 'owner' : 'rep',
      ]),
    ),
  );
  const userIds = users.map((u) => u.id);

  // Companies.
  const companyCount = 40;
  const companies = Array.from({ length: companyCount }, (_, i) => {
    const base = COMPANY_BASE[i % COMPANY_BASE.length]!;
    const name = `${base} ${pick(COMPANY_SUFFIX)}`;
    return {
      id: id('cmp', i + 1),
      name,
      domain: `${base.toLowerCase().replace(/[^a-z]/g, '')}.com`,
      owner: pick(userIds),
    };
  });
  sql.push(
    insert(
      'companies',
      ['id', 'name', 'domain', 'industry', 'size', 'owner_id', 'created_at'],
      companies.map((c) => [c.id, c.name, c.domain, pick(INDUSTRY), pick(SIZE), c.owner, tsOffset(-int(60, 720))]),
    ),
  );

  // Contacts — each belongs to a company; companies get 2-8.
  const contacts: { id: string; company: string; owner: string }[] = [];
  let ci = 0;
  for (const c of companies) {
    for (const _ of Array.from({ length: int(2, 8) })) {
      ci++;
      const first = pick(FIRST);
      const last = pick(LAST);
      contacts.push({ id: id('con', ci), company: c.id, owner: chance(0.5) ? c.owner : pick(userIds) });
      sql.push(
        insert(
          'contacts',
          ['id', 'first_name', 'last_name', 'email', 'phone', 'title', 'company_id', 'owner_id', 'created_at'],
          [
            [
              id('con', ci),
              first,
              last,
              `${first.toLowerCase()}.${last.toLowerCase().replace(/[^a-z]/g, '')}@${c.domain}`,
              `+1 (555) ${String(int(100, 999))}-${String(int(1000, 9999))}`,
              pick(TITLE),
              c.id,
              chance(0.5) ? c.owner : pick(userIds),
              tsOffset(-int(10, 600)),
            ],
          ],
        ),
      );
    }
  }

  // Pipeline + stages.
  sql.push(insert('pipelines', ['id', 'name', 'is_default'], [[id('pip', 1), 'Sales Pipeline', true]]));
  const stageIds = STAGES.map((_, i) => id('stg', i + 1));
  sql.push(
    insert(
      'stages',
      ['id', 'pipeline_id', 'name', 'position', 'win_probability'],
      STAGES.map((s, i) => [stageIds[i]!, id('pip', 1), s.name, i + 1, s.prob]),
    ),
  );

  // Products.
  sql.push(
    insert(
      'products',
      ['id', 'name', 'sku', 'unit_price'],
      PRODUCTS.map((p, i) => [id('prd', i + 1), p.name, p.sku, p.price]),
    ),
  );

  // Deals.
  const dealCount = 120;
  const deals: { id: string; company: string; owner: string; stageIdx: number; status: string; contact: string | null }[] = [];
  for (let i = 0; i < dealCount; i++) {
    const company = pick(companies);
    const companyContacts = contacts.filter((c) => c.company === company.id);
    const roll = rng();
    const status = roll < 0.65 ? 'open' : roll < 0.85 ? 'won' : 'lost';
    const stageIdx = status === 'open' ? int(0, OPEN_STAGE_COUNT - 1) : status === 'won' ? 4 : 5;
    // Owner: bias toward the demo user so "my deals" is populated.
    const owner = chance(0.4) ? me : pick(userIds);
    const close = status === 'open' ? dateOffset(int(3, 90)) : dateOffset(-int(3, 180));
    const primaryContact = companyContacts.length > 0 ? pick(companyContacts).id : null;
    deals.push({ id: id('deal', i + 1), company: company.id, owner, stageIdx, status, contact: primaryContact });
    sql.push(
      insert(
        'deals',
        ['id', 'title', 'company_id', 'primary_contact_id', 'value', 'currency', 'stage_id', 'owner_id', 'status', 'close_date', 'created_at'],
        [
          [
            id('deal', i + 1),
            `${company.name} — ${pick(PRODUCTS).name}`,
            company.id,
            primaryContact,
            int(2, 250) * 1000,
            'USD',
            stageIds[stageIdx]!,
            owner,
            status,
            close,
            tsOffset(-int(5, 240)),
          ],
        ],
      ),
    );
  }

  // Deal line items — about half the deals get 1-3.
  let dpi = 0;
  for (const d of deals) {
    if (!chance(0.5)) continue;
    for (const p of some(PRODUCTS, 1, 3)) {
      dpi++;
      const prodIdx = PRODUCTS.indexOf(p);
      sql.push(
        insert(
          'deal_products',
          ['id', 'deal_id', 'product_id', 'quantity', 'unit_price'],
          [[id('dp', dpi), d.id, id('prd', prodIdx + 1), int(1, 20), p.price]],
        ),
      );
    }
  }

  // Activities — clustered in the last 120 days, weighted recent.
  const activityCount = 600;
  const types = ['call', 'email', 'meeting', 'note'] as const;
  for (let i = 0; i < activityCount; i++) {
    const type = pick(types);
    const d = pick(deals);
    const daysAgo = -Math.floor(Math.pow(rng(), 1.8) * 120); // skew recent
    sql.push(
      insert(
        'activities',
        ['id', 'type', 'subject', 'body', 'contact_id', 'company_id', 'deal_id', 'owner_id', 'occurred_at'],
        [
          [
            id('act', i + 1),
            type,
            pick(ACTIVITY[type]),
            null,
            // The person on the deal, not a random bystander — so a contact's
            // activity timeline reflects the deals they're actually on.
            d.contact,
            d.company,
            d.id,
            chance(0.5) ? me : pick(userIds),
            tsOffset(daysAgo),
          ],
        ],
      ),
    );
  }

  // Tasks — a believable mix of overdue / today / upcoming, biased to me.
  const taskCount = 150;
  for (let i = 0; i < taskCount; i++) {
    const bucket = rng();
    const due = bucket < 0.3 ? dateOffset(-int(1, 21)) : bucket < 0.45 ? dateOffset(0) : dateOffset(int(1, 30));
    const done = bucket < 0.3 ? chance(0.7) : chance(0.15);
    const d = pick(deals);
    // Most tasks that hang off a deal also belong to that deal's primary contact,
    // so a contact's profile shows its open to-dos (not just the deal's).
    const taskContact = d.contact !== null && chance(0.7) ? d.contact : null;
    sql.push(
      insert(
        'tasks',
        ['id', 'title', 'due_date', 'done', 'assignee_id', 'contact_id', 'company_id', 'deal_id', 'created_at'],
        [
          [
            id('task', i + 1),
            pick(TASK),
            due,
            done,
            chance(0.45) ? me : pick(userIds),
            taskContact,
            d.company,
            d.id,
            tsOffset(-int(1, 60)),
          ],
        ],
      ),
    );
  }

  // Lists + members.
  sql.push(
    insert(
      'lists',
      ['id', 'name', 'kind'],
      LISTS.map((name, i) => [id('lst', i + 1), name, 'static']),
    ),
  );
  let lmi = 0;
  LISTS.forEach((_, li) => {
    for (const c of some(contacts, 8, 20)) {
      lmi++;
      sql.push(insert('list_members', ['id', 'list_id', 'contact_id'], [[id('lm', lmi), id('lst', li + 1), c.id]]));
    }
  });

  // Action catalog — what the action search searches. `id` is the Nova action
  // id run when chosen; `kind` decides how it runs ('screen' → navigate the main
  // canvas, 'create' → open in the modal). v1 is a hand-list; later this is
  // generated from the live registry.
  sql.push(
    insert(
      'actions',
      ['id', 'name', 'description', 'scope', 'kind', 'definition'],
      [
        ['home', 'Home', 'Go to the dashboard', 'crm', 'screen', '{}'],
        ['tasks', 'My tasks', 'Your open tasks', 'crm', 'screen', '{}'],
        ['contacts', 'Contacts', 'Browse all people', 'crm', 'screen', '{}'],
        ['companies', 'Companies', 'Browse all accounts', 'crm', 'screen', '{}'],
        ['deals', 'Deals', 'Browse all deals as a table', 'crm', 'screen', '{}'],
        ['deals-board', 'Pipeline', 'The deals pipeline board (Kanban by stage)', 'crm', 'screen', '{}'],
        ['settings', 'Settings', 'Workspace preferences', 'crm', 'screen', '{}'],
        ['new-contact', 'New contact', 'Add a person to the workspace', 'crm', 'create', '{}'],
        ['new-company', 'New company', 'Add a company or account', 'crm', 'create', '{}'],
        ['new-deal', 'New deal', 'Start tracking a new opportunity', 'crm', 'create', '{}'],
        ['new-task', 'New task', 'Add a to-do for yourself', 'crm', 'create', '{}'],
      ],
    ),
  );

  return sql.join('\n');
};
