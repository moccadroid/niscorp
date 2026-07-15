// Router edge-adapter check. Boots Vex FIRST (Node/PGlite — no window), THEN
// stubs a minimal window (history + location + popstate) so the in-memory router
// runs headlessly, then drives the shell via nav clicks and asserts the address
// bar follows. Run: pnpm --filter relay exec tsx src/dev/router-check.ts
import { shellAs } from './check-shell';
const shell = shellAs('sam');
import { getVexRuntime } from '../vex/runtime';
import { installRouter } from '../ui/router';

const settle = (ms = 200): Promise<void> => new Promise((r) => setTimeout(r, ms));

type Listener = () => void;

const run = async (): Promise<void> => {
  // Init PGlite while window is still undefined (its browser branch keys off it).
  await getVexRuntime();

  const loc = { pathname: '/' };
  const popListeners: Listener[] = [];
  (globalThis as Record<string, unknown>)['window'] = {
    location: loc,
    history: {
      pushState: (_s: unknown, _t: string, url: string): void => {
        loc.pathname = url;
      },
      replaceState: (_s: unknown, _t: string, url: string): void => {
        loc.pathname = url;
      },
    },
    addEventListener: (type: string, fn: Listener): void => {
      if (type === 'popstate') popListeners.push(fn);
    },
    removeEventListener: (): void => {},
  };

  installRouter(shell);
  await settle(250);

  const checks: [string, boolean][] = [];
  const nav = async (ref: string): Promise<string> => {
    shell.dispatch({ type: 'ui:click', ref });
    await settle(220);
    return loc.pathname;
  };

  checks.push([`initial path is / (got ${loc.pathname})`, loc.pathname === '/']);
  checks.push([`nav contacts → /contacts (got ${await nav('nav-contacts')})`, loc.pathname === '/contacts']);
  checks.push([`nav deals → /deals (got ${await nav('nav-deals')})`, loc.pathname === '/deals']);
  checks.push([`nav tasks → /tasks (got ${await nav('nav-tasks')})`, loc.pathname === '/tasks']);
  checks.push([`nav companies → /companies (got ${await nav('nav-companies')})`, loc.pathname === '/companies']);
  checks.push([`nav pipeline → /pipeline (got ${await nav('nav-pipeline')})`, loc.pathname === '/pipeline']);
  checks.push([`nav home → / (got ${await nav('nav-home')})`, loc.pathname === '/']);
  checks.push([`nav settings → /settings (got ${await nav('nav-settings')})`, loc.pathname === '/settings']);

  let ok = true;
  for (const [label, pass] of checks) {
    ok = ok && pass;
    console.log(`${pass ? '✓' : '✗'} ${label}`);
  }
  console.log(ok ? '\nOK — the address bar follows navigation.' : '\nFAIL — the URL does not track the active screen.');
  process.exit(ok ? 0 : 1);
};
void run();
