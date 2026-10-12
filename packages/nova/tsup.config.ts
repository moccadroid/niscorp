import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      'adapters/react/index': 'src/adapters/react/index.ts',
      'adapters/react/components/index': 'src/adapters/react/components/index.ts',
      'adapters/vue/index': 'src/adapters/vue/index.ts',
      'adapters/vue/components/index': 'src/adapters/vue/components/index.ts',
      'adapters/dom/index': 'src/adapters/dom/index.ts',
      'adapters/dom/server': 'src/adapters/dom/server.ts',
      'adapters/dom/components/index': 'src/adapters/dom/components/index.ts',
      'adapters/tty/index': 'src/adapters/tty/index.ts',
      'adapters/tty/components/index': 'src/adapters/tty/components/index.ts',
      'agent/index': 'src/agent/index.ts',
      'i18n/index': 'src/i18n/index.ts',
      'reflect/index': 'src/reflect/index.ts',
      'document/index': 'src/document/index.ts',
      'devtools/index': 'src/devtools/index.ts',
      'migrations/index': 'src/migrations/index.ts',
      'examples/index': 'src/examples/index.ts',
    },
    format: ['esm', 'cjs'],
    splitting: true, // cjs too: entries share chunks, so a class exists once, not once per entry
    dts: true,
    sourcemap: true,
    // Array configs build in parallel: `clean: true` here would delete the
    // other config's output. The build script cleans dist first.
    clean: false,
    treeshake: true,
    target: 'es2022',
    external: ['react', 'vue', '@niscorp/cortex', '@niscorp/prism'],
  },
  {
    // ink is ESM-only, so this entry is too.
    entry: { 'adapters/ink/index': 'src/adapters/ink/index.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: false,
    treeshake: true,
    target: 'es2022',
    // The react adapter stays external: bundled, the ink entry would hold its
    // own copy of NovaRenderContext, and a provider from the react entry
    // would not reach it.
    external: ['react', 'ink', 'ink-text-input', '@niscorp/cortex', '@niscorp/prism', '@niscorp/nova/adapters/react'],
  },
]);
