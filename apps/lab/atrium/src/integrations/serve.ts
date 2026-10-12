import { startIntegrationsService } from './service';

const main = async (): Promise<void> => {
  const { port } = await startIntegrationsService();
  console.log(`integrations service listening on http://127.0.0.1:${port}`);
  console.log('  GET  /:vendor/bundle — THE discovery surface: capabilities, actions, queries, slots, menus, tables');
  console.log('  GET  /:vendor/capabilities · POST /opera/key · /opera/upgrades · /mews/spa/slots · /mews/spa/book');
  console.log('stop this process and the app keeps serving — the last-synced bundles stay in its rows, and only the live integration calls fail, honestly.');
};

void main();
