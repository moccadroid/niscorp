// Browser has no Node `process` global, but several deps the showroom
// bundles (PGlite's Node-FS path, the openai SDK, Signal's streaming)
// read bare `process.*`. Vite's dev server defines `process.env`, which
// masks this — but `vite build` (GitHub Pages) leaves the reads as real
// global lookups, so they throw `ReferenceError: process is not defined`.
//
// Install a harmless stub before any other module runs. Imported first
// in main.tsx so it's in place for the whole import graph + runtime.
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
