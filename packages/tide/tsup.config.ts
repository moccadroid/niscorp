import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', 'store/postgres': 'src/store/postgres.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'es2022',
});
