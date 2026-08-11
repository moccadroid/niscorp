import type { ActionDefinition, LayoutNode } from '@niscorp/nova';

// REGISTERED INTEGRATIONS.
//
// Two decisions live in two places and it is worth being exact about which:
//
//   HERE, in this tool: is a service allowed to extend this deployment at all,
//   and which scopes may it read. Platform-level, keyed seam, no principal.
//
//   IN LYRA, on the owner's Add-ons screen: does THIS studio turn it on. Tenant
//   level, under the charter, attributable to a person.
//
// So an integration approved here is available to every studio and installed by
// none of them until an owner says so.
//
// LAID OUT BY INTEGRATION, not by widget. The version this replaces had a
// notice, a form, a state table and a scope table — four boxes about one
// integration, and eight about two. Everything for one service is now in one
// card.

const layout: LayoutNode = {
  component: 'Stack',
  props: { gap: 24 },
  children: [
    { component: 'Hero', props: { title: 'Integrations', lead: 'Services allowed to extend this deployment.' } },

    {
      component: 'Cards',
      props: {
        rows: '$.rows',
        empty: 'No integrations registered.',
        titleKey: 'id',
        subtitleKey: 'url',
        badgeKey: 'badge',
        problemKey: 'problem',
        factsKey: 'facts',
        scopesKey: 'scopes',
        scopesLabel: 'Read scopes',
        actions: [
          { label: 'Probe', ref: 'probe' },
          { label: 'Re-import bundle', ref: 'reimport' },
          { label: 'Approve', ref: 'approve', showKey: 'pending' },
          { label: 'Delete', ref: 'remove' },
        ],
      },
    },

    // ── register ─────────────────────────────────────────────
    //
    // Last, because it is used once per service and the list above is what an
    // operator opens this for.
    {
      component: 'Section',
      props: { title: 'Register a service', subtitle: 'Fetches its bundle. Nothing it ships is served until you approve it.' },
      children: {
        component: 'Card',
        props: { pad: 16 },
        children: {
          component: 'Stack',
          props: { gap: 12 },
          children: [
        { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },
        { if: '$.announceResult.said', then: { component: 'Notice', props: { tone: 'calm', message: '$.announceResult.said' } }, else: '' },
        // THE MINTED KEY LANDS HERE, ONCE. Registration is where the deployment
        // issues the integration its credential — the row keeps only the hash,
        // so this block is the one chance to copy it into the service's
        // environment. Its own component, because it is not a status line: it
        // arrives masked, reveals on purpose, and carries its own warning.
        // Renders nothing when the answer carried no key, which is every
        // re-import.
        { component: 'Secret', props: { value: '$.announceResult.key' } },
        {
          component: 'Row',
          props: { gap: 14, wrap: true, align: 'end' },
          children: [
            { component: 'Input', props: { label: 'Id', placeholder: 'belts' }, ref: 'newId', model: '$.newId' },
            { component: 'Input', props: { label: 'Bundle URL', placeholder: 'http://127.0.0.1:8799/belts' }, ref: 'newUrl', model: '$.newUrl' },
            { component: 'Button', props: { label: 'Register' }, ref: 'announce' },
          ],
        },
          ],
        },
      },
    },
  ],
};

// Every path that changes something re-reads the list. Written once here rather
// than repeated in six triggers.
const RELOAD = { call: 'load', onSuccess: [{ set: 'rows', value: '$.listing.rows' }] };

// RELOADED ON FAILURE TOO, and that is not belt-and-braces. A failed import is
// RECORDED — the row keeps its last error — so re-reading the list is what puts
// the reason on screen and leaves it there. Without this a registration that
// could not reach the service changed nothing visible at all: Lyra knew, the
// operator did not.
const DONE = { onSuccess: [RELOAD], onError: [RELOAD] };

export const integrationsAction: ActionDefinition = {
  id: 'admin.integrations',
  title: 'Integrations',
  data: { rows: [], loading: true, error: '', newId: '', newUrl: '', pendingId: '' },
  layout,
  endpoints: {
    load: { fn: 'admin.integrations.list', target: 'listing' },
    // Targeted because a fn with no target writes nowhere, and a binding onto
    // nothing renders as an empty box rather than as an error.
    announce: { fn: 'admin.integrations.announce', target: 'announceResult', errorTarget: 'error' },
    approve: { fn: 'admin.integrations.approve', errorTarget: 'error' },
    remove: { fn: 'admin.integrations.remove', errorTarget: 'error' },
    probe: { fn: 'admin.integrations.probe', target: 'probeResult', errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'rows', value: '$.listing.rows' }, { set: 'loading', value: false }] }] },
  triggers: [
    { event: 'ui:model', ref: 'newId', do: [{ set: 'newId', value: '@event.payload' }] },
    { event: 'ui:model', ref: 'newUrl', do: [{ set: 'newUrl', value: '@event.payload' }] },

    { event: 'ui:click', ref: 'announce', do: [{ set: 'error', value: '' }, { call: 'announce', ...DONE }] },

    // The id lands BEFORE the call — a call ahead of the set sends whatever the
    // previous row left behind.
    { event: 'ui:click', ref: 'approve', do: [{ set: 'pendingId', value: '@event.payload.id' }, { set: 'error', value: '' }, { call: 'approve', ...DONE }] },
    // DELETING CLEARS THE REGISTRATION PANEL, key included. Removal is what
    // kills a key — the hash goes with the row — so a block still offering the
    // value after the delete is offering a credential that resolves to
    // nothing. Approve deliberately does NOT clear it: the key is alive and
    // the operator may not have copied it yet.
    { event: 'ui:click', ref: 'remove', do: [{ set: 'pendingId', value: '@event.payload.id' }, { set: 'announceResult', value: '' }, { set: 'error', value: '' }, { call: 'remove', ...DONE }] },
    { event: 'ui:click', ref: 'probe', do: [{ set: 'pendingId', value: '@event.payload.id' }, { set: 'error', value: '' }, { call: 'probe', ...DONE }] },

    // Re-import carries no credential at all: the key was minted at first
    // registration and the row keeps only its hash, so publishing a new bundle
    // is the same call with nothing secret in it.
    {
      event: 'ui:click',
      ref: 'reimport',
      do: [
        { set: 'newId', value: '@event.payload.id' },
        { set: 'newUrl', value: '@event.payload.url' },
        { set: 'error', value: '' },
        { call: 'announce', ...DONE },
      ],
    },
  ],
};
