import { SourceLab } from '@showroom/modules/strata/source-lab';
import { action, grammars, stampAt } from './grammar.fixtures';

// An artifact in an app's SOURCE, when a grammar moves: the kit renamed
// Button's `label` to `text`, and this app's strata.lock.json says its source
// predates that. strata will not rewrite TypeScript — it works out EXACTLY what
// the artifact must become, writes a report for whoever edits (a person, an
// agent), and then holds the edit to that JSON before the lock moves.
//
// Try it three ways: verify before editing (refused, with what differs); type a
// wrong edit yourself (refused); let "an agent" edit — keys in its own order —
// and verify (passes: key order is how you wrote it, not content).

export const Demo = () => (
  <SourceLab
    grammars={grammars}
    lock={stampAt(undefined)}
    artifact={{ kind: 'nisc.nova/action', id: action.id, document: action, file: 'src/app/actions/classes/classes.action.ts' }}
    note="The report and verify are the same pure functions `pnpm strata upgrade` / `pnpm strata verify` run in an app — see packages/strata/src/upgrade. In the lab apps they ran for real: every app's lock moved to nisc.prism 1 through this loop."
  />
);
