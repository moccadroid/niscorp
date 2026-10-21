import { fileURLToPath } from 'node:url';
import { NOVA_SCHEMAS, NOVA_SEQUENCE } from '@niscorp/nova/migrations';
import { evaluate } from '@niscorp/prism';
import { PRISM_SCHEMAS, PRISM_SEQUENCE } from '@niscorp/prism/migrations';
import { runSourceUpgrade } from '@niscorp/strata/node';
import { actions } from '../app/action-catalog';
import { ARRANGEMENTS } from '../app/arrangements';
import { frameLayout } from '../app/shell/frame.layout';

const root = fileURLToPath(new URL('../..', import.meta.url));

process.exit(
  await runSourceUpgrade(
    {
      root,
      grammars: [NOVA_SEQUENCE, PRISM_SEQUENCE],
      transform: evaluate,
      schemas: { ...NOVA_SCHEMAS, ...PRISM_SCHEMAS },
      documents: async () => [
        ...Object.values(actions).map((document) => ({ kind: 'nisc.nova/action', id: document.id, document })),
        { kind: 'nisc.nova/layout', id: 'shell.frame', document: frameLayout },
        ...ARRANGEMENTS.map((arrangement) => ({ kind: 'nisc.nova/layout', id: `arrangement.${arrangement.id}`, document: arrangement.layout })),
      ],
    },
    process.argv.slice(2),
  ),
);
