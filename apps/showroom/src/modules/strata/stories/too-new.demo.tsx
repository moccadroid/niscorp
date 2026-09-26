import { DocumentsLab } from '@showroom/modules/strata/documents-lab';
import { NOVA_SEQUENCE } from '@niscorp/nova/migrations';
import { action, grammars, stampAt } from './grammar.fixtures';

// A document written by NEWER code than this — an add-on that already speaks
// kit 3, submitted to a host that knows kit 1; or a row written by the next
// release, read by a replica still on this one. Strict schemas mean an older
// reader cannot safely read a newer document, so strata does not try: it
// refuses by name, TOO_NEW, before anything renders. At intake moss turns this
// into "the host must be updated first"; at boot, a refusal to serve.
//
// The rule it enforces is the only order that works with strict grammars:
// the READER upgrades first — host before add-on, server before terminal.

export const Demo = () => (
  <DocumentsLab
    kind="nisc.nova/action"
    document={action}
    grammars={grammars}
    stamps={[
      { label: 'written at kit 3', stamp: stampAt(3) },
      { label: 'nova from the future', stamp: { ...stampAt(1), 'nisc.nova': NOVA_SEQUENCE.migrations.length + 2 } },
      { label: 'current', stamp: stampAt(1) },
    ]}
    note="Newer on any grammar is refused, with each one named. Pick 'current' to see the same document read cleanly."
  />
);
