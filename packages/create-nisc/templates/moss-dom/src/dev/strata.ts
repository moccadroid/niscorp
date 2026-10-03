// strata for this app's SOURCE artifacts — which version of each grammar
// (nova's, Prism's) the actions in src/app are written in, recorded in
// strata.lock.json, and how they are brought forward when a grammar moves
// (AGENTS.md rule 20).
//
//   npm run strata status      where the source stands (`-- --check` to fail when behind)
//   npm run strata upgrade     the exact expected JSON + a report of what to edit
//   npm run strata verify      holds the edit to that JSON, then moves the lock
import { fileURLToPath } from 'node:url';
import { NOVA_SCHEMAS, NOVA_SEQUENCE } from '@niscorp/nova/migrations';
import { PRISM_SCHEMAS, PRISM_SEQUENCE, prismTransform } from '@niscorp/prism/migrations';
import { runSourceUpgrade } from '@niscorp/strata/node';
import { actions } from '../app/action-catalog';

const root = fileURLToPath(new URL('../..', import.meta.url));

process.exit(
  await runSourceUpgrade(
    {
      root,
      grammars: [NOVA_SEQUENCE, PRISM_SEQUENCE],
      transform: prismTransform,
      schemas: { ...NOVA_SCHEMAS, ...PRISM_SCHEMAS },
      documents: async () => Object.values(actions).map((document) => ({ kind: 'nisc.nova/action', id: document.id, document })),
    },
    process.argv.slice(2),
  ),
);
