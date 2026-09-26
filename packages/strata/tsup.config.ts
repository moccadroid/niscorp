import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', 'postgres/index': 'src/postgres/index.ts', 'check/index': 'src/check/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'es2022',
});
