// The sidebar nav badges must be LIVE Vex data, not literals in the layout:
//  - on mount, ONE read (four COUNT(*)s cross-joined into a single row) fills
//    `$.counts.*` with scalar numbers,
//  - the NavItem `count` prop, bound to `$.counts.*`, resolves to that number
//    and renders with no validation error.
import { shell } from '../nova/shell';
import { getVexRuntime } from '../vex/runtime';

const settle = (ms = 80): Promise<void> => new Promise((r) => setTimeout(r, ms));
const sidebarData = (): Record<string, unknown> | undefined => {
  const a = shell.getCanvasState('sidebar').active;
  return a !== undefined ? shell.getRuntime(a.id)?.getData() : undefined;
};

type Node = { type?: string; name?: string; message?: string; props?: Record<string, unknown>; children?: unknown };
const collect = (tree: unknown): { errors: string[]; navCounts: unknown[] } => {
  const errors: string[] = [];
  const navCounts: unknown[] = [];
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (n === null || typeof n !== 'object') return;
    const node = n as Node;
    if (node.type === 'error') errors.push(`${node.name ?? '?'}: ${node.message ?? ''}`);
    if (node.type === 'component' && node.name === 'NavItem' && node.props?.['count'] !== undefined) navCounts.push(node.props['count']);
    if (node.children !== undefined) walk(node.children);
  };
  walk(tree);
  return { errors, navCounts };
};

const main = async (): Promise<void> => {
  const rt = await getVexRuntime();
  // The tasks badge is "my open tasks" (assignee = the demo user, not done) — read
  // the live DB figure so this stays correct as the seed evolves.
  const myTasks = ((await rt.db.query("SELECT count(*)::int AS n FROM tasks WHERE assignee_id='usr_001' AND done=false")).rows[0] as { n: number }).n;
  // Wait for the mount lifecycle (the four COUNT(*) reads) to populate counts —
  // each slot is a scalar number; the layout binds it directly.
  let counts: Record<string, unknown> = {};
  for (let i = 0; i < 40; i++) {
    counts = (sidebarData()?.['counts'] ?? {}) as Record<string, unknown>;
    if (typeof counts['contacts'] === 'number' && counts['contacts'] > 0) break;
    await settle();
  }
  const n = (k: string): number => (typeof counts[k] === 'number' ? (counts[k] as number) : -1);
  const checks: [string, boolean][] = [];
  checks.push([`counts loaded from Vex (c=${n('contacts')} co=${n('companies')} d=${n('deals')} t=${n('tasks')})`, typeof counts['contacts'] === 'number']);
  checks.push([`contacts = 189`, n('contacts') === 189]);
  checks.push([`companies = 40`, n('companies') === 40]);
  checks.push([`deals = 120`, n('deals') === 120]);
  checks.push([`my open tasks = ${myTasks} (live DB figure)`, n('tasks') === myTasks && myTasks > 0]);

  const { errors, navCounts } = collect(shell.flattenRenderTree(shell.getCanvasRenderTree('sidebar')));
  checks.push([`sidebar renders with no error nodes (${errors.join('; ') || 'none'})`, errors.length === 0]);
  checks.push([`NavItem badges resolved to numbers (got ${JSON.stringify(navCounts)})`, navCounts.length >= 4 && navCounts.every((c) => typeof c === 'number')]);

  let ok = true;
  for (const [label, pass] of checks) { ok = ok && pass; console.log(`${pass ? '✓' : '✗'} ${label}`); }
  console.log(ok ? '\nOK — sidebar counts are live Vex data, bound + rendered as numbers.' : '\nFAIL.');
  process.exit(ok ? 0 : 1);
};
void main();
