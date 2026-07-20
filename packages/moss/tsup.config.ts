import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    node: 'src/node.ts',
    client: 'src/client.ts',
    'terminal/index': 'src/terminal/index.ts',
    'terminal/react/index': 'src/terminal/react/index.ts',
    'terminal/dom/index': 'src/terminal/dom/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'es2022',
  // React and nova's adapters are the consumer's (or a workspace dep's) — the
  // terminal subpaths bind them but never bundle them.
  external: ['react', 'react-dom', 'react-dom/client', '@niscorp/nova', '@niscorp/nova/adapters/react', '@niscorp/nova/adapters/dom', '@niscorp/nova/adapters/dom/components', '@niscorp/nova/reflect'],
});
