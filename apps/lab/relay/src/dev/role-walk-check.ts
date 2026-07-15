// Role walk — the charter proof, headlessly. The anonymous lock screen, the
// REAL magic-link flow driven through the login action's own triggers, then
// one shell per principal: catalog-filtered chrome, deny-by-nonexistence at
// push time, devtools only for the dev role.
import { UnknownActionError } from '@niscorp/nova';
import { buildShell } from '../nova/shell';
import { identity, signIn, signOut, mintToken } from '../auth';

const settle = (ms = 300): Promise<void> => new Promise((r) => setTimeout(r, ms));
const checks: [string, boolean][] = [];
const denied = (fn: () => unknown): boolean => {
  try {
    fn();
    return false;
  } catch (e) {
    return e instanceof UnknownActionError;
  }
};

const run = async (): Promise<void> => {
  signOut();

  // ── anonymous: the one-action application ──
  const anon = buildShell(null);
  await settle();
  checks.push(['anonymous main boots to the lock screen', anon.getCanvasState('main').active?.definitionId === 'auth.login']);
  checks.push(['anonymous chrome is empty', anon.getCanvasState('sidebar').stack.length === 0 && anon.getCanvasState('topbar').stack.length === 0]);
  checks.push(['anonymous cannot push a screen', denied(() => anon.push('main', 'crm.deals'))]);

  // ── the real magic-link flow, through the action's own triggers ──
  anon.push('main', 'auth.login', { username: 'jordan' });
  await settle();
  anon.dispatch({ type: 'ui:click', ref: 'send' });
  await settle();
  checks.push(['send reveals the fake magic link', anon.getCanvasState('main').active?.data['stage'] === 'sent']);
  anon.dispatch({ type: 'ui:click', ref: 'open-link' });
  await settle();
  checks.push([`redeem mints the token — identity is jordan/usr_002 (got ${String(identity()?.userId)})`, identity()?.userId === 'usr_002']);

  // ── jordan = viewer: lists + views, nothing else ──
  const viewer = buildShell(identity());
  await settle();
  const nav = viewer.getCanvasState('sidebar').active?.data['nav'] as Record<string, boolean>;
  checks.push(['viewer sidebar hides tasks + settings, shows records', nav['tasks'] === false && nav['settings'] === false && nav['contacts'] === true]);
  checks.push(['viewer opens the contacts list', !denied(() => viewer.push('main', 'crm.contacts'))]);
  checks.push(['viewer cannot open the contact form — deny-by-nonexistence', denied(() => viewer.push('modal', 'crm.contact.form'))]);
  checks.push(['viewer has no devtools', denied(() => viewer.push('devtools', 'devtools.dock'))]);

  // ── sam = admin: settings yes; admin does NOT imply devtools ──
  const samToken = mintToken('sam');
  if (samToken === null) throw new Error('cannot mint sam');
  signIn(samToken);
  const admin = buildShell(identity());
  await settle();
  checks.push(['admin opens settings', !denied(() => admin.push('main', 'settings'))]);
  checks.push(['admin does not imply devtools', denied(() => admin.push('devtools', 'devtools.dock'))]);

  // ── alex = sales + dev: devtools installed, settings absent ──
  const alexToken = mintToken('alex');
  if (alexToken === null) throw new Error('cannot mint alex');
  signIn(alexToken);
  const sales = buildShell(identity());
  await settle();
  checks.push(['alex (dev) has the devtools registered', !denied(() => sales.push('devtools', 'devtools.dock'))]);
  checks.push(['alex (sales) has no settings', denied(() => sales.push('main', 'settings'))]);

  signOut();
  checks.push(['sign-out returns to anonymous', identity() === null]);

  let failed = 0;
  for (const [label, ok] of checks) {
    if (!ok) failed += 1;
    console.log(`${ok ? '✓' : '✗'} ${label}`);
  }
  if (failed > 0) {
    console.log(`\nFAIL — ${failed} check(s).`);
    process.exit(1);
  }
  console.log('\nOK — one charter, one token, a different application per principal.');
  process.exit(0);
};

void run();
