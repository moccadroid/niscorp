import { defineConfig } from 'tsup';

export default defineConfig({
  // FOUR ENTRIES, and each beside the first exists to keep something out of it.
  //
  // `index` is the engine, the memory store and the driver. It imports zod and
  // nothing else.
  //
  // `testing` is the STORE CONTRACT, shipped because anyone writing a store has
  // to be able to run the checks tide holds its own stores to. It pulls in no
  // test framework — each check is a function that throws — so it costs
  // nothing to publish.
  //
  // `agent` is the reflex agent, on its own subpath so cortex stays an
  // optional peer.
  //
  // `postgres` is the Postgres store, on its own subpath so strata stays an
  // optional peer: its tables are a strata sequence. There was a
  // `store/postgres` here once before: 700 lines, zero tests, never
  // instantiated anywhere in this repo, and divergent from the memory store in
  // eleven ways nothing could have caught. This one is the store that replaced
  // it, written and tested in moss, and it runs STORE_CONTRACT against a real
  // database (test/postgres-store.test.ts).
  entry: { index: 'src/index.ts', testing: 'src/testing.ts', agent: 'src/agent/index.ts', postgres: 'src/store/postgres/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'es2022',
});
