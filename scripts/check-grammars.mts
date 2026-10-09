// The grammar gate (strata S4). Two questions, for nisc's own grammars:
//
//   1. Did a kind's schema change without its grammar gaining a migration?
//      strata/snapshots/<grammar>/<version>.json records each kind's JSON Schema
//      at each version. Same version, different schema → fail: append a
//      migration (an empty marker is enough for an addition), then record the
//      new version with `pnpm strata:snapshot`.
//   2. Does every captured document (strata/corpus) still upgrade to the current
//      grammars and parse with the current strict schemas?
//
// A snapshot is the grammar's fingerprint, not the grammar: what the validator
// wrote for it. When the RECORDER changes and the grammar does not — a
// validator upgrade that describes the same schema differently, strata reading
// it differently — the current version is re-recorded, never edited by hand:
// `pnpm strata:snapshot --rebaseline`, in a commit that changes nothing else in
// the grammar. It refuses unless the corpus passes. What is history is the
// grammar version — its migrations, and the documents captured at its stamp.
//
// Run after `pnpm build`: pnpm check:grammars   (--write records a missing snapshot)

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { NOVA_SEQUENCE, NOVA_SCHEMAS } from '../packages/nova/dist/migrations/index.js';
import { evaluate } from '../packages/prism/dist/index.js';
import { PRISM_SEQUENCE, PRISM_SCHEMAS } from '../packages/prism/dist/migrations/index.js';
import { createUpgrader } from '../packages/strata/dist/index.js';
import { snapshotOf, snapshotText, compareSnapshot, checkCorpus, type CorpusDocument, type Snapshot } from '../packages/strata/dist/check/index.js';

const root = resolve(import.meta.dirname, '..');
const write = process.argv.includes('--write');
const rebaseline = process.argv.includes('--rebaseline');
const GRAMMARS = [
  { sequence: NOVA_SEQUENCE, schemas: NOVA_SCHEMAS },
  { sequence: PRISM_SEQUENCE, schemas: PRISM_SCHEMAS },
] as const;

let failed = 0;
const line = (ok: boolean, text: string, detail: readonly string[] = []): void => {
  console.log(`[${ok ? 'pass' : 'fail'}] ${text}`);
  for (const d of detail) console.log(`       ${d}`);
  if (!ok) failed += 1;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const readSnapshot = (file: string): Snapshot | undefined => {
  if (!existsSync(file)) return undefined;
  const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!isRecord(raw) || typeof raw['sequence'] !== 'string' || typeof raw['version'] !== 'number' || !isRecord(raw['kinds'])) throw new Error(`${file} is not a snapshot`);
  return { sequence: raw['sequence'], version: raw['version'], kinds: raw['kinds'] };
};

// ── 1. the corpus — first: a rebaseline stands on it ───────
const corpusDir = join(root, 'strata', 'corpus');
const documents: CorpusDocument[] = [];
for (const app of existsSync(corpusDir) ? readdirSync(corpusDir) : []) {
  for (const name of readdirSync(join(corpusDir, app)).filter((n) => n.endsWith('.json'))) {
    const raw: unknown = JSON.parse(readFileSync(join(corpusDir, app, name), 'utf8'));
    if (!isRecord(raw) || !isRecord(raw['stamp']) || !Array.isArray(raw['documents'])) throw new Error(`strata/corpus/${app}/${name} is not a corpus file`);
    const stamp = Object.fromEntries(Object.entries(raw['stamp']).map(([k, v]) => [k, Number(v)]));
    for (const doc of raw['documents']) {
      if (!isRecord(doc)) continue;
      documents.push({ id: `${app}/${name.replace(/\.json$/, '')}: ${String(doc['id'])}`, kind: String(doc['kind']), stamp, document: doc['document'] });
    }
  }
}
const upgrader = await createUpgrader(GRAMMARS.map((g) => g.sequence), { transform: evaluate });
const report = await checkCorpus(upgrader, { ...NOVA_SCHEMAS, ...PRISM_SCHEMAS }, documents);
line(
  report.failures.length === 0 && documents.length > 0,
  `corpus: ${report.passed}/${documents.length} captured documents upgrade and parse`,
  documents.length === 0 ? ['The corpus is empty — capture it: pnpm strata:corpus'] : report.failures.slice(0, 20).map((f) => `${f.id} (${f.kind}): ${f.reason}`),
);

// ── 2. snapshots ────────────────────────────────────────────────
for (const { sequence, schemas } of GRAMMARS) {
  const current = snapshotOf(sequence, schemas);
  const dir = join(root, 'strata', 'snapshots', sequence.id);
  const file = join(dir, `${current.version}.json`);
  const rel = `strata/snapshots/${sequence.id}/${current.version}.json`;
  const result = compareSnapshot(readSnapshot(file), current);
  // A rebaseline rewrites whatever the recorder writes differently now — the
  // spelling too, even where the comparison already reads the same.
  if (rebaseline && (!existsSync(file) || readFileSync(file, 'utf8') !== snapshotText(current))) {
    const recorded = report.failures.length === 0 && documents.length > 0;
    if (recorded) writeFileSync(file, snapshotText(current));
    line(recorded, recorded ? `${sequence.id}: re-recorded ${rel}` : `${sequence.id}: NOT re-recorded — a rebaseline stands on a passing corpus`, [
      ...(result.status === 'changed' ? result.changes.flatMap((c) => [`${c.kind}:`, ...c.lines.map((l) => `  ${l}`)]) : []),
      ...(recorded ? ['Commit it alone: a rebaseline changes the recorder, never the grammar.'] : []),
    ]);
  } else if (result.status === 'same') {
    line(true, `${sequence.id} matches ${rel}`);
  } else if (result.status === 'missing' && write) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, snapshotText(current));
    line(true, `${sequence.id}: recorded ${rel}`);
  } else if (result.status === 'missing') {
    line(false, `${sequence.id} is at version ${current.version} and nothing records what that version means`, [`Record it: pnpm strata:snapshot   (writes ${rel})`]);
  } else {
    line(false, `${sequence.id} changed since ${sequence.id}/${current.version} (${rel}) — and no migration says so`, [
      ...result.changes.flatMap((c) => [`${c.kind}:`, ...c.lines.map((l) => `  ${l}`)]),
      `Append a migration to ${sequence.id} — an empty marker is enough for an addition (strict readers at`,
      `${current.version} must refuse the newer documents); a rename or removal needs the steps that rewrite`,
      `old documents. Then: pnpm strata:snapshot. Never edit ${rel} by hand — if the grammar did not change and`,
      `the validator's (or strata's) reading of it did: pnpm strata:snapshot --rebaseline, in a commit of its own.`,
    ]);
  }
}

process.exit(failed > 0 ? 1 : 0);
