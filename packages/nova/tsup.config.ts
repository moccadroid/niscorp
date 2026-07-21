import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      // adapters live under src/adapters/ AND publish under /adapters/ — source
      // path and public path match: @niscorp/nova/adapters/react, /adapters/dom.
      'adapters/react/index': 'src/adapters/react/index.ts',
      'adapters/react/components/index': 'src/adapters/react/components/index.ts',
      'adapters/dom/index': 'src/adapters/dom/index.ts',
      'adapters/dom/components/index': 'src/adapters/dom/components/index.ts',
      'adapters/tty/index': 'src/adapters/tty/index.ts',
      'adapters/tty/components/index': 'src/adapters/tty/components/index.ts',
      'agent/index': 'src/agent/index.ts',
      'reflect/index': 'src/reflect/index.ts',
      'devtools/index': 'src/devtools/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    // Array configs build in PARALLEL — a `clean: true` here races the other
    // config's output and deletes it. The build script cleans dist up front.
    clean: false,
    treeshake: true,
    target: 'es2022',
    external: ['react', '@niscorp/cortex'],
  },
  {
    // ink is ESM-only, so this entry ships esm only (no require condition in
    // the exports map either).
    entry: { 'adapters/ink/index': 'src/adapters/ink/index.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: false,
    treeshake: true,
    target: 'es2022',
    // The kit imports the react adapter by its public self-name (not the
    // internal `@react` alias): bundling the react adapter here would give
    // the ink entry a PRIVATE copy of NovaRenderContext, and context
    // identity breaks across dist modules. External keeps one instance.
    external: ['react', 'ink', 'ink-text-input', '@niscorp/cortex', '@niscorp/nova/adapters/react'],
  },
]);
