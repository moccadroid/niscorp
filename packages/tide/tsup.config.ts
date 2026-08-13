import { defineConfig } from 'tsup';

export default defineConfig({
  // ONE ENTRY. There was a `store/postgres` alongside it: 700 lines, zero
  // tests, never instantiated anywhere in this repo, and divergent from the
  // memory store in eleven ways nothing could have caught. Persistence is
  // `createTideStore` in moss now, over vex — where the host's adapters,
  // scoping and identity already live, and where tide's zero-dependency
  // stance stays intact.
  // The second entry is the STORE CONTRACT, shipped because anyone writing a
  // store has to be able to run the checks tide holds its own reference
  // implementation to. It pulls in no test framework — each check is a
  // function that throws — so it costs nothing to publish.
  entry: { index: 'src/index.ts', testing: 'src/testing.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'es2022',
});
