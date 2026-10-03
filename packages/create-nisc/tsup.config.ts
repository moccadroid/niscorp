import { defineConfig } from 'tsup';

// ESM only: it runs as `npm create nisc`, nothing requires it. Both entries sit
// in dist/, beside each other, so `../templates` means the same folder to both.
export default defineConfig({
  entry: { index: 'src/index.ts', cli: 'src/cli.ts' },
  format: ['esm'],
  dts: { entry: { index: 'src/index.ts' } },
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'es2022',
  external: ['@clack/prompts'],
});
