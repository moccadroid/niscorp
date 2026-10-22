export const checks = (name: string): { check: (what: string, passed: boolean, detail?: string) => void; finish: () => never } => {
  let failures = 0;
  return {
    check: (what, passed, detail = '') => {
      console.log(`${passed ? '[pass]' : '[fail]'} ${what}${!passed && detail !== '' ? ` — ${detail}` : ''}`);
      if (!passed) failures += 1;
    },
    finish: () => {
      console.log(failures === 0 ? `[pass] ${name}: all checks passed` : `[fail] ${name}: ${failures} check(s) failed`);
      process.exit(failures === 0 ? 0 : 1);
    },
  };
};
