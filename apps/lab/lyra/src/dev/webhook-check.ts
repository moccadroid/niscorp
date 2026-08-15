// THE WEBHOOK DOOR — the one surface on this server that asks for nothing.
//
// Every other route is bounded by a credential. This one cannot be: a vendor
// calling in has no session and no key, because nobody is driving. So the
// question this check asks is not "who was let in" but "what does being let in
// get you" — and the answer must be: forwarded to the integration, with no identity
// manufactured on the way, and the integration still has to decide for itself.
//
// The property that cannot be seen from outside is BYTE FIDELITY. A vendor
// signs exact bytes; a JSON round-trip through this process would re-order one
// key and break every verification downstream, silently and only in production.
// So the integration answers with a hash of what it received and this check compares it
// against a hash of what was sent.
//
// Run: pnpm --filter lyra exec tsx src/dev/webhook-check.ts
import { createHash } from 'node:crypto';
import { startIntegrations } from '../../../lyra-integrations/src/serve';
import { ok, report, runtime, server } from './world';

const KEY = 'lab-operator-key';
runtime.operatorKey = KEY;

const PORT = 8797;
const SECRET = 'lab-hook-secret';
process.env['BELTS_HOOK_SECRET'] = SECRET;

const verifyKey = (await (await server.request('/api/integrations/verify-key')).json()) as { key: string };
process.env['LYRA_VERIFY_KEY'] = verifyKey.key;
const service = startIntegrations(PORT);

const operator = async (path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> => {
  const response = await server.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-operator-key': KEY },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: (await response.json().catch(() => ({}))) as Record<string, unknown> };
};

// Deliberately awkward: nested order, unicode, and whitespace a re-serializer
// would tidy. If anything on the path parses and re-emits this, the hash moves.
const PAYLOAD = '{"id":"evt_1",  "type":"invoice.paid","data":{"z":1,"a":"Ünïcøde — ✓","n":0.10}}';
const sha256 = (text: string): string => createHash('sha256').update(Buffer.from(text)).digest('hex');

const hook = async (id: string, event: string, body: string, headers: Record<string, string> = {}): Promise<{ status: number; json: Record<string, unknown> }> => {
  const response = await server.request(`/integrations/${id}/hook/${event}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
  return { status: response.status, json: (await response.json().catch(() => ({}))) as Record<string, unknown> };
};

try {
  // ── before approval there is nothing here ────────────────────
  const unknown = await hook('nobody', 'invoice.paid', PAYLOAD);
  ok('an integration nobody registered has no door', unknown.status === 404, String(unknown.status));

  await operator('/operator/integrations', { id: 'belts', url: `http://127.0.0.1:${PORT}/belts` });
  const pending = await hook('belts', 'invoice.paid', PAYLOAD);
  ok('...and a PENDING one does not either', pending.status === 404, `${pending.status} — registered is not approved`);
  ok('...answering 404, never 403', pending.json['message'] === 'Not found.', 'a stranger learns nothing about which integrations we are considering');

  await operator('/operator/integrations/belts/approve', {});

  // ── approved: the call lands, and the integration decides ───────────
  const unsigned = await hook('belts', 'invoice.paid', PAYLOAD);
  ok('an unsigned call REACHES the integration', unsigned.json['sha256'] !== undefined, 'the integration answered about a body, so it was forwarded');
  ok('...and the integration refuses it itself', unsigned.status === 401, `${unsigned.status} — moss vouched for nobody, so the integration had to ask`);

  // ── the property that cannot be seen from outside ────────────
  ok('the body arrives byte-identical', unsigned.json['sha256'] === sha256(PAYLOAD), `${String(unsigned.json['sha256']).slice(0, 16)}… over ${String(unsigned.json['bytes'])} bytes`);
  ok('...including the bytes a re-serializer would tidy', Number(unsigned.json['bytes']) === Buffer.byteLength(PAYLOAD), `${Buffer.byteLength(PAYLOAD)} bytes of awkward spacing and unicode`);

  // ── a signature the integration can actually check ──────────────────
  const signature = createHash('sha256').update(SECRET).update(Buffer.from(PAYLOAD)).digest('hex');
  const signed = await hook('belts', 'invoice.paid', PAYLOAD, { 'x-belts-signature': signature });
  ok('a signed call is accepted BY THE INTEGRATION', signed.status === 200 && signed.json['ok'] === true, 'the vendor is the only party that can vouch here');

  const tampered = await hook('belts', 'invoice.paid', `${PAYLOAD} `, { 'x-belts-signature': signature });
  ok('...and one byte later it is not', tampered.status === 401, 'the signature is over the bytes, and the bytes reached it intact');

  // ── the path segment is what isolates one integration from another ──
  const wrongIntegration = await hook('hookclaim', 'invoice.paid', PAYLOAD);
  ok('one integration’s door is not another’s', wrongIntegration.status === 404, 'the :id segment is the isolation — a secret and a failure are both per integration');

  // ── and no action may declare itself under it ────────────────
  const claim = await operator('/operator/integrations', { id: 'hookclaim', url: `http://127.0.0.1:${PORT}/hookclaim` });
  ok('a bundle claiming /hook/ for an action is refused', claim.status === 422, String(claim.status));
  ok('...by name, so the author knows why', String(JSON.stringify(claim.json['reasons'])).includes('/hook/'), String(JSON.stringify(claim.json['reasons'])));

  // ── the ceiling, last, because it spends the window ──────────
  let limited = 0;
  for (let i = 0; i < 260; i += 1) {
    const beat = await hook('belts', 'invoice.paid', PAYLOAD);
    if (beat.status === 429) limited += 1;
  }
  ok('an unauthenticated door has a ceiling', limited > 0, `${limited} of 260 refused — a door we did not lock needs a limit`);
} finally {
  await service.close();
}

report('the webhook door is open, narrow, and byte-faithful — and the integration still decides.');
