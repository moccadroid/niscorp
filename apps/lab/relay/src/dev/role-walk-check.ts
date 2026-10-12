import { UnknownActionError } from '@niscorp/nova';
import type { Shell } from '@niscorp/nova';
import { boot } from '../server/boot';
import { mintToken, userByUsername } from '../server/users';

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
  const { server, runtime } = await boot();
  const shells = server.shells;
  if (shells === undefined) throw new Error('no shell host');

  const as = async (username: string): Promise<Shell> => {
    const token = mintToken(username);
    if (token === null) throw new Error(`unknown user ${username}`);
    return (await shells.session(token, userByUsername(username)?.id ?? null)).shell;
  };

  const anon = (await shells.session(null, null)).shell;
  await settle();
  checks.push(['anonymous mounts exactly the lock screen', anon.getCanvasState('main').active?.definitionId === 'auth.login' && anon.getCanvasState('sidebar').stack.length === 0]);
  checks.push(['anonymous cannot push a screen', denied(() => anon.push('main', 'crm.deals'))]);

  const viewer = await as('jordan');
  await settle();
  const sidebarId = viewer.getCanvasState('sidebar').active?.id;
  const nav = (sidebarId !== undefined ? viewer.getRuntime(sidebarId)?.getData()['nav'] : undefined) as Record<string, boolean> | undefined;
  checks.push(['viewer sidebar hides tasks, shows settings + records', nav?.['tasks'] === false && nav?.['settings'] === true && nav?.['contacts'] === true]);
  checks.push(['viewer opens the contacts list', !denied(() => viewer.push('main', 'crm.contacts'))]);
  checks.push(['viewer opens settings — a member-floor action, everyone has it', !denied(() => viewer.push('main', 'settings'))]);
  checks.push(['viewer cannot open the contact form — deny-by-nonexistence', denied(() => viewer.push('modal', 'crm.contact.form'))]);

  const admin = await as('sam');
  await settle();
  checks.push(['admin opens settings (like everyone)', !denied(() => admin.push('main', 'settings'))]);

  const sales = await as('alex');
  await settle();
  checks.push(['alex opens the deal form', !denied(() => sales.push('modal', 'crm.deal.form', {}, ['modal']))]);
  checks.push(['alex (sales) opens settings too (member floor)', !denied(() => sales.push('main', 'settings'))]);

  checks.push(['one durable shell per principal', await as('jordan') === viewer && await as('alex') === sales]);
  checks.push(['different principals, different shells', viewer !== sales && sales !== admin]);

  await runtime.db.close();

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
