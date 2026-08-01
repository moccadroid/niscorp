import type { ActionDefinition } from '@niscorp/nova';
import { entriesLayout } from './entries.layout';
import { panelTriggers } from './panel';

// THE DATA API — every seeded cache entry, which is to say every read and every
// write the application is capable of making.
//
// The app is warm-only: an unknown fingerprint is a 500, never a silent
// generate. So the entries are not a cache in the usual sense, they are the API
// surface, and the fact that half of them arrived as `bundle_entries` rows from
// a vendor's service makes them the least readable half of the system — until
// now the only way to see one was to query the database and squint at JSON.
//
// Two derived facts are worth as much as the listing, and neither is visible
// from anywhere else:
//
//   ORPHANS  — seeded, called by nothing. Either dead weight or a surface
//              somebody forgot to wire. (`surface/matrix` sat like this for
//              weeks: a perfectly good estate-wide read with no caller.)
//   MISSING  — called, never seeded. In a warm-only app that is a 500 waiting
//              for the first person to click it, and it will not show up in a
//              boot check because nothing evaluates an endpoint until it runs.
export const entriesAction: ActionDefinition = {
  id: 'admin.entries',
  title: 'Entries',
  // `api` is the one target, because the handler answers one question: the
  // entries and the calls with no entry are the same read, and splitting them
  // into two keys would only mean two ways for them to disagree.
  data: { api: {}, filter: '', selected: {}, loading: true, error: '' },
  layout: entriesLayout,
  endpoints: { load: { fn: 'admin.entries', target: 'api', errorTarget: 'error' } },
  lifecycle: {
    mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }, { set: 'error', value: '' }], onError: [{ set: 'loading', value: false }] }],
  },
  triggers: [
    { event: 'ui:model', ref: 'filter', do: [{ set: 'filter', value: '@event.value' }, { call: 'load' }] },
    // The row carries its whole definition, so opening one is free — the JSON
    // came over with the list and a second fetch would buy nothing.
    { event: 'ui:click', ref: 'pick', do: [{ set: 'selected', value: '@event.payload' }] },
    ...panelTriggers,
  ],
};
