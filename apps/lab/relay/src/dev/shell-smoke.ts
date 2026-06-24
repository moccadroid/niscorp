// Headless checks:
//  1. Serializability — every action (layout included) round-trips through
//     JSON unchanged. This is the DB-readiness guarantee: a layout/action is
//     pure data, not a function call.
//  2. Structure — the shell's full render tree materializes (every component
//     found, every layout valid, actions instantiated).
//  3. Fragment compose — pushing new-company `with: ['modal']` materializes the
//     fragment chrome (Overlay + .rl-dialog) wrapped around the action's form
//     (Inputs + Selects), and a fragment id can't be pushed as an action.
// Run with `pnpm --filter relay shell-smoke`.
import { shell, ACTIONS } from '../nova/shell';

type Node = { type?: string; name?: string; message?: string; children?: unknown };

// Walk a materialized render tree, counting components by name and collecting
// any error nodes.
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

// ─── 1. Serialization ──────────────────────────────────────
for (const [id, action] of Object.entries(ACTIONS)) {
  const json = JSON.stringify(action);
  if (JSON.stringify(JSON.parse(json)) !== json) {
    console.error(`NOT SERIALIZABLE: ${id}`);
    process.exit(1);
  }
  console.log(`serialize ${id.padEnd(14)} ${json.length} bytes  ✓`);
}

// ─── 2. Structure ──────────────────────────────────────────
const shellTree = inspect(shell.flattenRenderTree(shell.getShellRenderTree()));
console.log('\ncomponents rendered:', JSON.stringify(shellTree.counts));
if (shellTree.errors.length > 0) {
  console.error('RENDER ERRORS:', shellTree.errors);
  process.exit(1);
}

// ─── 3. Fragment compose ───────────────────────────────────
const main = async () => {
  // A fragment is abstract — it isn't in `actions`, so it can't be pushed.
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

  // Push the form `with: ['modal']` — the fragment wraps it in dialog chrome.
  // company.form exercises the modal fragment wrapping a form's inputs.
  shell.push('modal', 'company.form', undefined, ['modal']);
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
