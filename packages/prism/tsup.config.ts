import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    agent: 'src/agent/index.ts',
    'migrations/index': 'src/migrations/index.ts',
    'examples/index': 'src/examples/index.ts',
  },
  format: ['esm', 'cjs'],
  splitting: true, // cjs too: entries share chunks, so a class exists once, not once per entry
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'es2022',
});
