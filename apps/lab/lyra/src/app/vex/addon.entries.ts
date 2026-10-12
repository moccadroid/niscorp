import type { CacheEntry, MutationEntry } from './index';

const row = (...path: string[]) => ({ $get: { from: { $var: 'a' }, path } });

export const addonsList: CacheEntry = {
  fingerprint: 'addons/list',
  intent: 'Integrations this deployment offers, and whether this studio has them',
  shape: [{ integration_id: '', title: '', tagline: '', description: '', adds: '', settings_action: '', installed: false, state_label: '', state_tone: '' }],
  dsl: {
    from: ['integrations'],
    fields: ['integrations.id', 'integrations.status', 'integrations.extension'],
    filter: { eq: ['integrations.status', 'approved'] },
    sort: [{ field: 'integrations.id', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'a',
      body: {
        integration_id: row('id'),
        title: row('extension', 'meta', 'title'),
        tagline: row('extension', 'meta', 'tagline'),
        description: row('extension', 'meta', 'description'),
        adds: row('extension', 'adds'),
        settings_action: row('extension', 'settings'),
      },
    },
  },
};

export const addonsInstalled: CacheEntry = {
  fingerprint: 'addons/installed',
  intent: 'Integrations this studio has turned on',
  shape: [{ integration_id: '' }],
  dsl: {
    from: ['studio_integrations'],
    fields: [{ field: 'studio_integrations.integration_id', as: 'integration_id' }],
    filter: { eq: ['studio_integrations.enabled', true] },
  },
};

export const addonInstall: MutationEntry = {
  fingerprint: 'addons/install',
  intent: 'Turn an integration on for this studio — fresh, or back on after a removal',
  mutation: {
    op: 'insert',
    table: 'studio_integrations',
    values: { integration_id: { $context: 'integrationId' }, enabled: true },
    onConflict: { target: ['studio_id', 'integration_id'], set: { enabled: true } },
  },
};

export const addonUninstall: MutationEntry = {
  fingerprint: 'addons/uninstall',
  intent: 'Turn an integration off for this studio',
  mutation: {
    op: 'update',
    table: 'studio_integrations',
    set: { enabled: false },
    where: { eq: ['studio_integrations.integration_id', { $context: 'integrationId' }] },
  },
};
