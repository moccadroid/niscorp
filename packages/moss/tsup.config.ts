import { defineConfig } from 'tsup';

// React and nova's adapters are the consumer's (or a workspace dep's) — the
// terminal subpaths bind them but never bundle them.
const EXTERNAL = [
  'react',
  'react-dom',
  'react-dom/client',
  '@niscorp/nova',
  '@niscorp/nova/adapters/react',
  '@niscorp/nova/adapters/dom',
  '@niscorp/nova/adapters/dom/components',
  '@niscorp/nova/adapters/tty',
  '@niscorp/nova/adapters/tty/components',
  '@niscorp/nova/adapters/ink',
  '@niscorp/nova/reflect',
];

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      node: 'src/node.ts',
      client: 'src/client/index.ts',
      'client/node': 'src/client/node.ts',
      'terminal/index': 'src/terminal/index.ts',
      'terminal/react/index': 'src/terminal/react/index.ts',
      'terminal/dom/index': 'src/terminal/dom/index.ts',
      'terminal/tty/index': 'src/terminal/tty/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    // Array configs build in PARALLEL — a `clean: true` here races the other
    // config's output and deletes it. The build script cleans dist up front.
    clean: false,
    treeshake: true,
    target: 'es2022',
    external: EXTERNAL,
  },
  {
    // ink is ESM-only, so this entry ships esm only (no require condition in
    // the exports map either).
    entry: { 'terminal/ink/index': 'src/terminal/ink/index.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: false,
    treeshake: true,
    target: 'es2022',
    external: [...EXTERNAL, 'ink'],
  },
]);
