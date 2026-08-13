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

// The annotation is on the CONST, not on the arrow, and that is load-bearing:
// TypeScript only narrows control flow past a never-returning call when the
// declaration itself is annotated. Written as `const report = (…): never =>`
// the compiler knows the return type and still refuses to believe the call
// ends the branch — so every `if (x === undefined) report(…)` guard left `x`
// possibly-undefined for the rest of the file, and eight such reads sat
// unflagged behind the tsconfig exclude.
export const report: (what: string) => never = (what) => {
  console.log(failed === 0 ? `\n\x1b[32mOK — ${what}\x1b[0m` : `\n\x1b[31mFAIL — ${failed} assertion(s).\x1b[0m`);
  process.exit(failed === 0 ? 0 : 1);
};
