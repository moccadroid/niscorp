import { createServer } from 'node:http';
import type { Server } from 'node:http';

export { integrationsPort, integrationsBase } from './port';
import { integrationsPort } from './port';
import { MEWS_BUNDLE } from './mews/bundle';
import { OPERA_BUNDLE } from './opera/bundle';
import type { IntegrationBundle, OptionRow } from './types';

// `enabled` in MATRIX is only the default for a capability the app has never
// seen: once its row exists, a re-sync never flips it.
const OPERA_V1 = ['stay.view', 'checkin.online', 'folio.read', 'folio.adjust', 'message.send', 'upgrade.offer', 'wakecall.set', 'checkout.late', 'transfer.book', 'goodwill.grant', 'issue.manage', 'task.assign', 'room.manage', 'ops.overview'];
const MEWS_V3 = ['stay.view', 'checkin.online', 'folio.read', 'folio.adjust', 'message.send', 'spa.book', 'housekeeping.request', 'minibar.post', 'transfer.book', 'goodwill.grant', 'issue.manage', 'task.assign', 'room.manage', 'ops.overview'];

const MATRIX: Record<string, { id: string; version: number; enabled: boolean }[]> = {
  opera: [
    ...OPERA_V1.map((id) => ({ id, version: 1, enabled: true })),
    { id: 'key.issue', version: 2, enabled: false },
    { id: 'checkout.express', version: 2, enabled: false },
  ],
  mews: MEWS_V3.map((id) => ({ id, version: 3, enabled: true })),
  hotelfix: [{ id: 'issue.report', version: 1, enabled: true }],
};

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

const spaSlots = (treatment: string): unknown[] => {
  const times = ['10:00', '11:30', '14:00', '15:30', '17:00'];
  const out: unknown[] = [];
  for (let offset = 1; offset <= 3; offset += 1) {
    const date = new Date(Date.now() + offset * DAY_MS);
    const day = date.toISOString().slice(0, 10);
    for (const time of times) {
      if (hashOf(`${day}|${time}|${treatment}`) % 3 === 0) continue;
      out.push({ slot_id: `${day}T${time}`, at: `${day}T${time}:00.000Z`, time, day, day_label: offset === 1 ? 'Tomorrow' : dayLabel(date) });
    }
  }
  return out;
};

const upgradeOffers = (): unknown[] =>
  [
    // `price` is the nightly uplift, not the rate: what moving up a class costs
    // on top of what the guest already pays.
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

  if (method === 'GET' && endpoint === 'bundle') {
    return json(bundlePayload(vendor));
  }

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

  if (vendor === 'opera' && method === 'POST' && endpoint === 'upgrades') {
    return json(upgradeOffers());
  }

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
      driver: pickDriver(reference),
    });
  }

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

export const startIntegrationsService = async (port = integrationsPort()): Promise<{ port: number; close: () => Promise<void> }> => {
  const server = createIntegrationsService();
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  return {
    port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
};
