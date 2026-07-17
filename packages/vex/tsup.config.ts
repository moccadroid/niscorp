import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'agent/index': 'src/agent/index.ts',
    'adapters/hono/index': 'src/adapters/hono/index.ts',
    'adapters/pglite/index': 'src/adapters/pglite/index.ts',
    'adapters/express/index': 'src/adapters/express/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'es2022',
  external: ['pg', 'hono', 'express'],
});
