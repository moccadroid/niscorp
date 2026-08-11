import type { CacheEntry, MutationEntry } from './index';

// WHAT A STUDIO HAS BOUGHT.
//
// Registration is a PLATFORM act — pointing the deployment at a service and
// approving what it may read — and it lives behind the operator seam, keyed,
// with no principal. This is the other half: a studio turning one on. That is a
// tenant decision made by somebody signed in, so it lives here, under the
// charter, where it can be attributed to a person.
//
// The catalogue side of it (`integrations`) is a table moss owns, so this read
// joins across a boundary the app does not otherwise cross. That is fine and
// deliberate: the app is allowed to know what is on sale.

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
        // The id-or-title fallback happens in `addons.stitch`, in plain code —
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

// WHICH ONES THIS STUDIO HOLDS, as its own read rather than a join.
//
// `integrations` is not scoped by studio — it is the deployment's catalogue, the
// same rows for everybody. `studio_integrations` IS scoped, by the tenant rule
// like every other table here. Joining them in one query would put an unscoped
// table and a scoped one in the same FROM and make the answer depend on which
// rule won; two reads keep each one's boundary its own.
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
// `studio_id` is stamped from scope, so "install it for somebody else's studio"
// is not a request the grammar can phrase.

export const addonInstall: MutationEntry = {
  fingerprint: 'addons/install',
  intent: 'Turn an integration on for this studio',
  mutation: {
    op: 'insert',
    table: 'studio_integrations',
    values: { integration_id: { $context: 'integrationId' }, enabled: true },
  },
};

export const addonUninstall: MutationEntry = {
  fingerprint: 'addons/uninstall',
  intent: 'Turn an integration off for this studio',
  // An UPDATE rather than a delete: what a studio bought and stopped paying for
  // is a fact worth keeping, and the integration's own records survive either
  // way — so re-installing restores what was there.
  mutation: {
    op: 'update',
    table: 'studio_integrations',
    set: { enabled: false },
    where: { eq: ['studio_integrations.integration_id', { $context: 'integrationId' }] },
  },
};

// The other half of the toggle uninstall creates. Install is an INSERT and the
// row uninstall leaves behind keeps the primary key — so installing a second
// time needs this UPDATE instead, and `addons.apply` (the fn) is what decides
// which of the two the moment calls for. The grammar cannot branch; the fn can.
export const addonReenable: MutationEntry = {
  fingerprint: 'addons/reenable',
  intent: 'Turn a previously uninstalled integration back on',
  mutation: {
    op: 'update',
    table: 'studio_integrations',
    set: { enabled: true },
    where: { eq: ['studio_integrations.integration_id', { $context: 'integrationId' }] },
  },
};
