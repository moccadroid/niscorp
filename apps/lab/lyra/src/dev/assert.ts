// A tick, a cross, and an exit code — the three lines every check ends with.
//
// They used to live in `world.ts`, which boots a database at import. A check
// about the SURFACE has nothing to ask a database, and paying for one to say
// "ok" is how a fast check becomes a slow one nobody runs. `world` re-exports
// these, so every existing check is untouched.
let failed = 0;

export const ok = (label: string, condition: boolean, detail = ''): void => {
  console.log(`${condition ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail === '' ? '' : ` — ${detail}`}`);
  if (!condition) failed += 1;
};

export const report = (what: string): never => {
  console.log(failed === 0 ? `\n\x1b[32mOK — ${what}\x1b[0m` : `\n\x1b[31mFAIL — ${failed} assertion(s).\x1b[0m`);
  process.exit(failed === 0 ? 0 : 1);
};
