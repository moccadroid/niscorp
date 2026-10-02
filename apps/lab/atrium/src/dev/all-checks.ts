// Every check, each in its own process over its own fresh database.
//
// They are separate processes on purpose: each check ships the app a different
// history (one of them ships a connector version, another closes an issue), and
// a shared database would make the order of the suite part of its meaning.
//
// Run: pnpm --filter atrium check
import { spawnSync } from 'node:child_process';

const CHECKS = [
  ['artifacts-check', 'every artifact is pure JSON, schema-valid, with honest input contracts'],
  ['discovery-check', 'the app ships knowing nothing and pulls its integrations over the wire'],
  ['resolution-check', 'two properties, two PMS backends, different surfaces'],
  ['shells-check', 'five principals, one URL, five applications'],
  ['scope-check', 'the tenant boundary is enforced by the engine'],
  ['ship-check', 'shipping an integration is a data change'],
  ['thread-check', 'one guest sentence through four applications'],
  ['functional-check', 'every loop closes through the database — messaging, menus, rooms, checkout'],
  ['desk-check', 'the front desk end to end — what is waiting, who this is, moving them, putting it right'],
  ['assistant-check', "the shell's agent: dock everywhere, memory as scoped rows, bounded tools"],
  ['watch-check', 'the agent watches the screen: derived attention, and the four brakes on it'],
  ['integrations-check', 'the integrations service is a separate process, and degrades honestly'],
  ['admin-check', 'our own tool, behind the app: nobody else reaches it, and it reads no hotel data'],
  ['ssr-check', 'the page a request is answered with is the screen the socket would have streamed'],
  ['pages-check', '/about is a page: drawn for whoever asks, kept by nothing, beside the app'],
  ['ssr-dev-check', 'the page is drawn in dev too, and stays a vite page'],
  ['site-check', 'the built terminal, served by the app with its pages drawn'],
  ['nisc-check', 'the nisc command on this app: build says how each path is served, export writes the site'],
] as const;

let failed = 0;
for (const [name, what] of CHECKS) {
  console.log(`\n\x1b[1m── ${name}\x1b[0m — ${what}`);
  const run = spawnSync('node', ['--import', 'tsx', `src/dev/${name}.ts`], { stdio: 'inherit', shell: false });
  if (run.status !== 0) failed += 1;
}

console.log(failed === 0 ? `\n\x1b[32mAll ${CHECKS.length} checks pass.\x1b[0m` : `\n\x1b[31m${failed} of ${CHECKS.length} checks failed.\x1b[0m`);
process.exit(failed === 0 ? 0 : 1);
