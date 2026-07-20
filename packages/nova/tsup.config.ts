import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    // adapters live under src/adapters/ AND publish under /adapters/ — source
    // path and public path match: @niscorp/nova/adapters/react, /adapters/dom.
    'adapters/react/index': 'src/adapters/react/index.ts',
    'adapters/react/components/index': 'src/adapters/react/components/index.ts',
    'adapters/dom/index': 'src/adapters/dom/index.ts',
    'adapters/dom/components/index': 'src/adapters/dom/components/index.ts',
    'agent/index': 'src/agent/index.ts',
    'reflect/index': 'src/reflect/index.ts',
    'devtools/index': 'src/devtools/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'es2022',
  external: ['react', '@niscorp/cortex'],
});
