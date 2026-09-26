import { DocumentsLab } from '@showroom/modules/strata/documents-lab';
import { action, grammars, stampAt } from './grammar.fixtures';

// How the migration above reached every Button without walking anything.
// nova's grammar says where its documents nest: an action holds a layout and,
// in its endpoints, Prism configs; a layout holds layouts at `children` (one
// node), `children[]` (an array of them), `then`, `else` and `do`. Two
// wildcards, deliberately: `children` is a lone node OR an array, and one
// wildcard for both would read a lone node's `props` as more layouts.
//
// Click a location: that node, and only that node, is what a migration for its
// kind receives. A Prism migration reaches the config inside `endpoints.load`
// the same way — nova never has to know Prism migrations exist.

export const Demo = () => (
  <DocumentsLab
    kind="nisc.nova/action"
    document={action}
    grammars={grammars}
    stamps={[{ label: 'current', stamp: stampAt(1) }]}
    showLocations
    note="Eleven documents in one action: the action, nine layouts at four depths, and one Prism config. This is the walker's whole knowledge — it comes from the grammar, never from a migration."
  />
);
