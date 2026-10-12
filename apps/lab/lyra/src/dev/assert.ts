let failed = 0;

export const ok = (label: string, condition: boolean, detail = ''): void => {
  console.log(`${condition ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail === '' ? '' : ` — ${detail}`}`);
  if (!condition) failed += 1;
};

// The annotation is on the const, not on the arrow: TypeScript narrows control
// flow past a never-returning call only when the declaration itself is annotated.
export const report: (what: string) => never = (what) => {
  console.log(failed === 0 ? `\n\x1b[32mOK — ${what}\x1b[0m` : `\n\x1b[31mFAIL — ${failed} assertion(s).\x1b[0m`);
  process.exit(failed === 0 ? 0 : 1);
};
