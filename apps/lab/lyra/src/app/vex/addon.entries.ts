import type { CacheEntry, MutationEntry } from './index';

const row = (name: string) => ({ $get: { from: { $var: 'a' }, path: [name] } });

export const addonsList: CacheEntry = {
  fingerprint: 'addons/list',
  intent: 'Integrations this deployment offers, and whether this studio has them',
  shape: [{ integration_id: '', title: '', tagline: '', description: '', adds: '', settings_action: '', installed: false, state_label: '', state_tone: '' }],
  dsl: {
    from: ['integrations'],
    // The tile's words come off the row, where intake put them from the
    // bundle's meta — the store never parses a bundle.
    fields: ['integrations.id', 'integrations.status', 'integrations.title', 'integrations.tagline', 'integrations.description', 'integrations.adds', 'integrations.settings_action'],
    // Only what an operator has approved is on sale. A pending integration is
    // one nobody has looked at yet, and it should not appear in a shop.
    filter: { eq: ['integrations.status', 'approved'] },
    sort: [{ field: 'integrations.id', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'a',
      body: {
        integration_id: row('id'),
        // The id-or-title fallback happens in the store's stitch derivation —
        // a bundle that shipped no meta still gets a tile named by its id.
        title: row('title'),
        tagline: row('tagline'),
        description: row('description'),
        adds: row('adds'),
        settings_action: row('settings_action'),
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

// ── the two writes ───────────────────────────────────────────
//
// Install used to be THREE fingerprints choreographed by a server function:
// re-enable (no-op when absent), read the installed list, insert only if
// still missing. ON CONFLICT is that whole dance as one atomic statement —
// fresh install inserts, a previously removed one flips back on, and there
// is no state it starts from that it gets wrong. The tenant column is scope-
// pinned into both the insert AND the conflict target, so the row it can
// revive is only ever this studio's own.

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
