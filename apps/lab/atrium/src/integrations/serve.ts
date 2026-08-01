// The integrations service as a process: `pnpm --filter atrium integrations`.
// The service itself is a factory (service.ts) so the checks can start and stop
// it; this file is only the listener around it.
//
// Runs under `tsx watch`: the app server reboots on save inside vite, and this
// process does the same on its own clock. Editing a bundle restarts THIS, and
// the app picks the change up at its next sync — which is the deployment model
// in miniature.
import { startIntegrationsService } from './service';

const main = async (): Promise<void> => {
  const { port } = await startIntegrationsService();
  console.log(`integrations service listening on http://127.0.0.1:${port}`);
  console.log('  GET  /:vendor/bundle — THE discovery surface: capabilities, actions, queries, slots, menus, tables');
  console.log('  GET  /:vendor/capabilities · POST /opera/key · /opera/upgrades · /mews/spa/slots · /mews/spa/book');
  console.log('stop this process and the app keeps serving — the last-synced bundles stay in its rows, and only the live integration calls fail, honestly.');
};

void main();
