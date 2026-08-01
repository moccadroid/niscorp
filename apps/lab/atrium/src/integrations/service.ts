import { createServer } from 'node:http';
import type { Server } from 'node:http';

// ═══════════════════════════════════════════════════════════
// The integrations service — a SEPARATE PROCESS, on its own deployment clock.
//
// This is the "functions as cloud" half of the architecture, and since the
// discovery flip it is the SOURCE of every integration: the app pulls each
// connector's `/bundle` — capability matrix, actions, queries, slots, menus,
// declared table footprint — validates it at intake, and upserts rows. The
// app ships with ZERO built-in knowledge of Opera, Mews or HotelFix;
// everything it knows about them arrived over this wire as data.
//
// Two things follow, and both are visible in the demo:
//
//   1. The main app never goes down to gain (or update) an integration —
//      shipping one deploys THIS process, then a sync pulls it.
//   2. When this service IS down, the app degrades structurally: live calls
//      fail with a sentence and write nothing, and the last-synced bundles
//      keep serving from their rows.
//
// Run it with `pnpm integrations`.
// ═══════════════════════════════════════════════════════════

export { integrationsPort, integrationsBase } from './port';
import { integrationsPort } from './port';
import { MEWS_BUNDLE } from './mews/bundle';
import { OPERA_BUNDLE } from './opera/bundle';
import type { IntegrationBundle, OptionRow } from './types';

// What each connector implements — the service's own truth, now with the
// DEFAULT switch state a fresh sync starts from. `enabled` here is only the
// default for a capability the app has never seen; once a row exists, the
// vendor console owns the switch and a re-sync never flips it. Opera ships
// the key and express checkout built but OFF — enabling them live is the
// demo's deployment.
// Both PMSes implement transfers and goodwill, switched ON, at every version
// they ship. That is deliberate and it is a decision about the DEMO rather than
// about the product: the one capability the concierge could famously never serve
// — "ask either for a taxi and neither invents one" — now works from the first
// boot, at both hotels, with nothing to find and nothing to flip. A feature
// somebody has to go and enable before it does anything is a feature nobody in
// the room believes in. The key stays off, because that flip IS a beat.
const OPERA_V1 = ['stay.view', 'checkin.online', 'folio.read', 'folio.adjust', 'message.send', 'upgrade.offer', 'wakecall.set', 'checkout.late', 'transfer.book', 'goodwill.grant', 'issue.manage', 'task.assign', 'room.manage', 'ops.overview'];
const MEWS_V3 = ['stay.view', 'checkin.online', 'folio.read', 'folio.adjust', 'message.send', 'spa.book', 'housekeeping.request', 'minibar.post', 'transfer.book', 'goodwill.grant', 'issue.manage', 'task.assign', 'room.manage', 'ops.overview'];

const MATRIX: Record<string, { id: string; version: number; enabled: boolean }[]> = {
  opera: [
    ...OPERA_V1.map((id) => ({ id, version: 1, enabled: true })),
    { id: 'key.issue', version: 2, enabled: false },
    { id: 'checkout.express', version: 2, enabled: false },
  ],
  mews: MEWS_V3.map((id) => ({ id, version: 3, enabled: true })),
  // The ticketing system — a different class of integration on the same seam.
  // It owns fault categories, never door credentials, so /key 409s here. No
  // actions of its own: its capability is served by the app's core surfaces.
  hotelfix: [{ id: 'issue.report', version: 1, enabled: true }],
};

// Kept for the /key implemented-check below (per-version verb lists).
const CAPABILITIES: Record<string, Record<number, string[]>> = {
  opera: {
    1: OPERA_V1,
    2: [...OPERA_V1, 'key.issue', 'checkout.express'],
  },
  mews: {
    3: MEWS_V3,
  },
  hotelfix: {
    1: ['issue.report'],
  },
};

// HotelFix's request catalogue — its whole contribution beyond the capability:
// the fault categories both hotels' report menus show.
// capability, label, detail, icon, kind, amount, position
const HOTELFIX_OPTIONS: OptionRow[] = [
  ['issue.report', 'Air conditioning', 'Too hot, too cold, or noisy', 'alert', 'climate', 0, 10],
  ['issue.report', 'Hot water', 'No hot water, or slow', 'alert', 'plumbing', 0, 20],
  ['issue.report', 'Wi-Fi', 'Slow or dropping', 'plug', 'wifi', 0, 30],
  ['issue.report', 'Noise', 'From a neighbour or outside', 'moon', 'noise', 0, 40],
  ['issue.report', 'Something else', 'Tell us in your own words', 'chat', 'other', 0, 50],
];

const VENDOR_BUNDLES: Record<string, IntegrationBundle | undefined> = {
  opera: OPERA_BUNDLE,
  mews: MEWS_BUNDLE,
  hotelfix: undefined,
};

// The wire shape of one integration — everything the app needs, as data. The
// app-side intake validates every field of this before a single row changes.
// Exported for the artifacts check: the same payload the wire serves is what
// the publish gate lints, so passing the check means passing intake.
export const bundlePayload = (vendor: string): unknown => {
  const bundle = VENDOR_BUNDLES[vendor];
  return {
    capabilities: MATRIX[vendor] ?? [],
    actions: bundle?.actions ?? {},
    queries: bundle?.entries ?? [],
    mutations: bundle?.mutations ?? [],
    slots: bundle?.slots ?? [],
    options: vendor === 'hotelfix' ? HOTELFIX_OPTIONS : (bundle?.options ?? []),
    tables: bundle?.tables ?? [],
  };
};

const json = (body: unknown, status = 200): [number, string] => [status, JSON.stringify(body)];

// A door credential. A real Opera integration posts to the property's lock
// vendor; this mints a plausible reference so the shape of the call is honest
// even though the lock is imaginary.
const credential = (stay: string): string => {
  let hash = 0;
  for (const ch of stay) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `KC-${hash.toString(36).toUpperCase().padStart(6, '0').slice(0, 6)}`;
};

const hashOf = (s: string): number => {
  let hash = 0;
  for (const ch of s) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash;
};

const DAY_MS = 86_400_000;
const dayLabel = (d: Date): string => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

const DRIVERS = ['Søren', 'Aleksandra', 'Mikkel', 'Fatima', 'Jorge', 'Petra'];
const pickDriver = (reference: number): string => DRIVERS[reference % DRIVERS.length] ?? 'the duty driver';

// The spa's book — deterministic per (day, time, treatment), so the same
// afternoon shows the same openings on every read, and different treatments
// genuinely differ. Mews owns availability; the app only ever renders it.
const spaSlots = (treatment: string): unknown[] => {
  const times = ['10:00', '11:30', '14:00', '15:30', '17:00'];
  const out: unknown[] = [];
  for (let offset = 1; offset <= 3; offset += 1) {
    const date = new Date(Date.now() + offset * DAY_MS);
    const day = date.toISOString().slice(0, 10);
    for (const time of times) {
      if (hashOf(`${day}|${time}|${treatment}`) % 3 === 0) continue; // taken
      out.push({ slot_id: `${day}T${time}`, at: `${day}T${time}:00.000Z`, time, day, day_label: offset === 1 ? 'Tomorrow' : dayLabel(date) });
    }
  }
  return out;
};

// Opera's upsell inventory — which better rooms are open tonight, priced.
// price_line arrives formatted because normalizing figures is what an
// integration layer is FOR; the app never does currency.
const upgradeOffers = (): unknown[] =>
  [
    // The nightly UPLIFT, not the rate — what moving up a class costs on top of
    // what they are already paying. Priced against the room list in the seed:
    // Double 195, Deluxe 240, Junior Suite 330, Suite 480.
    { code: 'DLX', name: 'Deluxe king', blurb: 'Higher floor, king bed, quiet side', price: 45 },
    { code: 'JSU', name: 'Junior suite', blurb: 'Corner room, bathtub, harbour view', price: 90 },
    { code: 'STE', name: 'The Lumen suite', blurb: 'The whole top corner, terrace included', price: 150 },
  ]
    .filter((o) => hashOf(`${new Date().toISOString().slice(0, 10)}|${o.code}`) % 4 !== 0)
    .map((o) => ({ ...o, price_line: `${o.blurb} · €${o.price}` }));

const handle = async (method: string, path: string, body: string): Promise<[number, string]> => {
  const [, vendor, ...restParts] = path.split('/');
  const endpoint = restParts.join('/');
  if (vendor === undefined || CAPABILITIES[vendor] === undefined) return json({ message: 'No such connector.' }, 404);

  if (method === 'GET' && endpoint === 'capabilities') {
    return json({ vendor, versions: CAPABILITIES[vendor] });
  }

  // THE discovery surface: everything this integration ships, as one payload.
  if (method === 'GET' && endpoint === 'bundle') {
    return json(bundlePayload(vendor));
  }

  // ── the Mews spa module ──
  if (vendor === 'mews' && method === 'POST' && endpoint === 'spa/slots') {
    const payload = JSON.parse(body === '' ? '{}' : body) as { treatment?: string };
    return json(spaSlots(payload.treatment ?? ''));
  }
  if (vendor === 'mews' && method === 'POST' && endpoint === 'spa/book') {
    const payload = JSON.parse(body === '' ? '{}' : body) as { treatment?: string; at?: string; stay?: string };
    if (payload.treatment === undefined || payload.at === undefined) return json({ message: 'A booking names a treatment and a time.' }, 400);
    const date = new Date(payload.at);
    return json({
      confirmation: `MEWS-SPA-${(hashOf(`${payload.stay ?? ''}|${payload.at}`) % 9000) + 1000}`,
      treatment: payload.treatment,
      at: payload.at,
      when_label: `${dayLabel(date)}, ${payload.at.slice(11, 16)}`,
    });
  }

  // ── the Opera upsell module ──
  if (vendor === 'opera' && method === 'POST' && endpoint === 'upgrades') {
    return json(upgradeOffers());
  }

  // ── transfers: BOTH PMSes hold a car contract ──
  // The vendor owns the fleet and the confirmation, exactly as it owns spa
  // availability and folio adjustments. The app books THROUGH here and only the
  // answer becomes our mirror row and the charge — so a service that is down
  // means no car and no row, and the guest reads which one did not answer.
  if ((vendor === 'opera' || vendor === 'mews') && method === 'POST' && endpoint === 'transfer/book') {
    const payload = JSON.parse(body === '' ? '{}' : body) as { stay?: string; at?: string; on?: string; destination?: string; vehicle?: string };
    if ((payload.at ?? '') === '') return json({ message: 'A transfer needs a pickup time.' }, 400);
    if ((payload.destination ?? '') === '') return json({ message: 'A transfer needs a destination.' }, 400);
    const reference = (hashOf(`${payload.stay ?? ''}|${payload.on ?? ''}|${payload.at ?? ''}`) % 9000) + 1000;
    return json({
      confirmation: `${vendor.toUpperCase()}-TRF-${reference}`,
      at: payload.at,
      on: payload.on ?? '',
      destination: payload.destination,
      vehicle: payload.vehicle ?? 'Saloon',
      // The driver's name is the sort of thing a car company hands back and an
      // integration passes through without inventing.
      driver: pickDriver(reference),
    });
  }

  // ── folio adjustment: BOTH PMSes own their bills ──
  // Opera calls it an adjustment, Mews calls it voiding a bill item; to the
  // app it is one capability with one shape, which is the entire integrator
  // job. The reversal reference is what a real vendor hands back for the
  // audit trail, and our mirror only moves after this answers.
  if ((vendor === 'opera' || vendor === 'mews') && method === 'POST' && endpoint === 'folio/void') {
    const payload = JSON.parse(body === '' ? '{}' : body) as { line?: string; reason?: string };
    if (payload.line === undefined || payload.line === '') return json({ message: 'No charge named.' }, 400);
    if ((payload.reason ?? '') === '') return json({ message: 'A reversal needs a reason.' }, 400);
    return json({
      reversal: `${vendor.toUpperCase()}-ADJ-${(hashOf(`${payload.line}|${payload.reason ?? ''}`) % 90000) + 10000}`,
      line: payload.line,
    });
  }

  if (method === 'POST' && endpoint === 'key') {
    const payload = JSON.parse(body === '' ? '{}' : body) as { stay?: string; version?: number };
    const version = Number(payload.version ?? 0);
    const implemented = CAPABILITIES[vendor]?.[version] ?? [];
    // The connector refuses what its own live version does not implement. Belt
    // and braces: the app should never have offered the action, and this is the
    // check that says so out loud if it ever does.
    if (!implemented.includes('key.issue')) {
      return json({ message: `${vendor} v${version} does not implement key.issue.` }, 409);
    }
    if (payload.stay === undefined) return json({ message: 'No stay reference.' }, 400);
    return json({ credential: credential(payload.stay) });
  }

  return json({ message: 'Not found.' }, 404);
};

const createIntegrationsService = (): Server =>
  createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      void handle(request.method ?? 'GET', request.url ?? '/', Buffer.concat(chunks).toString('utf8')).then(([status, payload]) => {
        response.writeHead(status, { 'content-type': 'application/json' });
        response.end(payload);
      });
    });
  });

// Start it and hand back a closer. The checks use this to prove BOTH sides of
// the seam — the app with the service down, then the same app with it up — and
// a test that cannot stop a listener cannot do that.
export const startIntegrationsService = async (port = integrationsPort()): Promise<{ port: number; close: () => Promise<void> }> => {
  const server = createIntegrationsService();
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  return {
    port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
};
