// THE INTEGRATION'S OWN FRONT DOOR.
//
// Every other check in this suite reaches the belts service THROUGH moss's
// proxy. That is the path the app uses, and it proves the proxy mints identity
// the caller cannot forge. It says nothing about a caller who does not use the
// proxy — so this check calls the service the way an attacker would.
//
// What it proves is the shape of the assertion design: identity does not EXIST
// outside a verified envelope. There are no identity headers to forge — a
// claim arrives inside a token signed by the deployment, carrying its own
// expiry and the integration it is for, and everything else is a 401. The
// admitted case is proven too, because three refusals pass on a service that
// refuses everything, and that is not the property being claimed.
//
// Run: pnpm --filter lyra exec tsx src/dev/perimeter-check.ts
import { createAssertionSigner } from '@niscorp/moss';
import { startIntegrations } from '../../../lyra-integrations/src/serve';
import { ok, report } from './world';

// A PORT OF ITS OWN, so this check cannot fight the service somebody is
// running to look at. They used to share 8799: every suite run killed the
// development instance, and the screen then said 'the service did not answer
// with a bundle' — an accurate message about a problem the checks had caused.
const PORT = 8798;
const BASE = `http://127.0.0.1:${PORT}`;

// THIS CHECK STANDS WHERE MOSS STANDS: it holds a signing keypair and the
// service holds the public half, exactly as a deployment hands it over. A
// second signer below is the impostor — same algorithm, same token shape, a
// key the service has never seen.
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
  // The service is up and holds data worth stealing.
  const selftest = (await fetch(`${BASE}/belts/_selftest`).then((r) => r.json())) as Record<string, number>;
  ok('the service is reachable and holds records', (selftest['north'] ?? 0) > 0, `${selftest['north']} belts`);

  // ── claims without an envelope ───────────────────────────────
  //
  // The old wire: identity as bare headers. There is nothing left that reads
  // them — not "they are checked", they are not identity at all.
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

  // Signature intact, payload edited: the studio swapped inside a genuine
  // token. The signature is over the payload bytes, so one changed byte
  // unverifies the whole claim.
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

  // A verified envelope carrying another studio: the token decides, and there
  // is no header beside it to disagree with.
  const lumen = await direct('/belts/roster', {
    authorization: `Bearer ${deployment.mint({ integration: 'belts', principal: 'p_x', scope: { studioId: 'st_lumen' } })}`,
    'x-nisc-scope-studioid': 'st_northrock',
  });
  ok('...and a header beside the token moves nothing', lumen.body === '[]', `${lumen.body} — identity is only what was signed`);

  // ── what stays open, deliberately ────────────────────────────
  //
  // The bundle is what the service publishes about itself: actions and layouts,
  // no studio's data in it. moss fetches it at registration, before the verify
  // key has ever reached this environment, so it cannot be behind anything.
  const bundle = await fetch(`${BASE}/belts/bundle`);
  ok('the bundle stays open — it is what the service publishes about itself', bundle.status === 200, String(bundle.status));

  await service.close();
  report('identity does not exist outside a verified envelope.');
} catch (err) {
  await service.close();
  throw err;
}
