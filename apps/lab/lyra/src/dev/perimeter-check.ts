// Run: pnpm --filter lyra exec tsx src/dev/perimeter-check.ts
import { createAssertionSigner } from '@niscorp/moss';
import { startIntegrations } from '../../../lyra-integrations/src/serve';
import { ok, report } from './world';

// Its own port, so a suite run cannot kill the instance somebody is looking at.
const PORT = 8798;
const BASE = `http://127.0.0.1:${PORT}`;

const deployment = createAssertionSigner();
const impostor = createAssertionSigner();
process.env['LYRA_VERIFY_KEY'] = deployment.verifyKey;

const service = startIntegrations(PORT);

const direct = async (path: string, headers: Record<string, string>): Promise<{ status: number; body: string }> => {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: '{}',
  });
  return { status: response.status, body: (await response.text()).slice(0, 200) };
};

const northrock = { integration: 'belts', principal: 'p_omar', scope: { studioId: 'st_northrock', membershipId: 'mb_omar' } };

try {
  const selftest = (await fetch(`${BASE}/belts/_selftest`).then((r) => r.json())) as Record<string, number>;
  ok('the service is reachable and holds records', (selftest['north'] ?? 0) > 0, `${selftest['north']} belts`);

  // ── claims without an envelope ───────────────────────────────
  const forged = await direct('/belts/roster', {
    'x-nisc-principal': 'p_omar',
    'x-nisc-scope-studioid': 'st_northrock',
    'x-nisc-scope-membershipid': 'mb_omar',
  });
  ok('forged identity headers are not identity', forged.status === 401, `${forged.status} ${forged.body}`);

  const bare = await direct('/belts/roster', {});
  ok('...and a bare request gets nothing', bare.status === 401, `${bare.status} ${bare.body}`);

  // ── the envelope has to be OURS ──────────────────────────────
  const wrongKey = await direct('/belts/roster', { authorization: `Bearer ${impostor.mint(northrock)}` });
  ok('a well-formed token from the wrong signer is refused', wrongKey.status === 401, String(wrongKey.status));

  const genuine = deployment.mint(northrock);
  const [payloadPart, signaturePart] = genuine.split('.');
  const editedPayload = Buffer.from(String(payloadPart).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString().replace('st_northrock', 'st_lumenrock');
  const tampered = `${Buffer.from(editedPayload).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.${signaturePart}`;
  ok('a tampered payload is refused', (await direct('/belts/roster', { authorization: `Bearer ${tampered}` })).status === 401, 'one edited byte unverifies the claim');

  // ── ...and CURRENT ───────────────────────────────────────────
  const expired = deployment.mint(northrock, -1);
  ok('an expired token is refused', (await direct('/belts/roster', { authorization: `Bearer ${expired}` })).status === 401, 'a token lives seconds; a logged one is not a credential');

  // ── ...and FOR THIS INTEGRATION ──────────────────────────────
  const sideways = deployment.mint({ ...northrock, integration: 'stripe' });
  ok('a token minted for another integration is refused', (await direct('/belts/roster', { authorization: `Bearer ${sideways}` })).status === 401, 'credentials do not replay sideways between bundles');

  // ── THE RIGHT CALLER GETS THROUGH, as who the TOKEN says ─────
  const admitted = await direct('/belts/roster', { authorization: `Bearer ${deployment.mint(northrock)}` });
  ok('a deployment-signed assertion is served', admitted.status === 200, String(admitted.status));
  ok('...scoped to the studio INSIDE the token', admitted.body.includes('Purple'), admitted.body.slice(0, 60));

  const lumen = await direct('/belts/roster', {
    authorization: `Bearer ${deployment.mint({ integration: 'belts', principal: 'p_x', scope: { studioId: 'st_lumen' } })}`,
    'x-nisc-scope-studioid': 'st_northrock',
  });
  ok('...and a header beside the token moves nothing', lumen.body === '[]', `${lumen.body} — identity is only what was signed`);

  // ── what stays open, deliberately ────────────────────────────
  const bundle = await fetch(`${BASE}/belts/bundle`);
  ok('the bundle stays open — it is what the service publishes about itself', bundle.status === 200, String(bundle.status));

  await service.close();
  report('identity does not exist outside a verified envelope.');
} catch (err) {
  await service.close();
  throw err;
}
