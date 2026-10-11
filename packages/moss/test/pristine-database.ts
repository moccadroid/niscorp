import { PGlite } from '@electric-sql/pglite';
import { beforeAll } from 'vitest';

// A DATABASE OF ITS OWN FOR A TEST, WITHOUT INITIALISING ONE EACH TIME.
//
// The tests that run on a database each start a PGlite: a WASM Postgres whose
// start is mostly `initdb`. Measured here, on an idle machine: 660 ms a start
// (930 the first in a process), and 1.0 to 2.7 s with every core busy, which
// is how a suite runs. Ten files started 62 of them between them (counted),
// and the tests that did were the slow tests of the package: 35 took over a
// second and the slowest 3.5 s, with a `testTimeout` of 30 s so that a slower
// runner did not read the start as a hang.
//
// A database that has been initialised once can be handed on as its data
// directory. A PGlite started from that directory skips `initdb`: 140 ms
// (measured the same way). So a file initialises one database, in a hook,
// keeps its directory, and each test starts its own from it. A test still has
// a database nobody else touches, with nothing in it but what Postgres puts
// there; it does not pay for making one from nothing.
//
// Call it once at the top of a test file, and call what it answers wherever
// the file wrote `new PGlite()`.
export const pristineDatabases = (): (() => PGlite) => {
  const held: { directory?: Awaited<ReturnType<PGlite['dumpDataDir']>> } = {};
  beforeAll(async () => {
    const initialised = new PGlite();
    held.directory = await initialised.dumpDataDir('none');
    await initialised.close();
  });
  return () => {
    if (held.directory === undefined) throw new Error("pristineDatabases: asked for a database before the file's beforeAll had initialised one");
    return new PGlite({ loadDataDir: held.directory });
  };
};
