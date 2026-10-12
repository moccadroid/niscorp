// Several bundled deps (PGlite, the openai SDK, Signal) read bare `process.*`.
// Vite's dev server defines `process.env`, but `vite build` leaves the reads as
// global lookups that throw. main.tsx imports this first, before any other module.
const g = globalThis as unknown as { process?: Record<string, unknown> };
g.process ??= {
  env: {},
  platform: '',
  arch: '',
  version: '',
  versions: {},
  argv: [],
  cwd: () => '/',
  nextTick: (fn: (...args: unknown[]) => void, ...args: unknown[]) =>
    queueMicrotask(() => fn(...args)),
};

export {};
