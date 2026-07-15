// Headless check for Option A stack navigation on `main`: sidebar resets the
// root, a row drills (push), a cross-link drills deeper, a breadcrumb click jumps
// back (popTo), and Back pops one. Suspended actions under the top no-op, so only
// the active record reacts. Run: pnpm --filter relay exec tsx src/dev/nav-check.ts
import { shell } from './check-shell';
import { getVexRuntime } from '../vex/runtime';

const settle = (ms = 90): Promise<void> => new Promise((r) => setTimeout(r, ms));
const stack = () => shell.getCanvasState('main').stack;
const depth = (): number => stack().length;
const activeId = (): string | undefined => {
  const a = shell.getCanvasState('main').active;
  return a !== undefined ? shell.getRuntime(a.id)?.definition.id : undefined;
};

const main = async (): Promise<void> => {
  await getVexRuntime();
  const checks: [string, unknown, unknown][] = [];

  // Sidebar resets main to the Contacts screen (root).
  shell.dispatch({ type: 'ui:click', ref: 'nav-contacts' });
  await settle();
  checks.push(['sidebar sets the contacts root', activeId(), 'crm.contacts'], ['root is depth 1', depth(), 1]);

  // Row drills into a contact (pushed onto main).
  shell.dispatch({ type: 'ui:click', ref: 'row', payload: 'con_001' });
  await settle();
  checks.push(['row drills into the contact', activeId(), 'crm.contact.view'], ['depth 2', depth(), 2]);

  // Cross-link from the contact drills into a company (deeper on the same stack).
  shell.dispatch({ type: 'ui:click', ref: 'open-company', payload: 'cmp_001' });
  await settle();
  checks.push(['cross-link drills into the company', activeId(), 'crm.company.view'], ['depth 3', depth(), 3]);

  // The stack chip jumps back to the contact (popTo its instance) — the chip
  // calls shell.popTo directly, exactly as the StackChip component does on click.
  const contactInstance = stack()[1]?.id ?? '';
  shell.popTo('main', contactInstance);
  await settle();
  checks.push(['breadcrumb jumps back to the contact', activeId(), 'crm.contact.view'], ['popped to depth 2', depth(), 2]);

  // The chip's Back pops one → the contacts list root.
  shell.pop('main');
  await settle();
  checks.push(['Back returns to the contacts list', activeId(), 'crm.contacts'], ['depth 1 again', depth(), 1]);

  let ok = true;
  for (const [label, got, want] of checks) {
    const pass = got === want;
    ok = ok && pass;
    console.log(`${pass ? '✓' : '✗'} ${label}   (got: ${String(got)})`);
  }
  console.log(ok ? '\nOK — drill (push), cross-link (push), breadcrumb (popTo), Back (pop) on the main stack.' : '\nFAIL — stack nav is incoherent.');
  process.exit(ok ? 0 : 1);
};

void main();
