// THE ADMINISTRATION TOOL, DRIVEN AGAINST A REAL LYRA.
//
// Two nisc apps in one process, talking over the operator seam. The tool has no
// database — an unseeded PGlite whose introspection finds no tables — so every
// fact on its screen came back through the seam, and there is no path from a
// pane to a studio's rows because there is no engine underneath to ask.
//
// The seam is a PARAMETER, which is what makes this possible: the tool takes a
// fetcher, and here it gets Lyra's own `server.request` instead of a socket. An
// administration tool that could only be driven over a port would be a tool
// welded to a deployment.
//
// Run: pnpm --filter lyra exec tsx src/dev/admin-check.ts
import { createSeam } from '../../../lyra-admin/src/seam';
import { buildAdminServer } from '../../../lyra-admin/src/service';
import { startIntegrations } from '../../../lyra-integrations/src/serve';
import { mintDevToken } from '@niscorp/moss';
import { ok, report, runtime, server } from './world';

const KEY = 'lab-operator-key';
// A PORT OF ITS OWN, so this check cannot fight the service somebody is
// running to look at. They used to share 8799: every suite run killed the
// development instance, and the screen then said 'the service did not answer
// with a bundle' — an accurate message about a problem the checks had caused.
const PORT = 8798;
const service = startIntegrations(PORT);

// The tool's client half, pointed at Lyra's request handler rather than a
// socket. Same code path a deployed admin runs.
const seam = createSeam(
  async (path, init) => {
    const response = await server.request(path, init);
    return { ok: response.ok, status: response.status, json: () => response.json() };
  },
  KEY,
);

// SET AFTER BOOT, deliberately. The seam reads the key per request, so a lab
// can turn it on without an environment variable and a check can prove both
// sides of it — off, wrong, and right — in one process.
const admin = await buildAdminServer(seam);

const screen = async (): Promise<string> => {
  const response = await admin.request('/catalog', { headers: { Authorization: `Bearer ${mintDevToken('op_lyra')}` } });
  return JSON.stringify(await response.json());
};

try {
  // ── the tool is not a way in ─────────────────────────────────
  //
  // A stranger who finds this port gets an application with no surfaces. Not a
  // login page to attack — nothing is hidden, because nothing is there.
  const anonymous = await admin.request('/catalog');
  const anonCatalog = (await anonymous.json()) as { actions: string[] };
  ok('an anonymous principal holds no admin surface', anonCatalog.actions.length === 0, `${anonCatalog.actions.length} actions`);

  const operator = await screen();
  ok('...and an operator holds the integrations screen', operator.includes('admin.integrations'), operator.slice(0, 90));

  // ── the seam refuses without the key ─────────────────────────
  const noKey = await server.request('/operator/integrations');
  ok('the seam does not exist without a key', noKey.status === 404, String(noKey.status));

  const wrongKey = await server.request('/operator/integrations', { headers: { 'x-operator-key': 'guess' } });
  ok('...and a wrong key gets the same answer as none', wrongKey.status === 404, 'a tool cannot tell an unset key from a bad one, and neither can anybody else');

  // THE HOLE THIS SEAM CLOSED. Registration used to sit on `/api/integrations`
  // with no principal check at all — anyone who could reach the server could
  // point the deployment at any URL and approve it for `memberships.read`.
  const oldPath = await server.request('/api/integrations', { method: 'POST', body: '{}' });
  ok('registration is gone from the principal-facing surface', oldPath.status >= 400, String(oldPath.status));

  // ── the tool does the work ───────────────────────────────────
  //
  // The key goes on here, after the two refusals above have been proven.
  runtime.operatorKey = KEY;

  const listed = (await seam.get('/operator/integrations')) as { integrations: unknown[] };
  ok('the tool reads the registry through the seam', Array.isArray(listed.integrations), `${listed.integrations.length} registered`);

  const announced = (await seam.post('/operator/integrations', { id: 'belts', url: `http://127.0.0.1:${PORT}/belts` })) as Record<string, unknown>;
  ok('announcing through the tool registers', announced['status'] === 'pending', JSON.stringify({ ...announced, key: '…' }));

  // THE KEY RIDES THE FIRST ANSWER AND NOTHING ELSE. Registration is where the
  // deployment issues the integration its credential; the pane shows it once,
  // the operator puts it in the service's environment, and the row keeps only
  // the hash — so a re-import has nothing to repeat.
  ok('...and the minted key is in that answer, once', String(announced['key'] ?? '').startsWith('ik_'), 'issued by the deployment, never received by it');

  const probe = (await seam.post('/operator/integrations/belts/probe', { path: 'bundle' })) as { status: number; ms: number };
  ok('a live probe says what the service answered', probe.status === 200, `${probe.status} in ${probe.ms}ms — the line that saves the hunt`);

  await seam.post('/operator/integrations/belts/approve', {});
  const after = (await seam.get('/operator/integrations')) as { integrations: { id: string; status: string; approvedData: string[] }[] };
  const belts = after.integrations.find((i) => i.id === 'belts');
  ok('approving through the tool grants', belts?.status === 'approved', JSON.stringify(belts));
  ok('...exactly what was asked for', (belts?.approvedData ?? []).join(',') === 'memberships.read,people.read', (belts?.approvedData ?? []).join(', '));

  // ── the tool cannot reach a studio's data ────────────────────
  //
  // Structural, not enforced: its charter has no `data` section, its runtime has
  // no tables, and its only route out is the seam. There is nothing to ask.
  const noVex = await admin.request('/api/vex', { method: 'POST', body: JSON.stringify({ fingerprint: 'members/list', context: {} }) });
  ok('the tool has no vex surface of its own', noVex.status >= 400, String(noVex.status));

  await seam.del('/operator/integrations/belts');
  await service.close();
  report('two apps, one seam: the tool administers Lyra and can reach nothing inside it.');
} catch (err) {
  await service.close();
  throw err;
}
