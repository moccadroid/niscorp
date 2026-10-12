import { shell } from './check-shell';
import { ACTIONS } from '@relay/app/action-catalog';

type Node = { type?: string; name?: string; message?: string; children?: unknown };

const inspect = (tree: unknown): { counts: Record<string, number>; errors: string[] } => {
  const counts: Record<string, number> = {};
  const errors: string[] = [];
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (n === null || typeof n !== 'object') return;
    const node = n as Node;
    if (node.type === 'component' && node.name !== undefined) counts[node.name] = (counts[node.name] ?? 0) + 1;
    if (node.type === 'error') errors.push(`${node.name ?? '?'}: ${node.message ?? ''}`);
    if (node.children !== undefined) walk(node.children);
  };
  walk(tree);
  return { counts, errors };
};

for (const [id, action] of Object.entries(ACTIONS)) {
  const json = JSON.stringify(action);
  if (JSON.stringify(JSON.parse(json)) !== json) {
    console.error(`NOT SERIALIZABLE: ${id}`);
    process.exit(1);
  }
  console.log(`serialize ${id.padEnd(14)} ${json.length} bytes  ✓`);
}

const shellTree = inspect(shell.flattenRenderTree(shell.getShellRenderTree()));
console.log('\ncomponents rendered:', JSON.stringify(shellTree.counts));
if (shellTree.errors.length > 0) {
  console.error('RENDER ERRORS:', shellTree.errors);
  process.exit(1);
}

const main = async () => {
  let threw = false;
  try {
    shell.push('modal', 'modal');
  } catch {
    threw = true;
  }
  if (!threw) {
    console.error('EXPECTED: pushing a fragment id as an action should throw');
    process.exit(1);
  }
  console.log('\nfragment id not pushable as action  ✓');

  shell.push('modal', 'crm.company.form', undefined, ['modal']);
  await new Promise((r) => setTimeout(r, 0));

  const modal = inspect(shell.flattenRenderTree(shell.getCanvasRenderTree('modal')));
  console.log('modal canvas rendered:', JSON.stringify(modal.counts));
  if (modal.errors.length > 0) {
    console.error('MODAL RENDER ERRORS:', modal.errors);
    process.exit(1);
  }
  const need = ['Overlay', 'Input', 'Select'];
  const missing = need.filter((n) => (modal.counts[n] ?? 0) === 0);
  if (missing.length > 0) {
    console.error(`MODAL MISSING: ${missing.join(', ')} (chrome+body did not compose)`);
    process.exit(1);
  }
  console.log('modal chrome (Overlay) wraps the form body (Input/Select)  ✓');

  console.log('\nOK — actions serializable, shell + composed modal materialized with no errors.');
  process.exit(0);
};

void main();
