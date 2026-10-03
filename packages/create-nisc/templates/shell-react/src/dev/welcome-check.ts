import { shellSettled } from '@niscorp/nova';
import { boot } from '../boot';

// The welcome screen, with no browser: the app's own boot, its first screen
// whole, and a press reaching the shell. One `[pass]`/`[fail]` line per
// assertion; any failure exits non-zero (AGENTS.md, "Verification"). Whether
// the screen draws and is picked up in a page is `nisc build`'s to check.

let failures = 0;
const check = (name: string, passed: boolean, detail = ''): void => {
  console.log(`${passed ? '[pass]' : '[fail]'} ${name}${!passed && detail !== '' ? ` — ${detail}` : ''}`);
  if (!passed) failures += 1;
};

const shell = boot();
check('the first screen is whole', await shellSettled(shell));
const active = shell.getState().canvases['main']?.active;
check('the welcome action opens on the main canvas', active?.definitionId === 'welcome', String(active?.definitionId));

shell.dispatch({ type: 'ui:click', ref: 'press', ...(active !== undefined ? { origin: active.id } : {}) });
await new Promise((done) => setTimeout(done, 20));
const presses = shell.getRuntime(active?.id ?? '')?.getData()['presses'];
check('a press reaches the shell', presses === 1, `presses is ${String(presses)}`);

console.log(failures === 0 ? '[pass] welcome: all checks passed' : `[fail] welcome: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
