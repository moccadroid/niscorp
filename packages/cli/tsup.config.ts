import { defineConfig } from 'tsup';

// Two builds. The library (what an app's nisc.config.ts imports its types from)
// ships both module formats like every other package. The command is ESM only:
// it loads the app's TypeScript through tsx's ESM loader, and nothing requires it.
// Its launcher is bin/nisc.js, a committed file, so the bin links on a fresh install.
const EXTERNAL = ['@niscorp/moss', '@niscorp/moss/node', '@hono/node-server', 'tsx/esm/api'];

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
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    dts: false,
    sourcemap: true,
    clean: false,
    treeshake: true,
    target: 'es2022',
    external: EXTERNAL,
  },
]);
