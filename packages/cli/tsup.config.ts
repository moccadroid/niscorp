import { defineConfig } from 'tsup';

const EXTERNAL = ['@niscorp/moss', '@niscorp/moss/node', '@niscorp/moss/vite', 'vite', '@niscorp/nova', '@niscorp/nova/reflect', '@hono/node-server', 'tsx/esm/api'];

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: false,
    treeshake: true,
    target: 'es2022',
    external: EXTERNAL,
  },
  {
    entry: { cli: 'src/cli.ts', adopt: 'src/adopt.ts' },
    format: ['esm'],
    dts: false,
    sourcemap: true,
    clean: false,
    treeshake: true,
    target: 'es2022',
    external: EXTERNAL,
  },
]);
