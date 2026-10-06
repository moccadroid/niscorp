import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', 'postgres/index': 'src/postgres/index.ts', 'check/index': 'src/check/index.ts', 'upgrade/index': 'src/upgrade/index.ts', 'node/index': 'src/node/index.ts' },
  format: ['esm', 'cjs'],
  splitting: true, // cjs too: entries share chunks, so a class exists once, not once per entry
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'es2022',
});
