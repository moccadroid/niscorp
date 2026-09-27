// Does tide write facts through ONE door?
//
// Facts reach tide's ledger three ways — the host ingests one, a handler
// emits one, a settled run reports its stats as one — and each used to call
// `appendIfAbsent('fact', …)` itself and remember to announce what it wrote.
// The handler path forgot, and a chain's middle link vanished from the event
// stream. `packages/tide/src/engine/facts.ts` is now the only writer, and
// announcing lives beside it. This fails the moment a second writer appears.
//
// A repo script rather than a tide test because tide is host-blind and ships
// no Node types; reading its source is a repo concern, not a package one.
//
// `pnpm check:fact-door`. Exits non-zero on any failure.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const source = resolve(import.meta.dirname, '..', 'packages', 'tide', 'src');
const DOOR = 'engine/facts.ts';
// The stores IMPLEMENT appendIfAbsent and the store contract exercises it
// directly; neither is the engine writing a fact.
const EXEMPT = ['store/', 'testing.ts'];
const WRITES_A_FACT = /appendIfAbsent\(\s*['"]fact['"]/;

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : entry.name.endsWith('.ts') ? [join(dir, entry.name)] : [],
  );

const writers = files(source)
  .map((file) => relative(source, file).split(sep).join('/'))
  .filter((file) => !EXEMPT.some((exempt) => file.startsWith(exempt)))
  .filter((file) => WRITES_A_FACT.test(readFileSync(join(source, file), 'utf8')));

const strays = writers.filter((file) => file !== DOOR);
if (!writers.includes(DOOR)) console.log(`[fail] ${DOOR} no longer writes facts — the door moved; update this check`);
else console.log(`[pass] ${DOOR} writes facts`);
if (strays.length > 0) console.log(`[fail] facts written outside the door: ${strays.join(', ')} — go through admitFact`);
else console.log('[pass] nothing else in tide writes a fact');

if (strays.length > 0 || !writers.includes(DOOR)) process.exit(1);
