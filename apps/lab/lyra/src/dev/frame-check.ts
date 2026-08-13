// THE FRAME SEAM — the one place this app renders something it did not validate.
//
// Everything else a pack ships is checked against a fixed component vocabulary
// and refused if it names anything else. A framed page is not: it is the pack's
// own HTML, served at THIS app's origin, and nothing here inspects it. That is a
// real weakening and it is why the seam is declared rather than conjured — so
// this check is the argument that the bounds actually hold.
//
// The bounds, in order: only a DECLARED page, only through a GRANT, only for a
// principal the grant was minted for, only while the pack is installed — and the
// grant itself must be worthless as identity, because it travels in a URL.
//
// Run: pnpm --filter lyra exec tsx src/dev/frame-check.ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startIntegrations } from '../../../lyra-integrations/src/serve';
import { CAST } from '@lyra/db/seed';
import { app, login, mintToken, ok, report, runtime, server, settle } from './world';

const KEY = 'lab-operator-key';
runtime.operatorKey = KEY;

const PORT = 8796;
const verifyKey = (await (await server.request('/api/integrations/verify-key')).json()) as { key: string };
process.env['LYRA_VERIFY_KEY'] = verifyKey.key;
const service = startIntegrations(PORT);

const FRAME = '/integrations/belts/embed/summary';

const operator = async (path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> => {
  const response = await server.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-operator-key': KEY },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: (await response.json().catch(() => ({}))) as Record<string, unknown> };
};

const grantFor = async (email: string, path: string): Promise<{ status: number; json: Record<string, unknown> }> => {
  const response = await server.request('/api/integrations/frame', {
    method: 'POST',
    headers: { Authorization: `Bearer ${String(await mintToken(email))}`, 'content-type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  return { status: response.status, json: (await response.json().catch(() => ({}))) as Record<string, unknown> };
};

const open = async (src: string): Promise<{ status: number; type: string; body: string }> => {
  const response = await server.request(src);
  return { status: response.status, type: response.headers.get('content-type') ?? '', body: await response.text() };
};

try {
  await operator('/operator/integrations', { id: 'belts', url: `http://127.0.0.1:${PORT}/belts` });
  await operator('/operator/integrations/belts/approve', {});

  // Installed the way a studio installs anything — through the owner's own
  // screen and their own policy, not by writing the row from here.
  const owner = await login(CAST.northrock.owner);
  await settle(10);
  owner.dispatch({ type: 'ui:click', ref: 'nav', payload: 'studio.addons' });
  await settle(14);
  owner.dispatch({ type: 'ui:click', ref: 'install', payload: { integration_id: 'belts' } });
  await settle(18);

  // ── a declared page, through a grant ─────────────────────────
  const granted = await grantFor(CAST.northrock.owner, FRAME);
  const src = String(granted.json['src'] ?? '');
  ok('a declared page can be granted', granted.status === 200 && src.startsWith('/integrations/belts/frame/'), src || String(granted.status));
  ok('...at THIS app’s origin, so the browser sends nothing of ours abroad', src.startsWith('/'), 'a relative path — same origin is the whole reason the seam is bounded');

  const page = await open(src);
  ok('...and spending it serves the pack’s own document', page.status === 200 && page.body.includes('<!doctype html'), `${page.status} · ${page.body.length} bytes`);
  ok('...as HTML, not as JSON', page.type.includes('text/html'), page.type);
  ok('...with the assertion still reaching the pack', !page.body.includes('Who are you?'), 'the grant was redeemed and a fresh assertion minted for the hop');
  ok('...answering about the RIGHT studio', page.body.includes('Purple — 2nd stripe'), 'the pack scoped by the assertion, exactly as on every other route');

  // ── the grant is not identity ────────────────────────────────
  //
  // It travels in a URL, so it will end up in a history entry and a log. What
  // it must NOT be is something the pack would accept as a caller.
  const token = src.split('/').pop() ?? '';
  const asBearer = await server.request('/integrations/belts/roster', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: '{}',
  });
  ok('a grant is worthless as identity', asBearer.status === 401, `${asBearer.status} — opaque and local, never signed by the deployment's key`);

  // ── only what the bundle declared ────────────────────────────
  const undeclared = await grantFor(CAST.northrock.owner, '/integrations/belts/embed/secret');
  ok('an undeclared page cannot be granted', undeclared.status === 404, String(undeclared.status));
  const notAFrame = await grantFor(CAST.northrock.owner, '/integrations/belts/roster');
  ok('...nor can a path that is merely reachable', notAFrame.status === 404, 'an action endpoint is not a page, and reach is not frames');

  // ── only through a grant that exists ─────────────────────────
  const forged = await open('/integrations/belts/frame/deadbeefdeadbeefdeadbeefdeadbeef');
  ok('an invented grant opens nothing', forged.status === 404, String(forged.status));

  // ── only for somebody who has it installed ───────────────────
  const elsewhere = await grantFor(CAST.lumen.owner, FRAME);
  ok('a studio without the install cannot frame it', elsewhere.status === 404, `${elsewhere.status} — same glob, two tenants`);

  // ── and the install is re-checked when the grant is SPENT ────
  //
  // The gap between minting and opening is exactly where an uninstall lands, and
  // a stale tab must stop working rather than keep serving.
  const stale = await grantFor(CAST.northrock.owner, FRAME);
  ok('...a grant taken while it was still installed', String(stale.json['src'] ?? '').startsWith('/integrations/belts/frame/'), 'minted, not yet spent');

  owner.dispatch({ type: 'ui:click', ref: 'nav', payload: 'studio.addons' });
  await settle(14);
  owner.dispatch({ type: 'ui:click', ref: 'uninstall', payload: { integration_id: 'belts' } });
  await settle(18);
  const afterUninstall = await open(String(stale.json['src'] ?? ''));
  ok('a grant minted before an uninstall does not open after it', afterUninstall.status === 404, `${afterUninstall.status} — checked when spent, not only when minted`);
  // ── the component is GENERIC, and stays that way ─────────────
  //
  // The whole point of the seam is that this app never learns what a pack is.
  // A kit that grew a `StripeEmbed` would have conceded exactly the thing the
  // frame exists to avoid, and it would have done so one commit at a time.
  ok('the kit offers a generic Frame', Object.keys(app.shell?.components ?? {}).includes('Frame'), 'a URL and a height — it knows no pack');
  ok('...and nothing vendor-shaped beside it', !Object.keys(app.shell?.components ?? {}).some((n) => /stripe|paypal|embed/i.test(n)), Object.keys(app.shell?.components ?? {}).length + ' components, none named for a vendor');

  // THE GATE FOR THIS WHOLE SEAM. The alternative design was this app importing
  // a payment provider's browser SDK. If that ever happens, the frame stopped
  // being worth its cost — so the absence is asserted rather than remembered.
  const vendorRefs: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name) && !full.includes('dev')) {
        if (/@stripe\/|from ['"]stripe['"]|require\(['"]stripe['"]\)/.test(readFileSync(full, 'utf8'))) vendorRefs.push(full);
      }
    }
  };
  walk(join(process.cwd(), 'src'));
  const manifest = readFileSync(join(process.cwd(), 'package.json'), 'utf8');
  ok('this app imports no payment SDK', vendorRefs.length === 0, vendorRefs.join(', ') || 'the pack carries it; the host gained a Frame');
  ok('...and depends on none', !/stripe/i.test(manifest), 'a dependency here is a dependency for every app that installs the pack');
} finally {
  await service.close();
}

report('a pack may serve a page and this app will frame it — declared, granted, scoped, and never mistaken for identity.');
