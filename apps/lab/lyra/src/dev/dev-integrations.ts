import type { MossServer } from '@niscorp/moss';
import type { PgPool } from '@niscorp/vex';

type DevIntegration = { id: string; url: string };

const parse = (raw: string): DevIntegration[] =>
  raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
    .map((entry) => {
      const at = entry.lastIndexOf('@');
      return { id: entry.slice(0, at), url: entry.slice(at + 1) };
    })
    .filter((p) => p.id !== '' && p.url !== '');

export const registerDevIntegrations = async (
  server: MossServer,
  pool: PgPool,
  operatorKey: string,
  reloadDirectory: () => Promise<void>,
): Promise<void> => {
  const raw = process.env['LYRA_DEV_INTEGRATIONS'] ?? '';
  if (raw === '' || operatorKey === '') return;

  const op = async (path: string, body: unknown): Promise<Response> =>
    server.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-operator-key': operatorKey },
      body: JSON.stringify(body),
    });

  const studios = (await pool.query('SELECT id FROM studios ORDER BY id')).rows as { id: string }[];

  for (const integration of parse(raw)) {
    try {
      const registered = await op('/operator/integrations', { id: integration.id, url: integration.url });
      if (!registered.ok) {
        console.warn(`[dev-integrations] ${integration.id}: ${integration.url} did not register (${registered.status}) — is it running? skipping.`);
        continue;
      }
      await op(`/operator/integrations/${integration.id}/approve`, {});
      for (const studio of studios) {
        await pool.query(
          `INSERT INTO studio_integrations (studio_id, integration_id, enabled)
           VALUES ($1, $2, true) ON CONFLICT (studio_id, integration_id) DO UPDATE SET enabled = true`,
          [studio.id, integration.id],
        );
      }
      console.log(`[dev-integrations] ${integration.id} registered, approved and installed for ${studios.length} studios`);
    } catch (err) {
      console.warn(`[dev-integrations] ${integration.id} failed: ${String(err).slice(0, 140)}`);
    }
  }

  await reloadDirectory();
  server.refresh();
};
