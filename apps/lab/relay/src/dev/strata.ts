// strata for this app's SOURCE artifacts — which version of each grammar
// (nova's, Prism's) the actions and fragments in src/app are written in, and
// how they are brought forward when a grammar moves (docs/plans/versioning.md).
//
//   pnpm strata status [--check]   where the source stands (CI runs --check)
//   pnpm strata upgrade            the expected JSON + .strata/upgrade/REPORT.md
//   pnpm strata verify             the edited source against it; moves strata.lock.json
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runSourceUpgrade } from '@niscorp/strata/node';
import { NOVA_SEQUENCE, NOVA_SCHEMAS } from '@niscorp/nova/migrations';
import { evaluate } from '@niscorp/prism';
import { PRISM_SEQUENCE, PRISM_SCHEMAS } from '@niscorp/prism/migrations';
import { CATALOG_DEFINITIONS } from '@relay/app/action-catalog';

const root = fileURLToPath(new URL('../..', import.meta.url));
const fragmentsDir = fileURLToPath(new URL('../app/shell/fragments', import.meta.url));

const isFragment = (value: unknown): value is { kind: 'fragment'; id: string } =>
  typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'fragment' && 'id' in value && typeof value.id === 'string';

const documents = async () => {
  const actions = Object.values(CATALOG_DEFINITIONS).map((document) => ({ kind: 'nisc.nova/action', id: document.id, document }));
  const fragments = [];
  const files = (() => {
    try {
      return readdirSync(fragmentsDir).filter((name) => name.endsWith('.fragment.ts'));
    } catch {
      return [];
    }
  })();
  for (const name of files) {
    // By URL, not by path: on Windows an absolute path is not an import specifier.
    const module: Record<string, unknown> = await import(new URL(`../app/shell/fragments/${name}`, import.meta.url).href);
    for (const value of Object.values(module)) if (isFragment(value)) fragments.push({ kind: 'nisc.nova/fragment', id: value.id, document: value });
  }
  return [...actions, ...fragments];
};

process.exit(
  await runSourceUpgrade(
    {
      root,
      grammars: [NOVA_SEQUENCE, PRISM_SEQUENCE],
      transform: evaluate,
      schemas: { ...NOVA_SCHEMAS, ...PRISM_SCHEMAS },
      documents,
    },
    process.argv.slice(2),
  ),
);
