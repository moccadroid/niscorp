// Run: pnpm --filter lyra exec tsx src/dev/admin-check.ts
import { OPERATOR_KEY } from './operator-key'; // FIRST — before the world boots; see that file
import { createSeam } from '../../../lyra-admin/src/seam';
import { buildAdminServer } from '../../../lyra-admin/src/service';
import { startIntegrations } from '../../../lyra-integrations/src/serve';
import { mintDevToken } from '@niscorp/moss';
import { ok, report, server } from './world';

// Set in `./operator-key` BEFORE the world is imported: moss reads it once, at boot.
const KEY = OPERATOR_KEY;
// Its own port, so a suite run cannot kill the instance somebody is looking at.
const PORT = 8798;
const service = startIntegrations(PORT);

const seam = createSeam(
  async (path, init) => {
    const response = await server.request(path, init);
    return { ok: response.ok, status: response.status, json: () => response.json() };
  },
  KEY,
);

// THE KEY IS READ ONCE, AT BOOT, so one server is in one state for as long as
// it lives. This used to say the seam reads it per request and proved off,
// wrong and right against a single Lyra by assigning the key halfway down —
// which meant "a wrong key" was only ever presented to a seam that was OFF,
// where every key is wrong. Lyra is booted WITH the key here, so no key and a
// wrong key are refused by a seam that would have answered the right one. Off
// is the state of every world that did not ask for a key, and `shell-check`
// holds it there.
const admin = await buildAdminServer(seam);

const screen = async (): Promise<string> => {
  const response = await admin.request('/catalog', { headers: { Authorization: `Bearer ${mintDevToken('op_lyra')}` } });
  return JSON.stringify(await response.json());
};

try {
  // ── the tool is not a way in ─────────────────────────────────
  const anonymous = await admin.request('/catalog');
  const anonCatalog = (await anonymous.json()) as { actions: string[] };
  ok('an anonymous principal holds no admin surface', anonCatalog.actions.length === 0, `${anonCatalog.actions.length} actions`);

  const operator = await screen();
  ok('...and an operator holds the integrations screen', operator.includes('admin.integrations'), operator.slice(0, 90));

  // ── the seam refuses without the key ─────────────────────────
  const noKey = await server.request('/operator/integrations');
  const noKeyAnswer = await noKey.text();
  ok('the seam does not exist without a key', noKey.status === 404, String(noKey.status));

  // The same BYTES, not only the same status: a refusal that worded itself
  // differently for "you sent nothing" and "you sent the wrong thing" would
  // tell a stranger the path is real and a key is what it wants.
  const wrongKey = await server.request('/operator/integrations', { headers: { 'x-operator-key': 'guess' } });
  ok(
    '...and a wrong key gets the same answer as none',
    wrongKey.status === 404 && (await wrongKey.text()) === noKeyAnswer,
    'a tool cannot tell an unset key from a bad one, and neither can anybody else',
  );

  // Falsifiable: the two refusals above prove nothing against a seam that is
  // simply off. Same path, same server, the right key.
  const rightKey = await server.request('/operator/integrations', { headers: { 'x-operator-key': KEY } });
  ok('...while the right one is answered, by the same seam', rightKey.status === 200, String(rightKey.status));

  const oldPath = await server.request('/api/integrations', { method: 'POST', body: '{}' });
  ok('registration is gone from the principal-facing surface', oldPath.status >= 400, String(oldPath.status));

  // ── the tool does the work ───────────────────────────────────
  const listed = (await seam.get('/operator/integrations')) as { integrations: unknown[] };
  ok('the tool reads the registry through the seam', Array.isArray(listed.integrations), `${listed.integrations.length} registered`);

  const announced = (await seam.post('/operator/integrations', { id: 'belts', url: `http://127.0.0.1:${PORT}/belts` })) as Record<string, unknown>;
  ok('announcing through the tool registers', announced['status'] === 'pending', JSON.stringify({ ...announced, key: '…' }));

  ok('...and the minted key is in that answer, once', String(announced['key'] ?? '').startsWith('ik_'), 'issued by the deployment, never received by it');

  const probe = (await seam.post('/operator/integrations/belts/probe', { path: 'bundle' })) as { status: number; ms: number };
  ok('a live probe says what the service answered', probe.status === 200, `${probe.status} in ${probe.ms}ms — the line that saves the hunt`);

  await seam.post('/operator/integrations/belts/approve', {});
  const after = (await seam.get('/operator/integrations')) as { integrations: { id: string; status: string; approvedData: string[] }[] };
  const belts = after.integrations.find((i) => i.id === 'belts');
  ok('approving through the tool grants', belts?.status === 'approved', JSON.stringify(belts));
  ok('...exactly what was asked for', (belts?.approvedData ?? []).join(',') === 'studio_people.read,people.read', (belts?.approvedData ?? []).join(', '));

  // ── the tool cannot reach a studio's data ────────────────────
  const noVex = await admin.request('/api/vex', { method: 'POST', body: JSON.stringify({ fingerprint: 'members/list', context: {} }) });
  ok('the tool has no vex surface of its own', noVex.status >= 400, String(noVex.status));

  await seam.del('/operator/integrations/belts');
  await service.close();
  report('two apps, one seam: the tool administers Lyra and can reach nothing inside it.');
} catch (err) {
  await service.close();
  throw err;
}
