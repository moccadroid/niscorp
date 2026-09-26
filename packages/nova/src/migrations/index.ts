import type { Sequence } from '@niscorp/strata';

// ═══════════════════════════════════════════════════════════════
// nova's grammar, as a strata sequence — @niscorp/nova/migrations.
//
// The documents nova defines (actions, fragments, layouts) and where each holds
// other documents. A stored or submitted nova document carries a stamp naming
// how far along this sequence its writer was; strata runs what it has not seen.
//
// THE EMBEDDINGS are the grammar's shape, not a migration's business: every
// place a layout nests a layout (a lone child, an array of them, a branch, a
// loop body), and every place an action holds another grammar's document (its
// endpoints' request and response are Prism configs). With them, a migration
// rewrites ONE flat node and strata finds every node at every depth.
//
// Version 0 is the grammar as it stood when strata arrived. HISTORY: migrations
// are appended, never edited — a change to ActionDefinitionSchema or the layout
// schemas that older documents would fail is a migration here.
// ═══════════════════════════════════════════════════════════════

const actionEmbeds = {
  layout: 'nisc.nova/layout',
  'endpoints.*.request': 'nisc.prism/config',
  'endpoints.*.response': 'nisc.prism/config',
} as const;

export const NOVA_SEQUENCE: Sequence = {
  id: 'nisc.nova',
  documents: {
    action: { embeds: actionEmbeds },
    fragment: { embeds: actionEmbeds },
    layout: {
      embeds: {
        children: 'nisc.nova/layout',
        'children[]': 'nisc.nova/layout',
        then: 'nisc.nova/layout',
        else: 'nisc.nova/layout',
        do: 'nisc.nova/layout',
      },
    },
  },
  migrations: [],
};
