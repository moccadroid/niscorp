import { z } from 'zod';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import { addonsInstalled, addonsList } from '@lyra/app/vex/addon.entries';

// THE STORE.
//
// Two reads rather than one, and the layout marks the rows: what the deployment
// offers, and what this studio holds. An owner sees a list and a button; they
// never see a permission dialog, because what an integration may read was
// settled by an operator before it was ever listed. A store that asked every
// owner to approve `memberships.read` would be a store where everybody clicks
// yes.
//
// Installing writes one row. What it changes is the CATALOG: moss drops every
// `ext.*` action outside a studio's installed set, so turning this on is what
// makes the screens appear in the menu — for this studio and nobody else.

const listPrism = { fingerprint: addonsList.fingerprint, context: {} };
const installedPrism = { fingerprint: addonsInstalled.fingerprint, context: {} };

// TILES, NOT ROWS. Each add-on is a card built from its bundle's meta — the
// name, the line under it, the paragraph, and the derived "Adds …" sentence
// that says what appears where BEFORE anybody installs anything. The buttons
// are the store's whole verb set: Install, Remove, and — only when installed
// and only when the pack shipped one — its Settings. Nothing functional ever
// renders here; this is a store.
const layout: LayoutNode = {
  component: 'Stack',
  props: { gap: 22 },
  children: [
    { component: 'Hero', props: { title: 'Add-ons', lead: 'What this studio can turn on. Screens land where they belong — a store, not a menu.' } },
    { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },
    // TILES, NOT ROWS — the shape a store is. As a table the description had
    // a 150px track between fixed columns totalling 410px and clipped at the
    // ellipsis every time: "Adds a Belt panel on p…". No width fixed that;
    // prose in a spreadsheet cell was the wrong container.
    {
      component: 'Cards',
      props: {
        rows: '$.rows',
        loading: '$.loading',
        rowKey: 'integration_id',
        titleKey: 'name',
        subtitleKey: 'tagline',
        bodyKey: 'description',
        badgeKey: 'state_label',
        badgeToneKey: 'state_tone',
        factsKey: 'facts',
        icon: 'addons',
        columns: 340,
        empty: 'Nothing on offer yet.',
        emptyHint: 'Add-ons appear here once an operator has approved them for this deployment.',
        emptyIcon: 'addons',
        actions: [
          { label: 'Install', ref: 'install', variant: 'outline', icon: 'plus', hideKey: 'installed' },
          { label: 'Settings', ref: 'openSettings', variant: 'ghost', icon: 'settings', showKey: 'has_settings' },
          { label: 'Remove', ref: 'uninstall', variant: 'ghost', showKey: 'installed' },
        ],
      },
    },
  ],
};

// The two reads are stitched here rather than in a query, because they are
// scoped differently: the catalogue is the deployment's and the installs are
// this studio's. A `fn:` is the only place that can hold both without one
// table's rule deciding the other's answer.
export const addonsAction: ActionDefinition = {
  id: 'studio.addons',
  title: 'Add-ons',
  data: { rows: [], offered: [], installed: [], loading: true, error: '', pendingId: '', pendingEnable: false },
  layout,
  endpoints: {
    // A failed read says so and stops pretending to load. The skeleton with no
    // error was this screen's first recorded fault: a refusal underneath and
    // grey bars on top, forever.
    offered: { url: '/api/studio/vex', method: 'POST', request: listPrism, target: 'offered', errorTarget: 'error' },
    installed: { url: '/api/studio/vex', method: 'POST', request: installedPrism, target: 'installed', errorTarget: 'error' },
    stitch: { fn: 'addons.stitch', target: 'rows' },
    // ONE fn for both directions of the toggle. Install-after-uninstall is an
    // UPDATE where first-install is an INSERT (the uninstalled row keeps its
    // key), the grammar cannot branch, and the write is only half the job —
    // the directory snapshot and the catalog memos must follow, or the menu
    // never learns what the studio just bought. See `addons.apply` in nav.ts.
    apply: { fn: 'addons.apply', errorTarget: 'error' },
  },
  lifecycle: {
    mount: [
      { call: 'offered', onError: [{ set: 'loading', value: false }] },
      { call: 'installed', onSuccess: [{ call: 'stitch', onSuccess: [{ set: 'loading', value: false }] }], onError: [{ set: 'loading', value: false }] },
    ],
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'install',
      do: [
        { set: 'pendingId', value: '@event.payload.integration_id' },
        { set: 'pendingEnable', value: true },
        { set: 'error', value: '' },
        { call: 'apply', onSuccess: [{ emit: { channel: 'addons-changed' } }] },
      ],
    },
    {
      event: 'ui:click',
      ref: 'uninstall',
      do: [
        { set: 'pendingId', value: '@event.payload.integration_id' },
        { set: 'pendingEnable', value: false },
        { set: 'error', value: '' },
        { call: 'apply', onSuccess: [{ emit: { channel: 'addons-changed' } }] },
      ],
    },
    // THE ONE INTEGRATION ACTION A STORE MAY OPEN: the pack's own settings,
    // on the sheet, from its tile. The id comes off the row, which came off
    // the bundle's `settings` declaration through intake — the store never
    // knows an integration's name.
    {
      event: 'ui:click',
      ref: 'openSettings',
      do: [{ push: { action: '@event.payload.settings_action', canvas: 'sheet', with: ['sheet'] } }],
    },
    // The fn re-resolved the catalog server-side; these re-reads are only the
    // store repainting its own list.
    {
      message: 'addons-changed',
      do: [{ call: 'offered' }, { call: 'installed', onSuccess: [{ call: 'stitch' }] }],
    },
  ],
};

export const addonsInputSchema = z.toJSONSchema(z.object({}));
