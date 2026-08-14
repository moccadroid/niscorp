import type { MossServer } from '@niscorp/moss';
import type { PgPool } from '@niscorp/vex';

// ── DEV ONLY: STAND THE INTEGRATIONS BACK UP ON EVERY BOOT ────
//
// Lyra's database is in-memory and replayed from seed each start, so the
// integrations table — who is registered, approved, installed — is empty every
// boot. In production an operator registers an integration once and it stays; in dev it
// vanishes on every save, and the store reads "Nothing on offer" until somebody
// re-runs the whole register → approve → install dance by hand.
//
// This does that dance automatically when `LYRA_DEV_PACKS` names an integration. It is
// the same three operator calls a person would make, in the same order, through
// the same surfaces — nothing here is a privileged shortcut. Off by default and
// unreachable without the env var, so it cannot touch a real deployment.
//
// Format: `LYRA_DEV_PACKS="stripe@http://127.0.0.1:8799/stripe,belts@http://127.0.0.1:8799/belts"`
// — 8799 being where the integrations service actually listens in dev; this
// example said 8781 for a while and cost two sessions an empty store.
// An integration that is not running yet fails its fetch and is logged and skipped — it
// registers on the next boot once it is up, rather than taking lyra down.

type DevPack = { id: string; url: string };

const parse = (raw: string): DevPack[] =>
  raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
    .map((entry) => {
      const at = entry.lastIndexOf('@');
      return { id: entry.slice(0, at), url: entry.slice(at + 1) };
    })
    .filter((p) => p.id !== '' && p.url !== '');

export const registerDevPacks = async (
  server: MossServer,
  pool: PgPool,
  operatorKey: string,
  reloadDirectory: () => Promise<void>,
): Promise<void> => {
  const raw = process.env['LYRA_DEV_PACKS'] ?? '';
  if (raw === '' || operatorKey === '') return;

  const op = async (path: string, body: unknown): Promise<Response> =>
    server.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-operator-key': operatorKey },
      body: JSON.stringify(body),
    });

  // Every studio, so a dev signs in as any owner and finds the integration already on.
  const studios = (await pool.query('SELECT id FROM studios ORDER BY id')).rows as { id: string }[];

  for (const integration of parse(raw)) {
    try {
      const registered = await op('/operator/integrations', { id: integration.id, url: integration.url });
      if (!registered.ok) {
        console.warn(`[dev-packs] ${integration.id}: ${integration.url} did not register (${registered.status}) — is it running? skipping.`);
        continue;
      }
      await op(`/operator/integrations/${integration.id}/approve`, {});
      // Install straight into the tenancy table the operator seam does not touch
      // — the same rows the owner's own install writes, so every studio has it.
      for (const studio of studios) {
        await pool.query(
          `INSERT INTO studio_integrations (studio_id, integration_id, enabled)
           VALUES ($1, $2, true) ON CONFLICT (studio_id, integration_id) DO UPDATE SET enabled = true`,
          [studio.id, integration.id],
        );
      }
      console.log(`[dev-packs] ${integration.id} registered, approved and installed for ${studios.length} studios`);
    } catch (err) {
      console.warn(`[dev-packs] ${integration.id} failed: ${String(err).slice(0, 140)}`);
    }
  }

  // The install rows landed after the directory snapshot was taken at boot, so
  // re-read it — otherwise `installedFor` returns the empty pre-install list and
  // the integration's screens stay hidden — then re-resolve the manifest.
  await reloadDirectory();
  server.refresh();
};
