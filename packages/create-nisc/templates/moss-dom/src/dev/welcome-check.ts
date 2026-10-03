import { renderDocument } from '@niscorp/moss';
import { boot } from '../server/boot';
import { drawing } from '../server/document';

// The welcome screen, end to end with no browser: the real server boots, the
// screen is served to nobody in particular, the page is drawn on the server,
// and a press reaches the shell. One `[pass]`/`[fail]` line per assertion; any
// failure exits non-zero (AGENTS.md, "Verification").

let failures = 0;
const check = (name: string, passed: boolean, detail = ''): void => {
  console.log(`${passed ? '[pass]' : '[fail]'} ${name}${!passed && detail !== '' ? ` — ${detail}` : ''}`);
  if (!passed) failures += 1;
};

const tick = (ms = 20): Promise<void> => new Promise((done) => setTimeout(done, ms));

const { server } = await boot();
try {
  const shells = server.shells;
  if (shells === undefined) throw new Error('the manifest has no shell');
  const snapshot = await shells.snapshot(null, null);
  const main = JSON.stringify(snapshot.trees['main'] ?? []);
  check('the anonymous principal is served the welcome action', main.includes('"definitionId":"welcome"'), main.slice(0, 200));
  check('its screen has a button to press', main.includes('"ref":"press"'));

  const template = '<!doctype html><html><head></head><body><div id="root"></div></body></html>';
  const page = await renderDocument({ ...drawing, server, template, request: { path: '/', cookie: null } });
  check('the page arrives drawn', page.drawn && page.html.includes('k-heading'), page.html.slice(0, 200));
  check('a page drawn for nobody may be kept by a cache', page.headers['cache-control'] === 'no-cache');

  const session = await shells.session(null, null);
  session.dispatch('main', { type: 'ui:click', ref: 'press' });
  await tick();
  const active = session.shell.getState().canvases['main']?.active?.id ?? '';
  const presses = session.shell.getRuntime(active)?.getData()['presses'];
  check('a press reaches the shell on the server', presses === 1, `presses is ${String(presses)}`);
} finally {
  server.close();
}

console.log(failures === 0 ? '[pass] welcome: all checks passed' : `[fail] welcome: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
