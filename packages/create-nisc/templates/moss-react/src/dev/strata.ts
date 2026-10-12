import { fileURLToPath } from 'node:url';
import { NOVA_SCHEMAS, NOVA_SEQUENCE } from '@niscorp/nova/migrations';
import { evaluate } from '@niscorp/prism';
import { PRISM_SCHEMAS, PRISM_SEQUENCE } from '@niscorp/prism/migrations';
import { runSourceUpgrade } from '@niscorp/strata/node';
import { actions } from '../app/action-catalog';

const root = fileURLToPath(new URL('../..', import.meta.url));

process.exit(
  await runSourceUpgrade(
    {
      root,
      grammars: [NOVA_SEQUENCE, PRISM_SEQUENCE],
      transform: evaluate,
      schemas: { ...NOVA_SCHEMAS, ...PRISM_SCHEMAS },
      documents: async () => Object.values(actions).map((document) => ({ kind: 'nisc.nova/action', id: document.id, document })),
    },
    process.argv.slice(2),
  ),
);
